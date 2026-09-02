/**
 * Loading skeletons.
 *
 * Shaped like the content they replace — a card skeleton has an image block, two
 * text lines and a button — so the page does not visibly re-flow when real data
 * lands. A generic spinner tells a reader something is happening; a matching
 * skeleton tells them what is coming.
 *
 * `animate-pulse` rather than a shimmer sweep: the sweep needs a moving gradient
 * per element and reads as busier than the content it stands in for.
 */

export function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Shimmer className="h-36 rounded-none" />
      <div className="space-y-3 p-4">
        <Shimmer className="h-2.5 w-16" />
        <Shimmer className="h-4 w-3/4" />
        <div className="flex items-baseline justify-between pt-1">
          <Shimmer className="h-5 w-20" />
          <Shimmer className="h-3 w-14" />
        </div>
        <Shimmer className="h-9 w-full rounded-lg" />
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function StatTileSkeleton() {
  return (
    <div className="rounded-lg border p-4">
      <Shimmer className="h-2.5 w-24" />
      <Shimmer className="mt-2.5 h-7 w-28" />
      <Shimmer className="mt-2 h-2.5 w-20" />
    </div>
  );
}

export function TableSkeleton({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex gap-4 border-b bg-muted/40 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Shimmer key={i} className="h-2.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex gap-4 border-b px-4 py-3.5 last:border-b-0"
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Shimmer key={c} className="h-3 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** One audit entry: header row, two summary lines, a short action list. */
export function TimelineItemSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <Shimmer className="h-3.5 w-40" />
        <Shimmer className="h-2.5 w-12" />
      </div>
      <Shimmer className="mt-3.5 h-3 w-4/5" />
      <Shimmer className="mt-2 h-3 w-3/5" />
      <div className="mt-4 space-y-2 border-t pt-3">
        <Shimmer className="h-2.5 w-2/5" />
        <Shimmer className="h-2.5 w-1/3" />
      </div>
    </div>
  );
}

export function TimelineSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="relative mt-6 space-y-3 pl-7">
      <div
        aria-hidden="true"
        className="absolute bottom-2 left-[7px] top-2 w-px bg-border"
      />
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="relative">
          <span
            aria-hidden="true"
            className="absolute -left-7 top-5 h-[9px] w-[9px] animate-pulse rounded-full bg-muted ring-4 ring-background"
          />
          <TimelineItemSkeleton />
        </div>
      ))}
    </div>
  );
}
