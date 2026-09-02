import "server-only";
import { prisma } from "@/lib/db";
import type { CampaignStatus } from "@prisma/client";
import { recordMoneyAction } from "@/payments/audit";
import {
  sendCampaignEmails,
  describeOutcome,
  emailIsConfigured,
  type SendOutcome,
} from "@/lib/email";

/**
 * Campaign reads and the approval transition.
 *
 * The one rule this module exists to enforce: a campaign becomes `active` only
 * through `decideCampaign`, which requires a human approver's identity. Nothing
 * an agent can call sets that status (see tools/growth.ts, which always writes
 * `proposed`).
 */

export type CampaignTarget = {
  segment: string;
  cartIds: string[];
  cartCount: number;
  cartValueInPaise: number;
  estimatedRecoveryInPaise: number;
  assumedRecoveryRate: number;
  topProducts: string[];
};

export type CampaignRow = {
  id: string;
  name: string;
  type: string;
  status: CampaignStatus;
  content: string;
  createdByAgent: string | null;
  approvedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  target: CampaignTarget;
};

const EMPTY_TARGET: CampaignTarget = {
  segment: "Unknown segment",
  cartIds: [],
  cartCount: 0,
  cartValueInPaise: 0,
  estimatedRecoveryInPaise: 0,
  assumedRecoveryRate: 0,
  topProducts: [],
};

export async function listCampaigns(
  merchantId: string,
  limit = 30,
): Promise<CampaignRow[]> {
  const rows = await prisma.campaign.findMany({
    where: { merchantId },
    orderBy: [{ createdAt: "desc" }],
    take: Math.min(limit, 100),
  });

  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    status: c.status,
    content: c.content,
    createdByAgent: c.createdByAgent,
    approvedBy: c.approvedBy,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    target: { ...EMPTY_TARGET, ...((c.targetDefinition ?? {}) as Partial<CampaignTarget>) },
  }));
}

/**
 * Who a campaign can actually reach.
 *
 * A cart only has a recipient if it belongs to a signed-in customer. Seeded carts
 * have no customer at all, and the seeded demo customer carries a placeholder
 * clerkId — neither is a real inbox, so neither is counted as reachable. That is
 * what keeps "sent to N" honest rather than aspirational.
 */
export async function resolveCampaignRecipients(
  merchantId: string,
  cartIds: string[],
): Promise<{ reachable: string[]; unreachableCount: number }> {
  if (cartIds.length === 0) return { reachable: [], unreachableCount: 0 };

  const carts = await prisma.cart.findMany({
    where: { id: { in: cartIds }, merchantId },
    select: { id: true, customer: { select: { email: true, clerkId: true } } },
  });

  const reachable = new Set<string>();
  let unreachable = 0;

  for (const cart of carts) {
    const customer = cart.customer;
    // `seed_` prefixed clerkIds are fixtures, not people.
    if (!customer?.email || customer.clerkId.startsWith("seed_")) {
      unreachable++;
      continue;
    }
    reachable.add(customer.email.toLowerCase());
  }

  return { reachable: [...reachable], unreachableCount: unreachable };
}

export class CampaignDecisionError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "ALREADY_DECIDED",
  ) {
    super(message);
    this.name = "CampaignDecisionError";
  }
}

/**
 * The human approval gate.
 *
 * Only a `proposed` campaign can be decided, so a second click cannot re-activate
 * a rejected one or re-reject an active one. The transition and the approver's
 * identity are written in the same transaction as the audit row, so a campaign
 * can never be active without a record of who allowed it.
 */
