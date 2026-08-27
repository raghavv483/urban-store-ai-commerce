import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { getProductBySlug } from "@/db/queries/products";
import { getStorefrontMerchantId } from "@/lib/merchant";
import { formatPaise } from "@/lib/money";

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

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/shop" className="text-sm text-muted-foreground hover:underline">
        ← Back to shop
      </Link>

      <div className="mt-6">
        <Badge variant="secondary">{product.category}</Badge>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">{product.name}</h1>
        <p className="mt-2 text-2xl font-bold tabular-nums">
          {formatPaise(product.priceInPaise)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"} · SKU{" "}
          {product.sku}
        </p>
      </div>

      {product.description ? (
        <p className="mt-6 leading-relaxed">{product.description}</p>
      ) : null}

      {specs.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Specifications</h2>
          <dl className="divide-y rounded-lg border">
            {specs.map(([key, value]) => (
              <div key={key} className="flex justify-between px-4 py-3 text-sm">
                <dt className="capitalize text-muted-foreground">{key}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </main>
  );
}
