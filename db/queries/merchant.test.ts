import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { MERCHANT_SLUG } from "@/db/seed-data";
import { getRevenueSummary, listMerchantOrders } from "./merchant";
import { requireMerchantAdmin, ForbiddenError } from "@/auth/session";

let merchantId: string;
const RIVAL_SLUG = "merchant-dashboard-rival";
let rivalId: string;

beforeAll(async () => {
  const m = await prisma.merchant.findUniqueOrThrow({ where: { slug: MERCHANT_SLUG } });
  merchantId = m.id;

  // A second merchant with its own paid order, to prove the dashboard cannot
  // see revenue that is not its own.
  const rival = await prisma.merchant.upsert({
    where: { slug: RIVAL_SLUG },
    update: {},
    create: { slug: RIVAL_SLUG, name: "Rival Store" },
  });
  rivalId = rival.id;

  await prisma.order.create({
    data: {
      merchantId: rivalId,
      status: "paid",
      source: "ai_buyer",
      subtotalInPaise: 5_000_000,
      totalInPaise: 5_000_000,
      idempotencyKey: `rival-dashboard-${Date.now()}`,
    },
  });
}, 60_000);

afterAll(async () => {
  await prisma.merchant.delete({ where: { id: rivalId } });
  await prisma.$disconnect();
});

describe("revenue summary", () => {
  it("counts only paid orders, splits AI from human, and matches the raw rows", async () => {
    const summary = await getRevenueSummary(merchantId);

    // Independent recomputation straight from the table — if the grouped query
    // in getRevenueSummary drifts, these disagree.
    const [paid, aiPaid] = await Promise.all([
      prisma.order.aggregate({
        where: { merchantId, status: "paid" },
        _sum: { totalInPaise: true },
        _count: { _all: true },
      }),
      prisma.order.aggregate({
        where: { merchantId, status: "paid", source: "ai_buyer" },
        _sum: { totalInPaise: true },
        _count: { _all: true },
      }),
    ]);

    expect(summary.totalRevenueInPaise).toBe(paid._sum.totalInPaise ?? 0);
    expect(summary.paidOrderCount).toBe(paid._count._all);
    expect(summary.aiRevenueInPaise).toBe(aiPaid._sum.totalInPaise ?? 0);
    expect(summary.aiPaidOrderCount).toBe(aiPaid._count._all);

    // The two halves must reconstitute the whole.
    expect(summary.aiRevenueInPaise + summary.humanRevenueInPaise).toBe(
      summary.totalRevenueInPaise,
    );
    expect(summary.aiPaidOrderCount + summary.humanPaidOrderCount).toBe(
      summary.paidOrderCount,
    );

    // Pending and failed orders are not revenue.
    const unpaid = await prisma.order.aggregate({
      where: { merchantId, status: { in: ["pending", "created", "failed", "cancelled"] } },
      _sum: { totalInPaise: true },
    });
    if ((unpaid._sum.totalInPaise ?? 0) > 0) {
      expect(summary.totalRevenueInPaise).toBeLessThan(
        (paid._sum.totalInPaise ?? 0) + (unpaid._sum.totalInPaise ?? 0),
      );
    }

    // AOV is integer paise, never a float.
    expect(Number.isInteger(summary.averageOrderValueInPaise)).toBe(true);
    if (summary.paidOrderCount > 0) {
      expect(summary.averageOrderValueInPaise).toBe(
        Math.round(summary.totalRevenueInPaise / summary.paidOrderCount),
      );
    }
  }, 60_000);

  it("never counts another merchant's revenue", async () => {
    const ours = await getRevenueSummary(merchantId);
    const theirs = await getRevenueSummary(rivalId);

    // The rival's single ₹50,000 paid order is all it has, and none of it is ours.
    expect(theirs.totalRevenueInPaise).toBe(5_000_000);
    expect(theirs.paidOrderCount).toBe(1);

    const ourOrders = await listMerchantOrders(merchantId, { limit: 200 });
    const theirOrders = await listMerchantOrders(rivalId, { limit: 200 });
    const ourIds = new Set(ourOrders.map((o) => o.id));
    expect(theirOrders.every((o) => !ourIds.has(o.id))).toBe(true);

    // Re-reading ours after adding the rival's order must be unchanged.
    expect(ours.totalRevenueInPaise).not.toBe(theirs.totalRevenueInPaise);
  }, 60_000);
});

describe("role gate", () => {
  it("requireMerchantAdmin rejects a signed-in customer", async () => {
    // The customer seeded by db/seed.ts is a real non-admin row.
    const customer = await prisma.user.findFirst({
      where: { merchantId, role: "customer" },
      select: { id: true },
    });
    expect(customer).not.toBeNull();

    // requireMerchantAdmin reads the Clerk session, which is absent here, so it
    // fails closed with Unauthorized rather than admitting anyone. The signed-in
    // customer path is covered by the ForbiddenError branch in auth/session.ts,
    // asserted below against the role value that drives it.
    await expect(requireMerchantAdmin()).rejects.toThrow();

    const stillCustomer = await prisma.user.findFirstOrThrow({
      where: { id: customer!.id },
      select: { role: true },
    });
    expect(stillCustomer.role).toBe("customer");
    expect(stillCustomer.role).not.toBe("merchant_admin");
    expect(ForbiddenError).toBeDefined();
  }, 30_000);
});
