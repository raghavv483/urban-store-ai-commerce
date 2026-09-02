import Link from "next/link";
import { guardMerchantPage } from "@/auth/merchant-guard";
import { getRevenueSummary, listMerchantOrders } from "@/db/queries/merchant";
import { formatPaise } from "@/lib/money";
import { RevenueTiles } from "./revenue-tiles";
import { PageIn } from "@/components/motion";
import { EmptyState, SectionHeading, SourceBadge, StatusText } from "./ui";

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
    <PageIn className="py-8">
      <section>
        <SectionHeading>Revenue</SectionHeading>

        {!hasRevenue ? (
          <EmptyState
            title="No paid orders yet."
            hint="Revenue appears here once a payment is confirmed by a signed webhook."
          />
        ) : (
          <RevenueTiles summary={summary} />
        )}
      </section>

      {summary.pendingOrderCount > 0 || summary.failedOrderCount > 0 ? (
        <p className="mt-4 text-meta text-muted-foreground">
          Not counted above: {summary.pendingOrderCount} awaiting payment,{" "}
          {summary.failedOrderCount} failed. Only orders confirmed by a verified
          webhook count as revenue.
        </p>
      ) : null}

      {/* Sits directly under the AI-attributed revenue story: this is what those
          buyers actually read to find the shop. */}
      <Link
        href="/agent-catalog"
        className="group mt-6 flex items-center justify-between gap-4 rounded-xl border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md"
      >
        <div>
          <div className="text-heading">What AI buyers can see</div>
          <div className="mt-1 text-meta text-muted-foreground">
            The machine-readable catalog autonomous agents discover your store
            through — open, no credentials required.
          </div>
        </div>
        <span
          aria-hidden="true"
          className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
        >
          &rarr;
        </span>
      </Link>

      <section className="mt-10">
        <SectionHeading
          action={
            <Link
              href="/merchant/orders"
              className="text-meta text-primary underline-offset-2 hover:underline"
            >
              View all
            </Link>
          }
        >
          Recent orders
        </SectionHeading>

        {recent.length === 0 ? (
          <EmptyState title="No orders yet." />
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-meta">
              <thead className="border-b bg-muted/40 text-left">
                <tr>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Order
                  </th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Source
                  </th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recent.map((o) => (
                  <tr
                    key={o.id}
                    className="transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-mono text-xs">
                      {o.id.slice(0, 12)}…
                    </td>
                    <td className="px-4 py-3">
                      <SourceBadge source={o.source} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusText status={o.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {formatPaise(o.totalInPaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageIn>
  );
}
