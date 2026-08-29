import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { listProducts, getProductBySlug } from "@/db/queries/products";
import { formatPaise } from "@/lib/money";
import { ok, fail, type AgentTool } from "./types";

/** Catalog read tools. All merchant-scoped via ToolContext, never via model input. */

export const searchProducts: AgentTool = {
  name: "searchProducts",
  effect: "read",
  description:
    "Search the store catalog by free text and/or category, optionally capped at a maximum price. Use for 'find me a laptop', 'show me accessories under 2000'. Returns matching products with price and stock.",
  inputSchema: z.object({
    // Accepts "" and normalises it away: told not to put a use case in `query`,
    // the model sends an empty string rather than omitting the key, and rejecting
    // that would fail the whole call over a formatting detail.
    query: z
      .string()
      .max(128)
      .optional()
      .transform((v) => {
        const t = v?.trim();
        return t ? t : undefined;
      })
      .describe("literal text match on product name/description; omit for use cases"),
    category: z
      .enum(["Laptops", "Monitors", "Accessories", "Audio"])
      .optional()
      .describe("exact category filter"),
    maxPriceInPaise: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("maximum unit price in PAISE, not rupees (₹80,000 = 8000000)"),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  async execute(input, ctx) {
    const { query, category, maxPriceInPaise, limit } = input as {
      query?: string;
      category?: string;
      maxPriceInPaise?: number;
      limit: number;
    };

    const applyPrice = (rows: Awaited<ReturnType<typeof listProducts>>) =>
      maxPriceInPaise === undefined
        ? rows
        : rows.filter((p) => p.priceInPaise <= maxPriceInPaise);

    let products = applyPrice(await listProducts(ctx.merchantId, { q: query, category }));
    let droppedQuery = false;

    // `query` is a literal SQL match on name/description, but the router hands it
    // whatever the shopper said — "programming", "for coding", "gaming". Those
    // describe a use case, not a product name, so they match nothing and the
    // shopper is told the catalog is empty when it isn't. When a free-text term
    // finds nothing but a structural filter exists, drop the term and return the
    // filtered set instead of a misleading empty result.
    if (products.length === 0 && query && (category || maxPriceInPaise !== undefined)) {
      products = applyPrice(await listProducts(ctx.merchantId, { category }));
      droppedQuery = products.length > 0;
    }

    const trimmed = products.slice(0, limit);

    return ok(
      trimmed.map((p) => ({
        slug: p.slug,
        name: p.name,
        category: p.category,
        priceInPaise: p.priceInPaise,
        priceDisplay: formatPaise(p.priceInPaise),
        stock: p.stock,
        inStock: p.stock > 0,
      })),
      `Found ${trimmed.length} product(s)${category ? ` in ${category}` : ""}${
        maxPriceInPaise ? ` under ${formatPaise(maxPriceInPaise)}` : ""
      }${droppedQuery ? ` (no name match for "${query}", so showing all that fit the filters)` : ""}.`,
    );
  },
};

export const getProduct: AgentTool = {
  name: "getProduct",
  effect: "read",
  description:
    "Get full detail for one product by its slug: description, specifications, price, stock, SKU.",
  inputSchema: z.object({
    slug: z.string().min(1).max(64).describe("product slug, e.g. 'thinkpad-x'"),
  }),
  async execute(input, ctx) {
    const { slug } = input as { slug: string };
    const product = await getProductBySlug(ctx.merchantId, slug);
    if (!product) return fail("NOT_FOUND", `No product with slug "${slug}".`);

    return ok(
      {
        slug: product.slug,
        name: product.name,
        category: product.category,
        priceInPaise: product.priceInPaise,
        priceDisplay: formatPaise(product.priceInPaise),
        stock: product.stock,
        sku: product.sku,
        description: product.description,
        specifications: product.specifications,
      },
      `${product.name}: ${formatPaise(product.priceInPaise)}, ${product.stock} in stock.`,
    );
  },
};

export const getInventory: AgentTool = {
  name: "getInventory",
  effect: "read",
  description:
    "Check current stock for one product by slug. Use for 'is X in stock', 'how many left'.",
  inputSchema: z.object({
    slug: z.string().min(1).max(64),
  }),
  async execute(input, ctx) {
    const { slug } = input as { slug: string };
    const product = await prisma.product.findFirst({
      where: { merchantId: ctx.merchantId, slug, active: true },
      select: { slug: true, name: true, stock: true },
    });
    if (!product) return fail("NOT_FOUND", `No product with slug "${slug}".`);

    return ok(
      { slug: product.slug, name: product.name, stock: product.stock, inStock: product.stock > 0 },
      product.stock > 0
        ? `${product.name}: ${product.stock} in stock.`
        : `${product.name} is out of stock.`,
    );
  },
};

export const getRecommendations: AgentTool = {
  name: "getRecommendations",
  effect: "read",
  description:
    "Get accessories and complementary products for a given product slug, using the store's curated cross-sell relations. Use for upsell and 'what goes with this'.",
  inputSchema: z.object({
    slug: z.string().min(1).max(64).describe("the anchor product's slug"),
    limit: z.number().int().min(1).max(10).default(3),
  }),
  async execute(input, ctx) {
    const { slug, limit } = input as { slug: string; limit: number };

    const anchor = await prisma.product.findFirst({
      where: { merchantId: ctx.merchantId, slug, active: true },
      select: { id: true, name: true },
    });
    if (!anchor) return fail("NOT_FOUND", `No product with slug "${slug}".`);

    const relations = await prisma.productRelation.findMany({
      where: { merchantId: ctx.merchantId, productId: anchor.id },
      orderBy: { score: "desc" },
      take: limit,
      include: {
        relatedProduct: {
          select: { slug: true, name: true, priceInPaise: true, stock: true, active: true },
        },
      },
    });

    const items = relations
      .filter((r) => r.relatedProduct.active)
      .map((r) => ({
        slug: r.relatedProduct.slug,
        name: r.relatedProduct.name,
        priceInPaise: r.relatedProduct.priceInPaise,
        priceDisplay: formatPaise(r.relatedProduct.priceInPaise),
        stock: r.relatedProduct.stock,
        relationType: r.relationType,
        score: r.score,
      }));

    return ok(
      items,
      `${items.length} accessory recommendation(s) for ${anchor.name}.`,
    );
  },
};
