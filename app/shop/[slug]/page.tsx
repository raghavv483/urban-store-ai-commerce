import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductBySlug } from "@/db/queries/products";
import { getStorefrontMerchantId } from "@/lib/merchant";
import { formatPaise } from "@/lib/money";
import { ProductVisual } from "@/components/product-visual";
import { AddToCart } from "@/components/add-to-cart";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const merchantId = await getStorefrontMerchantId();
  const product = await getProductBySlug(merchantId, slug);

  if (!product) notFound();

  const specs = Object.entries(product.specifications);
  const inStock = product.stock > 0;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <nav className="text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/shop" className="transition-colors hover:text-foreground">
          Shop
        </Link>
        <span className="mx-2">/</span>
        <Link
          href={`/shop?category=${encodeURIComponent(product.category)}`}
          className="transition-colors hover:text-foreground"
        >
          {product.category}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{product.name}</span>
      </nav>

      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <ProductVisual
          category={product.category}
          slug={product.slug}
          className="aspect-[4/3] w-full rounded-2xl border"
        />

        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {product.category}
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{product.name}</h1>

          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-3xl font-bold tabular-nums tracking-tight">
              {formatPaise(product.priceInPaise)}
            </span>
            <span
              className={
                inStock
                  ? "text-sm text-emerald-700 dark:text-emerald-400"
                  : "text-sm text-muted-foreground"
              }
            >
              {inStock ? `${product.stock} in stock` : "Out of stock"}
            </span>
          </div>

          {product.description ? (
            <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground">
              {product.description}
            </p>
          ) : null}

          <div className="mt-7 max-w-sm">
            <AddToCart slug={product.slug} inStock={inStock} size="large" />
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Free delivery above &#8377;999 &middot; 14-day returns &middot; SKU{" "}
            {product.sku}
          </p>

          <p className="mt-3 text-sm">
            <Link href="/ai-shopping" className="underline underline-offset-2">
              Ask about this product
            </Link>{" "}
            <span className="text-muted-foreground">
              — returns, warranty, or what pairs with it.
            </span>
          </p>
        </div>
      </div>

      {specs.length > 0 ? (
        <section className="mt-14">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Specifications
          </h2>
          <dl className="mt-3 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2">
            {specs.map(([key, value]) => (
              <div key={key} className="flex justify-between gap-4 bg-card px-4 py-3">
                <dt className="text-sm capitalize text-muted-foreground">{key}</dt>
                <dd className="text-sm font-medium">
                  {typeof value === "object" && value !== null
                    ? JSON.stringify(value)
                    : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </main>
  );
}
