import Link from "next/link";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPaise } from "@/lib/money";
import type { ProductListItem } from "@/types/product";

export function ProductCard({ product }: { product: ProductListItem }) {
  const inStock = product.stock > 0;

  return (
    <Card className="flex h-full flex-col transition-shadow hover:shadow-md">
      <CardContent className="flex-1 pt-6">
        <Badge variant="secondary" className="mb-3">
          {product.category}
        </Badge>
        <Link
          href={`/shop/${product.slug}`}
          className="text-lg font-semibold hover:underline"
        >
          {product.name}
        </Link>
      </CardContent>
      <CardFooter className="flex items-center justify-between border-t pt-4">
        <span className="text-xl font-bold tabular-nums">
          {formatPaise(product.priceInPaise)}
        </span>
        <span
          className={
            inStock ? "text-sm text-emerald-600" : "text-sm text-muted-foreground"
          }
        >
          {inStock ? `${product.stock} in stock` : "Out of stock"}
        </span>
      </CardFooter>
    </Card>
  );
}
