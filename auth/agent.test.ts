import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Razorpay is mocked: these tests exercise our agent boundary and spine, not
// Razorpay's API.
let counter = 0;
const createOrder = vi.fn(async () => ({ id: `order_agent_test_${++counter}` }));
vi.mock("@/payments/razorpay", () => ({
  razorpay: () => ({ orders: { create: createOrder } }),
  toReceipt: (s: string) => s.slice(0, 40),
}));

const { prisma } = await import("@/lib/db");
const { requireAgentContext, AgentAuthError } = await import("./agent");
const { runTool } = await import("@/tools");
const { handleWebhookEvent } = await import("@/payments/webhook");
const { env } = await import("@/lib/env");
const { MERCHANT_SLUG } = await import("@/db/seed-data");

const SESSION = "agent-vitest";
let merchantId: string;
let thinkpadId: string;
let stockAtStart: number;

const req = (auth?: string) =>
  new Request("http://localhost/api/agent/cart", {
    method: "POST",
    headers: {
      ...(auth ? { authorization: auth } : {}),
      "x-agent-session": SESSION,
    },
  });

beforeAll(async () => {
  const m = await prisma.merchant.findUniqueOrThrow({ where: { slug: MERCHANT_SLUG } });
  merchantId = m.id;
  const p = await prisma.product.findFirstOrThrow({
    where: { merchantId, slug: "thinkpad-x" },
    select: { id: true, stock: true },
  });
  thinkpadId = p.id;
  stockAtStart = p.stock;
}, 60_000);

afterAll(async () => {
  const carts = await prisma.cart.findMany({
    where: { merchantId, sessionId: SESSION },
    select: { id: true },
  });
  const cartIds = carts.map((c) => c.id);
  if (cartIds.length > 0) {
    await prisma.order.deleteMany({ where: { cartId: { in: cartIds } } });
    await prisma.cart.deleteMany({ where: { id: { in: cartIds } } });
  }
  await prisma.agentRun.deleteMany({ where: { merchantId, sessionId: SESSION } });
  // Restore whatever these tests consumed.
  await prisma.product.update({ where: { id: thinkpadId }, data: { stock: stockAtStart } });
  await prisma.$disconnect();
});

describe("agent auth boundary", () => {
  it("rejects a request with no key, a malformed header, or the wrong key", async () => {
    await expect(requireAgentContext(req())).rejects.toBeInstanceOf(AgentAuthError);
    await expect(requireAgentContext(req(env.AGENT_API_KEY))).rejects.toBeInstanceOf(
      AgentAuthError,
    ); // missing "Bearer " scheme
    await expect(requireAgentContext(req("Bearer "))).rejects.toBeInstanceOf(AgentAuthError);
    await expect(
      requireAgentContext(req("Bearer definitely-not-the-key")),
    ).rejects.toBeInstanceOf(AgentAuthError);

    // A near-miss must fail too — this is the case a non-constant-time compare
    // would leak through timing.
    await expect(
      requireAgentContext(req(`Bearer ${env.AGENT_API_KEY.slice(0, -1)}x`)),
    ).rejects.toBeInstanceOf(AgentAuthError);
  }, 30_000);

  it("accepts the right key and pins actor + merchantId server-side", async () => {
    const ctx = await requireAgentContext(req(`Bearer ${env.AGENT_API_KEY}`));
    expect(ctx.actor).toBe("ai_buyer");
    expect(ctx.merchantId).toBe(merchantId);
    expect(ctx.customerId).toBeNull();
  }, 30_000);
});

describe("autonomous purchase", () => {
  it("buys end to end: order paid, attributed to ai_buyer, inventory decremented", async () => {
    const ctx = await requireAgentContext(req(`Bearer ${env.AGENT_API_KEY}`));

    const add = await runTool("addToCart", { productSlug: "thinkpad-x", quantity: 1 }, ctx);
    expect(add.result.ok).toBe(true);
    const cartId = (add.result.ok ? add.result.data : null) as { cartId: string };

    const checkout = await runTool("createRazorpayOrder", { cartId: cartId.cartId }, ctx);
    expect(checkout.result.ok).toBe(true);
    const order = (checkout.result.ok ? checkout.result.data : null) as {
      orderId: string;
      razorpayOrderId: string;
      amountInPaise: number;
    };

    // The amount came from the DB, not from anything the agent supplied.
    expect(order.amountInPaise).toBe(7_499_900);

    const before = (await prisma.product.findUniqueOrThrow({ where: { id: thinkpadId } })).stock;

    const settled = await handleWebhookEvent({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_agent_${Date.now()}`,
            order_id: order.razorpayOrderId,
            amount: order.amountInPaise,
            currency: "INR",
            method: "card",
          },
        },
      },
    });
    expect(settled).toMatchObject({ handled: true, action: "paid" });

    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
    expect(row.status).toBe("paid");
    // This is what powers the merchant dashboard's AI-attributed revenue.
    expect(row.source).toBe("ai_buyer");

    const after = (await prisma.product.findUniqueOrThrow({ where: { id: thinkpadId } })).stock;
    expect(after).toBe(before - 1);
  }, 90_000);

  it("a declined agent payment leaves no stuck order and no inventory change", async () => {
    const ctx = await requireAgentContext(req(`Bearer ${env.AGENT_API_KEY}`));

    const add = await runTool("addToCart", { productSlug: "thinkpad-x", quantity: 1 }, ctx);
    const cartId = (add.result.ok ? add.result.data : null) as { cartId: string };
    const checkout = await runTool("createRazorpayOrder", { cartId: cartId.cartId }, ctx);
    const order = (checkout.result.ok ? checkout.result.data : null) as {
      orderId: string;
      razorpayOrderId: string;
      amountInPaise: number;
    };

    const before = (await prisma.product.findUniqueOrThrow({ where: { id: thinkpadId } })).stock;

    await handleWebhookEvent({
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: `pay_agent_fail_${Date.now()}`,
            order_id: order.razorpayOrderId,
            amount: order.amountInPaise,
            currency: "INR",
            method: "card",
            error_code: "BAD_REQUEST_ERROR",
            error_description: "Payment declined by the issuing bank.",
          },
        },
      },
    });

    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
    // Terminal, not dangling in `pending` — that is what "no stuck order" means.
    expect(row.status).toBe("failed");
    expect(["created", "pending"]).not.toContain(row.status);

    const after = (await prisma.product.findUniqueOrThrow({ where: { id: thinkpadId } })).stock;
    expect(after).toBe(before);

    // The cart survives, so the agent's retry has something to check out again.
    const cart = await prisma.cart.findUniqueOrThrow({ where: { id: cartId.cartId } });
    expect(cart.status).toBe("active");
  }, 90_000);
});
