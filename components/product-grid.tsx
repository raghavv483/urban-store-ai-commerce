import { ProductCard } from "./product-card";
import type { ProductListItem } from "@/types/product";

export function ProductGrid({ products }: { products: ProductListItem[] }) {
  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="font-medium">No products match that search.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Try a different category, or clear the filters.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
