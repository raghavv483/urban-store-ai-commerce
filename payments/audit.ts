import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Audit trail for money actions (CLAUDE.md safety rule 4).
 *
 * Every meaningful money action writes an `agent_runs` row (who/why/outcome) plus
 * one or more `agent_actions` rows (what was attempted, the policy decision, the
 * result). Day 2 has no LLM in the path — the "actor" is the deterministic spine
 * or the Razorpay webhook — but the audit shape is identical to what the agent
 * layer will write on Day 3+, so `/merchant/agent-activity` renders both.
 *
 * NEVER log raw chain-of-thought here. Concise decision summaries only.
 */

export type AuditActor =
  | "human_checkout"
  | "razorpay_webhook"
  | "system";

export type AuditActionInput = {
  actionType: string;
  parameters?: Prisma.InputJsonValue;
  policyDecision?: string;
  result?: Prisma.InputJsonValue;
};

/** A Prisma client or an interactive transaction — audit writes join the caller's tx. */
type Db = Prisma.TransactionClient | typeof prisma;

export async function recordMoneyAction(
  db: Db,
  input: {
    merchantId: string;
    actor: AuditActor;
    trigger: string;
    inputSummary: string;
    outputSummary: string;
    status: "succeeded" | "failed";
    sessionId?: string | null;
    actions: AuditActionInput[];
  },
): Promise<string> {
  const run = await db.agentRun.create({
    data: {
      merchantId: input.merchantId,
      sessionId: input.sessionId ?? null,
      agentName: input.actor,
      trigger: input.trigger,
      inputSummary: input.inputSummary,
      outputSummary: input.outputSummary,
      status: input.status === "succeeded" ? "succeeded" : "failed",
      completedAt: new Date(),
      actions: {
        create: input.actions.map((a) => ({
          actionType: a.actionType,
          parameters: a.parameters ?? {},
          policyDecision: a.policyDecision ?? null,
          approvalRequired: false,
          approvalStatus: null,
          result: a.result ?? {},
        })),
      },
    },
    select: { id: true },
  });

  return run.id;
}
