import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAgentContext, AgentAuthError } from "@/auth/agent";
import { runTool, auditAgentRun } from "@/tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  productSlug: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(10).default(1),
  cartId: z.string().min(1).max(64).optional(),
});

/** Agent cart operations. Thin wrapper over the same addToCart tool the chat uses. */
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

  const call = await runTool("addToCart", body, ctx);

  await auditAgentRun({
    ctx,
    agentName: "ai_buyer",
    trigger: `agent-api:cart:${ctx.sessionId}`,
    userMessage: `addToCart ${body.productSlug} x${body.quantity}`,
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
