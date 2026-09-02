import Link from "next/link";
import { formatPaise } from "@/lib/money";
import { ProductVisual } from "./product-visual";
import { AddToCart } from "./add-to-cart";
import type { ProductListItem } from "@/types/product";

export function ProductCard({
  product,
  compact = false,
}: {
  product: ProductListItem;
  /** Inline card for the chat — no add button, tighter. */
  compact?: boolean;
}) {
  const inStock = product.stock > 0;
  const lowStock = inStock && product.stock <= 8;

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-shadow duration-200 hover:shadow-lg hover:shadow-foreground/5">
      <Link href={`/shop/${product.slug}`} className="block" tabIndex={-1} aria-hidden="true">
        <ProductVisual
          category={product.category}
          slug={product.slug}
          className={compact ? "h-24" : "h-36"}
        />
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {product.category}
        </div>

        <h3 className="mt-1.5 text-[15px] font-semibold leading-snug tracking-tight">
          <Link
            href={`/shop/${product.slug}`}
            className="after:absolute after:inset-0 hover:underline focus-visible:underline"
          >
            {product.name}
          </Link>
        </h3>

        <div className="mt-3 flex items-baseline justify-between gap-2">
          <span className="text-lg font-bold tabular-nums tracking-tight">
            {formatPaise(product.priceInPaise)}
          </span>
          {/* When out of stock the disabled button already says so; repeating it
              here read as an error rather than a state. */}
          {inStock ? (
            <span
              className={
                lowStock
                  ? "text-xs font-medium text-amber-700 dark:text-amber-400"
                  : "text-xs text-emerald-700 dark:text-emerald-400"
              }
            >
              {lowStock ? `Only ${product.stock} left` : "In stock"}
            </span>
          ) : compact ? (
            <span className="text-xs text-muted-foreground">Out of stock</span>
          ) : null}
        </div>

        {compact ? null : (
          <div className="relative z-10 mt-4">
            <AddToCart slug={product.slug} inStock={inStock} />
          </div>
        )}
      </div>
    </article>
  );
}
