import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductBySlug } from "@/db/queries/products";
import { getRelatedProducts } from "@/db/queries/related";
import { getStorefrontMerchantId } from "@/lib/merchant";
import { formatPaise } from "@/lib/money";
import { ProductVisual } from "@/components/product-visual";
import { AddToCart } from "@/components/add-to-cart";
import { PageIn } from "@/components/motion";
import { FrequentlyBought } from "./frequently-bought";
import { SpecTable } from "./spec-table";

export const dynamic = "force-dynamic";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const merchantId = await getStorefrontMerchantId();
  const product = await getProductBySlug(merchantId, slug);

  if (!product) notFound();

  const related = await getRelatedProducts(merchantId, slug, 3);
  const specs = Object.entries(product.specifications);
  const inStock = product.stock > 0;
  const lowStock = inStock && product.stock <= 8;

  const bundleTotal =
    product.priceInPaise + related.reduce((s, r) => s + r.priceInPaise, 0);

  return (
    <PageIn className="mx-auto max-w-5xl px-6 py-8">
      <nav className="text-meta text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/shop" className="transition-colors hover:text-foreground">
          Shop
        </Link>
        <span className="mx-2 opacity-50">/</span>
        <Link
          href={`/shop?category=${encodeURIComponent(product.category)}`}
          className="transition-colors hover:text-foreground"
        >
          {product.category}
        </Link>
        <span className="mx-2 opacity-50">/</span>
        <span className="text-foreground">{product.name}</span>
      </nav>

      <div className="mt-7 grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
        <ProductVisual
          category={product.category}
          slug={product.slug}
          className="aspect-[4/3] w-full rounded-2xl border"
        />

        <div className="flex flex-col">
          <div className="text-eyebrow uppercase text-muted-foreground">
            {product.category}
          </div>
          <h1 className="mt-2 text-title">{product.name}</h1>

          <div className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-title tabular-nums">
              {formatPaise(product.priceInPaise)}
            </span>
            <span
              className={
                !inStock
                  ? "text-meta text-muted-foreground"
                  : lowStock
                    ? "text-meta font-medium text-amber-700 dark:text-amber-400"
                    : "text-meta text-emerald-700 dark:text-emerald-400"
              }
            >
              {!inStock
                ? "Out of stock"
                : lowStock
                  ? `Only ${product.stock} left`
                  : `${product.stock} in stock`}
            </span>
          </div>

          {product.description ? (
            <p className="mt-5 max-w-prose text-body text-muted-foreground">
              {product.description}
            </p>
          ) : null}

          <div className="mt-7 max-w-sm">
            <AddToCart
              slug={product.slug}
              productName={product.name}
              inStock={inStock}
              size="large"
            />
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t pt-5 text-meta">
            <div>
              <dt className="text-muted-foreground">Delivery</dt>
              <dd className="mt-0.5 font-medium">Free above ₹999</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Returns</dt>
              <dd className="mt-0.5 font-medium">14 days</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">SKU</dt>
              <dd className="mt-0.5 font-mono text-xs">{product.sku}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Questions?</dt>
              <dd className="mt-0.5">
                <Link
                  href="/ai-shopping"
                  className="font-medium text-primary hover:underline"
                >
                  Ask the assistant
                </Link>
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {specs.length > 0 ? <SpecTable specs={specs} /> : null}

      <FrequentlyBought
        products={related}
        anchorName={product.name}
        totalDisplay={formatPaise(bundleTotal)}
      />
    </PageIn>
  );
}
