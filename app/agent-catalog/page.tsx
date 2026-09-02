import Link from "next/link";
import { getStorefrontMerchantId } from "@/lib/merchant";
import { buildAgentCatalog } from "@/db/queries/agent-catalog";
import { JsonView } from "./json-view";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Agent Catalog · Urban Store",
  description:
    "The machine-readable interface an autonomous AI shopping agent uses to discover Urban Store.",
};

/**
 * Human-readable window onto /api/agent/catalog.
 *
 * Public, matching the endpoint: an autonomous buyer has to be able to discover
 * the shop before it has any relationship with it, and this page shows exactly
 * what it would see. Rendered from `buildAgentCatalog` — the same function the
 * endpoint calls — so this can never drift into being a mockup of the feed.
 */
export default async function AgentCatalogPage() {
  const merchantId = await getStorefrontMerchantId();
  const catalog = await buildAgentCatalog(merchantId);

  const inStock = catalog.products.filter((p) => p.inStock).length;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        For AI agents
      </div>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Agent Catalog</h1>

      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
        This is the structured, machine-readable interface an autonomous AI
        shopping agent uses to discover Urban Store&apos;s catalog — no
        authentication required to browse, matching Track 01&apos;s
        &ldquo;agent-readable catalog&rdquo; direction and the shape assumed by
        emerging agentic-commerce protocols (ACP, AP2, x402, NPCI&apos;s UAP).
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <a
          href="/api/agent/catalog"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3.5 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Raw JSON
          <span aria-hidden="true">↗</span>
        </a>
        <Link
          href="/shop"
          className="rounded-lg border px-3.5 py-2 text-sm transition-colors hover:bg-muted"
        >
          The same products, for humans
        </Link>
      </div>

      <dl className="mt-8 grid gap-3 sm:grid-cols-3">
        <Fact label="Products listed" value={String(catalog.products.length)} />
        <Fact label="In stock right now" value={String(inStock)} />
        <Fact
          label="Return window"
          value={`${catalog.returnPolicy.windowDays} days`}
        />
      </dl>

      <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-50/50 p-4 text-sm dark:bg-amber-950/15">
        <div className="font-medium">What is and is not implemented</div>
        <p className="mt-1 text-muted-foreground">
          Urban Store does <strong>not</strong> implement ACP, AP2, x402 or UAP
          — no agent-payments protocol is spoken on the wire. What it has is the
          shape they assume: open discovery, a bearer-authenticated action
          surface, amounts derived server-side that an agent cannot influence,
          and signature-verified settlement. The{" "}
          <code className="text-xs">protocols</code> field below says exactly
          that.
        </p>
      </div>

      <section className="mt-8">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            GET /api/agent/catalog
          </h2>
          <span className="text-xs text-muted-foreground">
            live response · no auth
          </span>
        </div>
        <JsonView data={catalog} />
      </section>

      <p className="mt-6 text-sm text-muted-foreground">
        The <code className="text-xs">actions</code> block tells an agent how to
        transact without out-of-band documentation. Those endpoints need a
        bearer key — and notice that checkout accepts a cart id and nothing
        else: there is no field an agent could put a price in.
      </p>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-bold tabular-nums tracking-tight">
        {value}
      </dd>
    </div>
  );
}
