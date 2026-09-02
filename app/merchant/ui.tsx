import type { ReactNode } from "react";

/**
 * Shared dashboard chrome.
 *
 * These used to live in `page.tsx` and be imported from there by sibling routes,
 * which made the overview page a de-facto component library. One neutral module
 * instead, so every merchant screen renders a status or a source the same way.
 */

export function SectionHeading({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <h2 className="text-eyebrow uppercase text-muted-foreground">
        {children}
      </h2>
      {action}
    </div>
  );
}

/** Dashed container for "nothing here yet". Never an error tone — empty is normal. */
export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: ReactNode;
}) {
  return (
    <div className="mt-3 rounded-xl border border-dashed p-12 text-center">
      <p className="text-body font-medium">{title}</p>
      {hint ? (
        <p className="mx-auto mt-1.5 max-w-md text-meta text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SourceBadge({ source }: { source: string }) {
  const isAi = source === "ai_buyer";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
        isAi
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"
          : "bg-muted text-muted-foreground"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${
          isAi ? "bg-emerald-500" : "bg-muted-foreground/50"
        }`}
      />
      {isAi ? "AI buyer" : "Human"}
    </span>
  );
}

const STATUS_TONE: Record<string, string> = {
  paid: "border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/50 dark:text-emerald-300",
  failed:
    "border-red-300/60 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-950/50 dark:text-red-300",
  cancelled: "border-border bg-muted text-muted-foreground line-through",
  pending:
    "border-amber-300/60 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/50 dark:text-amber-300",
  created: "border-border bg-muted text-muted-foreground",
};

/** Status as a bounded pill rather than loose coloured text — scans faster in a table. */
export function StatusText({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.created;
  return (
    <span
      className={`inline-block rounded-md border px-1.5 py-0.5 text-xs font-medium ${tone}`}
    >
      {status}
    </span>
  );
}
