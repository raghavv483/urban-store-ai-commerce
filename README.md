# Urban Store AI Commerce OS

An AI-native electronics store where **both humans and autonomous agents can shop and
pay**, with every money action explainable, bounded, gated, and audited.

Built for the Razorpay Buildathon, Track 01. Razorpay runs in **test mode** — no real
money moves.

Product detail: [`PRD.md`](PRD.md) · Technical design: [`ARCHITECTURE.md`](ARCHITECTURE.md) ·
Build plan: [`urban-store-build-spec.md`](urban-store-build-spec.md) ·
Working rules: [`CLAUDE.md`](CLAUDE.md)

---

## The prime directive

> **The LLM never touches money directly.**
>
> ```
> LLM / agent  →  proposes a structured tool call
>              →  deterministic backend validates (Zod)
>              →  policy check (bounds, merchant scope, approval gate)
>              →  backend calls Razorpay
>              →  signature-verified webhook
>              →  database records the outcome
> ```

The model never calls Razorpay, never sets a price, and never determines a payment
amount. Everything else in this codebase follows from that one constraint.

### The seven rules it expands into

| # | Rule | Enforced in |
|---|---|---|
| 1 | The amount comes from the **DB cart, server-side** — never from user or agent input. Say "pay ₹1" on a ₹74,999 cart and you are charged ₹74,999. | `payments/cart.ts` → `priceCart` (there is no `amount` parameter anywhere in the spine) |
| 2 | **Always verify the webhook signature.** A browser "success" is never proof of payment. | `payments/webhook.ts` → HMAC SHA-256 over the raw body, `timingSafeEqual` |
| 3 | **Payment operations are idempotent.** The same checkout twice returns the existing order. | `payments/checkout.ts` + a unique index on `orders.idempotency_key` |
| 4 | **Every meaningful agent action writes an audit row** — actor, trigger, tools, decision summary, policy check, result. Decision summaries only; never raw chain-of-thought. | `agent_runs` / `agent_actions`, rendered at `/merchant/agent-activity` |
| 5 | **Agents reach the system only through strict tools.** No raw DB connection, no arbitrary queries. | `tools/index.ts` — 13 tools, and if it is not in `TOOLS`, an agent cannot do it |
| 6 | **Every query is scoped by `merchantId`** from the authenticated session, never from input. | `auth/session.ts`, every function in `db/queries/` |
| 7 | **No secrets in the browser.** | `lib/env.ts` — one Zod-validated, server-only surface |

---

## What's in the box

### Three ways to buy the same laptop

| Surface | Who it's for | Route |
|---|---|---|
| **Catalog storefront** | Humans who like browsing | `/shop`, `/shop/[slug]` |
| **Conversational storefront** | Humans who'd rather ask | `/ai-shopping` |
| **Machine-readable API** | Autonomous buyers, no human present | `/api/agent/*` |

All three converge on **one** checkout spine. There is no "agent checkout" that skips
validation — the autonomous buyer and the human buyer run identical server code.

### And a merchant console behind it

| Route | What it shows |
|---|---|
| `/merchant` | Revenue split by human vs. AI-attributed, animated tiles |
| `/merchant/orders` | Every order, filterable by source and status |
| `/merchant/agent-activity` | The audit trail as a timeline — what each agent was asked, what it decided, which policy check ran |
| `/merchant/campaigns` | Agent-proposed campaigns awaiting **human approval** |
| `/agent-catalog` | A human-readable window onto the machine-readable feed |

---

## Architecture

