"use client";

import { useState, useTransition } from "react";
import { proposeRecoveryCampaign, decide } from "./actions";
import { motion, AnimatePresence, EASE, pressable } from "@/components/motion";

type Target = {
  segment: string;
  cartCount: number;
  cartValueInPaise: number;
  estimatedRecoveryInPaise: number;
  assumedRecoveryRate: number;
  topProducts: string[];
};

export type CampaignOutcomeView = {
  targetCartCount: number;
  recoveredCartCount: number;
  recoveredInPaise: number;
  recoveryRatePercent: number;
  measuredSince: string;
};

export type CampaignView = {
  id: string;
  name: string;
  status: "proposed" | "approved" | "active" | "rejected";
  content: string;
  createdByAgent: string | null;
  approvedBy: string | null;
  createdAt: string;
  target: Target;
  /** Present only for active campaigns. Derived from paid orders, never stored. */
  outcome: CampaignOutcomeView | null;
};

const money = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

const STATUS_STYLE: Record<string, string> = {
  proposed:
    "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300",
  active:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300",
  approved:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300",
  rejected: "bg-muted text-muted-foreground",
};

const TH =
  "px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground";

/** Height animation for the edit affordance. `auto` so copy of any length fits. */
const collapse = {
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto" as const, opacity: 1 },
  exit: { height: 0, opacity: 0 },
  transition: { duration: 0.26, ease: EASE },
};

