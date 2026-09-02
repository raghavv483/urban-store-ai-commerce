import Link from "next/link";
import { guardMerchantPage } from "@/auth/merchant-guard";
import { listAgentActivity, listAgentNames } from "@/db/queries/merchant";
import { PageIn, StaggerList, StaggerListItem } from "@/components/motion";
import { EmptyState } from "../ui";

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

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs transition-colors ${
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "bg-card hover:border-primary/40 hover:bg-muted"
    }`;

  return (
    <PageIn className="py-8">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h2 className="text-eyebrow uppercase text-muted-foreground">
            Agent activity
          </h2>
          <p className="mt-2 max-w-2xl text-meta text-muted-foreground">
            Every decision an agent made on this store, and what it was allowed
            to do. Decision summaries only — the model&apos;s internal reasoning
            is never recorded.
          </p>
        </div>
        <nav className="flex flex-wrap gap-1.5" aria-label="Filter by actor">
          <Link href="/merchant/agent-activity" className={chip(!agentName)}>
            All
          </Link>
          {agentNames.map((n) => (
            <Link
              key={n}
              href={`/merchant/agent-activity?agent=${encodeURIComponent(n)}`}
              className={chip(agentName === n)}
            >
              {ACTOR_LABELS[n] ?? n}
            </Link>
          ))}
        </nav>
      </div>

      {runs.length === 0 ? (
        <EmptyState
          title={
            agentName
              ? "No activity from this actor yet."
              : "No agent activity yet."
          }
          hint="Entries appear as soon as an agent takes an action — a search, a cart change, or a payment."
        />
      ) : (
        // A rail down the left edge ties the runs into one timeline. Each marker
        // sits on the rail, so failures are visible as a break in an otherwise
        // even column of green.
        <div className="relative mt-6 pl-7">
          <div
            aria-hidden="true"
            className="absolute bottom-2 left-[7px] top-2 w-px bg-border"
          />
          <StaggerList className="space-y-3">
            {runs.map((run) => {
              const failed = run.status === "failed";
              return (
                <StaggerListItem key={run.id} className="relative">
                  <span
                    aria-hidden="true"
                    className={`absolute -left-7 top-5 h-[9px] w-[9px] rounded-full ring-4 ring-background ${
                      failed ? "bg-destructive" : "bg-emerald-500"
                    }`}
                  />
                  <div
                    className={`rounded-xl border bg-card p-4 transition-shadow hover:shadow-sm ${
                      failed
                        ? "border-destructive/40 bg-destructive/[0.03]"
                        : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-heading">
                          {ACTOR_LABELS[run.agentName] ?? run.agentName}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            failed
                              ? "bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300"
                              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"
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

                    <p className="mt-2.5 text-meta">
                      <span className="text-muted-foreground">Asked to: </span>
                      {run.inputSummary}
                    </p>
                    {run.outputSummary ? (
                      <p className="mt-1 text-meta">
                        <span className="text-muted-foreground">Decided: </span>
                        {run.outputSummary}
                      </p>
                    ) : null}

                    {run.actions.length > 0 ? (
                      <ul className="mt-3.5 space-y-2 border-t pt-3">
                        {run.actions.map((a) => (
                          <li key={a.id} className="text-xs">
                            <div className="flex flex-wrap items-baseline gap-2">
                              <span
                                aria-hidden="true"
                                className={
                                  a.ok === false
                                    ? "text-destructive"
                                    : "text-emerald-600 dark:text-emerald-400"
                                }
                              >
                                {a.ok === false ? "✕" : "✓"}
                              </span>
                              <span className="font-medium">
                                {ACTION_LABELS[a.actionType] ?? a.actionType}
                              </span>
                              {a.durationMs !== null ? (
                                <span className="tabular-nums text-muted-foreground">
                                  {a.durationMs}ms
                                </span>
                              ) : null}
                              {a.approvalRequired ? (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                                  approval {a.approvalStatus ?? "pending"}
                                </span>
                              ) : null}
                            </div>
                            {a.detail ? (
                              <div className="ml-5 text-muted-foreground">
                                {a.detail}
                              </div>
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
                  </div>
                </StaggerListItem>
              );
            })}
          </StaggerList>
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Read-only. Showing the 40 most recent runs.
      </p>
    </PageIn>
  );
}
