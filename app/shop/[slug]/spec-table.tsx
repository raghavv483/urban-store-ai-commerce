"use client";

import { useState } from "react";
import { AnimatePresence, motion, EASE } from "@/components/motion";

/**
 * Specifications, collapsible.
 *
 * Shows the first four rows and hides the rest behind a toggle: a laptop's full
 * spec sheet pushes the cross-sell row below the fold, and the cross-sell is
 * what we actually want a browsing shopper to reach.
 */
export function SpecTable({ specs }: { specs: Array<[string, unknown]> }) {
  const [open, setOpen] = useState(false);
  const PREVIEW = 4;
  const hasMore = specs.length > PREVIEW;
  const visible = open ? specs : specs.slice(0, PREVIEW);

  return (
    <section className="mt-14">
      <h2 className="text-heading">Specifications</h2>

      <dl className="mt-4 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2">
        {visible.map(([key, value]) => (
          <div
            key={key}
            className="flex items-baseline justify-between gap-4 bg-card px-4 py-3"
          >
            <dt className="text-meta capitalize text-muted-foreground">
              {key}
            </dt>
            <dd className="text-meta font-medium">
              {typeof value === "object" && value !== null
                ? JSON.stringify(value)
                : String(value)}
            </dd>
          </div>
        ))}

        <AnimatePresence initial={false}>{open ? null : null}</AnimatePresence>
      </dl>

      {hasMore ? (
        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-3 text-meta font-medium text-primary underline-offset-4 hover:underline"
          aria-expanded={open}
        >
          <motion.span
            key={open ? "less" : "more"}
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: EASE }}
            className="inline-block"
          >
            {open
              ? "Show fewer specifications"
              : `Show all ${specs.length} specifications`}
          </motion.span>
        </button>
      ) : null}
    </section>
  );
}
