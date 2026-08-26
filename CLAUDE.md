# CLAUDE.md — Working Rules for Claude Code

> Claude Code reads this file at the start of every session. These are standing rules.
> Follow them on **every** prompt unless I explicitly override them in that prompt.

---

## What this project is (one line)

**Urban Store AI Commerce OS** — an AI-native electronics store (Razorpay Buildathon,
Track 01) where both humans and autonomous AI agents can shop and pay, with every money
action explainable, bounded, gated, and audited.

Full product detail: see `PRD.md`. Technical design: see `ARCHITECTURE.md`. Day-by-day
plan: see `urban-store-build-spec.md`. **Read the relevant one before building a feature.**

---

## The prime directive (never violate)

> **The LLM never touches money directly.**
>
> LLM/agent → proposes a structured tool call → deterministic backend validates →
> policy check → backend calls Razorpay → webhook verifies → database records.
>
> Never let the LLM call Razorpay, set a price, or determine a payment amount.

---

## Non-negotiable safety rules (enforce on every money-related change)

1. **Payment amount comes from the DB cart, server-side. NEVER from user/agent input.**
   If a buyer says "pay ₹1" and the cart is ₹74,999, charge ₹74,999.
2. **Always verify the Razorpay webhook signature.** Frontend "success" is never proof
   of payment. Only a signature-verified webhook marks an order paid.
3. **All payment operations must be idempotent.** Same checkout twice → return the
   existing order, never a duplicate.
4. **Every meaningful agent action writes an audit row** (`agent_runs` / `agent_actions`):
   actor, timestamp, trigger, tools used, decision summary, policy check, result,
   approval status. Do NOT log raw LLM chain-of-thought — log a concise decision summary.
5. **Agents access the system ONLY through strict tools.** Never give an agent a raw DB
   connection or the ability to run arbitrary queries.
6. **Every DB query is scoped by `merchantId` from the authenticated session** — never
   from user-provided input. Merchant data isolation is mandatory.
7. **Never expose secrets to the browser.** Razorpay secret, LLM keys, DB creds, auth
   secrets live in env vars, server-side only.

---

## How to work (process rules)

- **One phase/day at a time.** Never scaffold the whole app in one go. Build the current
  phase, stop, let me verify.
- **Read the spec section before building.** When I say "build Day N," read that day in
  `urban-store-build-spec.md` plus any sections it references, THEN build.
- **Reuse before rewriting.** Inspect existing code/components first. Don't rewrite
  working code or re-invent a utility that already exists.
- **After any significant change:** run type-checking and linting, fix errors before
  telling me it's done.
- **Don't leave TODO stubs or half-wired hooks for cut features.** Build the current
  scope clean and complete, as if cut features don't exist.
- **When I report a bug, I'll give you the actual error text.** Use it. Don't guess.

## What "done" means (per feature)

A feature is done ONLY when all of these work together:
`UI + API + DB + validation + error handling + loading state + real data +
agent/tool integration (where relevant) + the unhappy paths`

"It ran once on the happy path" is NOT done.

---

## Tech stack (don't swap without asking)

Next.js (App Router) + TypeScript · Tailwind + shadcn/ui · PostgreSQL (Neon/Supabase) +
Prisma · pgvector for RAG · Clerk for auth · LangGraph (JS) for agents · Razorpay **Test
Mode** for payments. LLM provider abstracted behind a clean interface.

## Folder structure

```
/app         routes (customer + merchant + api)
/components   UI components
/lib          shared utils, LLM provider abstraction
/agents       LangGraph graphs
/tools        strict agent tools (the ONLY way agents touch the system)
/rag          embedding + retrieval
/db           prisma schema + seed
/payments     razorpay client, webhook verification, idempotency
/auth         auth helpers, session scoping
/types        shared types + zod schemas
```

---

## Coding conventions

- **TypeScript everywhere**, strict mode. No `any` unless truly unavoidable (comment why).
- **Validate all tool inputs and API bodies with Zod.** No fragile natural-language
  parsing between agents — use schemas.
- **Prefer structured agent outputs** (JSON matching a Zod schema) over free text.
- **Errors:** catch external calls (LLM, RAG, DB, Razorpay). Never expose stack traces
  to the user. Return useful messages.
- **Env vars** for all config. No hardcoded secrets, no client-side secrets, ever.

---

## Agent design rules

- Don't create an agent for every operation. Deterministic things (`getInventory`) are
  **tools/functions**, not agents.
- Use the pattern: **Router/Supervisor → specialized workflow → deterministic tools.**
- Use an agent only where genuine reasoning is needed (intent understanding,
  recommendation, routing). Everything else is a plain function.
- Optimize for a coherent end-to-end workflow, NOT for the number of agents.

---

## Decision priority (when trade-offs arise)

1. correctness  2. security  3. production reliability  4. simplicity  5. UX
6. demo impact

Prefer a modular monolith over microservices. Prefer simple and reliable over clever.