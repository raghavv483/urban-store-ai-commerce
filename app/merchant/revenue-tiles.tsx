"use client";

import {
  AnimatedNumber,
  StaggerIn,
  StaggerItem,
  motion,
  EASE,
} from "@/components/motion";

export type RevenueView = {
  totalRevenueInPaise: number;
  aiRevenueInPaise: number;
  humanRevenueInPaise: number;
  averageOrderValueInPaise: number;
  aiSharePercent: number;
  paidOrderCount: number;
  aiPaidOrderCount: number;
  humanPaidOrderCount: number;
};

/**
 * Money formatter shared by the static render and every animation frame, so a
 * counting figure is never formatted differently from its resting value.
 */
const inr = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: paise % 100 === 0 ? 0 : 2,
  }).format(paise / 100);

export function RevenueTiles({ summary }: { summary: RevenueView }) {
  const plural = (n: number) => (n === 1 ? "" : "s");

  return (
    <>
      <StaggerIn className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StaggerItem>
          <Tile
            label="Total revenue"
            value={summary.totalRevenueInPaise}
            sub={`${summary.paidOrderCount} paid order${plural(summary.paidOrderCount)}`}
          />
        </StaggerItem>
        <StaggerItem>
          {/* The figure the whole autonomous-buyer story rests on. */}
          <Tile
            label="AI-attributed revenue"
            value={summary.aiRevenueInPaise}
            sub={
              summary.aiPaidOrderCount === 0
                ? "No AI-driven orders yet"
                : `${summary.aiSharePercent}% of revenue · ${summary.aiPaidOrderCount} order${plural(summary.aiPaidOrderCount)}`
            }
            highlight
          />
        </StaggerItem>
        <StaggerItem>
          <Tile
            label="Human revenue"
            value={summary.humanRevenueInPaise}
            sub={`${summary.humanPaidOrderCount} order${plural(summary.humanPaidOrderCount)}`}
          />
        </StaggerItem>
        <StaggerItem>
          <Tile
            label="Average order value"
            value={summary.averageOrderValueInPaise}
            sub="Across paid orders"
          />
        </StaggerItem>
      </StaggerIn>

      {summary.aiPaidOrderCount > 0 ? (
        <div className="mt-4 overflow-hidden rounded-xl border">
          <div className="flex h-2.5 bg-muted" aria-hidden="true">
            <motion.div
              className="bg-emerald-600"
              initial={{ width: 0 }}
              animate={{ width: `${summary.aiSharePercent}%` }}
              transition={{ duration: 0.9, ease: EASE, delay: 0.25 }}
            />
          </div>
          <p className="px-4 py-2.5 text-meta text-muted-foreground">
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              {summary.aiSharePercent}% autonomous
            </span>{" "}
            — {inr(summary.aiRevenueInPaise)} of{" "}
            {inr(summary.totalRevenueInPaise)} was bought by an AI agent with no
            human clicks.
          </p>
        </div>
      ) : null}
    </>
  );
}

function Tile({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: number;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`h-full rounded-xl border p-4 transition-shadow hover:elevate ${
        highlight
          ? "border-emerald-600/35 bg-emerald-50/50 dark:bg-emerald-950/20"
          : "bg-card"
      }`}
    >
      <div className="text-eyebrow uppercase text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-2 text-title tabular-nums ${
          highlight ? "text-emerald-700 dark:text-emerald-400" : ""
        }`}
      >
        <AnimatedNumber value={value} format={inr} />
      </div>
      <div className="mt-1.5 text-meta text-muted-foreground">{sub}</div>
    </div>
  );
}
