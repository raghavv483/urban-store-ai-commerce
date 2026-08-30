import Link from "next/link";
import { z } from "zod";
import { guardMerchantPage } from "@/auth/merchant-guard";
import { listMerchantOrders } from "@/db/queries/merchant";
import { formatPaise } from "@/lib/money";
import { SourceBadge, StatusText } from "../page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orders · Urban Store Merchant" };

/** Filters come from the URL, so a malformed one degrades to "no filter". */
const filterSchema = z.object({
  source: z.enum(["human", "ai_buyer"]).optional(),
  status: z.enum(["created", "pending", "paid", "failed", "cancelled"]).optional(),
});

const SOURCE_TABS = [
  { value: undefined, label: "All" },
  { value: "human" as const, label: "Human" },
  { value: "ai_buyer" as const, label: "AI buyer" },
];

export default async function MerchantOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await guardMerchantPage();
  const raw = await searchParams;

  const parsed = filterSchema.safeParse({
    source: typeof raw.source === "string" ? raw.source : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
  });
  const filters = parsed.success ? parsed.data : {};

  const orders = await listMerchantOrders(session.merchantId, {
    ...filters,
    limit: 100,
  });

  return (
    <main className="py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Orders
        </h2>
        <nav className="flex gap-1.5" aria-label="Filter by source">
          {SOURCE_TABS.map((t) => {
            const active = filters.source === t.value;
            return (
              <Link
                key={t.label}
                href={t.value ? `/merchant/orders?source=${t.value}` : "/merchant/orders"}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "hover:bg-muted"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {orders.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed p-10 text-center">
          <p className="font-medium">
            {filters.source === "ai_buyer"
              ? "No AI-driven orders yet."
              : filters.source === "human"
                ? "No human orders yet."
                : "No orders yet."}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {filters.source
              ? "Try clearing the filter."
              : "Orders appear here as soon as a checkout is started."}
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-4 py-2.5 font-medium">Order</th>
                <th className="px-4 py-2.5 font-medium">Placed</th>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 font-medium">Source</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Items</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t align-top">
                  <td className="px-4 py-3 font-mono text-xs">
                    {o.id.slice(0, 14)}…
                    {o.razorpayOrderId ? (
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {o.razorpayOrderId}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {o.createdAt.toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                    <div>
                      {o.createdAt.toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {o.customerEmail ?? (
                      <span className="text-muted-foreground">guest</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <SourceBadge source={o.source} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusText status={o.status} />
                    {o.errorDescription ? (
                      <div className="mt-0.5 max-w-52 text-[11px] text-muted-foreground">
                        {o.errorDescription}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{o.itemCount}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    {formatPaise(o.totalInPaise)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Read-only. Showing up to 100 most recent orders.
      </p>
    </main>
  );
}
