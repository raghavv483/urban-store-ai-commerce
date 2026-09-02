import Link from "next/link";
import { prisma } from "@/lib/db";
import { getStorefrontMerchantId } from "@/lib/merchant";
import { formatPaise } from "@/lib/money";
import { priceCart, CartError } from "@/payments/cart";
import { ProductVisual } from "@/components/product-visual";
import { PageIn } from "@/components/motion";
import { getActiveCartSummary } from "../shop/actions";
import { CartLineControls } from "./cart-line";
import { PayButton } from "./pay-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Checkout · Urban Store" };

/**
 * Checkout page. The order summary is priced server-side by `priceCart` — the same
 * function the spine uses — so what the buyer sees is exactly what will be charged.
 * No amount is ever read from the URL or the browser.
 *
 * Deliberately the least animated page in the product: the total is rendered as
 * a plain, final number. A count-up here would flash amounts that are not the
 * amount being charged, which is exactly the wrong thing to do on a payment
 * screen. Motion is limited to the page entrance.
 *
 * Which cart gets shown is resolved server-side from the shopper's own httpOnly
 * cart cookie. `?cartId=` is honoured only because the AI chat hands out links
 * with it; nothing in the customer UI puts a cart id in a URL, so a shopper can
 * no longer land on a cart that is not theirs by following a stale link.
 */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const merchantId = await getStorefrontMerchantId();

  // The shopper's own cart wins. An explicit ?cartId= is a chat hand-off, and it
  // is used only when the shopper has no cart of their own — so following an old
  // link can never silently replace the cart they are actually building.
  const own = await getActiveCartSummary();
  const linked = typeof raw.cartId === "string" ? raw.cartId : undefined;
  const cartId = own?.cartId ?? linked;

  if (!cartId) {
    return (
      <PageIn className="mx-auto max-w-2xl px-6 py-20 text-center">
        <EmptyBag />
        <h1 className="mt-6 text-title">Your cart is empty</h1>
        <p className="mx-auto mt-2 max-w-sm text-body text-muted-foreground">
          Add something to your cart and it will show up here.
        </p>
        <div className="mt-7 flex justify-center gap-3">
          <Link
            href="/shop"
            className="rounded-lg bg-primary px-4 py-2.5 text-meta font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Browse the shop
          </Link>
          <Link
            href="/ai-shopping"
            className="rounded-lg border bg-card px-4 py-2.5 text-meta font-medium transition-colors hover:bg-muted"
          >
            Shop with AI
          </Link>
        </div>
      </PageIn>
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
        <PageIn className="mx-auto max-w-2xl px-6 py-20 text-center">
          <EmptyBag />
          <h1 className="mt-6 text-title">Your cart is empty</h1>
          <p className="mx-auto mt-2 max-w-sm text-body text-muted-foreground">
            Nothing left to check out. Add something and come back.
          </p>
          <div className="mt-7 flex justify-center gap-3">
            <Link
              href="/shop"
              className="rounded-lg bg-primary px-4 py-2.5 text-meta font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Browse the shop
            </Link>
            <Link
              href="/ai-shopping"
              className="rounded-lg border bg-card px-4 py-2.5 text-meta font-medium transition-colors hover:bg-muted"
            >
              Shop with AI
            </Link>
          </div>
        </PageIn>
      );
    }

    // A cart that is no longer active is almost always one that was just paid
    // for. "Checkout unavailable" is a alarming thing to show someone whose
    // payment succeeded, so say what actually happened.
    if (error instanceof CartError && error.code === "CART_NOT_ACTIVE") {
      return (
        <PageIn className="mx-auto max-w-2xl px-6 py-20 text-center">
          <EmptyBag />
          <h1 className="mt-6 text-title">This cart is already closed</h1>
          <p className="mx-auto mt-2 max-w-sm text-body text-muted-foreground">
            It was checked out, so there is nothing left to pay for here. Any
            confirmed order shows up in the merchant dashboard.
          </p>
          <Link
            href="/shop"
            className="mt-7 inline-flex rounded-lg bg-primary px-4 py-2.5 text-meta font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Continue shopping
          </Link>
        </PageIn>
      );
    }

    const message =
      error instanceof CartError
        ? error.message
        : "That cart could not be priced.";
    return (
      <PageIn className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-title">Checkout unavailable</h1>
        <p className="mt-2 text-body text-muted-foreground">{message}</p>
        <Link
          href="/shop"
          className="mt-5 inline-flex rounded-lg border bg-card px-4 py-2.5 text-meta font-medium transition-colors hover:bg-muted"
        >
          Back to shop
        </Link>
      </PageIn>
    );
  }

  // Imagery only. Categories are not part of pricing and are read separately so
  // `priceCart` stays the single source of truth for anything money-shaped.
  const categories = new Map(
    (
      await prisma.product.findMany({
        where: { merchantId, slug: { in: priced.lines.map((l) => l.slug) } },
        select: { slug: true, category: true },
      })
    ).map((p) => [p.slug, p.category]),
  );

  const outOfStock = priced.lines.filter((l) => l.stock < l.quantity);
  const itemCount = priced.lines.reduce((n, l) => n + l.quantity, 0);

  return (
    <PageIn className="mx-auto max-w-5xl px-6 py-10">
      <nav className="text-meta text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/shop" className="transition-colors hover:text-foreground">
          Shop
        </Link>
        <span className="mx-2 opacity-50">/</span>
        <span className="text-foreground">Checkout</span>
      </nav>

      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h1 className="text-title">Checkout</h1>
        <span className="text-meta text-muted-foreground">
          {itemCount} item{itemCount === 1 ? "" : "s"} · Razorpay test mode, no
          real money moves
        </span>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        {/* Lines */}
        <div className="divide-y overflow-hidden rounded-2xl border bg-card">
          {priced.lines.map((l) => (
            <div key={l.productId} className="flex gap-4 p-4 sm:p-5">
              <ProductVisual
                category={categories.get(l.slug) ?? ""}
                slug={l.slug}
                className="h-20 w-24 shrink-0 rounded-xl border"
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link
                      href={`/shop/${l.slug}`}
                      className="text-heading hover:underline"
                    >
                      {l.name}
                    </Link>
                    <div className="mt-0.5 text-meta text-muted-foreground">
                      {formatPaise(l.unitPriceInPaise)} each
                    </div>
                  </div>
                  <div className="shrink-0 text-heading tabular-nums">
                    {formatPaise(l.unitPriceInPaise * l.quantity)}
                  </div>
                </div>

                {l.unitPriceInPaise !== l.priceAtAddInPaise ? (
                  <p className="mt-2 rounded-md border border-amber-300/60 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300">
                    Price changed since you added this (was{" "}
                    {formatPaise(l.priceAtAddInPaise)})
                  </p>
                ) : null}

                <CartLineControls
                  cartId={cartId}
                  slug={l.slug}
                  name={l.name}
                  quantity={l.quantity}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="space-y-4 lg:sticky lg:top-24">
          <div className="rounded-2xl border bg-card p-5 elevate">
            <h2 className="text-eyebrow uppercase text-muted-foreground">
              Order summary
            </h2>

            <dl className="mt-4 space-y-2.5 text-meta">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">
                  {formatPaise(priced.totalInPaise)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Delivery</dt>
                <dd className="text-emerald-700 dark:text-emerald-400">Free</dd>
              </div>
            </dl>

            <div className="mt-4 flex items-baseline justify-between border-t pt-4">
              <span className="text-heading">Total</span>
              <span className="text-title tabular-nums">
                {formatPaise(priced.totalInPaise)}
              </span>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              Priced server-side from the cart. The amount charged is this
              amount.
            </p>

            {outOfStock.length > 0 ? (
              <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-meta text-destructive">
                Out of stock:{" "}
                {outOfStock
                  .map((l) => `${l.slug} (have ${l.stock})`)
                  .join(", ")}
                . Checkout will be refused.
              </p>
            ) : null}

            <div className="mt-5">
              <PayButton
                cartId={cartId}
                totalDisplay={formatPaise(priced.totalInPaise)}
                disabled={outOfStock.length > 0}
                disabledReason="Fix the out-of-stock items to continue"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-dashed p-4 text-xs leading-relaxed text-muted-foreground">
            Test card 4111 1111 1111 1111, any future expiry, any CVV. Your
            order is marked paid only when Razorpay&apos;s signed webhook
            arrives — the browser&apos;s success message is not proof of
            payment.
          </div>
        </div>
      </div>
    </PageIn>
  );
}

/** Empty-state mark. Same illustration language as the product visuals. */
function EmptyBag() {
  return (
    <svg
      viewBox="0 0 80 80"
      className="mx-auto h-20 w-20 text-muted-foreground"
      aria-hidden="true"
    >
      <ellipse
        cx="40"
        cy="70"
        rx="22"
        ry="2.5"
        fill="currentColor"
        fillOpacity="0.08"
      />
      <path
        d="M20 26h40l-4 40H24z"
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M31 30v-6a9 9 0 0 1 18 0v6"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
