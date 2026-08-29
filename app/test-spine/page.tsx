import { formatPaise } from "@/lib/money";
import { getSpineState } from "./actions";
import { SpineControls } from "./spine-controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Transaction spine — manual test" };

export default async function TestSpinePage() {
  const { cart, orders, products, runs } = await getSpineState();

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Transaction spine — manual test</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Day 2. No AI, no agents. Every amount below is derived server-side from the
          database cart; nothing here accepts an amount from the browser.
        </p>
      </header>

      <SpineControls activeCartId={cart?.id ?? null} />

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Inventory
        </h2>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium">Price</th>
                <th className="px-3 py-2 font-medium">Stock</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.slug} className="border-t">
                  <td className="px-3 py-2">{p.slug}</td>
                  <td className="px-3 py-2 tabular-nums">{formatPaise(p.priceInPaise)}</td>
                  <td className="px-3 py-2 tabular-nums font-medium">{p.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Active test cart
        </h2>
        {cart ? (
          <div className="rounded-md border p-3 text-sm">
            <div className="font-mono text-xs text-muted-foreground">{cart.id}</div>
            <ul className="mt-2 space-y-1">
              {cart.items.map((i) => (
                <li key={i.id}>
                  {i.quantity} × {i.product.name} @ {formatPaise(i.priceAtTimePaise)}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No active cart. Click “Create test cart”.</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Recent orders
        </h2>
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Order</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Total</th>
                  <th className="px-3 py-2 font-medium">Payment</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-t align-top">
                    <td className="px-3 py-2 font-mono text-xs">{o.id.slice(0, 12)}…</td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          o.status === "paid"
                            ? "font-medium text-emerald-600"
                            : o.status === "failed"
                              ? "font-medium text-red-600"
                              : "text-muted-foreground"
                        }
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatPaise(o.totalInPaise)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {o.payments.length === 0
                        ? "—"
                        : o.payments
                            .map((p) => `${p.status}${p.errorCode ? ` (${p.errorCode})` : ""}`)
                            .join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Audit trail (agent_runs / agent_actions)
        </h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No audit rows yet.</p>
        ) : (
          <ul className="space-y-2">
            {runs.map((r) => (
              <li key={r.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{r.agentName}</span>
                  <span
                    className={
                      r.status === "succeeded"
                        ? "text-xs text-emerald-600"
                        : "text-xs text-red-600"
                    }
                  >
                    {r.status}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{r.trigger}</div>
                <div className="mt-1">{r.outputSummary}</div>
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {r.actions.map((a) => (
                    <li key={a.id}>
                      <span className="font-mono">{a.actionType}</span>
                      {a.policyDecision ? ` — ${a.policyDecision}` : ""}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