export function CampaignBoard({ campaigns }: { campaigns: CampaignView[] }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const proposed = campaigns.filter((c) => c.status === "proposed");
  const decided = campaigns.filter((c) => c.status !== "proposed");

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const res = await fn();
      setNotice(res);
      setEditing(null);
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-2xl text-meta text-muted-foreground">
          The growth agent can look at abandoned carts and draft a recovery
          campaign. It cannot start one — every campaign stays inactive until
          you approve it. Approving sends the copy for real, in Resend test
          mode, to shoppers with a verified address on file.
        </p>
        <motion.button
          {...pressable}
          onClick={() => run(proposeRecoveryCampaign)}
          disabled={pending}
          className="shrink-0 rounded-lg bg-primary px-4 py-2.5 text-meta font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Working…" : "Ask the agent for a proposal"}
        </motion.button>
      </div>

      <AnimatePresence initial={false}>
        {notice ? (
          <motion.p
            key={notice.message}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.24, ease: EASE }}
            className={`rounded-lg border-l-2 px-3.5 py-2.5 text-meta ${
              notice.ok
                ? "border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/25"
                : "border-destructive bg-red-50/70 dark:bg-red-950/25"
            }`}
          >
            {notice.message}
          </motion.p>
        ) : null}
      </AnimatePresence>

      <section>
        <h3 className="text-eyebrow uppercase text-muted-foreground">
          Awaiting your decision
        </h3>

        {proposed.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed p-10 text-center text-meta text-muted-foreground">
            No campaigns waiting. Ask the agent for a proposal to see one here.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            <AnimatePresence initial={false}>
              {proposed.map((c) => (
                <motion.li
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  className="rounded-2xl border bg-card p-5 elevate"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-heading">{c.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[c.status]}`}
                    >
                      awaiting approval
                    </span>
                  </div>

                  <dl className="mt-5 grid gap-4 rounded-xl bg-muted/40 p-4 sm:grid-cols-3">
                    <div>
                      <dt className="text-xs text-muted-foreground">Target</dt>
                      <dd className="mt-1 text-heading">
                        {c.target.cartCount} cart
                        {c.target.cartCount === 1 ? "" : "s"}
                      </dd>
                      <dd className="text-xs text-muted-foreground">
                        {c.target.segment}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Cart value at risk
                      </dt>
                      <dd className="mt-1 text-heading tabular-nums">
                        {money(c.target.cartValueInPaise)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Estimated recovery
                      </dt>
                      <dd className="mt-1 text-heading tabular-nums text-emerald-600 dark:text-emerald-400">
                        {money(c.target.estimatedRecoveryInPaise)}
                      </dd>
                      <dd className="text-xs text-muted-foreground">
                        at {Math.round(c.target.assumedRecoveryRate * 100)}% —
                        an estimate, not a forecast
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-5">
                    <div className="text-xs text-muted-foreground">
                      Message copy
                    </div>
                    <div className="mt-1.5">
                      <AnimatePresence mode="wait" initial={false}>
                        {editing === c.id ? (
                          <motion.div
                            key="edit"
                            {...collapse}
                            className="overflow-hidden"
                          >
                            <textarea
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              rows={4}
                              autoFocus
                              className="w-full rounded-lg border bg-background p-3 text-meta leading-relaxed outline-none transition-shadow focus:border-primary/40 focus:shadow-[0_0_0_3px] focus:shadow-primary/10"
                            />
                          </motion.div>
                        ) : (
                          <motion.p
                            key="read"
                            {...collapse}
                            className="overflow-hidden whitespace-pre-wrap rounded-lg border bg-muted/40 p-3.5 text-meta leading-relaxed"
                          >
                            {c.content}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {editing === c.id ? (
                      <>
                        <motion.button
                          {...pressable}
                          onClick={() =>
                            run(() => decide(c.id, "approve", draft))
                          }
                          disabled={pending}
                          className="rounded-lg bg-emerald-600 px-4 py-2 text-meta font-medium text-white disabled:opacity-50"
                        >
                          Save &amp; approve
                        </motion.button>
                        <button
                          onClick={() => setEditing(null)}
                          className="rounded-lg border bg-card px-4 py-2 text-meta transition-colors hover:bg-muted"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <motion.button
                          {...pressable}
                          onClick={() => run(() => decide(c.id, "approve"))}
                          disabled={pending}
                          className="rounded-lg bg-emerald-600 px-4 py-2 text-meta font-medium text-white disabled:opacity-50"
                        >
                          Approve
                        </motion.button>
                        <button
                          onClick={() => {
                            setEditing(c.id);
                            setDraft(c.content);
                          }}
                          disabled={pending}
                          className="rounded-lg border bg-card px-4 py-2 text-meta transition-colors hover:bg-muted disabled:opacity-50"
                        >
                          Edit copy
                        </button>
                        <button
                          onClick={() => run(() => decide(c.id, "reject"))}
                          disabled={pending}
                          className="rounded-lg border bg-card px-4 py-2 text-meta text-destructive transition-colors hover:bg-destructive/5 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>

                  <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                    Proposed by {c.createdByAgent ?? "an agent"}. Approving
                    sends this copy to shoppers whose cart is linked to a
                    verified account; carts with no account on file are counted
                    as unreachable rather than contacted.
                  </p>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-eyebrow uppercase text-muted-foreground">
          Decided
        </h3>
        {decided.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed p-10 text-center text-meta text-muted-foreground">
            Nothing decided yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-meta">
              <thead className="border-b bg-muted/40 text-left">
                <tr>
                  <th className={TH}>Campaign</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Decided by</th>
                  <th className={`${TH} text-right`}>Carts</th>
                  <th className={`${TH} text-right`}>Est. recovery</th>
                  <th className={`${TH} text-right`}>Actually recovered</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {decided.map((c) => (
                  <tr
                    key={c.id}
                    className="transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">{c.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[c.status]}`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {c.approvedBy ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c.target.cartCount}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c.status === "rejected" ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        money(c.target.estimatedRecoveryInPaise)
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.outcome ? (
                        <>
                          <div
                            className={
                              c.outcome.recoveredCartCount > 0
                                ? "font-medium tabular-nums text-emerald-600 dark:text-emerald-400"
                                : "tabular-nums text-muted-foreground"
                            }
                          >
                            {money(c.outcome.recoveredInPaise)}
                          </div>
                          <div className="text-xs tabular-nums text-muted-foreground">
                            {c.outcome.recoveredCartCount} of{" "}
                            {c.outcome.targetCartCount} carts
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
