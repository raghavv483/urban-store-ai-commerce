import { productQuerySchema } from "@/types/product";
import { listCategories, listProducts } from "@/db/queries/products";
import { getStorefrontMerchantId } from "@/lib/merchant";
import { ProductGrid } from "@/components/product-grid";
import { CategoryFilter } from "@/components/category-filter";

export const metadata = { title: "Shop · Urban Store" };

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;

  // Unparseable filters degrade to "no filter" rather than erroring the page.
  const parsed = productQuerySchema.safeParse({
    category: typeof raw.category === "string" ? raw.category : undefined,
    q: typeof raw.q === "string" ? raw.q : undefined,
  });
  const filters = parsed.success ? parsed.data : {};

  const merchantId = await getStorefrontMerchantId();
  const [products, categories] = await Promise.all([
    listProducts(merchantId, filters),
    listCategories(merchantId),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Urban Store</h1>
        <p className="mt-1 text-muted-foreground">
          Laptops, monitors, and the accessories that go with them.
        </p>
      </header>

      <div className="mb-8">
        <CategoryFilter categories={categories} active={filters.category} />
      </div>

      <ProductGrid products={products} />
    </main>
  );
}
