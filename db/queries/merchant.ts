import "server-only";
import { prisma } from "@/lib/db";
import type { OrderSource, OrderStatus } from "@prisma/client";

/**
 * Merchant dashboard reads. Every function takes `merchantId` as its first
 * argument and puts it in the `where` clause — same structural rule as
 * db/queries/products.ts (CLAUDE.md safety rule 6). All read-only: nothing here
 * writes, and nothing here touches money logic.
 */

export type RevenueSummary = {
  /** Paid orders only. Pending and failed orders are not revenue. */
  totalRevenueInPaise: number;
  aiRevenueInPaise: number;
  humanRevenueInPaise: number;
  /** Share of paid revenue attributable to autonomous agents, 0-100. */
  aiSharePercent: number;
  paidOrderCount: number;
  aiPaidOrderCount: number;
  humanPaidOrderCount: number;
  averageOrderValueInPaise: number;
  /** Non-revenue counts, shown so the dashboard is honest about what it excludes. */
  pendingOrderCount: number;
  failedOrderCount: number;
};

export async function getRevenueSummary(merchantId: string): Promise<RevenueSummary> {
  // One grouped query rather than six aggregates: fewer round trips, and every
  // figure is guaranteed to come from the same snapshot of the table.
  const grouped = await prisma.order.groupBy({
    by: ["status", "source"],
    where: { merchantId },
    _count: { _all: true },
    _sum: { totalInPaise: true },
  });

  let aiRevenue = 0;
  let humanRevenue = 0;
  let aiPaid = 0;
  let humanPaid = 0;
  let pending = 0;
  let failed = 0;

  for (const row of grouped) {
    const count = row._count._all;
    const sum = row._sum.totalInPaise ?? 0;

    if (row.status === "paid") {
      if (row.source === "ai_buyer") {
        aiRevenue += sum;
        aiPaid += count;
      } else {
        humanRevenue += sum;
        humanPaid += count;
      }
    } else if (row.status === "created" || row.status === "pending") {
      pending += count;
    } else if (row.status === "failed") {
      failed += count;
    }
  }

  const totalRevenue = aiRevenue + humanRevenue;
  const paidCount = aiPaid + humanPaid;

  return {
    totalRevenueInPaise: totalRevenue,
    aiRevenueInPaise: aiRevenue,
    humanRevenueInPaise: humanRevenue,
    aiSharePercent: totalRevenue === 0 ? 0 : Math.round((aiRevenue / totalRevenue) * 100),
    paidOrderCount: paidCount,
    aiPaidOrderCount: aiPaid,
    humanPaidOrderCount: humanPaid,
    // Integer paise throughout: rounding here rather than carrying a float keeps
    // the money convention intact all the way to the formatter.
    averageOrderValueInPaise: paidCount === 0 ? 0 : Math.round(totalRevenue / paidCount),
    pendingOrderCount: pending,
    failedOrderCount: failed,
  };
}

export type MerchantOrderRow = {
  id: string;
  createdAt: Date;
  status: OrderStatus;
  source: OrderSource;
  totalInPaise: number;
  customerEmail: string | null;
  itemCount: number;
  razorpayOrderId: string | null;
  paymentStatus: string | null;
  errorDescription: string | null;
};

export async function listMerchantOrders(
  merchantId: string,
  filters: { source?: OrderSource; status?: OrderStatus; limit?: number } = {},
): Promise<MerchantOrderRow[]> {
  const orders = await prisma.order.findMany({
    where: {
      merchantId,
      ...(filters.source ? { source: filters.source } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(filters.limit ?? 50, 200),
    select: {
      id: true,
      createdAt: true,
      status: true,
      source: true,
      totalInPaise: true,
      razorpayOrderId: true,
      customer: { select: { email: true } },
      items: { select: { quantity: true } },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, errorDescription: true },
      },
    },
  });

  return orders.map((o) => ({
    id: o.id,
    createdAt: o.createdAt,
    status: o.status,
    source: o.source,
    totalInPaise: o.totalInPaise,
    customerEmail: o.customer?.email ?? null,
    itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
    razorpayOrderId: o.razorpayOrderId,
    paymentStatus: o.payments[0]?.status ?? null,
    errorDescription: o.payments[0]?.errorDescription ?? null,
  }));
}

export type AgentActivityRow = {
  id: string;
  agentName: string;
  trigger: string;
  inputSummary: string;
  outputSummary: string | null;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  actions: Array<{
    id: string;
    actionType: string;
    policyDecision: string | null;
    approvalRequired: boolean;
    approvalStatus: string | null;
    ok: boolean | null;
    detail: string | null;
    durationMs: number | null;
  }>;
};

/**
 * The audit trail, shaped for reading rather than for machines.
 *
 * `agent_actions.result` is a Json blob; the fields worth showing a merchant are
 * pulled out here so the page renders sentences instead of a JSON dump.
 */
export async function listAgentActivity(
  merchantId: string,
  filters: { limit?: number; agentName?: string } = {},
): Promise<AgentActivityRow[]> {
  const runs = await prisma.agentRun.findMany({
    where: {
      merchantId,
      ...(filters.agentName ? { agentName: filters.agentName } : {}),
    },
    orderBy: { startedAt: "desc" },
    take: Math.min(filters.limit ?? 40, 200),
    include: { actions: { orderBy: { createdAt: "asc" } } },
  });

  return runs.map((run) => ({
    id: run.id,
    agentName: run.agentName,
    trigger: run.trigger,
    inputSummary: run.inputSummary,
    outputSummary: run.outputSummary,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    actions: run.actions.map((a) => {
      const result = (a.result ?? {}) as {
        ok?: boolean;
        summary?: string;
        durationMs?: number;
      };
      return {
        id: a.id,
        actionType: a.actionType,
        policyDecision: a.policyDecision,
        approvalRequired: a.approvalRequired,
        approvalStatus: a.approvalStatus,
        ok: typeof result.ok === "boolean" ? result.ok : null,
        detail: typeof result.summary === "string" ? result.summary : null,
        durationMs: typeof result.durationMs === "number" ? result.durationMs : null,
      };
    }),
  }));
}

/** Distinct actor names, for the activity page's filter. */
export async function listAgentNames(merchantId: string): Promise<string[]> {
  const rows = await prisma.agentRun.findMany({
    where: { merchantId },
    select: { agentName: true },
    distinct: ["agentName"],
    orderBy: { agentName: "asc" },
  });
  return rows.map((r) => r.agentName);
}
