import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getStorefrontMerchantId } from "@/lib/merchant";
import { getSessionContext } from "@/auth/session";
import { runAgentTurn } from "@/agents/router";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  message: z.string().min(1).max(1000),
  cartId: z.string().min(1).max(64).optional(),
});

/**
 * Day 3 manual test harness for the router. No UI — POST a prompt, get the
 * classification, the tool that ran, its structured result, and the audit run id.
 *
 * GET returns usage plus a few example prompts.
 */
export async function GET() {
  return NextResponse.json({
    usage: 'POST { "message": "find me a laptop under 80000", "cartId": "optional" }',
    examples: [
      "find me a laptop under 80000",
      "is the thinkpad x in stock?",
      "what accessories go with the macbook air m3?",
      "add a usb-c hub to my cart",
      "what's in my cart?",
      "can I return it after 10 days?",
    ],
  });
}

export async function POST(request: Request) {
  let parsedBody: z.infer<typeof bodySchema>;
  try {
    parsedBody = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: 'Body must be { "message": string, "cartId"?: string }' },
      { status: 400 },
    );
  }

  try {
    const merchantId = await getStorefrontMerchantId();
    const session = await getSessionContext();

    // If no cart was named, reuse the most recent active one so multi-turn
    // cart flows work from curl without the caller tracking ids.
    let cartId = parsedBody.cartId ?? null;
    if (!cartId) {
      const latest = await prisma.cart.findFirst({
        where: { merchantId, status: "active" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      cartId = latest?.id ?? null;
    }

    const result = await runAgentTurn({
      message: parsedBody.message,
      cartId,
      ctx: {
        merchantId,
        customerId: session?.userId ?? null,
        sessionId: "agent-test-route",
        actor: "human",
      },
    });

    return NextResponse.json({
      message: parsedBody.message,
      cartIdUsed: cartId,
      intent: result.intent,
      tools: result.tools,
      sources: result.sources,
      toolOk: result.toolOk,
      reply: result.reply,
      data: result.data,
      agentRunId: result.agentRunId,
      auditUrl: `/test-spine`,
    });
  } catch (error) {
    console.error("[agent-test] failed:", error);
    return NextResponse.json({ error: "Agent run failed." }, { status: 500 });
  }
}
