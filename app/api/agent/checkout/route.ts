import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAgentContext, AgentAuthError, agentOrderCapInPaise } from "@/auth/agent";
import { runTool, auditAgentRun } from "@/tools";
import { priceCart, CartError } from "@/payments/cart";
import { formatPaise } from "@/lib/money";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * There is deliberately no amount, price or currency field here.
 *
 * An autonomous buyer can name a cart and nothing else. The total is derived by
 * the spine from database rows (CLAUDE.md prime directive + safety rule 1), so
 * no amount an agent might compute, hallucinate or be tricked into can reach
 * Razorpay.
 */
const bodySchema = z.object({
  cartId: z.string().min(1).max(64),
});

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireAgentContext(request);
  } catch (error) {
    if (error instanceof AgentAuthError) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    throw error;
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // ---- Policy gate: bound how much an agent may commit in one order ----
  // Checked against the server-computed total, before any Razorpay call. A
  // refusal is audited as an explicit policy denial, not a silent no-op.
  const cap = agentOrderCapInPaise();
  try {
    const priced = await priceCart(prisma, ctx.merchantId, body.cartId);

    if (priced.totalInPaise > cap) {
      await auditAgentRun({
        ctx,
        agentName: "ai_buyer",
        trigger: `agent-api:checkout:${ctx.sessionId}`,
        userMessage: `checkout cart ${body.cartId}`,
        decisionSummary: `Refused: cart total ${formatPaise(priced.totalInPaise)} exceeds the agent order cap of ${formatPaise(cap)}. No order created, nothing charged.`,
        calls: [
          {
            tool: "createRazorpayOrder",
            input: { cartId: body.cartId },
            result: {
              ok: false,
              code: "POLICY_LIMIT_EXCEEDED",
              error: `Order total ${formatPaise(priced.totalInPaise)} exceeds the agent limit of ${formatPaise(cap)}.`,
              summary: "Policy denied: agent order cap exceeded.",
            },
            durationMs: 0,
          },
        ],
      });

      return NextResponse.json(
        {
          error: `Order total ${formatPaise(priced.totalInPaise)} exceeds the agent spending limit of ${formatPaise(cap)}. A human must approve a purchase this size.`,
          code: "POLICY_LIMIT_EXCEEDED",
          totalInPaise: priced.totalInPaise,
          capInPaise: cap,
        },
        { status: 403 },
      );
    }
  } catch (error) {
    if (error instanceof CartError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    throw error;
  }

  const call = await runTool("createRazorpayOrder", { cartId: body.cartId }, ctx);

  await auditAgentRun({
    ctx,
    agentName: "ai_buyer",
    trigger: `agent-api:checkout:${ctx.sessionId}`,
    userMessage: `checkout cart ${body.cartId}`,
    decisionSummary: call.result.summary,
    calls: [call],
  });

  if (!call.result.ok) {
    return NextResponse.json(
      { error: call.result.error, code: call.result.code },
      { status: 400 },
    );
  }

  return NextResponse.json(call.result.data);
}
