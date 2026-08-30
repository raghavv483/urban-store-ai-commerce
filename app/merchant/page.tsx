import Link from "next/link";
import { guardMerchantPage } from "@/auth/merchant-guard";
import { getRevenueSummary, listMerchantOrders } from "@/db/queries/merchant";
import { formatPaise } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview · Urban Store Merchant" };

export default async function MerchantOverviewPage() {
  const session = await guardMerchantPage();
  const [summary, recent] = await Promise.all([
    getRevenueSummary(session.merchantId),
    listMerchantOrders(session.merchantId, { limit: 5 }),
  ]);

  const hasRevenue = summary.paidOrderCount > 0;

  return (
    <main className="py-8">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Revenue
        </h2>

        {!hasRevenue ? (
          <div className="mt-3 rounded-lg border border-dashed p-10 text-center">
            <p className="font-medium">No paid orders yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Revenue appears here once a payment is confirmed by a signed webhook.
            </p>
          </div>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Total revenue"
              value={formatPaise(summary.totalRevenueInPaise)}
              sub={`${summary.paidOrderCount} paid order${summary.paidOrderCount === 1 ? "" : "s"}`}
            />
            {/* The number the whole AI-buyer story rests on, so it gets the accent. */}
            <Stat
              label="AI-attributed revenue"
              value={formatPaise(summary.aiRevenueInPaise)}
              sub={
                summary.aiPaidOrderCount === 0
                  ? "No AI-driven orders yet"
                  : `${summary.aiSharePercent}% of revenue · ${summary.aiPaidOrderCount} order${
                      summary.aiPaidOrderCount === 1 ? "" : "s"
                    }`
              }
              highlight
            />
            <Stat
              label="Human revenue"
              value={formatPaise(summary.humanRevenueInPaise)}
              sub={`${summary.humanPaidOrderCount} order${summary.humanPaidOrderCount === 1 ? "" : "s"}`}
            />
            <Stat
              label="Average order value"
              value={formatPaise(summary.averageOrderValueInPaise)}
              sub="Across paid orders"
            />
          </div>
        )}

        {hasRevenue && summary.aiPaidOrderCount > 0 ? (
          <div className="mt-4 overflow-hidden rounded-lg border">
            <div className="flex h-2.5" aria-hidden="true">
              <div
                className="bg-emerald-600"
                style={{ width: `${summary.aiSharePercent}%` }}
              />
              <div className="flex-1 bg-muted" />
            </div>
            <p className="px-4 py-2.5 text-xs text-muted-foreground">
              <span className="font-medium text-emerald-600">
                {summary.aiSharePercent}% autonomous
              </span>{" "}
              — {formatPaise(summary.aiRevenueInPaise)} of{" "}
              {formatPaise(summary.totalRevenueInPaise)} was bought by an AI agent with no
              human clicks.
            </p>
          </div>
        ) : null}
      </section>

      {summary.pendingOrderCount > 0 || summary.failedOrderCount > 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Not counted above: {summary.pendingOrderCount} awaiting payment,{" "}
          {summary.failedOrderCount} failed. Only orders confirmed by a verified webhook
          count as revenue.
        </p>
      ) : null}

      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Recent orders
          </h2>
          <Link href="/merchant/orders" className="text-sm underline hover:no-underline">
            View all
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No orders yet.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Source</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((o) => (
                  <tr key={o.id} className="border-t">
                    <td className="px-4 py-2.5 font-mono text-xs">{o.id.slice(0, 12)}…</td>
                    <td className="px-4 py-2.5">
                      <SourceBadge source={o.source} />
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusText status={o.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatPaise(o.totalInPaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        highlight ? "border-emerald-600/40 bg-emerald-50/60 dark:bg-emerald-950/20" : ""
      }`}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1.5 text-2xl font-bold tabular-nums ${
          highlight ? "text-emerald-700 dark:text-emerald-400" : ""
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

export function SourceBadge({ source }: { source: string }) {
  const isAi = source === "ai_buyer";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        isAi
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {isAi ? "AI buyer" : "Human"}
    </span>
  );
}

export function StatusText({ status }: { status: string }) {
  const tone =
    status === "paid"
      ? "font-medium text-emerald-600"
      : status === "failed"
        ? "font-medium text-red-600"
        : status === "cancelled"
          ? "text-muted-foreground line-through"
          : "text-muted-foreground";
  return <span className={tone}>{status}</span>;
}
