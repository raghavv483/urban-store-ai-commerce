import "server-only";
import { prisma } from "@/lib/db";
import { formatPaise } from "@/lib/money";

/**
 * Builds the machine-readable catalog document.
 *
 * Extracted so `/api/agent/catalog` and the human-readable `/agent-catalog` page
 * render the SAME object from the SAME code. If the page called the endpoint over
 * HTTP it would be a second, drifting representation; if it rebuilt the shape
 * itself it would be a mockup. This way the page is genuinely a window onto the
 * feed rather than a picture of it.
 */
export async function buildAgentCatalog(merchantId: string) {
  const [merchant, products, relations] = await Promise.all([
    prisma.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      select: { name: true, slug: true },
    }),
    prisma.product.findMany({
      where: { merchantId, active: true },
      select: {
        slug: true,
        name: true,
        category: true,
        priceInPaise: true,
        currency: true,
        stock: true,
        sku: true,
        description: true,
        specifications: true,
      },
      orderBy: [{ category: "asc" }, { priceInPaise: "desc" }],
    }),
    prisma.productRelation.findMany({
      where: { merchantId },
      orderBy: { score: "desc" },
      select: {
        relationType: true,
        product: { select: { slug: true } },
        relatedProduct: { select: { slug: true, active: true } },
      },
    }),
  ]);

  const compatible = new Map<string, string[]>();
  for (const r of relations) {
    if (!r.relatedProduct.active) continue;
    const list = compatible.get(r.product.slug) ?? [];
    list.push(r.relatedProduct.slug);
    compatible.set(r.product.slug, list);
  }

  return {
    merchant: { name: merchant.name, slug: merchant.slug },
    currency: "INR",
    // Stated once rather than repeated per product: it is a store-wide policy,
    // and duplicating it would invite an agent to treat it as per-item.
    returnPolicy: {
      windowDays: 14,
      startsFrom: "delivery",
      conditions:
        "Original packaging and all included accessories. Opened hygiene-sealed audio and final-sale items are excluded.",
      source: "/api/agent/catalog",
    },
    products: products.map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      priceInPaise: p.priceInPaise,
      priceDisplay: formatPaise(p.priceInPaise),
      currency: p.currency,
      stock: p.stock,
      inStock: p.stock > 0,
      sku: p.sku,
      description: p.description,
      attributes: p.specifications,
      compatibleWith: compatible.get(p.slug) ?? [],
      returnEligible: true,
    })),
    /*
     * Honest framing: Urban Store does NOT implement ACP, AP2, x402 or NPCI's
     * UAP. No agent-payments protocol is spoken on the wire here.
     *
     * What it does have is the shape those protocols assume: a machine-readable
     * catalog a buyer can discover without credentials, a bearer-authenticated
     * action surface, server-derived amounts an agent cannot influence, and a
     * signed settlement callback. Adopting one of them would be adapter work at
     * this boundary, not a redesign.
     */
    protocols: {
      implemented: [],
      note: "No agent-payments protocol is implemented. This endpoint is shaped to be adaptable to ACP, AP2, x402 or NPCI UAP: open discovery, bearer-authenticated actions, server-derived amounts, and signature-verified settlement.",
      references: ["ACP", "AP2", "x402", "NPCI UAP"],
    },
    // Tells a consuming agent how to actually transact, so discovery and
    // action are one hop apart rather than requiring out-of-band docs.
    actions: {
      addToCart: {
        method: "POST",
        path: "/api/agent/cart",
        auth: "Bearer AGENT_API_KEY",
        body: {
          productSlug: "string",
          quantity: "integer >= 1",
          cartId: "string (optional)",
        },
      },
      checkout: {
        method: "POST",
        path: "/api/agent/checkout",
        auth: "Bearer AGENT_API_KEY",
        body: { cartId: "string" },
        note: "No amount is accepted. The total is derived from the cart server-side.",
      },
      orderStatus: {
        method: "GET",
        path: "/api/agent/order/{orderId}",
        auth: "Bearer AGENT_API_KEY",
      },
    },
  };
}

export type AgentCatalog = Awaited<ReturnType<typeof buildAgentCatalog>>;
