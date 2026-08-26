# ARCHITECTURE — Urban Store AI Commerce OS

Technical design reference. For product/what: see `PRD.md`. For rules: see `CLAUDE.md`.
For the day-by-day plan: see `urban-store-build-spec.md`.

---

## 1. System shape

Modular monolith — one Next.js app, logically separated modules. No microservices.

```
                    ┌─────────────────────────┐
   Human buyer  →   │  Chat UI (/ai-shopping)  │ ─┐
                    └─────────────────────────┘  │
                    ┌─────────────────────────┐  │     ┌───────────────────────┐
   AI buyer     →   │  /api/agent/catalog +    │ ─┼──→  │   TRANSACTION SPINE    │
                    │  autonomous buyer agent   │  │     │  (deterministic, gated)│
                    └─────────────────────────┘  │     └──────────┬────────────┘
                                                  │                │
                    ┌─────────────────────────┐  │                ▼
   Merchant     →   │  /merchant dashboard +   │ ←┘     ┌───────────────────────┐
                    │  campaign orchestrator    │        │  Razorpay (test mode)  │
                    └─────────────────────────┘        │  + webhook + Postgres  │
                                                        │  + audit log           │
                                                        └───────────────────────┘
```

## 2. The transaction spine (the heart)

Seven deterministic steps. The LLM is NEVER in this path — it only *proposes* a checkout
via a tool; the spine executes.

```
1. Buyer (human/agent) confirms purchase
2. Backend fetches cart from DB
3. Backend calculates authoritative total  (SERVER-SIDE — ignore any buyer-supplied amount)
4. Backend verifies inventory
5. Backend creates Razorpay order           (IDEMPOTENT — dedupe key; repeat → same order)
6. Buyer pays → Razorpay webhook → backend VERIFIES SIGNATURE
7. Backend marks order paid, decrements inventory, writes audit row
```

Lives in `/payments`. Exposed to agents only via the `createRazorpayOrder` tool.

### Idempotency

Each checkout attempt carries a stable key (e.g. cartId + a client-generated request id).
Before creating a Razorpay order, check for an existing order with that key; if found,
return it. Webhook processing is idempotent too: a payment already marked captured is a
no-op on repeat delivery.

### Graceful failure path

```
Payment declined / errors
→ backend catches (no crash)
→ order NOT marked paid, inventory NOT decremented (state stays consistent)
→ audit row: "payment failed, reason: <x>"
→ agent retries once on fallback OR returns clean message: "payment failed, nothing charged"
```

## 3. Data model (Prisma / Postgres)

Only what the scoped build needs.

- **users** — id, email, role (`customer` | `merchant_admin`)  *(Clerk-backed)*
- **merchants** — id, name, slug
- **products** — id, merchantId, name, slug, category, price, currency, stock, sku,
  specifications(Json), active
- **product_relations** — id, merchantId, productId, relatedProductId, relationType, score
- **carts** — id, merchantId, customerId|sessionId, status, total
- **cart_items** — id, cartId, productId, quantity, priceAtTime
- **cart_events** — id, cartId, eventType, metadata, createdAt
  *(checkout_started | payment_failed | abandoned | recovered — powers campaign view)*
- **orders** — id, merchantId, customerId, razorpayOrderId, status, subtotal, total,
  currency, **source (`human` | `ai_buyer`)**  ← powers AI-attributed revenue
- **order_items** — id, orderId, productId, quantity, unitPrice
- **payments** — id, orderId, razorpayPaymentId, status, method, amount, capturedAt
- **campaigns** — id, merchantId, type, name, status, targetDefinition(Json), content,
  createdByAgent, approvedBy, createdAt
- **agent_runs** — id, merchantId, sessionId, agentName, trigger, inputSummary,
  outputSummary, status, startedAt, completedAt
- **agent_actions** — id, agentRunId, actionType, parameters(Json), policyDecision,
  approvalRequired, approvalStatus, result(Json), createdAt
