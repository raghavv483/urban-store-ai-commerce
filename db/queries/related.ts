import "server-only";
import { prisma } from "@/lib/db";

export type RelatedProduct = {
  slug: string;
  name: string;
  category: string;
  priceInPaise: number;
  stock: number;
  score: number;
};

/**
 * Curated cross-sell for one product, highest score first.
 *
 * Reads the same `product_relations` rows that drive the chat's Day 5 upsell, so
 * the storefront and the assistant recommend the same things. Out-of-stock and
 * delisted products are dropped rather than shown as unbuyable.
 */
export async function getRelatedProducts(
  merchantId: string,
  slug: string,
  limit = 3,
): Promise<RelatedProduct[]> {
  const anchor = await prisma.product.findFirst({
    where: { merchantId, slug, active: true },
    select: { id: true },
  });
  if (!anchor) return [];

  const relations = await prisma.productRelation.findMany({
    where: { merchantId, productId: anchor.id },
    orderBy: { score: "desc" },
    take: limit * 2,
    select: {
      score: true,
      relatedProduct: {
        select: {
          slug: true,
          name: true,
          category: true,
          priceInPaise: true,
          stock: true,
          active: true,
        },
      },
    },
  });

  return relations
    .filter((r) => r.relatedProduct.active && r.relatedProduct.stock > 0)
    .slice(0, limit)
    .map((r) => ({
      slug: r.relatedProduct.slug,
      name: r.relatedProduct.name,
      category: r.relatedProduct.category,
      priceInPaise: r.relatedProduct.priceInPaise,
      stock: r.relatedProduct.stock,
      score: r.score,
    }));
}
