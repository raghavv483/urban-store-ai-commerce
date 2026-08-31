"use server";

import { revalidatePath } from "next/cache";
import { guardMerchantPage } from "@/auth/merchant-guard";
import { runTool, auditAgentRun } from "@/tools";
import { decideCampaign, CampaignDecisionError } from "@/db/queries/campaigns";

export type CampaignActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/**
 * Ask the growth agent for a proposal. Every entry point is role-gated: the
 * merchant admin session is what supplies merchantId, never the form.
 */
export async function proposeRecoveryCampaign(): Promise<CampaignActionResult> {
  const session = await guardMerchantPage();

  const ctx = {
    merchantId: session.merchantId,
    customerId: session.userId,
    sessionId: `merchant-${session.userId}`,
    actor: "human" as const,
  };

  const call = await runTool("proposeCampaign", {}, ctx);

  await auditAgentRun({
    ctx,
    agentName: "growth_agent",
    trigger: `campaign:propose:${session.userId}`,
    userMessage: "Merchant asked the growth agent to recover abandoned carts.",
    decisionSummary: call.result.summary,
    calls: [call],
  });

  revalidatePath("/merchant/campaigns");

  return call.result.ok
    ? { ok: true, message: call.result.summary }
    : { ok: false, message: call.result.error };
}

/** Approve (optionally with edited copy) or reject. The only path to `active`. */
export async function decide(
  campaignId: string,
  decision: "approve" | "reject",
  editedContent?: string,
): Promise<CampaignActionResult> {
  const session = await guardMerchantPage();

  try {
    const campaign = await decideCampaign({
      merchantId: session.merchantId,
      campaignId,
      decision,
      approverEmail: session.email,
      editedContent,
    });

    revalidatePath("/merchant/campaigns");
    revalidatePath("/merchant/agent-activity");

    return {
      ok: true,
      message:
        decision === "approve"
          ? `Campaign is now active for ${campaign.target.cartCount} cart(s). Simulated only — nothing was sent.`
          : "Campaign rejected. Nothing was sent and no customer was contacted.",
    };
  } catch (error) {
    if (error instanceof CampaignDecisionError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}
