"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, EASE } from "./motion";
import { onCartAdded, onCartCleared } from "@/lib/cart-events";

/**
 * Header cart indicator.
 *
 * Takes its truth from the server on every render, but bumps optimistically the
 * instant something is added so the badge reacts at the moment of the click
 * rather than after a round trip. The server value wins on the next navigation.
 *
 * The link carries no cart id. Which cart a shopper is checking out is decided
 * server-side from their httpOnly cart cookie — putting the id in the href let a
 * stale or foreign cart id reach checkout, which is exactly the bug this fixes.
 * `cartId` is still passed in, but only to decide whether there is a cart to
 * show at all.
 */
export function CartBadge({
  cartId,
  itemCount,
}: {
  cartId: string | null;
  itemCount: number;
}) {
  const [count, setCount] = useState(itemCount);
  const [id, setId] = useState(cartId);
  const [pulse, setPulse] = useState(0);
  const [serverSnapshot, setServerSnapshot] = useState({ cartId, itemCount });

  // Adjust during render rather than in an effect: React's documented pattern
  // for "props changed, reset derived state", and it avoids the extra commit a
  // setState-inside-useEffect would cause.
  if (
    serverSnapshot.itemCount !== itemCount ||
    serverSnapshot.cartId !== cartId
  ) {
    setServerSnapshot({ cartId, itemCount });
    setCount(itemCount);
    setId(cartId);
  }

  useEffect(() => {
    return onCartAdded((detail) => {
      setId(detail.cartId);
      setCount(detail.itemCount);
      setPulse((p) => p + 1);
    });
  }, []);

  // A settled payment closes the cart server-side. Payment can complete inside
  // a Razorpay popup with no navigation, so without this the badge would keep
  // showing the paid-for items until the shopper reloaded by hand.
  useEffect(() => {
    return onCartCleared(() => {
      setCount(0);
      setId(null);
    });
  }, []);

  if (count <= 0 || !id) return null;

  return (
    <Link
      href="/checkout"
      className="relative flex items-center gap-1.5 rounded-lg border px-3 py-2 text-meta transition-colors hover:bg-muted"
    >
      <motion.span
        // One quick swell per add — enough to draw the eye to the corner.
        key={pulse}
        animate={pulse > 0 ? { scale: [1, 1.28, 1] } : undefined}
        transition={{ duration: 0.42, ease: EASE }}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1.5 1.5h1.8l1.5 8h7.2l1.5-5.5H4.4" />
          <circle cx="6.5" cy="13" r="1.1" />
          <circle cx="12" cy="13" r="1.1" />
        </svg>
      </motion.span>

      <span className="min-w-3 text-center tabular-nums">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={count}
            initial={{ y: -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="inline-block"
          >
            {count}
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="sr-only">items in cart, go to checkout</span>
    </Link>
  );
}
