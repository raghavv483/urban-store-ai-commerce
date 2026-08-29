import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Razorpay is mocked: these tests exercise OUR spine, not Razorpay's API. Each
// call returns a unique order id so idempotency can't pass by coincidence.
let rzpCounter = 0;
const createOrder = vi.fn(async () => ({ id: `order_test_${++rzpCounter}` }));

vi.mock("./razorpay", () => ({
  razorpay: () => ({ orders: { create: createOrder } }),
  toReceipt: (s: string) => s.slice(0, 40),
}));

const { prisma } = await import("@/lib/db");
const { createCheckout } = await import("./checkout");
const { handleWebhookEvent, verifyWebhookSignature } = await import("./webhook");
const { seed } = await import("@/db/seed");
const { MERCHANT_SLUG } = await import("@/db/seed-data");

const TEST_SESSION = "spine-vitest-cart";
let merchantId: string;
let thinkpadId: string;
let thinkpadStockBefore: number;

async function makeCart(quantity = 1): Promise<string> {
  const cart = await prisma.cart.create({
    data: {
      merchantId,
      sessionId: TEST_SESSION,
      status: "active",
      totalInPaise: 0,
      items: { create: [{ productId: thinkpadId, quantity, priceAtTimePaise: 7_499_900 }] },
    },
    select: { id: true },
  });
  return cart.id;
}

beforeAll(async () => {
  await seed();
  const merchant = await prisma.merchant.findUniqueOrThrow({ where: { slug: MERCHANT_SLUG } });
  merchantId = merchant.id;
  const p = await prisma.product.findFirstOrThrow({
    where: { merchantId, slug: "thinkpad-x" },
    select: { id: true, stock: true },
  });
  thinkpadId = p.id;
  thinkpadStockBefore = p.stock;
});

afterAll(async () => {
  // Remove only what these tests created, then restore stock they consumed.
  const carts = await prisma.cart.findMany({
    where: { merchantId, sessionId: TEST_SESSION },
    select: { id: true },
  });
  const cartIds = carts.map((c) => c.id);
  if (cartIds.length > 0) {
    const orders = await prisma.order.findMany({
      where: { cartId: { in: cartIds } },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);
    if (orderIds.length > 0) {
      await prisma.agentRun.deleteMany({
        where: { merchantId, trigger: { contains: "spine-vitest" } },
      });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    await prisma.cart.deleteMany({ where: { id: { in: cartIds } } });
  }
  await prisma.product.update({
    where: { id: thinkpadId },
    data: { stock: thinkpadStockBefore },
  });
  await prisma.$disconnect();
});

describe("transaction spine", () => {
  it("a captured payment marks the order paid and decrements inventory exactly once", async () => {
    const cartId = await makeCart(1);
    const checkout = await createCheckout({ merchantId, cartId });

    // Amount is derived from the DB, not passed in — 1 × ThinkPad X.
    expect(checkout.amountInPaise).toBe(7_499_900);

    const stockBefore = (
      await prisma.product.findUniqueOrThrow({ where: { id: thinkpadId } })
    ).stock;

    const event = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_test_${Date.now()}`,
            order_id: checkout.razorpayOrderId,
            amount: checkout.amountInPaise,
            currency: "INR",
            method: "card",
          },
        },
      },
    };

    const first = await handleWebhookEvent(event);
    expect(first).toMatchObject({ handled: true, action: "paid" });

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: checkout.orderId },
      include: { payments: true },
    });
    expect(order.status).toBe("paid");
    expect(order.payments[0].status).toBe("captured");

    const stockAfter = (
      await prisma.product.findUniqueOrThrow({ where: { id: thinkpadId } })
    ).stock;
    expect(stockAfter).toBe(stockBefore - 1);

    // Razorpay retries webhooks. A repeat delivery must be a no-op, not a
    // second decrement — otherwise retries silently destroy inventory.
    const replay = await handleWebhookEvent(event);
    expect(replay).toMatchObject({ handled: true, action: "already_processed" });

    const stockAfterReplay = (
      await prisma.product.findUniqueOrThrow({ where: { id: thinkpadId } })
    ).stock;
    expect(stockAfterReplay).toBe(stockBefore - 1);

    // The money action is audited.
    const run = await prisma.agentRun.findFirst({
      where: { merchantId, trigger: { contains: "payment.captured" } },
      orderBy: { startedAt: "desc" },
      include: { actions: true },
    });
    expect(run?.status).toBe("succeeded");
    expect(run?.actions.map((a) => a.actionType)).toContain("decrement_inventory");
  });

  it("checking out the same cart twice returns the existing order, never a duplicate", async () => {
    const cartId = await makeCart(1);

    const first = await createCheckout({ merchantId, cartId });
    const second = await createCheckout({ merchantId, cartId });

    expect(second.orderId).toBe(first.orderId);
    expect(second.razorpayOrderId).toBe(first.razorpayOrderId);
    expect(second.reused).toBe(true);

    const count = await prisma.order.count({ where: { merchantId, cartId } });
    expect(count).toBe(1);
  });

  it("a declined payment leaves no stuck order and no inventory change", async () => {
    const cartId = await makeCart(1);
    const checkout = await createCheckout({ merchantId, cartId });

    const stockBefore = (
      await prisma.product.findUniqueOrThrow({ where: { id: thinkpadId } })
    ).stock;

    const outcome = await handleWebhookEvent({
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: `pay_fail_${Date.now()}`,
            order_id: checkout.razorpayOrderId,
            amount: checkout.amountInPaise,
            currency: "INR",
            method: "card",
            error_code: "BAD_REQUEST_ERROR",
            error_description: "Payment failed due to insufficient funds",
          },
        },
      },
    });

    expect(outcome).toMatchObject({ handled: true, action: "failed" });

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: checkout.orderId },
      include: { payments: true },
    });

    // Not paid, and not left dangling in `pending` either — no stuck order.
    expect(order.status).toBe("failed");
    expect(order.payments[0].status).toBe("failed");
    expect(order.payments[0].errorCode).toBe("BAD_REQUEST_ERROR");

    const stockAfter = (
      await prisma.product.findUniqueOrThrow({ where: { id: thinkpadId } })
    ).stock;
    expect(stockAfter).toBe(stockBefore);

    // The cart stays active so the buyer can retry — that is the recovery path.
    const cart = await prisma.cart.findUniqueOrThrow({ where: { id: cartId } });
    expect(cart.status).toBe("active");

    // Retry after a decline must be allowed and must create a NEW order.
    const retry = await createCheckout({ merchantId, cartId });
    expect(retry.orderId).not.toBe(checkout.orderId);
    expect(retry.reused).toBe(false);
  });

  it("rejects a webhook whose signature does not match the raw body", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    expect(verifyWebhookSignature(body, "deadbeef")).toBe(false);
    expect(verifyWebhookSignature(body, null)).toBe(false);
  });
});