```
                      ┌──────────────┐   ┌──────────────┐   ┌───────────────┐
   Human (browser) ─→ │    /shop     │   │ /ai-shopping │   │ /merchant/*   │
                      └──────┬───────┘   └──────┬───────┘   └───────┬───────┘
                             │                  │                   │
                             │           ┌──────▼───────┐           │
   AI agent (bearer) ─→ /api/agent/*     │  LangGraph   │           │
                             │           │   router     │           │
                             │           │ classify →   │           │
                             │           │ execute  →   │           │
                             │           │ respond      │           │
                             │           └──────┬───────┘           │
                             │                  │                   │
                             ▼                  ▼                   ▼
                      ┌──────────────────────────────────────────────────┐
                      │  tools/  — 13 strict, Zod-validated tools         │
                      │  the ONLY way anything reaches the system        │
                      └────────────────────┬─────────────────────────────┘
                                           │
                      ┌────────────────────▼─────────────────────────────┐
                      │  payments/  — the transaction spine              │
                      │  priceCart → verifyInventory → createCheckout    │
                      │  no amount parameter exists                      │
                      └────────────────────┬─────────────────────────────┘
                                           │
                              ┌────────────▼────────────┐
                              │  Razorpay (test mode)   │
                              └────────────┬────────────┘
                                           │ signed webhook
                              ┌────────────▼────────────┐
                              │ /api/webhooks/razorpay  │
                              │ verify → mark paid →    │
                              │ decrement stock →       │
                              │ close cart → audit      │
                              └─────────────────────────┘
```

### The transaction spine, step by step

`payments/checkout.ts` runs five steps, and **none of them accept an amount**:

1. Caller confirms purchase → `createCheckout({ merchantId, cartId, ... })`
2. Fetch the cart from the database
3. Derive the authoritative total — `priceCart`, server-side
4. Verify inventory — `verifyInventory`
5. Create the Razorpay order — idempotently

**Idempotency has a subtlety worth knowing.** An already-open order for the cart is
reused rather than duplicated — but only after checking the total still matches. An
early version of this reused the open order blindly, so adding items after starting
checkout charged the old, lower total: idempotency had quietly become a discount. Stale
orders are now cancelled and re-created. A *failed* order never blocks a fresh attempt,
which is what makes declined-payment retry work at all.

### Agent design

Deterministic things are **functions**, not agents. `getInventory` is a tool. The
pattern is **router → specialized workflow → deterministic tools**, and an agent is used
only where genuine reasoning is needed: intent understanding, recommendation, routing.

The LangGraph router (`agents/router.ts`) is three nodes — `classify → execute →
respond` — with a `MemorySaver` checkpointer for multi-turn threads.

Two hard-won details are baked in:

- **The server overwrites any `cartId` the model supplies.** The model once hallucinated
  `"cart123"`. It no longer gets a vote on which cart it is writing to.
- **Tool results are replaced per turn, not accumulated.** With an appending reducer plus
  a checkpointer, a policy answer leaked into an unrelated product search two turns later.

### RAG, and the honesty guardrail

pgvector (`vector(384)`, ivfflat index) over 4 store documents — return policy, warranty
terms, shipping, and a laptop buying guide — embedded locally with
`Xenova/all-MiniLM-L6-v2`, so no embedding API is called.

If retrieval finds no relevant chunk, the answer is *"I couldn't find that in Urban
Store's knowledge base."* It never invents a policy.

---

## Quick start

```bash
npm install
cp .env.example .env.local    # then fill in every value — see the table below
npm run db:migrate            # applies committed migrations only; safe
npm run db:seed               # 21 products, 53 cross-sell relations (idempotent)
npm run rag:seed              # embeds the knowledge base
npm run dev                   # http://localhost:3000
```

**Postgres needs pgvector:** `CREATE EXTENSION IF NOT EXISTS vector;`

**Set `MERCHANT_ADMIN_EMAIL`** to the address you sign up with — that account becomes
the merchant admin on first sign-in. Everyone else is a customer.

> `npm run db:migrate` only **applies** committed migrations (`prisma migrate deploy`).
> It never generates or resets anything, so it is safe against the shared database. To
> **create** a migration, read [`db/migrations/README.md`](db/migrations/README.md)
> first — this database has a hand-written pgvector index and a documented
> drift-detection trap that make the naive `prisma migrate dev` workflow unsafe here.

