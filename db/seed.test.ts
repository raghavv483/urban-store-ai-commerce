import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { seed } from "./seed";
import { MERCHANT_SLUG, SEED_PRODUCTS, SEED_RELATIONS } from "./seed-data";

beforeAll(async () => {
  await seed();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("seed", () => {
  it("creates the Urban Store merchant", async () => {
    const merchant = await prisma.merchant.findUnique({ where: { slug: MERCHANT_SLUG } });
    expect(merchant).not.toBeNull();
    expect(merchant?.name).toBe("Urban Store");
  });

  it("creates every seed product with prices in paise", async () => {
    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { slug: MERCHANT_SLUG } });
    const products = await prisma.product.findMany({ where: { merchantId: merchant.id } });
    expect(products).toHaveLength(SEED_PRODUCTS.length);

    const thinkpad = products.find((p) => p.slug === "thinkpad-x");
    expect(thinkpad?.priceInPaise).toBe(7_499_900);
    expect(Number.isInteger(thinkpad?.priceInPaise)).toBe(true);
  });

  it("creates the cross-sell relations", async () => {
    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { slug: MERCHANT_SLUG } });
    const relations = await prisma.productRelation.findMany({ where: { merchantId: merchant.id } });
    expect(relations).toHaveLength(SEED_RELATIONS.length);
  });

  it("creates prior paid orders so the dashboard is not empty", async () => {
    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { slug: MERCHANT_SLUG } });
    const orders = await prisma.order.findMany({
      where: { merchantId: merchant.id, status: "paid" },
    });
    expect(orders.length).toBeGreaterThanOrEqual(2);
  });

  it("creates abandoned carts, each with items and an abandoned event", async () => {
    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { slug: MERCHANT_SLUG } });
    const carts = await prisma.cart.findMany({
      // Scoped to the seed's own session ids. Asserting a bare count of abandoned
      // carts assumed this test owned the database — manual testing through
      // /test-spine abandons its previous cart on each run, so the number grew.
      where: {
        merchantId: merchant.id,
        status: "abandoned",
        sessionId: { startsWith: "seed-abandoned-" },
      },
      include: { events: true, items: true },
    });
    expect(carts.length).toBeGreaterThanOrEqual(3);
    for (const cart of carts) {
      expect(cart.items.length).toBeGreaterThan(0);
      expect(cart.events.some((e) => e.eventType === "abandoned")).toBe(true);
    }
  });

  it("is idempotent — running twice does not duplicate rows", async () => {
    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { slug: MERCHANT_SLUG } });
    const [ordersBefore, orderItemsBefore, paymentsBefore] = await Promise.all([
      prisma.order.count({ where: { merchantId: merchant.id } }),
      prisma.orderItem.count({ where: { order: { merchantId: merchant.id } } }),
      prisma.payment.count({ where: { order: { merchantId: merchant.id } } }),
    ]);

    await seed();

    const [products, relations, carts, ordersAfter, orderItemsAfter, paymentsAfter] =
      await Promise.all([
        prisma.product.count({ where: { merchantId: merchant.id } }),
        prisma.productRelation.count({ where: { merchantId: merchant.id } }),
        prisma.cart.count({
          where: {
            merchantId: merchant.id,
            status: "abandoned",
            sessionId: { startsWith: "seed-abandoned-" },
          },
        }),
        prisma.order.count({ where: { merchantId: merchant.id } }),
        prisma.orderItem.count({ where: { order: { merchantId: merchant.id } } }),
        prisma.payment.count({ where: { order: { merchantId: merchant.id } } }),
      ]);
    expect(products).toBe(SEED_PRODUCTS.length);
    expect(relations).toBe(SEED_RELATIONS.length);
    expect(carts).toBe(3);
    expect(ordersAfter).toBe(ordersBefore);
    expect(orderItemsAfter).toBe(orderItemsBefore);
    expect(paymentsAfter).toBe(paymentsBefore);
  });
});
