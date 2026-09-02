import Link from "next/link";
import { prisma } from "@/lib/db";
import { getStorefrontMerchantId } from "@/lib/merchant";
import { formatPaise } from "@/lib/money";
import { priceCart, CartError } from "@/payments/cart";
import { SpineControls } from "../test-spine/spine-controls";
import { CartLineControls } from "./cart-line";

export const dynamic = "force-dynamic";
export const metadata = { title: "Checkout · Urban Store" };

/**
 * Checkout page. The order summary is priced server-side by `priceCart` — the same
 * function the spine uses — so what the buyer sees is exactly what will be charged.
 * No amount is ever read from the URL or the browser.
 */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const cartId = typeof raw.cartId === "string" ? raw.cartId : undefined;
  const merchantId = await getStorefrontMerchantId();

  if (!cartId) {
    const latest = await prisma.cart.findFirst({
      where: { merchantId, status: "active" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-bold">Checkout</h1>
        <p className="mt-2 text-muted-foreground">
          No cart specified. Add <code className="text-sm">?cartId=…</code> to the URL.
        </p>
        {latest ? (
          <Link href={`/checkout?cartId=${latest.id}`} className="mt-4 inline-block underline">
            Use the most recent active cart
          </Link>
        ) : (
          <Link href="/test-spine" className="mt-4 inline-block underline">
            Create a test cart
          </Link>
        )}
      </main>
    );
  }

  let priced;
  try {
    priced = await priceCart(prisma, merchantId, cartId);
  } catch (error) {
    // Removing the last line empties the cart, which `priceCart` rightly refuses
    // to price. That is a normal outcome of using the Remove button, not a
    // failure, so it gets an empty state rather than an error page.
    if (error instanceof CartError && error.code === "CART_EMPTY") {
      return (
        <main className="mx-auto max-w-2xl px-6 py-16 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Your cart is empty</h1>
          <p className="mt-2 text-muted-foreground">
            Nothing left to check out. Add something and come back.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/shop"
              className="rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Browse the shop
            </Link>
            <Link
              href="/ai-shopping"
              className="rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              Shop with AI
            </Link>
          </div>
        </main>
      );
    }

    const message =
      error instanceof CartError ? error.message : "That cart could not be priced.";
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-bold">Checkout unavailable</h1>
        <p className="mt-2 text-muted-foreground">{message}</p>
        <Link href="/shop" className="mt-4 inline-block underline">
          Back to shop
        </Link>
      </main>
    );
  }

  const outOfStock = priced.lines.filter((l) => l.stock < l.quantity);

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Checkout</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Razorpay test mode. No real money moves.
        </p>
      </div>

      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <tbody>
            {priced.lines.map((l) => (
              <tr key={l.productId} className="border-b">
                <td className="px-4 py-3">
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatPaise(l.unitPriceInPaise)} each
                  </div>
                  {l.unitPriceInPaise !== l.priceAtAddInPaise ? (
                    <div className="mt-1 text-xs text-amber-600">
                      Price changed since you added this (was{" "}
                      {formatPaise(l.priceAtAddInPaise)})
                    </div>
                  ) : null}
                  <CartLineControls
                    cartId={cartId}
                    slug={l.slug}
                    name={l.name}
                    quantity={l.quantity}
                  />
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatPaise(l.unitPriceInPaise * l.quantity)}
                </td>
              </tr>
            ))}
            <tr className="bg-muted/40">
              <td className="px-4 py-3 font-semibold">Total</td>
              <td className="px-4 py-3 text-right text-lg font-bold tabular-nums">
                {formatPaise(priced.totalInPaise)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {outOfStock.length > 0 ? (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          Out of stock:{" "}
          {outOfStock.map((l) => `${l.slug} (have ${l.stock})`).join(", ")}. Checkout will
          be refused.
        </p>
      ) : null}

      <SpineControls activeCartId={cartId} />

      <p className="text-xs text-muted-foreground">
        Test card 4111 1111 1111 1111, any future expiry, any CVV. Your order is marked
        paid only when Razorpay&apos;s signed webhook arrives — the browser&apos;s success
        message is not proof of payment.
      </p>
    </main>
  );
}