### Seeing a payment end to end

Razorpay's webhook has to reach your machine, so the spine only completes with a tunnel
running:

```bash
ngrok http 3000
# then point the Razorpay dashboard webhook at
#   https://<your-ngrok>.ngrok-free.app/api/webhooks/razorpay
# and copy the signing secret into RAZORPAY_WEBHOOK_SECRET
```

Test card `4111 1111 1111 1111`, any future expiry, any CVV.

**Without the tunnel, the order stays `pending` forever** — which is the correct
behaviour, not a bug. Only a signature-verified webhook marks an order paid.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 (Turbopack) |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest — 70 tests across 15 files |
| `npm run db:migrate` | Apply committed migrations (`migrate deploy`, safe) |
| `npm run db:seed` | Seed Urban Store (idempotent) |
| `npm run db:studio` | Browse the database |
| `npm run rag:seed` | Embed the knowledge base into pgvector |
| `npm run agent:buy` | **Autonomous buyer buys a laptop with zero human clicks** |
| `npm run agent:buy:fail` | Same, but the first payment is declined — shows graceful recovery |
| `npm run demo:curate` | Tidy the dataset before recording |

> Tests hit the **real database** in `.env.local`. They clean up after themselves, but
> do not point them at anything you care about. `tsx` scripts need
> `--conditions=react-server` because of the `server-only` guard — the npm scripts
> already pass it.

---

## Environment

Every variable is validated by Zod at first access (`lib/env.ts`); the app fails loudly
on boot rather than mysteriously at runtime.

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Pooled connection (Supabase :6543) — used at runtime |
| `DIRECT_URL` | Direct connection (:5432) — used for migrations |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Test mode |
| `RAZORPAY_WEBHOOK_SECRET` | From the dashboard webhook you create |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Key id only, safe in the browser. **Must equal** `RAZORPAY_KEY_ID` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | Auth |
| `GROQ_API_KEY` / `GROQ_BASE_URL` | Groq speaks the OpenAI wire format, so the provider abstraction is the OpenAI SDK pointed elsewhere |
| `LLM_MODEL` / `LLM_FAST_MODEL` | Defaults `openai/gpt-oss-120b` / `openai/gpt-oss-20b`. **Groq retires model ids on short notice** — verify against `GET /openai/v1/models` before changing |
| `LLM_MAX_RETRIES` / `LLM_TIMEOUT_MS` | Defaults 3 / 30s |
| `MERCHANT_ADMIN_EMAIL` | This account becomes merchant admin |
| `EMBEDDING_MODEL` / `EMBEDDING_DIMENSIONS` | Must agree with the `vector(N)` width of `knowledge_chunks` |
| `APP_BASE_URL` | Absolute base for links in emails |
| `RESEND_API_KEY` | Optional. Without it, campaigns still approve — they report that nothing could be sent |
| `RESEND_FROM` / `RESEND_ALLOWED_RECIPIENTS` | Sandbox only delivers to verified addresses; anything else is reported unreachable rather than bounced |
| `AGENT_API_KEY` | Bearer secret for autonomous buyers, min 32 chars |
| `AGENT_MAX_ORDER_VALUE_PAISE` | Hard ceiling on one agent-initiated order. The spine still derives the amount; this bounds what an agent may commit |
| `FAILED_CART_ELIGIBLE_AFTER_MS` | See the revert table below |
| `ENABLE_TEST_SPINE` | See the revert table below |

### ⚠️ Demo-tuned settings to revert

Two values in `.env.local` are set for live demo recording, not production. Restore both
before treating this as production-correct:

