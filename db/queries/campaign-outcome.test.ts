import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { MERCHANT_SLUG } from "@/db/seed-data";
import { getCampaignOutcome } from "./campaigns";

const TAG = "outcome-vitest";
let merchantId: string;
let customerId: string;
let productId: string;
const cartIds: string[] = [];
const campaignIds: string[] = [];

/** Builds an active campaign whose approval moment is `approvedAt`. */
async function makeCampaign(targets: string[], approvedAt: Date) {
  const c = await prisma.campaign.create({
    data: {
      merchantId,
      type: "cart_recovery",
      name: `${TAG} campaign`,
      status: "active",
      approvedBy: "tester@urbanstore.test",
      content: "copy",
      targetDefinition: { cartIds: targets, cartCount: targets.length },
    },
  });
  // `updatedAt` is @updatedAt so it cannot be set on create; force it to the
  // moment we want to measure from.
  await prisma.$executeRaw`UPDATE campaigns SET updated_at = ${approvedAt} WHERE id = ${c.id}`;
  campaignIds.push(c.id);
  const fresh = await prisma.campaign.findUniqueOrThrow({ where: { id: c.id } });
  return {
    status: fresh.status,
    updatedAt: fresh.updatedAt,
    target: { ...(fresh.targetDefinition as object) } as never,
  };
}

async function makeCart(): Promise<string> {
  const cart = await prisma.cart.create({
    data: { merchantId, customerId, sessionId: TAG, status: "abandoned", totalInPaise: 1000 },
  });
  cartIds.push(cart.id);
  return cart.id;
}

async function makePaidOrder(cartId: string | null, at: Date, totalInPaise: number) {
  const o = await prisma.order.create({
    data: {
      merchantId,
      customerId,
      cartId,
      status: "paid",
      source: "human",
      subtotalInPaise: totalInPaise,
      totalInPaise,
      idempotencyKey: `${TAG}-${Math.random()}`,
    },
  });
  await prisma.$executeRaw`UPDATE orders SET created_at = ${at} WHERE id = ${o.id}`;
  return o.id;
}

beforeAll(async () => {
  const m = await prisma.merchant.findUniqueOrThrow({ where: { slug: MERCHANT_SLUG } });
  merchantId = m.id;
  const u = await prisma.user.upsert({
    where: { email: `${TAG}@urbanstore.test` },
    update: {},
    create: { clerkId: `${TAG}-clerk`, email: `${TAG}@urbanstore.test`, role: "customer", merchantId },
  });
  customerId = u.id;
  const p = await prisma.product.findFirstOrThrow({ where: { merchantId }, select: { id: true } });
  productId = p.id;
  void productId;
}, 60_000);

afterAll(async () => {
  await prisma.order.deleteMany({ where: { customerId } });
  if (campaignIds.length) await prisma.campaign.deleteMany({ where: { id: { in: campaignIds } } });
  if (cartIds.length) await prisma.cart.deleteMany({ where: { id: { in: cartIds } } });
  await prisma.user.deleteMany({ where: { id: customerId } });
  await prisma.$disconnect();
});

describe("campaign outcome", () => {
  it("counts a paid order after approval, ignores one from before", async () => {
    const cart = await makeCart();
    const approvedAt = new Date(Date.now() - 60 * 60 * 1000);

    // A purchase BEFORE the campaign ran must never be claimed as recovery.
    await makePaidOrder(cart, new Date(approvedAt.getTime() - 60_000), 500_000);
    const campaign = await makeCampaign([cart], approvedAt);

    let outcome = await getCampaignOutcome(merchantId, campaign);
    expect(outcome!.recoveredCartCount).toBe(0);
    expect(outcome!.recoveredInPaise).toBe(0);

    // Now one after approval — that is attributable.
    await makePaidOrder(cart, new Date(approvedAt.getTime() + 60_000), 740_000);
    outcome = await getCampaignOutcome(merchantId, campaign);
    expect(outcome!.recoveredCartCount).toBe(1);
    expect(outcome!.recoveredInPaise).toBe(740_000);
    expect(outcome!.recoveryRatePercent).toBe(100);
  }, 60_000);

  it("never counts more carts than it targeted when one customer owned several", async () => {
    const a = await makeCart();
    const b = await makeCart();
    const c = await makeCart();
    const approvedAt = new Date(Date.now() - 30 * 60 * 1000);
    const campaign = await makeCampaign([a, b, c], approvedAt);

    // One order, no cart link — the same customer buying again. It may claim at
    // most one of their three targeted carts, not all three.
    await makePaidOrder(null, new Date(approvedAt.getTime() + 60_000), 250_000);

    const outcome = await getCampaignOutcome(merchantId, campaign);
    expect(outcome!.targetCartCount).toBe(3);
    expect(outcome!.recoveredCartCount).toBe(1);
    expect(outcome!.recoveredInPaise).toBe(250_000);
    expect(outcome!.recoveredCartCount).toBeLessThanOrEqual(outcome!.targetCartCount);
  }, 60_000);
});
