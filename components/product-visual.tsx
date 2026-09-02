/**
 * Product imagery without photography.
 *
 * The first pass was hairline outlines on a flat tint, which read as clip-art.
 * This version treats each product as a small isometric-ish render: filled
 * bodies with a lighter face and a darker edge, sitting on a soft ground shadow
 * over a two-stop wash. Same idea, but the shapes now have mass, which is the
 * difference between "placeholder" and "illustration".
 *
 * Still inline SVG — no network request, no layout shift, and every colour is a
 * `currentColor` opacity so one definition serves both themes.
 */

const CATEGORY_TINT: Record<string, { wash: string; ink: string }> = {
  Laptops: {
    wash: "from-violet-100 via-violet-50 to-transparent dark:from-violet-950/60 dark:via-violet-900/20",
    ink: "text-violet-900 dark:text-violet-200",
  },
  Monitors: {
    wash: "from-sky-100 via-sky-50 to-transparent dark:from-sky-950/60 dark:via-sky-900/20",
    ink: "text-sky-900 dark:text-sky-200",
  },
  Accessories: {
    wash: "from-amber-100 via-amber-50 to-transparent dark:from-amber-950/60 dark:via-amber-900/20",
    ink: "text-amber-900 dark:text-amber-200",
  },
  Audio: {
    wash: "from-rose-100 via-rose-50 to-transparent dark:from-rose-950/60 dark:via-rose-900/20",
    ink: "text-rose-900 dark:text-rose-200",
  },
};

const FALLBACK = {
  wash: "from-muted via-muted/50 to-transparent",
  ink: "text-muted-foreground",
};

/** Opacity ramp: body, lit face, edge. Keeps every shape on one visual system. */
const BODY = 0.16;
const FACE = 0.09;
const EDGE = 0.42;

/** Soft contact shadow, shared by every shape. Hoisted so it is not redefined
 *  on each render. */
function Ground() {
  return (
    <ellipse
      cx="40"
      cy="47"
      rx="24"
      ry="2.4"
      fill="currentColor"
      fillOpacity="0.07"
    />
  );
}

function Shape({ category, slug }: { category: string; slug: string }) {
  const stroke = {
    stroke: "currentColor",
    strokeOpacity: EDGE,
    strokeWidth: 0.9,
    strokeLinejoin: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
  };
  const body = { fill: "currentColor", fillOpacity: BODY };
  const face = { fill: "currentColor", fillOpacity: FACE };

  if (slug === "usb-c-hub") {
    return (
      <>
        <Ground />
        <rect
          x="24"
          y="24"
          width="32"
          height="11"
          rx="3"
          {...body}
          {...stroke}
        />
        <rect x="24" y="24" width="32" height="4" rx="2" {...face} />
        <path d="M24 29.5H12M56 27h9M56 32h9" {...stroke} fill="none" />
        <rect
          x="36"
          y="14"
          width="8"
          height="4.5"
          rx="1.6"
          {...body}
          {...stroke}
        />
        <path d="M40 18.5V24" {...stroke} fill="none" />
      </>
    );
  }

  if (slug === "laptop-sleeve-14") {
    return (
      <>
        <Ground />
        <rect
          x="26"
          y="13"
          width="28"
          height="31"
          rx="4.5"
          {...body}
          {...stroke}
        />
        <path d="M26 21h28" {...stroke} fill="none" />
        <rect x="26" y="13" width="28" height="8" rx="4.5" {...face} />
        <path
          d="M34 13v-2.5a2.5 2.5 0 0 1 2.5-2.5h7A2.5 2.5 0 0 1 46 10.5V13"
          {...stroke}
          fill="none"
        />
      </>
    );
  }

  if (slug === "wireless-mouse") {
    return (
      <>
        <Ground />
        <rect
          x="32"
          y="12"
          width="16"
          height="32"
          rx="8"
          {...body}
          {...stroke}
        />
        <path d="M32 24a8 8 0 0 1 16 0" {...face} />
        <path d="M40 12v11" {...stroke} fill="none" />
      </>
    );
  }

  switch (category) {
    case "Laptops":
      return (
        <>
          <Ground />
          {/* Screen, then the keyboard deck in perspective. */}
          <rect
            x="22"
            y="10"
            width="36"
            height="24"
            rx="2.5"
            {...body}
            {...stroke}
          />
          <rect x="25" y="13" width="30" height="18" rx="1.5" {...face} />
          <path d="M14 44h52l-6-8H20z" {...body} {...stroke} />
          <path d="M34 40h12" {...stroke} fill="none" />
        </>
      );
    case "Monitors":
      return (
        <>
          <Ground />
          <rect
            x="12"
            y="8"
            width="56"
            height="30"
            rx="2.5"
            {...body}
            {...stroke}
          />
          <rect x="15" y="11" width="50" height="24" rx="1.5" {...face} />
          <path d="M40 38v5" {...stroke} fill="none" />
          <path d="M30 45h20" {...body} {...stroke} />
        </>
      );
    case "Audio":
      return (
        <>
          <Ground />
          <path d="M20 30v-4a20 20 0 0 1 40 0v4" {...stroke} fill="none" />
          <rect
            x="14"
            y="27"
            width="11"
            height="17"
            rx="5"
            {...body}
            {...stroke}
          />
          <rect
            x="55"
            y="27"
            width="11"
            height="17"
            rx="5"
            {...body}
            {...stroke}
          />
          <rect x="16.5" y="30" width="6" height="11" rx="3" {...face} />
        </>
      );
    default:
      // Keyboard, for the remaining accessories.
      return (
        <>
          <Ground />
          <path d="M14 18h52l4 22H10z" {...body} {...stroke} />
          <path d="M18 22h44l2 6H16z" {...face} />
          <path
            d="M20 32h4M27 32h4M34 32h4M41 32h4M48 32h4M28 36h24"
            {...stroke}
            fill="none"
          />
        </>
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
  const tint = CATEGORY_TINT[category] ?? FALLBACK;

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-gradient-to-b ${tint.wash} ${className}`}
    >
      <svg
        viewBox="0 0 80 52"
        className={`h-full w-full max-h-[78%] max-w-[78%] ${tint.ink}`}
        aria-hidden="true"
      >
        <Shape category={category} slug={slug} />
      </svg>
    </div>
  );
}
