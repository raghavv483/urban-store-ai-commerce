import "server-only";
import { prisma } from "@/lib/db";
import type { CampaignStatus } from "@prisma/client";
import { recordMoneyAction } from "@/payments/audit";

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
}): Promise<CampaignRow> {
  const { merchantId, campaignId, decision, approverEmail } = input;

  return prisma.$transaction(async (tx) => {
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
          ? `Approved by ${approverEmail}. Campaign is now active for ${target.cartCount} cart(s)${edited ? ", with edited copy" : ""}. Simulated only — no message was sent.`
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
}
