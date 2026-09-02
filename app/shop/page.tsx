import Link from "next/link";
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
      <header className="mb-10">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Urban Store</h1>
            <p className="mt-2 max-w-md text-[15px] text-muted-foreground">
              Laptops, monitors and the accessories that go with them. Browse below,
              or just describe what you need.
            </p>
          </div>

          {/* Second, larger entry point: a visitor who scrolls past the header
              still finds the conversational storefront. */}
          <Link
            href="/ai-shopping"
            className="group flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-shadow hover:shadow-md"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                <path d="M8 0l1.6 4.6L14 6.2l-4.4 1.6L8 12.4 6.4 7.8 2 6.2l4.4-1.6L8 0zM13 10l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" />
              </svg>
            </span>
            <span>
              <span className="block text-sm font-semibold">Shop with AI</span>
              <span className="block text-xs text-muted-foreground">
                &ldquo;a laptop under &#8377;80,000 for coding&rdquo;
              </span>
            </span>
          </Link>
        </div>
      </header>

      <div className="mb-8">
        <CategoryFilter categories={categories} active={filters.category} />
      </div>

      <ProductGrid products={products} />
    </main>
  );
}
