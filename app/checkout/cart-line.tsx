"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeLine, changeQuantity } from "./actions";
import { motion, AnimatePresence, EASE } from "@/components/motion";

/**
 * Quantity stepper and remove control for one checkout line.
 *
 * Every change goes through a server action so the total is always recomputed by
 * `priceCart` — the client never does money arithmetic, it just re-renders what
 * the server returns.
 *
 * The stepper dims while a change is in flight rather than swapping in a
 * spinner: the quantity on screen is briefly stale, and fading it says so
 * without the row changing height.
 */
export function CartLineControls({
  cartId,
  slug,
  name,
  quantity,
}: {
  cartId: string;
  slug: string;
  name: string;
  quantity: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.message);
      else router.refresh();
    });
  }

  const step =
    "px-2.5 py-1.5 text-meta text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="mt-3">
      <div
        className={`flex items-center gap-3 transition-opacity ${
          pending ? "opacity-60" : ""
        }`}
      >
        <div className="inline-flex items-center overflow-hidden rounded-lg border bg-background">
          <button
            onClick={() => run(() => changeQuantity(cartId, slug, "down"))}
            disabled={pending}
            aria-label={`Reduce ${name} quantity`}
            className={step}
          >
            &minus;
          </button>
          <span
            className="min-w-8 px-1 text-center text-meta tabular-nums"
            aria-live="polite"
          >
            {quantity}
          </span>
          <button
            onClick={() => run(() => changeQuantity(cartId, slug, "up"))}
            disabled={pending}
            aria-label={`Increase ${name} quantity`}
            className={step}
          >
            +
          </button>
        </div>

        <button
          onClick={() => run(() => removeLine(cartId, slug))}
          disabled={pending}
          className="text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-destructive disabled:opacity-40"
        >
          {pending ? "Updating…" : "Remove"}
        </button>
      </div>

      <AnimatePresence>
        {error ? (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="overflow-hidden text-xs text-destructive"
          >
            <span className="block pt-2">{error}</span>
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
