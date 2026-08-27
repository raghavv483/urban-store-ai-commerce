import { prisma } from "@/lib/db";
import type {
  ProductDetail,
  ProductListItem,
  ProductQuery,
} from "@/types/product";

const LIST_FIELDS = {
  id: true,
  slug: true,
  name: true,
  category: true,
  priceInPaise: true,
  stock: true,
  imageUrl: true,
} as const;

export async function listProducts(
  merchantId: string,
  filters: ProductQuery,
): Promise<ProductListItem[]> {
  return prisma.product.findMany({
    where: {
      merchantId,
      active: true,
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.q
        ? {
            OR: [
              { name: { contains: filters.q, mode: "insensitive" as const } },
              { description: { contains: filters.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: LIST_FIELDS,
    orderBy: [{ category: "asc" }, { priceInPaise: "desc" }],
  });
}

export async function listCategories(merchantId: string): Promise<string[]> {
  const rows = await prisma.product.findMany({
    where: { merchantId, active: true },
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
  return rows.map((r) => r.category);
}

export async function getProductBySlug(
  merchantId: string,
  slug: string,
): Promise<ProductDetail | null> {
  const product = await prisma.product.findUnique({
    where: { merchantId_slug: { merchantId, slug } },
    select: { ...LIST_FIELDS, sku: true, description: true, specifications: true },
  });

  if (!product) return null;

  return {
    ...product,
    // `specifications` is Prisma.JsonValue; the seed and admin path both write a
    // flat string map, so this narrowing is safe.
    specifications: (product.specifications ?? {}) as Record<string, string>,
  };
}