| Variable | Demo value | Production value | Why it matters |
|---|---|---|---|
| `FAILED_CART_ELIGIBLE_AFTER_MS` | `10000` (10s) | `1800000` (30 min) | How long a declined-payment cart waits before the growth agent may target it. At 10s a shopper reaching for a second card gets a "you left something behind" email mid-retry. |
| `ENABLE_TEST_SPINE` | `true` | unset / `false` | Exposes `/test-spine`, the manual payment harness. Its server actions create carts and Razorpay orders and are reachable by anyone who can reach the app. |

`.env.example` already carries the production value for both, so a fresh
`cp .env.example .env.local` is correct by default.

---

## The agent surface

An autonomous buyer discovers the store with **no credentials**, then authenticates only
to act.

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/agent/catalog` | none | Machine-readable catalog: prices in paise, stock, `compatibleWith` derived from `product_relations`, return-policy window |
| `POST /api/agent/cart` | `Bearer` | Add to cart — wraps the same `addToCart` tool the chat uses |
| `POST /api/agent/checkout` | `Bearer` | Runs the spine. Enforces `AGENT_MAX_ORDER_VALUE_PAISE` **before** any Razorpay call |
| `GET /api/agent/order/[orderId]` | `Bearer` | Settlement status |
| `POST /api/agent/test` | `Bearer` | Auth-boundary probe |

The bearer check uses `timingSafeEqual` — the same reason the webhook does. A request
with no key or a wrong key is genuinely rejected; `auth/agent.test.ts` asserts it rather
than assuming it.

```bash
npm run agent:buy        # discover → choose cheapest in-stock laptop → buy
npm run agent:buy:fail   # first payment declined → retry once → stop cleanly
```

The failure mode is deliberate: it reports and stops rather than looping. A stuck retry
loop is worse than a clean stop.

---

## The growth agent, and where it is *not* allowed to go

The agent may read abandoned carts and **draft** a recovery campaign. It cannot activate
one and it cannot send anything. Activation is a human click, recorded with an approval
status and an audit row. Approving sends real email through Resend (sandbox), to
addresses with a verified account on file; carts with no account are counted unreachable
rather than contacted.

**Which carts are recoverable** is worth explaining, because it is not just
`status = 'abandoned'`:

A declined payment leaves the cart **`active`** on purpose — the buyer should be able to
try another card, and `priceCart` refuses a non-active cart, so closing it would break
retry. But nothing in this codebase ever ages a cart to `abandoned`; there is no
sweeper. Keyed on status alone, the highest-intent cart in the store — the one where the
shopper reached the card form — would never be recoverable at all.

So the predicate is:

```sql
status = 'abandoned'
  OR (status = 'active' AND EXISTS cart_event
      WHERE eventType = 'payment_failed'
        AND createdAt <= now() - FAILED_CART_ELIGIBLE_AFTER_MS)
