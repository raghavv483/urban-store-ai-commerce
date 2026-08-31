import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { MERCHANT_SLUG } from "@/db/seed-data";
import { decideCampaign, CampaignDecisionError, listCampaigns } from "./campaigns";
import { runTool, type ToolContext } from "@/tools";

const APPROVER = "merchant-vitest@urbanstore.test";
let ctx: ToolContext;
const created: string[] = [];

async function propose(): Promise<string> {
  const call = await runTool("proposeCampaign", {}, ctx);
  if (!call.result.ok) throw new Error(`propose failed: ${call.result.error}`);
  const id = (call.result.data as { campaignId: string }).campaignId;
  created.push(id);
  return id;
}

beforeAll(async () => {
  const m = await prisma.merchant.findUniqueOrThrow({ where: { slug: MERCHANT_SLUG } });
  ctx = {
    merchantId: m.id,
    customerId: null,
    sessionId: "campaign-vitest",
    actor: "human",
  };
}, 60_000);

afterAll(async () => {
  if (created.length > 0) {
    await prisma.campaign.deleteMany({ where: { id: { in: created } } });
  }
  await prisma.agentRun.deleteMany({
    where: { merchantId: ctx.merchantId, sessionId: "campaign-vitest" },
  });
  await prisma.$disconnect();
});

describe("campaign approval gate", () => {
  it("an agent can only propose — the campaign is inactive until a human approves", async () => {
    const id = await propose();

    // The agent's own output must never be active.
    const fresh = await prisma.campaign.findUniqueOrThrow({ where: { id } });
    expect(fresh.status).toBe("proposed");
    expect(fresh.approvedBy).toBeNull();
    expect(fresh.createdByAgent).toBe("growth_agent");

    // Nothing an agent can call flips it. Only decideCampaign does, and it
    // demands an approver's identity.
    const approved = await decideCampaign({
      merchantId: ctx.merchantId,
      campaignId: id,
      decision: "approve",
      approverEmail: APPROVER,
    });

    expect(approved.status).toBe("active");
    expect(approved.approvedBy).toBe(APPROVER);

    // The approval is audited with who decided and that a human had to.
    const run = await prisma.agentRun.findFirst({
      where: { merchantId: ctx.merchantId, trigger: `campaign:approve:${id}` },
      include: { actions: true },
    });
    expect(run).not.toBeNull();
    const action = run!.actions[0];
    expect(action.actionType).toBe("approve_campaign");
    expect(action.approvalRequired).toBe(true);
    expect(action.approvalStatus).toBe("approved");
    expect(action.policyDecision).toMatch(/human approval required/i);
  }, 120_000);

  it("rejecting never activates, and a decided campaign cannot be decided again", async () => {
    const id = await propose();

    const rejected = await decideCampaign({
      merchantId: ctx.merchantId,
      campaignId: id,
      decision: "reject",
      approverEmail: APPROVER,
    });

    expect(rejected.status).toBe("rejected");
    expect(rejected.status).not.toBe("active");

    const stored = await prisma.campaign.findUniqueOrThrow({ where: { id } });
    expect(stored.status).toBe("rejected");

    // A second click — or a double submit — must not resurrect it. Without this
    // guard, "reject then approve" would quietly activate a campaign the merchant
    // had already turned down.
    await expect(
      decideCampaign({
        merchantId: ctx.merchantId,
        campaignId: id,
        decision: "approve",
        approverEmail: APPROVER,
      }),
    ).rejects.toBeInstanceOf(CampaignDecisionError);

    const afterRetry = await prisma.campaign.findUniqueOrThrow({ where: { id } });
    expect(afterRetry.status).toBe("rejected");

    const run = await prisma.agentRun.findFirst({
      where: { merchantId: ctx.merchantId, trigger: `campaign:reject:${id}` },
      include: { actions: true },
    });
    expect(run!.actions[0].approvalStatus).toBe("rejected");
  }, 120_000);

  it("never returns another merchant's campaigns", async () => {
    const rival = await prisma.merchant.upsert({
      where: { slug: "campaign-rival" },
      update: {},
      create: { slug: "campaign-rival", name: "Rival" },
    });
    try {
      await prisma.campaign.create({
        data: {
          merchantId: rival.id,
          type: "cart_recovery",
          name: "Rival campaign",
          content: "not ours",
          status: "proposed",
        },
      });
      const ours = await listCampaigns(ctx.merchantId, 100);
      expect(ours.every((c) => c.name !== "Rival campaign")).toBe(true);

      // And a cross-merchant decision must fail rather than reach across.
      const theirs = await prisma.campaign.findFirstOrThrow({
        where: { merchantId: rival.id },
      });
      await expect(
        decideCampaign({
          merchantId: ctx.merchantId,
          campaignId: theirs.id,
          decision: "approve",
          approverEmail: APPROVER,
        }),
      ).rejects.toBeInstanceOf(CampaignDecisionError);
    } finally {
      await prisma.merchant.delete({ where: { id: rival.id } });
    }
  }, 60_000);
});
