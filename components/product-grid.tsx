"use client";

import { ProductCard } from "./product-card";
import { StaggerIn, StaggerItem, motion, cardHover } from "./motion";
import type { ProductListItem } from "@/types/product";

export function ProductGrid({ products }: { products: ProductListItem[] }) {
  if (products.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-dashed p-14 text-center"
      >
        <p className="text-body font-medium">No products match that search.</p>
        <p className="mt-1 text-meta text-muted-foreground">
          Try a different category, or clear the filters.
        </p>
      </motion.div>
    );
  }

  return (
    <StaggerIn className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => (
        <StaggerItem key={product.id} className="h-full">
          <motion.div {...cardHover} className="h-full">
            <ProductCard product={product} />
          </motion.div>
        </StaggerItem>
      ))}
    </StaggerIn>
  );
}
