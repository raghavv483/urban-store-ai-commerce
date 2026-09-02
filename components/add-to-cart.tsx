"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addToCartAction } from "@/app/shop/actions";
import { announceCartAdded } from "@/lib/cart-events";
import { motion, AnimatePresence, EASE, pressable } from "./motion";

/**
 * Add-to-cart entry point for the catalog pages. Calls the same `addToCart` tool
 * the chat uses; no cart logic lives here.
 *
 * Confirmation is the toast plus the header badge, not inline text — inline
 * success copy pushed the card taller and shifted the grid under the cursor.
 * The button itself only reports failure, which has to stay next to the control
 * that failed.
 */
export function AddToCart({
  slug,
  productName,
  inStock,
  size = "default",
}: {
  slug: string;
  productName: string;
  inStock: boolean;
  size?: "default" | "large";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);
  const router = useRouter();

  if (!inStock) {
    return (
      <button
        disabled
        className="w-full cursor-not-allowed rounded-lg border bg-muted/50 px-4 py-2.5 text-meta font-medium text-muted-foreground"
      >
        Out of stock
      </button>
    );
  }

  function add() {
    setError(null);
    startTransition(async () => {
      const res = await addToCartAction(slug, 1);
      if (!res.ok) {
        setError(res.message);
        return;
      }

      announceCartAdded({
        productName,
        totalDisplay: res.totalDisplay,
        cartId: res.cartId,
        itemCount: res.itemCount,
      });

      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1600);
      // Re-read the server's cart so the header badge and checkout agree.
      router.refresh();
    });
  }

  const pad =
    size === "large" ? "px-5 py-3 text-body" : "px-4 py-2.5 text-meta";

  return (
    <div className="w-full">
      <motion.button
        {...pressable}
        onClick={add}
        disabled={pending}
        className={`relative w-full overflow-hidden rounded-lg bg-primary ${pad} font-medium text-primary-foreground disabled:opacity-60`}
      >
        {/* The label swaps rather than the button resizing, so neighbouring
            cards never move while one is mid-request. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={pending ? "pending" : justAdded ? "added" : "idle"}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: EASE }}
            className="flex items-center justify-center gap-1.5"
          >
            {pending ? (
              <>
                <Spinner />
                Adding
              </>
            ) : justAdded ? (
              <>
                <Tick />
                Added
              </>
            ) : (
              "Add to cart"
            )}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {error ? (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="overflow-hidden text-meta text-destructive"
          >
            <span className="block pt-2">{error}</span>
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Spinner() {
  return (
    <motion.span
      animate={{ rotate: 360 }}
      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
      className="inline-block h-3.5 w-3.5 rounded-full border-[1.5px] border-current border-t-transparent"
      aria-hidden="true"
    />
  );
}

function Tick() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <motion.path
        d="M3.5 8.5l3 3 6-6"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, ease: EASE }}
      />
    </svg>
  );
}
