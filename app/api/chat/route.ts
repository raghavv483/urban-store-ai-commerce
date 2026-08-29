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
  threadId: z.string().min(1).max(64),
  cartId: z.string().min(1).max(64).nullish(),
});

/**
 * Chat turn endpoint for /ai-shopping.
 *
 * Conversation history is NOT accepted from the client — it lives in the router's
 * LangGraph checkpointer, keyed by threadId. A client that replayed a doctored
 * history could otherwise talk the assistant into a different past.
 */
export async function POST(request: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const merchantId = await getStorefrontMerchantId();
    const session = await getSessionContext();

    let cartId = body.cartId ?? null;
    if (cartId) {
      const owned = await prisma.cart.findFirst({
        where: { id: cartId, merchantId, status: "active" },
        select: { id: true },
      });
      cartId = owned?.id ?? null;
    }

    const result = await runAgentTurn({
      message: body.message,
      threadId: body.threadId,
      cartId,
      ctx: {
        merchantId,
        customerId: session?.userId ?? null,
        sessionId: body.threadId,
        actor: "human",
      },
    });

    // If a tool created or grew a cart, hand the id back so the next turn keeps it.
    const toolCartId =
      (result.data as { cartId?: string } | null)?.cartId ?? cartId ?? null;

    return NextResponse.json({
      reply: result.reply,
      intent: result.intent,
      tools: result.tools,
      products: result.products,
      sources: result.sources,
      cartId: toolCartId,
      agentRunId: result.agentRunId,
    });
  } catch (error) {
    console.error("[chat] turn failed:", error);
    return NextResponse.json(
      { error: "Something went wrong on our side. Nothing was charged." },
      { status: 500 },
    );
  }
}
