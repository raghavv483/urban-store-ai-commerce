"use client";

import { useState, useTransition } from "react";
import { proposeRecoveryCampaign, decide } from "./actions";

type Target = {
  segment: string;
  cartCount: number;
  cartValueInPaise: number;
  estimatedRecoveryInPaise: number;
  assumedRecoveryRate: number;
  topProducts: string[];
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
};

const money = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

const STATUS_STYLE: Record<string, string> = {
  proposed: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "bg-muted text-muted-foreground",
};

export function CampaignBoard({ campaigns }: { campaigns: CampaignView[] }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          The growth agent can look at abandoned carts and draft a recovery campaign.
          It cannot start one — every campaign stays inactive until you approve it.
          Approving sends the copy for real, in Resend test mode, to shoppers with a
          verified address on file.
        </p>
        <button
          onClick={() => run(proposeRecoveryCampaign)}
          disabled={pending}
          className="shrink-0 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "Working…" : "Ask the agent for a proposal"}
        </button>
      </div>

      {notice ? (
        <p
          className={`rounded-md border-l-2 px-3 py-2 text-sm ${
            notice.ok
              ? "border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/20"
              : "border-red-500 bg-red-50/70 dark:bg-red-950/20"
          }`}
        >
          {notice.message}
        </p>
      ) : null}

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Awaiting your decision
        </h3>

        {proposed.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No campaigns waiting. Ask the agent for a proposal to see one here.
          </p>
        ) : (
          <ul className="mt-3 space-y-4">
            {proposed.map((c) => (
              <li key={c.id} className="rounded-lg border p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{c.name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[c.status]}`}
                  >
                    awaiting approval
                  </span>
                </div>

                <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">Target</dt>
                    <dd className="mt-0.5 text-sm font-medium">
                      {c.target.cartCount} cart{c.target.cartCount === 1 ? "" : "s"}
                    </dd>
                    <dd className="text-xs text-muted-foreground">{c.target.segment}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Cart value at risk</dt>
                    <dd className="mt-0.5 text-sm font-medium tabular-nums">
                      {money(c.target.cartValueInPaise)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Estimated recovery</dt>
                    <dd className="mt-0.5 text-sm font-medium tabular-nums text-emerald-600">
                      {money(c.target.estimatedRecoveryInPaise)}
                    </dd>
                    <dd className="text-xs text-muted-foreground">
                      at {Math.round(c.target.assumedRecoveryRate * 100)}% — an estimate,
                      not a forecast
                    </dd>
                  </div>
                </dl>

                <div className="mt-4">
                  <div className="text-xs text-muted-foreground">Message copy</div>
                  {editing === c.id ? (
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={4}
                      className="mt-1.5 w-full rounded-md border bg-background p-3 text-sm outline-none focus:ring-1 focus:ring-foreground/20"
                    />
                  ) : (
                    <p className="mt-1.5 rounded-md border bg-muted/40 p-3 text-sm leading-relaxed">
                      {c.content}
                    </p>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {editing === c.id ? (
                    <>
                      <button
                        onClick={() => run(() => decide(c.id, "approve", draft))}
                        disabled={pending}
                        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        Save &amp; approve
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="rounded-md border px-4 py-2 text-sm"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => run(() => decide(c.id, "approve"))}
                        disabled={pending}
                        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => {
                          setEditing(c.id);
                          setDraft(c.content);
                        }}
                        disabled={pending}
                        className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
                      >
                        Edit copy
                      </button>
                      <button
                        onClick={() => run(() => decide(c.id, "reject"))}
                        disabled={pending}
                        className="rounded-md border px-4 py-2 text-sm text-red-600 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>

                <p className="mt-3 text-xs text-muted-foreground">
                  Proposed by {c.createdByAgent ?? "an agent"}. Approving sends this copy
                  to shoppers whose cart is linked to a verified account; carts with no
                  account on file are counted as unreachable rather than contacted.
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Decided
        </h3>
        {decided.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nothing decided yet.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Campaign</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Decided by</th>
                  <th className="px-4 py-2.5 text-right font-medium">Carts</th>
                  <th className="px-4 py-2.5 text-right font-medium">Est. recovery</th>
                </tr>
              </thead>
              <tbody>
                {decided.map((c) => (
                  <tr key={c.id} className="border-t">
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