```

Read-only, no scheduler, no new write path — and self-correcting: a cart qualifies on
its *current* state, so a shopper who retries successfully flips to `checked_out` and
drops out on the next read.

The delay is what keeps it honest. Emailing "you left something behind" to someone
thirty seconds into re-entering their card is worse than not emailing at all.

Outcomes are **derived, never stored**: `getCampaignOutcome` compares targeted carts
against orders paid *after* approval, capped at one order per cart, so a campaign can
never take credit for a sale that already happened.

---

## Money, precisely

Money is an **integer number of paise** everywhere — database, tools, API payloads,
audit rows. There is exactly one formatting site, `formatPaise` in `lib/money.ts`, and
`lib/money.test.ts` pins the Indian digit grouping (`₹1,00,000`, not `₹100,000`).

Two places deliberately refuse to animate a number:

- **The checkout total** is rendered as a plain, final figure. A count-up would flash
  amounts that are not the amount being charged.
- **The header cart badge** empties only on a webhook-confirmed `paid` — never on
  Razorpay's in-page callback, which fires before settlement.

---

## Tech stack

Next.js 16 (App Router) · TypeScript strict · Tailwind v4 + shadcn tokens ·
PostgreSQL (Supabase) + Prisma 7 · pgvector · Clerk · LangGraph (JS) · Groq ·
Framer Motion · Resend · Razorpay test mode · Vitest

Version quirks that will bite you if you don't know them:

- **Next 16** — `params` / `searchParams` are Promises; `middleware.ts` is `proxy.ts`.
- **Prisma 7** — needs an explicit driver adapter (`@prisma/adapter-pg`); `url` /
  `directUrl` moved out of the schema into `prisma.config.ts`.
- **Clerk Core 3** — `<SignedIn>` / `<SignedOut>` are **removed throwing stubs**. Use
  `<Show when="signed-in">`. Typecheck, lint and build all pass with the old ones; every
  page 500s at runtime. This was caught only by curling a running server.

---

## Layout

```
/app         routes (customer + merchant + api)
/components  UI components, motion vocabulary, skeletons
/lib         env, money, db, LLM provider abstraction, cart events
/agents      LangGraph graphs
/tools       the 13 strict agent tools — the only way agents touch the system
/rag         embedding + retrieval
/db          prisma schema, migrations, seed, queries
/payments    razorpay client, cart pricing, checkout spine, webhook, audit
/auth        session helpers, merchant guard, agent bearer auth
/types       shared types + zod schemas
```

---

## Testing

```bash
npm test              # 70 tests, 15 files
```

Per `CLAUDE.md` this project tests the parts where being wrong costs money, not every
function:

- **The payment spine** — `payments/spine.test.ts`: server-side totals, inventory
  verification, idempotency, signature verification.
- **The agent boundary** — `auth/agent.test.ts`: a request with no key or a wrong key is
  actually rejected, and the order cap actually holds.
- Plus schema, seed, money formatting, env parsing, RAG retrieval, merchant scoping,
  campaign outcome attribution, and the router.

**A known flake:** running the full suite repeatedly back-to-back can produce file-level
load failures with tests skipped. That is connection-pool exhaustion against pooled
Supabase, not an assertion failure — re-run it.

---

## Agent-payments protocols — where this sits

Urban Store does **not** implement ACP, AP2, x402, or NPCI's UAP. No agent-payments
protocol is spoken on the wire, and nothing here should be read as compliance with one.

What it has is the *shape* those protocols assume, arrived at for its own reasons:

| Property | Where it lives |
|---|---|
| Machine-readable catalog, discoverable without credentials | `GET /api/agent/catalog` |
| Bearer-authenticated action surface for autonomous buyers | `POST /api/agent/cart`, `/api/agent/checkout` |
| Amounts derived server-side, never accepted from the caller | `payments/cart.ts` → `payments/checkout.ts` |
| Bounded agent authority | `AGENT_MAX_ORDER_VALUE_PAISE`, enforced before any Razorpay call |
| Signature-verified settlement callback | `POST /api/webhooks/razorpay` |
| Every agent action attributable and auditable | `agent_runs` / `agent_actions` → `/merchant/agent-activity` |

Adopting one would be adapter work at that boundary — mapping an existing discovery
document and action surface onto their envelope — rather than a redesign of the money
path. The constraint that makes that true is the prime directive: the model proposes,
deterministic code decides, and the amount always comes from the database.

---

## Known gaps

Stated plainly, because a demo that hides them is worse than one that doesn't:

- **No production deployment.** Local plus an ngrok tunnel for webhooks.
- **Single merchant.** Every query is `merchantId`-scoped and multi-tenancy is enforced
  in tests, but only one merchant is seeded.
- **Resend runs in sandbox** — delivery is limited to verified addresses.
- **`/test-spine` is developer tooling**, gated behind `ENABLE_TEST_SPINE`. It is not a
  customer surface and its actions create synthetic carts and real test-mode Razorpay
  orders.
- **Recovery-rate estimates are planning figures, not forecasts** — a flat 20%, labelled
  as an estimate everywhere it appears in the UI.
