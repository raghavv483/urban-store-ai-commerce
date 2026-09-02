/**
 * Product imagery without photography.
 *
 * There are no real product photos for this store, and a blank grey box reads as
 * an unfinished page. Each category gets a distinct hue and a line-drawn
 * silhouette of the product type, so cards are identifiable at a glance and the
 * grid reads as designed rather than as missing assets.
 *
 * Drawn as inline SVG on a tinted ground: no network request, no layout shift,
 * and it inherits the theme through `currentColor`.
 */

type Category = "Laptops" | "Monitors" | "Accessories" | "Audio";

const CATEGORY_STYLE: Record<string, { from: string; to: string; ink: string }> = {
  Laptops: {
    from: "from-indigo-100 dark:from-indigo-950/50",
    to: "to-indigo-50/40 dark:to-indigo-900/20",
    ink: "text-indigo-700/70 dark:text-indigo-300/60",
  },
  Monitors: {
    from: "from-sky-100 dark:from-sky-950/50",
    to: "to-sky-50/40 dark:to-sky-900/20",
    ink: "text-sky-700/70 dark:text-sky-300/60",
  },
  Accessories: {
    from: "from-amber-100 dark:from-amber-950/50",
    to: "to-amber-50/40 dark:to-amber-900/20",
    ink: "text-amber-800/70 dark:text-amber-300/60",
  },
  Audio: {
    from: "from-rose-100 dark:from-rose-950/50",
    to: "to-rose-50/40 dark:to-rose-900/20",
    ink: "text-rose-700/70 dark:text-rose-300/60",
  },
};

const FALLBACK = {
  from: "from-muted",
  to: "to-muted/40",
  ink: "text-muted-foreground",
};

/** Slug-specific shapes where they differ meaningfully inside a category. */
function Silhouette({ category, slug }: { category: string; slug: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.25,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
  };

  if (slug === "usb-c-hub") {
    return (
      <svg viewBox="0 0 64 40" className="h-16 w-24" aria-hidden="true">
        <rect x="14" y="14" width="36" height="12" rx="3" {...common} />
        <path d="M14 20H6M50 17h6M50 23h6M32 14V8" {...common} />
        <rect x="29" y="4" width="6" height="4" rx="1" {...common} />
      </svg>
    );
  }
  if (slug === "laptop-sleeve-14") {
    return (
      <svg viewBox="0 0 64 40" className="h-16 w-24" aria-hidden="true">
        <rect x="16" y="8" width="32" height="26" rx="4" {...common} />
        <path d="M16 14h32M24 8v-2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2" {...common} />
      </svg>
    );
  }
  if (slug === "wireless-mouse") {
    return (
      <svg viewBox="0 0 64 40" className="h-16 w-24" aria-hidden="true">
        <rect x="24" y="6" width="16" height="28" rx="8" {...common} />
        <path d="M32 6v9" {...common} />
      </svg>
    );
  }

  switch (category as Category) {
    case "Laptops":
      return (
        <svg viewBox="0 0 64 40" className="h-16 w-24" aria-hidden="true">
          <rect x="14" y="8" width="36" height="22" rx="2" {...common} />
          <path d="M8 33h48l-3-3H11z" {...common} />
        </svg>
      );
    case "Monitors":
      return (
        <svg viewBox="0 0 64 40" className="h-16 w-24" aria-hidden="true">
          <rect x="8" y="5" width="48" height="26" rx="2" {...common} />
          <path d="M32 31v5M24 36h16" {...common} />
        </svg>
      );
    case "Audio":
      return (
        <svg viewBox="0 0 64 40" className="h-16 w-24" aria-hidden="true">
          <path d="M16 26v-6a16 16 0 0 1 32 0v6" {...common} />
          <rect x="10" y="24" width="8" height="12" rx="3" {...common} />
          <rect x="46" y="24" width="8" height="12" rx="3" {...common} />
        </svg>
      );
    default:
      // Accessories fall back to a keyboard.
      return (
        <svg viewBox="0 0 64 40" className="h-16 w-24" aria-hidden="true">
          <rect x="8" y="12" width="48" height="20" rx="3" {...common} />
          <path d="M15 19h2M22 19h2M29 19h2M36 19h2M43 19h2M22 26h20" {...common} />
        </svg>
      );
  }
}

export function ProductVisual({
  category,
  slug,
  className = "",
}: {
  category: string;
  slug: string;
  className?: string;
}) {
  const style = CATEGORY_STYLE[category] ?? FALLBACK;

  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br ${style.from} ${style.to} ${className}`}
    >
      <div className={style.ink}>
        <Silhouette category={category} slug={slug} />
      </div>
    </div>
  );
}
