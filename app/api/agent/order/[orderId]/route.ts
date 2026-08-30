import { NextResponse } from "next/server";
import { requireAgentContext, AgentAuthError } from "@/auth/agent";
import { runTool } from "@/tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Order + payment status, for a buyer polling after it submits payment. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  let ctx;
  try {
    ctx = await requireAgentContext(request);
  } catch (error) {
    if (error instanceof AgentAuthError) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    throw error;
  }

  const { orderId } = await params;
  // Reads are not audited: polling would flood the trail and tell a merchant
  // nothing about what the agent decided. Only actions are recorded.
  const call = await runTool("getPaymentStatus", { orderId }, ctx);

  if (!call.result.ok) {
    return NextResponse.json(
      { error: call.result.error, code: call.result.code },
      { status: call.result.code === "NOT_FOUND" ? 404 : 400 },
    );
  }

  return NextResponse.json(call.result.data);
}
