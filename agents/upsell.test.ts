import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { MERCHANT_SLUG } from "@/db/seed-data";
import { runAgentTurn } from "./router";
import type { ToolContext } from "@/tools";

const SESSION = "upsell-vitest";
let ctx: ToolContext;

beforeAll(async () => {
  const m = await prisma.merchant.findUniqueOrThrow({ where: { slug: MERCHANT_SLUG } });
  ctx = { merchantId: m.id, customerId: null, sessionId: SESSION, actor: "human" };
}, 60_000);

afterAll(async () => {
  // Remove only carts these tests created.
  await prisma.cart.deleteMany({ where: { merchantId: ctx.merchantId, sessionId: SESSION } });
  await prisma.agentRun.deleteMany({ where: { merchantId: ctx.merchantId, sessionId: SESSION } });
  await prisma.$disconnect();
});

describe("active upsell", () => {
  it("proposes an accessory when a laptop is added, and only adds it once accepted", async () => {
    const thread = `${SESSION}-${Date.now()}`;

    const add = await runAgentTurn({
      message: "add a thinkpad x to my cart",
      ctx,
      threadId: thread,
    });

    expect(add.tools).toContain("addToCart");

    // A cross-sell accessory is named with its real price, phrased as an offer.
    expect(add.reply).toMatch(/USB-C Hub|Laptop Sleeve|Wireless Mouse/i);
    expect(add.reply).toMatch(/want me to add it/i);

    // Crucially: proposing must NOT have changed the cart. One line only.
    const cartId = (add as unknown as { data?: { cartId?: string } }).data?.cartId;
    const afterOffer = await prisma.cartItem.count({
      where: { cart: { merchantId: ctx.merchantId, sessionId: SESSION } },
    });
    expect(afterOffer).toBe(1);

    // Accepting adds it and shows the total moving.
    const accept = await runAgentTurn({
      message: "yes",
      ctx,
      cartId: cartId ?? null,
      threadId: thread,
    });

    expect(accept.reply).toMatch(/Cart total is now ₹[\d,]+, up from ₹[\d,]+/);

    const afterAccept = await prisma.cartItem.count({
      where: { cart: { merchantId: ctx.merchantId, sessionId: SESSION } },
    });
    expect(afterAccept).toBe(2);
  }, 120_000);
});
