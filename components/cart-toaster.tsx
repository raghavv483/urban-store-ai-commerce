"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, EASE } from "./motion";
import { onCartAdded, type CartAddedDetail } from "@/lib/cart-events";

/**
 * Add-to-cart confirmation.
 *
 * Mounted once in the root layout. Slides up from the bottom-right, holds for
 * four seconds, then leaves — long enough to read the new total and reach
 * "Checkout", short enough not to sit over the page.
 *
 * Deliberately not a generic toast system: the app has exactly one thing worth
 * announcing this way, and a queue/severity/position API would be scaffolding
 * for cases that do not exist.
 */
export function CartToaster() {
  const [toast, setToast] = useState<CartAddedDetail | null>(null);

  useEffect(() => {
    return onCartAdded((detail) => setToast(detail));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex justify-end p-4 sm:p-6"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence>
        {toast ? (
          <motion.div
            key={`${toast.cartId}-${toast.productName}-${toast.totalDisplay}`}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{
              opacity: 0,
              y: 8,
              scale: 0.98,
              transition: { duration: 0.18 },
            }}
            transition={{ duration: 0.32, ease: EASE }}
            className="pointer-events-auto w-full max-w-sm rounded-xl border bg-card p-4 elevate-lg"
          >
            <div className="flex items-start gap-3">
              <motion.span
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  delay: 0.08,
                  type: "spring",
                  stiffness: 400,
                  damping: 18,
                }}
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 16 16"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3.5 8.5l3 3 6-6" />
                </svg>
              </motion.span>

              <div className="min-w-0 flex-1">
                <div className="text-body font-semibold leading-snug">
                  {toast.productName} added
                </div>
                <div className="mt-0.5 text-meta text-muted-foreground">
                  Cart total {toast.totalDisplay}
                </div>
                <Link
                  href="/checkout"
                  className="mt-2.5 inline-flex items-center gap-1 text-meta font-medium text-primary underline-offset-4 hover:underline"
                  onClick={() => setToast(null)}
                >
                  Go to checkout
                  <span aria-hidden="true">→</span>
                </Link>
              </div>

              <button
                onClick={() => setToast(null)}
                aria-label="Dismiss"
                className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <svg
                  viewBox="0 0 16 16"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