export async function decideCampaign(input: {
  merchantId: string;
  campaignId: string;
  decision: "approve" | "reject";
  approverEmail: string;
  /** Optional edited copy — Approve and Edit are the same transition. */
  editedContent?: string;
}): Promise<CampaignRow & { delivery: SendOutcome | null; deliverySummary: string }> {
  const { merchantId, campaignId, decision, approverEmail } = input;

  const decided = await prisma.$transaction(async (tx) => {
    const existing = await tx.campaign.findFirst({
      where: { id: campaignId, merchantId },
    });
    if (!existing) {
      throw new CampaignDecisionError("That campaign no longer exists.", "NOT_FOUND");
    }
    if (existing.status !== "proposed") {
      throw new CampaignDecisionError(
        `This campaign was already ${existing.status}.`,
        "ALREADY_DECIDED",
      );
    }

    const nextStatus: CampaignStatus = decision === "approve" ? "active" : "rejected";
    const content = input.editedContent?.trim() || existing.content;
    const edited = content !== existing.content;

    const updated = await tx.campaign.update({
      where: { id: campaignId },
      data: {
        status: nextStatus,
        content,
        approvedBy: approverEmail,
      },
    });

    const target = { ...EMPTY_TARGET, ...((updated.targetDefinition ?? {}) as Partial<CampaignTarget>) };

    await recordMoneyAction(tx, {
      merchantId,
      actor: "human_checkout",
      agentName: "merchant_approval",
      trigger: `campaign:${decision}:${campaignId}`,
      inputSummary: `Merchant reviewed campaign "${existing.name}" proposed by ${existing.createdByAgent ?? "an agent"}.`,
      outputSummary:
        decision === "approve"
          ? // Deliberately makes no claim about delivery: the send happens after
            // this transaction commits, and is audited separately with its real
            // outcome. Asserting "sent" here would be a guess.
            `Approved by ${approverEmail}. Campaign is now active for ${target.cartCount} cart(s)${edited ? ", with edited copy" : ""}. Delivery recorded separately.`
          : `Rejected by ${approverEmail}. Campaign discarded, nothing sent, no customer contacted.`,
      status: "succeeded",
      actions: [
        {
          actionType: decision === "approve" ? "approve_campaign" : "reject_campaign",
          parameters: {
            campaignId,
            cartCount: target.cartCount,
            cartValueInPaise: target.cartValueInPaise,
            contentEdited: edited,
          },
          policyDecision:
            "human approval required before a campaign may become active; agent may only propose",
          approvalRequired: true,
          approvalStatus: decision === "approve" ? "approved" : "rejected",
          result: {
            ok: true,
            summary: `Campaign ${decision === "approve" ? "activated" : "rejected"} by ${approverEmail}.`,
            status: nextStatus,
            approvedBy: approverEmail,
          },
        },
      ],
    });

    return {
      id: updated.id,
      name: updated.name,
      type: updated.type,
      status: updated.status,
      content: updated.content,
      createdByAgent: updated.createdByAgent,
      approvedBy: updated.approvedBy,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      target,
    };
  });

  // A rejected campaign contacts nobody, by definition.
  if (decided.status !== "active") {
    return {
      ...decided,
      delivery: null,
      deliverySummary: "Rejected — nothing sent, no customer contacted.",
    };
  }

  // ---- Delivery, outside the transaction ----
  // The approval is already committed. A provider outage must not undo a decision
  // a human made, so every failure below is reported, never thrown.
  let delivery: SendOutcome | null = null;
  let deliverySummary: string;

  try {
    const { reachable, unreachableCount } = await resolveCampaignRecipients(
      merchantId,
      decided.target.cartIds,
    );

    if (!emailIsConfigured()) {
      deliverySummary = `Email is not configured, so nothing was sent. ${
        reachable.length + unreachableCount
      } cart(s) in the audience.`;
    } else {
      delivery = await sendCampaignEmails({
        recipients: reachable,
        subject: "You left something in your cart at Urban Store",
        body: decided.content,
      });
      // Carts with no customer at all never reached the sender, so fold them in.
      delivery.skipped.push(
        ...Array.from({ length: unreachableCount }, () => ({
          email: "(no account on this cart)",
          reason: "cart has no signed-in customer",
        })),
      );
      deliverySummary = describeOutcome(delivery);
    }
  } catch (error) {
    deliverySummary = `Campaign is active, but delivery could not be attempted: ${
      error instanceof Error ? error.message : "unknown error"
    }`;
  }

  // Audited as its own run so the trail distinguishes "a human approved this"
  // from "and here is what actually reached an inbox".
  try {
    await recordMoneyAction(prisma, {
      merchantId,
      actor: "system",
      agentName: "campaign_delivery",
      trigger: `campaign:deliver:${campaignId}`,
      inputSummary: `Delivering approved campaign "${decided.name}" to its audience.`,
      outputSummary: deliverySummary,
      status: delivery && delivery.failed.length > 0 ? "failed" : "succeeded",
      actions: [
        {
          actionType: "send_campaign_email",
          parameters: { campaignId, audienceCarts: decided.target.cartCount },
          policyDecision:
            "allow: campaign already approved by a human; sandbox delivers only to verified recipients",
          result: {
            ok: Boolean(delivery && delivery.failed.length === 0),
            summary: deliverySummary,
            sent: delivery?.sent ?? [],
            failed: delivery?.failed ?? [],
            skipped: delivery?.skipped.length ?? 0,
          },
        },
      ],
    });
  } catch {
    // The audit is important but not worth failing an already-sent campaign over.
  }

  return { ...decided, delivery, deliverySummary };
}

