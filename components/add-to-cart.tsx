"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { addToCartAction } from "@/app/shop/actions";

/**
 * Add-to-cart entry point for the catalog pages. Calls the same `addToCart` tool
 * the chat uses; no cart logic lives here.
 *
 * After a successful add it shows the new cart total and a route to checkout,
 * mirroring how the chat confirms — a shopper should never have to guess whether
 * it worked or where to go next.
 */
export function AddToCart({
  slug,
  inStock,
  size = "default",
}: {
  slug: string;
  inStock: boolean;
  size?: "default" | "large";
}) {
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState<{ cartId: string; total: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!inStock) {
    return (
      <button
        disabled
        className="w-full cursor-not-allowed rounded-lg border border-border bg-muted/50 px-4 py-2.5 text-sm font-medium text-muted-foreground"
      >
        Out of stock
      </button>
    );
  }

  function add() {
    setError(null);
    startTransition(async () => {
      const res = await addToCartAction(slug, 1);
      if (res.ok) setAdded({ cartId: res.cartId, total: res.totalDisplay });
      else setError(res.message);
    });
  }

  const pad = size === "large" ? "px-5 py-3 text-[15px]" : "px-4 py-2.5 text-sm";

  return (
    <div className="w-full">
      <button
        onClick={add}
        disabled={pending}
        className={`w-full rounded-lg bg-foreground ${pad} font-medium text-background transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-60`}
      >
        {pending ? "Adding…" : added ? "Add another" : "Add to cart"}
      </button>

      {added ? (
        <div className="mt-2.5 rounded-lg border border-emerald-600/30 bg-emerald-50/70 px-3 py-2.5 text-sm dark:bg-emerald-950/25">
          <div className="font-medium text-emerald-800 dark:text-emerald-300">
            Added — cart total {added.total}
          </div>
          <div className="mt-1.5 flex gap-3 text-xs">
            <Link
              href={`/checkout?cartId=${added.cartId}`}
              className="font-medium underline underline-offset-2"
            >
              Go to checkout
            </Link>
            <Link href="/ai-shopping" className="text-muted-foreground hover:underline">
              Ask about it first
            </Link>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-2.5 rounded-lg border border-red-300/60 bg-red-50/70 px-3 py-2 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
