import { NextResponse } from "next/server";
import { handleWebhookEvent, verifyWebhookSignature } from "@/payments/webhook";

// Never cache or pre-render: this must run per request, on the server.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Razorpay webhook receiver — spine steps 6 and 7.
 *
 * Order of operations matters:
 *   1. read the RAW body (not parsed JSON — re-serializing changes the bytes)
 *   2. verify the HMAC signature
 *   3. only then parse and act
 *
 * Returns 200 for anything we have handled or deliberately ignored, so Razorpay
 * stops retrying. Returns 400 for an invalid signature and 500 only when we
 * genuinely failed to process a legitimate event — those Razorpay should retry.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    // Do not say why. An attacker probing the endpoint learns nothing.
    console.warn("[razorpay-webhook] rejected: invalid or missing signature");
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    const outcome = await handleWebhookEvent(
      event as Parameters<typeof handleWebhookEvent>[0],
    );

    if (!outcome.handled) {
      console.error("[razorpay-webhook] could not handle event:", outcome.reason);
      return NextResponse.json({ error: outcome.reason }, { status: 400 });
    }

    return NextResponse.json({ status: outcome.action, orderId: outcome.orderId ?? null });
  } catch (error) {
    // Something in settlement failed. Return 500 so Razorpay retries — the
    // handler is idempotent, so a retry is safe.
    console.error("[razorpay-webhook] settlement failed:", error);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
