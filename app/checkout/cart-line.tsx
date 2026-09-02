"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeLine, changeQuantity } from "./actions";

/**
 * Quantity stepper and remove control for one checkout line.
 *
 * Every change goes through a server action so the total is always recomputed by
 * `priceCart` — the client never does money arithmetic, it just re-renders what
 * the server returns.
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

  return (
    <div className="mt-2">
      <div className="flex items-center gap-3">
        <div className="inline-flex items-center rounded-lg border">
          <button
            onClick={() => run(() => changeQuantity(cartId, slug, "down"))}
            disabled={pending}
            aria-label={`Reduce ${name} quantity`}
            className="px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            &minus;
          </button>
          <span className="min-w-8 px-1 text-center text-sm tabular-nums" aria-live="polite">
            {quantity}
          </span>
          <button
            onClick={() => run(() => changeQuantity(cartId, slug, "up"))}
            disabled={pending}
            aria-label={`Increase ${name} quantity`}
            className="px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            +
          </button>
        </div>

        <button
          onClick={() => run(() => removeLine(cartId, slug))}
          disabled={pending}
          className="text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-red-600 disabled:opacity-40"
        >
          {pending ? "Updating…" : "Remove"}
        </button>
      </div>

      {error ? (
        <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
