import { prisma } from "@/lib/db";
import {
  MERCHANT_NAME,
  MERCHANT_SLUG,
  SEED_PRODUCTS,
  SEED_RELATIONS,
} from "./seed-data";

export async function seed(): Promise<void> {
  const merchant = await prisma.merchant.upsert({
    where: { slug: MERCHANT_SLUG },
    update: { name: MERCHANT_NAME },
    create: { slug: MERCHANT_SLUG, name: MERCHANT_NAME },
  });

  for (const p of SEED_PRODUCTS) {
    await prisma.product.upsert({
      where: { merchantId_slug: { merchantId: merchant.id, slug: p.slug } },
      update: {
        name: p.name,
        category: p.category,
        priceInPaise: p.priceInPaise,
        stock: p.stock,
        sku: p.sku,
        description: p.description,
        specifications: p.specifications,
        active: true,
      },
      create: {
        merchantId: merchant.id,
        slug: p.slug,
        name: p.name,
        category: p.category,
        priceInPaise: p.priceInPaise,
        stock: p.stock,
        sku: p.sku,
        description: p.description,
        specifications: p.specifications,
      },
    });
  }

  const products = await prisma.product.findMany({ where: { merchantId: merchant.id } });
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const need = (slug: string) => {
    const found = bySlug.get(slug);
    if (!found) throw new Error(`Seed error: product "${slug}" was not created`);
    return found;
  };

  for (const r of SEED_RELATIONS) {
    const product = need(r.productSlug);
    const related = need(r.relatedProductSlug);
    await prisma.productRelation.upsert({
      where: {
        productId_relatedProductId_relationType: {
          productId: product.id,
          relatedProductId: related.id,
          relationType: r.relationType,
        },
      },
      update: { score: r.score },
      create: {
        merchantId: merchant.id,
        productId: product.id,
        relatedProductId: related.id,
        relationType: r.relationType,
        score: r.score,
      },
    });
  }

  // A demo customer that prior orders and abandoned carts belong to.
  const demoCustomer = await prisma.user.upsert({
    where: { email: "rahul@urbanstore.demo" },
    update: {},
    create: {
      clerkId: "seed_demo_customer",
      email: "rahul@urbanstore.demo",
      role: "customer",
      merchantId: merchant.id,
    },
  });

  // Two prior paid orders, so the Day 7 dashboard has revenue to show —
  // one human, one ai_buyer, so AI-attributed revenue is non-zero too.
  const priorOrders = [
    {
      key: "seed-order-1",
      source: "human" as const,
      items: [{ slug: "macbook-air-m3", qty: 1 }, { slug: "usb-c-hub", qty: 1 }],
    },
    {
      key: "seed-order-2",
      source: "ai_buyer" as const,
      items: [{ slug: "monitor-27-4k", qty: 1 }, { slug: "mechanical-keyboard", qty: 1 }],
    },
  ];

  for (const o of priorOrders) {
    const existing = await prisma.order.findFirst({
      where: { merchantId: merchant.id, idempotencyKey: o.key },
    });
    if (existing) continue;

    const subtotal = o.items.reduce(
      (sum, i) => sum + need(i.slug).priceInPaise * i.qty,
      0,
    );

    await prisma.order.create({
      data: {
        merchantId: merchant.id,
        customerId: demoCustomer.id,
        idempotencyKey: o.key,
        razorpayOrderId: `order_seed_${o.key}`,
        status: "paid",
        source: o.source,
        subtotalInPaise: subtotal,
        totalInPaise: subtotal,
        items: {
          create: o.items.map((i) => ({
            productId: need(i.slug).id,
            quantity: i.qty,
            unitPriceInPaise: need(i.slug).priceInPaise,
          })),
        },
        payments: {
          create: {
            razorpayPaymentId: `pay_seed_${o.key}`,
            status: "captured",
            method: "card",
            amountInPaise: subtotal,
            capturedAt: new Date(),
          },
        },
      },
    });
  }

  // Three abandoned carts, so the Day 8 campaign agent has something to act on.
  const abandonedCarts = [
    { session: "seed-abandoned-1", items: [{ slug: "thinkpad-x", qty: 1 }] },
    {
      session: "seed-abandoned-2",
      items: [{ slug: "dell-xps-13", qty: 1 }, { slug: "noise-cancel-headset", qty: 1 }],
    },
    { session: "seed-abandoned-3", items: [{ slug: "monitor-27-4k", qty: 2 }] },
  ];

  for (const c of abandonedCarts) {
    const existing = await prisma.cart.findFirst({
      where: { merchantId: merchant.id, sessionId: c.session },
    });
    if (existing) continue;

    const total = c.items.reduce(
      (sum, i) => sum + need(i.slug).priceInPaise * i.qty,
      0,
    );

    await prisma.cart.create({
      data: {
        merchantId: merchant.id,
        sessionId: c.session,
        status: "abandoned",
        totalInPaise: total,
        items: {
          create: c.items.map((i) => ({
            productId: need(i.slug).id,
            quantity: i.qty,
            priceAtTimePaise: need(i.slug).priceInPaise,
          })),
        },
        events: {
          create: [
            { eventType: "checkout_started", metadata: { seeded: true } },
            { eventType: "abandoned", metadata: { seeded: true, reason: "left_checkout" } },
          ],
        },
      },
    });
  }
}

// Only runs when invoked directly via `npm run db:seed`, not on import from tests.
if (process.argv[1]?.includes("seed")) {
  seed()
    .then(() => console.log("Seed complete."))
    .catch((error) => {
      console.error("Seed failed:", error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
