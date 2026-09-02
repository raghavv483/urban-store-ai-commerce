# Urban Store AI Commerce OS

An AI-native electronics store where both humans and autonomous agents can shop
and pay, with every money action explainable, bounded, gated, and audited.

Product detail: `PRD.md` · Technical design: `ARCHITECTURE.md` ·
Build plan: `urban-store-build-spec.md`

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in every value
npm run db:migrate
npm run db:seed
npm run dev
```

The Postgres database needs the `vector` extension:
`CREATE EXTENSION IF NOT EXISTS vector;`

Set `MERCHANT_ADMIN_EMAIL` to the address you sign up with — that account
becomes the merchant admin on first sign-in.

`npm run db:migrate` only **applies** committed migrations (`prisma migrate
deploy`) — it never generates or resets anything, so it's safe to run against
the shared database. If you need to **create** a new migration, read
`db/migrations/README.md` first — this project's database has quirks
(a hand-written pgvector index, and a documented drift-detection trap) that
make the naive `prisma migrate dev` workflow unsafe here.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest (unit + DB integration) |
| `npm run db:migrate` | Apply committed Prisma migrations (`migrate deploy`, safe) |
| `npm run db:seed` | Seed Urban Store (idempotent) |
| `npm run db:studio` | Browse the database |

Tests hit the real database in `.env.local`. They clean up after themselves,
but do not point them at anything you care about.

## Layout

```
/app       routes (customer + merchant + api)
/components UI components
/lib        shared utils, env, money, LLM provider abstraction
/agents     LangGraph graphs
/tools      strict agent tools
/rag        embedding + retrieval
/db         prisma schema, seed, queries
/payments   razorpay client, webhook verification, idempotency
/auth       session helpers and merchant scoping
/types      shared types + zod schemas
```

## Day 1 status

Done: schema, seed, Clerk auth with two roles, merchant-scoped product
queries, `/shop` catalog and detail pages.

Next: Day 2 — the transaction spine. See `urban-store-build-spec.md` §9.

## Agent-payments protocols — where this sits

Urban Store does **not** implement ACP, AP2, x402 or NPCI's UAP. No agent-payments
protocol is spoken on the wire, and nothing here should be read as compliance with one.

What it does have is the shape those protocols assume, built for its own reasons:

| Property | Where it lives |
|---|---|
| Machine-readable catalog, discoverable without credentials | `GET /api/agent/catalog` |
| Bearer-authenticated action surface for autonomous buyers | `POST /api/agent/cart`, `/api/agent/checkout` |
| Amounts derived server-side, never accepted from the caller | `payments/cart.ts` → `payments/checkout.ts` |
| Bounded agent authority | `AGENT_MAX_ORDER_VALUE_PAISE`, enforced before any Razorpay call |
| Signature-verified settlement callback | `POST /api/webhooks/razorpay` |
| Every agent action attributable and auditable | `agent_runs` / `agent_actions`, rendered at `/merchant/agent-activity` |

Adopting one of these protocols would be adapter work at that boundary — mapping an
existing discovery document and action surface onto their envelope — rather than a
redesign of the money path. The constraint that makes that true is the prime directive:
the model proposes, deterministic code decides, and the amount always comes from the
database.
