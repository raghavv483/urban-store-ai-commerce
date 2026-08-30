import Link from "next/link";
import { guardMerchantPage } from "@/auth/merchant-guard";
import { listAgentActivity, listAgentNames } from "@/db/queries/merchant";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agent activity · Urban Store Merchant" };

/** Plain-English names for the actors that write audit rows. */
const ACTOR_LABELS: Record<string, string> = {
  router: "Shopping assistant",
  ai_buyer: "Autonomous buyer",
  human_checkout: "Customer checkout",
  razorpay_webhook: "Payment webhook",
  system: "System",
};

/** Plain-English names for tool calls, so the page reads as sentences. */
const ACTION_LABELS: Record<string, string> = {
  searchProducts: "Searched the catalog",
  getProduct: "Looked up a product",
  getInventory: "Checked stock",
  getRecommendations: "Fetched accessory recommendations",
  getCart: "Read the cart",
  addToCart: "Added an item to the cart",
  createRazorpayOrder: "Created a payment order",
  getPaymentStatus: "Checked payment status",
  searchKnowledgeBase: "Searched store policy documents",
  getReturnPolicy: "Looked up the return policy",
  calculate_total: "Calculated the order total",
  verify_inventory: "Verified inventory",
  verify_webhook_signature: "Verified the payment signature",
  mark_order_paid: "Marked the order paid",
  mark_order_failed: "Marked the order failed",
  decrement_inventory: "Decremented inventory",
  cancel_stale_order: "Cancelled a stale order",
};

function relativeTime(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default async function AgentActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await guardMerchantPage();
  const raw = await searchParams;
  const agentName = typeof raw.agent === "string" ? raw.agent : undefined;

  const [runs, agentNames] = await Promise.all([
    listAgentActivity(session.merchantId, { agentName, limit: 40 }),
    listAgentNames(session.merchantId),
  ]);

  return (
    <main className="py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Agent activity
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every decision an agent made on this store, and what it was allowed to do.
            Decision summaries only — the model&apos;s internal reasoning is never recorded.
          </p>
        </div>
        <nav className="flex flex-wrap gap-1.5" aria-label="Filter by actor">
          <Link
            href="/merchant/agent-activity"
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              !agentName ? "border-foreground bg-foreground text-background" : "hover:bg-muted"
            }`}
          >
            All
          </Link>
          {agentNames.map((n) => (
            <Link
              key={n}
              href={`/merchant/agent-activity?agent=${encodeURIComponent(n)}`}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                agentName === n
                  ? "border-foreground bg-foreground text-background"
                  : "hover:bg-muted"
              }`}
            >
              {ACTOR_LABELS[n] ?? n}
            </Link>
          ))}
        </nav>
      </div>

      {runs.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed p-10 text-center">
          <p className="font-medium">
            {agentName ? "No activity from this actor yet." : "No agent activity yet."}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Entries appear as soon as an agent takes an action — a search, a cart change,
            or a payment.
          </p>
        </div>
      ) : (
        <ol className="mt-4 space-y-3">
          {runs.map((run) => {
            const failed = run.status === "failed";
            return (
              <li
                key={run.id}
                className={`rounded-lg border p-4 ${
                  failed ? "border-red-300/60 bg-red-50/40 dark:bg-red-950/10" : ""
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium">
                      {ACTOR_LABELS[run.agentName] ?? run.agentName}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        failed
                          ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      }`}
                    >
                      {run.status}
                    </span>
                  </div>
                  <time
                    className="text-xs text-muted-foreground"
                    dateTime={run.startedAt.toISOString()}
                    title={run.startedAt.toLocaleString("en-IN")}
                  >
                    {relativeTime(run.startedAt)}
                  </time>
                </div>

                <p className="mt-2 text-sm">
                  <span className="text-muted-foreground">Asked to: </span>
                  {run.inputSummary}
                </p>
                {run.outputSummary ? (
                  <p className="mt-1 text-sm">
                    <span className="text-muted-foreground">Decided: </span>
                    {run.outputSummary}
                  </p>
                ) : null}

                {run.actions.length > 0 ? (
                  <ul className="mt-3 space-y-1.5 border-t pt-3">
                    {run.actions.map((a) => (
                      <li key={a.id} className="text-xs">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span
                            aria-hidden="true"
                            className={
                              a.ok === false ? "text-red-600" : "text-emerald-600"
                            }
                          >
                            {a.ok === false ? "✕" : "✓"}
                          </span>
                          <span className="font-medium">
                            {ACTION_LABELS[a.actionType] ?? a.actionType}
                          </span>
                          {a.durationMs !== null ? (
                            <span className="text-muted-foreground tabular-nums">
                              {a.durationMs}ms
                            </span>
                          ) : null}
                          {a.approvalRequired ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              approval {a.approvalStatus ?? "pending"}
                            </span>
                          ) : null}
                        </div>
                        {a.detail ? (
                          <div className="ml-5 text-muted-foreground">{a.detail}</div>
                        ) : null}
                        {a.policyDecision ? (
                          <div className="ml-5 text-muted-foreground">
                            <span className="font-medium">Policy: </span>
                            {a.policyDecision}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="mt-3 border-t pt-2 font-mono text-[11px] text-muted-foreground">
                  {run.trigger}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Read-only. Showing the 40 most recent runs.
      </p>
    </main>
  );
}