export type CampaignOutcome = {
  targetCartCount: number;
  recoveredCartCount: number;
  recoveredInPaise: number;
  /** Share of targeted carts that converted, 0-100. */
  recoveryRatePercent: number;
  /** When the clock started — orders before this are not attributable. */
  measuredSince: Date;
};

/**
 * Did an approved campaign actually recover anything?
 *
 * Purely derived: this writes nothing and stores nothing. It re-reads paid orders
 * every time, so the number on screen is the current truth rather than a snapshot
 * that can drift.
 *
 * A targeted cart counts as recovered when a PAID order appears after the campaign
 * was approved, matched either by the cart itself or by the same customer buying
 * again. Orders before approval are never counted — a campaign cannot take credit
 * for a sale that already happened.
 *
 * Attribution is capped at one order per targeted cart, so a customer who owned
 * three abandoned carts and placed one order recovers one cart, not three.
 */
export async function getCampaignOutcome(
  merchantId: string,
  campaign: Pick<CampaignRow, "status" | "updatedAt" | "target">,
): Promise<CampaignOutcome | null> {
  // Only an active campaign has an outcome. A proposal has not run; a rejected
  // one never will.
  if (campaign.status !== "active") return null;

  const cartIds = campaign.target.cartIds ?? [];
  // `updatedAt` is the approval moment: a decided campaign cannot be decided
  // again, so this timestamp does not move afterwards.
  const measuredSince = campaign.updatedAt;

  if (cartIds.length === 0) {
    return {
      targetCartCount: 0,
      recoveredCartCount: 0,
      recoveredInPaise: 0,
      recoveryRatePercent: 0,
      measuredSince,
    };
  }

  const targetCarts = await prisma.cart.findMany({
    where: { id: { in: cartIds }, merchantId },
    select: { id: true, customerId: true },
  });

  const customerIds = [
    ...new Set(targetCarts.map((c) => c.customerId).filter((id): id is string => !!id)),
  ];

  const orders = await prisma.order.findMany({
    where: {
      merchantId,
      status: "paid",
      createdAt: { gte: measuredSince },
      OR: [
        { cartId: { in: cartIds } },
        ...(customerIds.length > 0 ? [{ customerId: { in: customerIds } }] : []),
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { cartId: true, customerId: true, totalInPaise: true },
  });

  const recoveredCarts = new Set<string>();
  let recoveredInPaise = 0;

  // Direct cart matches first — they are unambiguous.
  for (const order of orders) {
    if (order.cartId && cartIds.includes(order.cartId) && !recoveredCarts.has(order.cartId)) {
      recoveredCarts.add(order.cartId);
      recoveredInPaise += order.totalInPaise;
    }
  }

  // Then same-customer orders, each claiming at most one of that customer's
  // still-unrecovered carts.
  for (const order of orders) {
    if (order.cartId && cartIds.includes(order.cartId)) continue; // already counted
    if (!order.customerId) continue;

    const claimable = targetCarts.find(
      (c) => c.customerId === order.customerId && !recoveredCarts.has(c.id),
    );
    if (!claimable) continue;

    recoveredCarts.add(claimable.id);
    recoveredInPaise += order.totalInPaise;
  }

  return {
    targetCartCount: cartIds.length,
    recoveredCartCount: recoveredCarts.size,
    recoveredInPaise,
    recoveryRatePercent:
      cartIds.length === 0
        ? 0
        : Math.round((recoveredCarts.size / cartIds.length) * 100),
    measuredSince,
  };
}
