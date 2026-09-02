"use client";

import Link from "next/link";
import { ProductVisual } from "@/components/product-visual";
import { AddToCart } from "@/components/add-to-cart";
import { StaggerIn, StaggerItem, motion, cardHover } from "@/components/motion";
import type { RelatedProduct } from "@/db/queries/related";

/**
 * Frequently bought together.
 *
 * A horizontal row rather than a grid: these are secondary to the product being
 * viewed, and a row reads as an aside where a grid would compete with the main
 * listing. Each card adds directly — the point is not having to leave this page.
 */
export function FrequentlyBought({
  products,
  anchorName,
  totalDisplay,
}: {
  products: RelatedProduct[];
  anchorName: string;
  totalDisplay: string;
}) {
  if (products.length === 0) return null;

  return (
    <section className="mt-16">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-heading">
          Frequently bought with the {anchorName}
        </h2>
        <span className="text-meta text-muted-foreground">
          Add all three and the total comes to {totalDisplay}
        </span>
      </div>

      <StaggerIn className="mt-4 flex gap-4 overflow-x-auto pb-2 [scrollbar-width:thin] sm:grid sm:grid-cols-3 sm:overflow-visible">
        {products.map((p) => (
          <StaggerItem key={p.slug} className="min-w-[240px] flex-1 sm:min-w-0">
            <motion.article
              {...cardHover}
              className="flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:elevate"
            >
              <Link href={`/shop/${p.slug}`} aria-label={p.name}>
                <ProductVisual
                  category={p.category}
                  slug={p.slug}
                  className="h-28"
                />
              </Link>

              <div className="flex flex-1 flex-col p-4">
                <Link
                  href={`/shop/${p.slug}`}
                  className="text-body font-semibold leading-snug hover:underline"
                >
                  {p.name}
                </Link>
                <div className="mt-1 text-meta text-muted-foreground">
                  {p.category}
                </div>

                <div className="mt-3 flex items-baseline justify-between gap-2">
                  <span className="text-heading font-bold tabular-nums">
                    ₹{(p.priceInPaise / 100).toLocaleString("en-IN")}
                  </span>
                  <span className="text-meta text-emerald-700 dark:text-emerald-400">
                    In stock
                  </span>
                </div>

                <div className="mt-4">
                  <AddToCart slug={p.slug} productName={p.name} inStock />
                </div>
              </div>
            </motion.article>
          </StaggerItem>
        ))}
      </StaggerIn>
    </section>
  );
}