- **knowledge_chunks** — id, merchantId, docType, content, embedding(vector), metadata(Json)

**Rule:** every query scoped by `merchantId` from the authenticated session.

## 4. AI layer: agentic RAG via LangGraph

This is **agentic RAG**, not plain RAG: a router decides, per query, *where* the answer
lives and combines sources. Plain RAG would blindly search documents every time.

```
User message
   → Router/Supervisor (classify intent, pick tools)
        ├── live data needed?      → DB tools (searchProducts, getInventory, getCart, ...)
        ├── policy/guide needed?   → RAG tool (searchKnowledgeBase, pgvector, merchant-scoped)
        └── both?                  → call both, then combine
   → Recommendation / response workflow
   → structured output
```

Routing examples:
- "Is ThinkPad X in stock?" → DB only
- "Can I return it after 10 days?" → RAG only
- "Best laptop under ₹80k for programming that's in stock?" → DB + RAG + recommend

Keep it appropriately agentic: router picks sources and can use RAG+DB together. Do NOT
build self-correcting retrieval loops unless there's spare time — mark that "future work."

## 5. Tools (the ONLY way agents touch the system)

Each tool has a strict Zod input schema. Agents never get a raw DB connection.

```
searchProducts · getProduct · getInventory · getCart · addToCart · removeFromCart
getReturnPolicy (RAG) · searchKnowledgeBase (RAG) · getRecommendations
createRazorpayOrder · getPaymentStatus
getAbandonedCarts · proposeCampaign · requestMerchantApproval
```

`createRazorpayOrder` is the only tool that reaches the spine, and even it only *requests*
— the spine validates amount/inventory server-side regardless of what the tool passed.

## 6. RAG pipeline

Seed-time (no upload UI): synthetic policy/guide docs → chunk → embed → store in
`knowledge_chunks` with `merchantId` + `docType` metadata.

Query-time: embed query → pgvector similarity search, filtered by `merchantId` (and
optionally `docType`) → top-k chunks → grounded answer with source metadata. If nothing
relevant: "I couldn't find that in Urban Store's knowledge base." Never hallucinate policy.

## 7. Auth & isolation

Clerk sessions. Two roles: `customer`, `merchant_admin`. Authorization on the **server**,
never trust route-level protection alone. `merchantId` always derived from the
authenticated session, never from request input. Single merchant (Urban Store) for the
demo, but code as if multi-tenant so isolation is real.

## 8. Observability / audit

Every agent run → `agent_runs`; every meaningful action → `agent_actions`. Log: actor,
trigger, tools used, decision summary, policy decision, approval status, result. **Never**
log raw chain-of-thought — log a concise, human-readable decision summary. The
`/merchant/agent-activity` page renders these. Also log: Razorpay webhook events, payment
failures, RAG retrievals, agent latency.

## 9. Folder → responsibility map

```
/app         routes: customer pages, merchant pages, /api (incl. /api/agent/catalog, webhook)
/components   shadcn-based UI
/lib          LLM provider abstraction, shared utils
/agents       LangGraph graphs (router + workflows)
/tools        strict tools with Zod schemas (agent → system boundary)
/rag          embedding + retrieval
/db           prisma schema + seed
/payments     razorpay client, order creation, webhook verify, idempotency  ← the spine
/auth         session + merchantId scoping helpers
/types        shared types + Zod schemas
```

## 10. Environment variables

```
DATABASE_URL=                # Postgres (Neon/Supabase, pgvector enabled)
RAZORPAY_KEY_ID=             # test mode
RAZORPAY_KEY_SECRET=         # test mode — server only, NEVER client
RAZORPAY_WEBHOOK_SECRET=     # for signature verification
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
LLM_API_KEY=                 # provider-abstracted
# embeddings key if separate
```

Never expose secret keys to the browser. All payment operations server-side.