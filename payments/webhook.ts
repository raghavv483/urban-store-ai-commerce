import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { recordMoneyAction } from "./audit";

/**
 * Spine step 6 — verify the webhook signature.
 *
 * Razorpay signs the RAW request body with the webhook secret (HMAC SHA-256, hex).
 * The comparison is timing-safe. A frontend "payment success" callback is NEVER
 * proof of payment (CLAUDE.md safety rule 2); only a signature-verified webhook
 * may move an order to paid.
 *
 * Must be given the raw body string — re-serializing parsed JSON changes bytes and
 * breaks the digest.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;

  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");

  // timingSafeEqual throws on length mismatch, so guard first.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

type RazorpayPaymentEntity = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  method?: string;
  error_code?: string | null;
  error_description?: string | null;
};

export type WebhookOutcome =
  | { handled: true; action: "paid" | "failed" | "already_processed" | "ignored"; orderId?: string }
  | { handled: false; reason: string };

/**
 * Spine step 7 — settle the payment.
 *
 * Idempotent (safety rule 3): a repeat delivery of an already-captured payment is a
 * no-op. Razorpay retries webhooks, so this WILL be called more than once for the
 * same payment in normal operation.
 *
 * Everything that must agree — order status, payment row, inventory — moves inside
 * one transaction, so a crash cannot leave an order paid with stock un-decremented.
 */
export async function handleWebhookEvent(event: {
  event: string;
  payload?: { payment?: { entity?: RazorpayPaymentEntity } };
}): Promise<WebhookOutcome> {
  const entity = event.payload?.payment?.entity;

  if (event.event !== "payment.captured" && event.event !== "payment.failed") {
    return { handled: true, action: "ignored" };
  }
  if (!entity?.id || !entity.order_id) {
    return { handled: false, reason: "Event missing payment id or order id." };
  }

  const order = await prisma.order.findUnique({
    where: { razorpayOrderId: entity.order_id },
    include: { items: true },
  });

  if (!order) {
    // Not ours (or another environment's). Acknowledge so Razorpay stops retrying.
    return { handled: true, action: "ignored" };
  }

  // ---- Idempotency gate ----
  const existingPayment = await prisma.payment.findUnique({
    where: { razorpayPaymentId: entity.id },
  });
  if (existingPayment) {
    return { handled: true, action: "already_processed", orderId: order.id };
  }
  if (order.status === "paid" && event.event === "payment.captured") {
    return { handled: true, action: "already_processed", orderId: order.id };
  }

  if (event.event === "payment.failed") {
    return settleFailure(order.id, order.merchantId, order.cartId, entity);
  }

  return settleCapture(order.id, order.merchantId, order.cartId, order.items, entity);
}

async function settleCapture(
  orderId: string,
  merchantId: string,
  cartId: string | null,
  items: Array<{ productId: string; quantity: number }>,
  entity: RazorpayPaymentEntity,
): Promise<WebhookOutcome> {
  await prisma.$transaction(async (tx) => {
    // Re-check inside the transaction: a concurrent delivery may have won.
    const fresh = await tx.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    if (fresh?.status === "paid") return;

    await tx.payment.create({
      data: {
        orderId,
        razorpayPaymentId: entity.id,
        status: "captured",
        method: entity.method ?? null,
        amountInPaise: entity.amount,
        capturedAt: new Date(),
      },
    });

    await tx.order.update({ where: { id: orderId }, data: { status: "paid" } });

    // Decrement inventory. `decrement` is atomic in Postgres, so concurrent
    // orders cannot both read the same stock and overwrite each other.
    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }

    if (cartId) {
      await tx.cart.update({
        where: { id: cartId },
        data: { status: "checked_out" },
      });
    }

    await recordMoneyAction(tx, {
      merchantId,
      actor: "razorpay_webhook",
      trigger: `webhook:payment.captured:${entity.id}`,
      inputSummary: `Signature-verified payment.captured for Razorpay order ${entity.order_id}.`,
      outputSummary: `Order ${orderId} marked paid for ${entity.amount} paise; inventory decremented for ${items.length} line(s).`,
      status: "succeeded",
      actions: [
        {
          actionType: "verify_webhook_signature",
          parameters: { razorpayOrderId: entity.order_id },
          policyDecision: "allow: HMAC SHA-256 signature valid",
          result: { verified: true },
        },
        {
          actionType: "mark_order_paid",
          parameters: { orderId, razorpayPaymentId: entity.id },
          policyDecision: "allow: verified webhook is the only path to paid",
          result: { amountInPaise: entity.amount, method: entity.method ?? null },
        },
        {
          actionType: "decrement_inventory",
          parameters: { orderId },
          policyDecision: "allow: payment captured",
          result: {
            lines: items.map((i) => ({ productId: i.productId, by: i.quantity })),
          },
        },
      ],
    });
  });

  return { handled: true, action: "paid", orderId };
}

async function settleFailure(
  orderId: string,
  merchantId: string,
  cartId: string | null,
  entity: RazorpayPaymentEntity,
): Promise<WebhookOutcome> {
  await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        orderId,
        razorpayPaymentId: entity.id,
        status: "failed",
        method: entity.method ?? null,
        amountInPaise: entity.amount,
        errorCode: entity.error_code ?? null,
        errorDescription: entity.error_description ?? null,
      },
    });

    // Order goes to `failed`, NOT paid. Inventory is untouched. The cart stays
    // active so the buyer can retry — this is the graceful-failure path.
    await tx.order.update({ where: { id: orderId }, data: { status: "failed" } });

    if (cartId) {
      await tx.cartEvent.create({
        data: {
          cartId,
          eventType: "payment_failed",
          metadata: {
            orderId,
            code: entity.error_code ?? null,
            description: entity.error_description ?? null,
          },
        },
      });
    }

    await recordMoneyAction(tx, {
      merchantId,
      actor: "razorpay_webhook",
      trigger: `webhook:payment.failed:${entity.id}`,
      inputSummary: `Signature-verified payment.failed for Razorpay order ${entity.order_id}.`,
      outputSummary: `Payment declined (${entity.error_code ?? "unknown"}): ${
        entity.error_description ?? "no description"
      }. Order ${orderId} marked failed. Nothing charged, inventory unchanged, cart still open for retry.`,
      status: "failed",
      actions: [
        {
          actionType: "verify_webhook_signature",
          parameters: { razorpayOrderId: entity.order_id },
          policyDecision: "allow: HMAC SHA-256 signature valid",
          result: { verified: true },
        },
        {
          actionType: "mark_order_failed",
          parameters: { orderId, razorpayPaymentId: entity.id },
          policyDecision: "deny: payment not captured, order must not be marked paid",
          result: {
            code: entity.error_code ?? null,
            description: entity.error_description ?? null,
            inventoryChanged: false,
          },
        },
      ],
    });
  });

  return { handled: true, action: "failed", orderId };
}
