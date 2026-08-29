import "server-only";
import { Prisma, type OrderSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { razorpay, toReceipt } from "./razorpay";
import { recordMoneyAction, type AuditActor } from "./audit";
import {
  CartError,
  InventoryError,
  priceCart,
  verifyInventory,
  type PricedCart,
} from "./cart";

export type CheckoutResult = {
  orderId: string;
  razorpayOrderId: string;
  amountInPaise: number;
  currency: string;
  /** Public key id for Razorpay Checkout in the browser. Not a secret. */
  razorpayKeyId: string;
  /** True when this call returned an order that already existed. */
  reused: boolean;
  priceDrift: boolean;
};

export class CheckoutError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

/** Statuses where an order is still awaiting payment — safe to hand back to a repeat caller. */
const OPEN_STATUSES = ["created", "pending"] as const;

/**
 * The transaction spine, steps 1-5.
 *
 *   1. Caller confirms purchase   → this function is called
 *   2. Fetch cart from DB         → priceCart
 *   3. Authoritative total        → priceCart (server-side, never a caller amount)
 *   4. Verify inventory           → verifyInventory
 *   5. Create Razorpay order      → idempotent
 *
 * There is NO amount parameter. The only inputs are identifiers; the money is
 * derived from the database (CLAUDE.md safety rule 1).
 *
 * Idempotency (safety rule 3): if an order for this cart is already open, that order
 * is returned and no second Razorpay order is created. A *failed* order does not
 * block a fresh attempt, which is what makes declined-payment retry possible.
 * The unique index on `orders.idempotency_key` is the backstop against two
 * concurrent callers racing past the read.
 */
export async function createCheckout(params: {
  merchantId: string;
  cartId: string;
  customerId?: string | null;
  source?: OrderSource;
  actor?: AuditActor;
}): Promise<CheckoutResult> {
  const { merchantId, cartId } = params;
  const source: OrderSource = params.source ?? "human";
  const actor: AuditActor = params.actor ?? "human_checkout";

  // ---- Steps 2-4: price and verify, outside the transaction (reads only) ----
  let priced: PricedCart;
  try {
    priced = await priceCart(prisma, merchantId, cartId);
    verifyInventory(priced);
  } catch (error) {
    await auditFailure(merchantId, cartId, actor, error);
    if (error instanceof InventoryError) {
      throw new CheckoutError(error.message, "INSUFFICIENT_STOCK", error.shortfalls);
    }
    if (error instanceof CartError) {
      throw new CheckoutError(error.message, error.code);
    }
    throw error;
  }

  // ---- Step 5a: reuse an open order if one exists (idempotency) ----
  const open = await prisma.order.findFirst({
    where: { merchantId, cartId, status: { in: [...OPEN_STATUSES] } },
    orderBy: { createdAt: "desc" },
  });

  if (open?.razorpayOrderId) {
    return {
      orderId: open.id,
      razorpayOrderId: open.razorpayOrderId,
      amountInPaise: open.totalInPaise,
      currency: open.currency,
      razorpayKeyId: env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      reused: true,
      priceDrift: priced.priceDrift,
    };
  }

  // Attempt number makes the idempotency key unique per retry while staying
  // deterministic, so a double-submit of the same attempt collides on the index.
  const priorAttempts = await prisma.order.count({ where: { merchantId, cartId } });
  const idempotencyKey = `cart:${cartId}:attempt:${priorAttempts + 1}`;

  // ---- Step 5b: create our order row first, then the Razorpay order ----
  // Our row is the source of truth. If the Razorpay call fails we mark it failed
  // rather than leaving a phantom paid-looking order.
  let localOrderId: string;
  try {
    const created = await prisma.order.create({
      data: {
        merchantId,
        cartId,
        customerId: params.customerId ?? priced.customerId,
        status: "created",
        source,
        subtotalInPaise: priced.subtotalInPaise,
        totalInPaise: priced.totalInPaise,
        currency: "INR",
        idempotencyKey,
        items: {
          create: priced.lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPriceInPaise: l.unitPriceInPaise,
          })),
        },
      },
      select: { id: true },
    });
    localOrderId = created.id;
  } catch (error) {
    // Unique violation on idempotency_key = a concurrent caller won the race.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const winner = await prisma.order.findUnique({ where: { idempotencyKey } });
      if (winner?.razorpayOrderId) {
        return {
          orderId: winner.id,
          razorpayOrderId: winner.razorpayOrderId,
          amountInPaise: winner.totalInPaise,
          currency: winner.currency,
          razorpayKeyId: env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          reused: true,
          priceDrift: priced.priceDrift,
        };
      }
    }
    await auditFailure(merchantId, cartId, actor, error);
    throw error;
  }

  // ---- Step 5c: call Razorpay ----
  let rzpOrderId: string;
  try {
    const rzpOrder = await razorpay().orders.create({
      amount: priced.totalInPaise, // paise, straight from the DB-derived total
      currency: "INR",
      receipt: toReceipt(localOrderId),
      notes: { merchantId, cartId, localOrderId, source },
    });
    rzpOrderId = rzpOrder.id;
  } catch (error) {
    // Razorpay unreachable or rejected the order. Leave no stuck order.
    await prisma.order.update({
      where: { id: localOrderId },
      data: { status: "failed" },
    });
    await auditFailure(merchantId, cartId, actor, error, localOrderId);
    throw new CheckoutError(
      "Could not reach the payment provider. Nothing was charged.",
      "PROVIDER_ERROR",
    );
  }

  await prisma.order.update({
    where: { id: localOrderId },
    data: { razorpayOrderId: rzpOrderId, status: "pending" },
  });

  await prisma.cartEvent.create({
    data: {
      cartId,
      eventType: "checkout_started",
      metadata: { orderId: localOrderId, razorpayOrderId: rzpOrderId },
    },
  });

  await recordMoneyAction(prisma, {
    merchantId,
    actor,
    trigger: `checkout:${cartId}`,
    inputSummary: `Checkout requested for cart ${cartId} (${priced.lines.length} line(s)).`,
    outputSummary: `Created order ${localOrderId} for ${priced.totalInPaise} paise; Razorpay order ${rzpOrderId}. Awaiting payment.`,
    status: "succeeded",
    actions: [
      {
        actionType: "calculate_total",
        parameters: { cartId },
        policyDecision: "allow: total derived server-side from DB cart",
        result: {
          subtotalInPaise: priced.subtotalInPaise,
          totalInPaise: priced.totalInPaise,
          priceDrift: priced.priceDrift,
          lines: priced.lines.map((l) => ({
            slug: l.slug,
            quantity: l.quantity,
            unitPriceInPaise: l.unitPriceInPaise,
          })),
        },
      },
      {
        actionType: "verify_inventory",
        parameters: { cartId },
        policyDecision: "allow: all lines in stock",
        result: { ok: true },
      },
      {
        actionType: "create_razorpay_order",
        parameters: { cartId, idempotencyKey, amountInPaise: priced.totalInPaise },
        policyDecision: "allow: amount from DB, idempotency key held",
        result: { orderId: localOrderId, razorpayOrderId: rzpOrderId },
      },
    ],
  });

  return {
    orderId: localOrderId,
    razorpayOrderId: rzpOrderId,
    amountInPaise: priced.totalInPaise,
    currency: "INR",
    razorpayKeyId: env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    reused: false,
    priceDrift: priced.priceDrift,
  };
}

async function auditFailure(
  merchantId: string,
  cartId: string,
  actor: AuditActor,
  error: unknown,
  orderId?: string,
): Promise<void> {
  const reason = error instanceof Error ? error.message : String(error);
  try {
    await recordMoneyAction(prisma, {
      merchantId,
      actor,
      trigger: `checkout:${cartId}`,
      inputSummary: `Checkout requested for cart ${cartId}.`,
      outputSummary: `Checkout refused: ${reason}. Nothing was charged.`,
      status: "failed",
      actions: [
        {
          actionType: "create_razorpay_order",
          parameters: { cartId, orderId: orderId ?? null },
          policyDecision: "deny",
          result: { error: reason },
        },
      ],
    });
  } catch {
    // Audit must never mask the original failure.
  }
}
