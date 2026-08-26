# Urban Store AI Commerce OS — 10-Day Solo Build Spec

**Razorpay Buildathon · Track 01 (AI Growth & Agentic Commerce)**
**Builder:** solo · **Time:** ~10 days · **Method:** vibecoding with Claude Code

---

## 0. How to read this file

This is the *scoped, buildable* version of the full vision — what a solo developer can
actually ship in 10 days and demo without it breaking on camera.

The full 45-section spec is the north star. This file is the road you actually drive.
Where they conflict, **this file wins.**

The one rule that governs every decision:

> **Track 01's bar: every money action explainable, bounded and gated; show the
> audit trail; show one failure handled gracefully.**

The bar rewards *depth on the transaction layer*, not breadth. So the whole project is
built around a single **transaction spine**, with front doors onto it and a dashboard
reading from it.

### What the extra 3 days (vs the 7-day plan) buys

- ✅ **Campaign orchestrator** — the 4th Track 01 example direction, previously cut
- ✅ **Stronger upsell** — active bundle proposal with visible order-total lift
- ✅ **Protocol-aware framing** — ACP / AP2 / x402 / UAP language answering "why now"
- ✅ **Real buffer** — slack for the debugging spiral, not a prayer

It does **not** buy the full autonomous growth-analysis engine or a production campaign
automation system. Those are still out of scope (see §5).

---

## 1. Track 01 coverage scorecard

The extra days let you hit all four example directions plus the full bar.

| Track 01 asks | Status | Where |
|---------------|--------|-------|
| Grow revenue OR make transactable by AI buyer | ✅ both | spine-shared |
| Conversational in-app checkout | ✅ | Front door 1 (§4) |
| Agent-readable catalog | ✅ | `/api/agent/catalog` + AI buyer (§4) |
| Upsell & cross-sell agent | ✅ | active bundle flow (§4) |
| Campaign orchestrator | ✅ | proposal → approval → track (§4) |
| Every money action explainable | ✅ | Agent Activity page |
| Bounded | ✅ | strict tools, no raw DB/Razorpay for LLM |
| Gated | ✅ | server-side amount, confirmation, LLM-proposes-backend-executes |
| Show the audit trail | ✅ | `/merchant/agent-activity` |
| One failure handled gracefully | ✅ | declined-payment recovery (§3) |
| "Why now" (ACP/AP2/x402/UAP) | ✅ | protocol-aware framing (§10) |

---

## 2. The core strategy: one spine, two front doors, one mirror

To win Track 01 you build **one gated transaction backend** and put multiple buyers in
front of it, then a dashboard that reads from it.

```
                    ┌─────────────────────────┐
   FRONT DOOR 1 →   │  Human buyer (chat UI)   │ ─┐
                    └─────────────────────────┘  │
                    ┌─────────────────────────┐  │      ┌──────────────────────┐
   FRONT DOOR 2 →   │  AI buyer (autonomous    │ ─┼───→  │  TRANSACTION SPINE     │
                    │  agent hitting catalog)   │  │      │  (gated, deterministic)│
                    └─────────────────────────┘  │      └──────────┬───────────┘
                                                  │                 │
                    ┌─────────────────────────┐  │                 ▼
   THE MIRROR   →   │  Merchant dashboard +    │ ←┘      ┌──────────────────────┐
                    │  campaign orchestrator    │         │  Razorpay + webhook   │
                    └─────────────────────────┘         │  + Postgres audit log │
                                                         └──────────────────────┘
```

- **Spine** = the money path. Built once. Every buyer goes through it.
- **Front door 1** = conversational checkout + active upsell (grow-revenue half).
- **Front door 2** = AI-buyer endpoint (sellable-to-AI-buyers half — the differentiator).
- **The mirror** = merchant dashboard reading what the spine wrote, plus a light
  campaign orchestrator (proposal → approval → track).

Both halves share the same spine. That's how a solo dev covers all of Track 01 without
building parallel systems.

---

## 3. The merchant: Urban Store

Online electronics store.

| Product              | Price (₹) | Category    | Stock |
|----------------------|-----------|-------------|-------|
| ThinkPad X           | 74,999    | Laptop      | 12    |
| Dell XPS 13          | 94,999    | Laptop      | 7     |
| MacBook Air M3       | 89,999    | Laptop      | 9     |
| 27" 4K Monitor       | 18,999    | Monitor     | 20    |
| Mechanical Keyboard  | 3,999     | Accessory   | 40    |
| Wireless Mouse       | 1,299     | Accessory   | 60    |
| USB-C Hub            | 2,499     | Accessory   | 35    |
| Laptop Sleeve 14"    | 1,499     | Accessory   | 50    |
| Noise-cancel Headset | 6,999     | Accessory   | 25    |

Cross-sell relationships (seed — used by upsell logic):

```
ThinkPad X      → USB-C Hub, Laptop Sleeve 14", Wireless Mouse
MacBook Air M3  → USB-C Hub, Laptop Sleeve 14"
Dell XPS 13     → USB-C Hub, Noise-cancel Headset
27" 4K Monitor  → Mechanical Keyboard, Wireless Mouse
```

---

## 4. The transaction spine (THE thing that wins or loses this)

The one part you must *understand*, not just generate. Seven steps.

```
1. Customer/agent confirms purchase
2. Backend fetches cart from DB
3. Backend calculates authoritative total (SERVER-SIDE — never trust the buyer's amount)
4. Backend verifies inventory
5. Backend creates Razorpay order (IDEMPOTENT — same request twice = same order)
6. Buyer pays → Razorpay fires webhook → backend VERIFIES SIGNATURE
7. Backend marks order paid, decrements inventory, writes audit log
```

### Non-negotiable safety rules (this IS the bar)

- **The LLM never calls Razorpay.** LLM proposes structured tool call → deterministic
  backend validates → backend calls Razorpay.
- **Amount comes from the DB cart, never the buyer's message.** Buyer says "pay ₹1",
  cart is ₹74,999 → backend charges ₹74,999.
- **Verify the webhook signature.** Frontend "success" is not proof of payment.
- **Idempotency.** Same checkout twice returns the existing order.
- **Every money action writes an audit row:** actor, timestamp, trigger, tools used,
  decision summary, policy check, result, approval status.

### The graceful failure (build this — almost nobody does)

The bar literally says "one failure handled gracefully." Build **declined-payment
recovery**:

```
Buyer attempts payment
→ Razorpay test-mode card simulating decline
→ backend catches it, logs it, does NOT mark order paid
→ agent retries once on a fallback path OR surfaces a clean "payment failed, here's why"
→ audit log shows the whole thing handled — no crash, no stuck order
```

Demo this live. It proves everything the bar cares about in 20 seconds.

---

## 5. Scope

### IN scope

**Customer side**
- Product catalog (`/shop`) — cards, filters, product detail
- Conversational checkout (`/ai-shopping`) — search, RAG policy Q&A, recommend,
  **active bundle upsell**, gated checkout. Front door 1.
- Cart + Razorpay test-mode checkout — the spine
- Order confirmation + history

**AI-buyer side (differentiator)**
- Agent-readable catalog endpoint (`/api/agent/catalog`) — structured JSON: name,
  price, stock, attributes, return eligibility, compatible products
- Autonomous buyer agent — discovers catalog, builds cart, completes gated payment alone
- Graceful failure demo (§4)

**Merchant side (the mirror)**
- Dashboard home (`/merchant`) — revenue, **AI-attributed revenue**, orders, AOV
- Agent Activity (`/merchant/agent-activity`) — renders the audit trail
- Orders list (`/merchant/orders`) — read-only
- **Campaign orchestrator (`/merchant/campaigns`)** — light version:
  agent proposes a recovery/upsell campaign → merchant approves/edits/rejects →
  status tracked. See §8 for exact bounds.

**AI plumbing**
- LangGraph router + workflows (search / policy / recommend / cart / checkout / campaign)
- Strict tools: `searchProducts`, `getProduct`, `getInventory`, `getCart`, `addToCart`,
  `getReturnPolicy`, `getRecommendations`, `createRazorpayOrder`, `getPaymentStatus`,
  `getAbandonedCarts`, `proposeCampaign`
- RAG: pgvector, 3–4 synthetic policy docs, merchant-scoped

### CUT (do NOT build)

- ❌ Full autonomous growth-analysis engine (agent that self-analyzes the whole business)
- ❌ Campaign *automation/execution* (actually sending emails/SMS) — propose + track only
- ❌ Real abandoned-cart *detection engine* — seed a few abandoned carts, query them
- ❌ Multi-document RAG ingestion UI — seed vectors directly
- ❌ Customer segmentation / personalization engine
- ❌ Voice / WhatsApp / multi-channel
- ❌ Microservices — modular monolith only
- ❌ Merchant staff roles, settings, knowledge-base management UI
- ❌ 15+ agents

---

## 6. Tech stack

| Layer     | Choice                              |
|-----------|-------------------------------------|
| Framework | Next.js (App Router) + TypeScript   |
| UI        | Tailwind + shadcn/ui                 |
| DB        | PostgreSQL (Supabase or Neon)        |
| ORM       | Prisma                              |
| Vectors   | pgvector (same DB)                   |
| Auth      | Clerk                               |
| Agents    | LangGraph (JS)                       |
| LLM       | your keys; abstracted, swappable     |
| Payments  | Razorpay **Test Mode**               |

```
/app  /components  /lib  /agents  /tools  /rag  /db  /payments  /auth  /types
```

---

## 7. Database schema (only what's needed)

- **users** — id, email, role (`customer` | `merchant_admin`) — Clerk-backed
- **merchants** — id, name, slug (single "Urban Store")
- **products** — id, merchantId, name, slug, category, price, currency, stock, sku,
  specifications (JSON), active
- **product_relations** — id, merchantId, productId, relatedProductId, relationType, score
- **carts** — id, merchantId, customerId/sessionId, status, total
- **cart_items** — id, cartId, productId, quantity, priceAtTime
- **cart_events** — id, cartId, eventType, metadata, createdAt
  (`checkout_started`, `payment_failed`, `abandoned` — powers the campaign view)
- **orders** — id, merchantId, customerId, razorpayOrderId, status, subtotal, total,
  currency, **source** (`human` | `ai_buyer`) ← powers "AI-attributed revenue"
- **order_items** — id, orderId, productId, quantity, unitPrice
- **payments** — id, orderId, razorpayPaymentId, status, method, amount, capturedAt
- **campaigns** — id, merchantId, type, name, status, targetDefinition, content,
  createdByAgent, approvedBy, createdAt
- **agent_runs** — id, merchantId, sessionId, agentName, trigger, inputSummary,
  outputSummary, status, startedAt, completedAt
- **agent_actions** — id, agentRunId, actionType, parameters, policyDecision,
  approvalRequired, approvalStatus, result, createdAt
- **knowledge_chunks** — id, merchantId, docType, content, embedding (vector), metadata

---

## 8. The campaign orchestrator (bounded scope)

The 4th example direction, kept deliberately light so it doesn't eat the timeline.

**What it does:**
1. Merchant asks: "recover my abandoned carts" (or opens `/merchant/campaigns`)
2. Growth workflow queries seeded abandoned carts (`cart_events` where abandoned)
3. Filters high-value ones, calculates potential recoverable revenue
4. Proposes a campaign: target segment + generated copy + est. revenue
5. Merchant sees a preview card: **[Approve] [Edit] [Reject]**
6. On approve, campaign status → active, logged to audit trail
7. Status tracked on the campaigns page

**What it deliberately does NOT do:** actually send emails/SMS/WhatsApp. It *proposes
and tracks* — execution is mocked as "active." This keeps the human-approval + audit
story (which is what the bar rewards) without a day lost to notification infra.

This gives you the campaign orchestrator example direction AND reinforces the bar
(bounded, gated, human-approved, audited) — the same virtues as the payment spine,
applied to growth actions.

---

## 9. The 10-day build order

~10 focused hours/day.

### Day 1 — Foundation (no AI)
Next.js + TS + Tailwind + shadcn. Clerk auth, two roles. Postgres + Prisma, schema
from §7, migrate. Seed Urban Store (9 products, relations, a few prior orders + a few
abandoned carts). Basic `/shop`.
**Done when:** log in, see real products from DB.

### Day 2 — The transaction spine (still no AI) ⚠️ protect this
Server actions: `getCart`, server-side `calculateTotal`, `verifyInventory`.
`createRazorpayOrder` (idempotent). `/checkout` with Razorpay test-mode. Webhook:
**signature verification**, idempotent, mark paid, decrement inventory, audit row.
Test by hand with plain buttons.
**Sit with this code. Trace all 7 steps of §4 until you understand them.**
**Done when:** buy with test card → order "paid" from verified webhook → inventory
drops → audit row exists.

### Day 3 — Buffer + agent tools + LangGraph skeleton
Morning: buffer for anything Day 2 left shaky (payments always leave something).
Then wrap the spine in strict tools. LangGraph router + one workflow. Log every tool
call into `agent_runs`/`agent_actions` from the start.
**Done when:** a hardcoded prompt routes through LangGraph, calls a tool, audit row appears.

### Day 4 — Front door 1 part A: conversational search + RAG
`/ai-shopping` chat (streaming, inline product cards). Router → search / recommend /
policy workflows. RAG: embed 3–4 synthetic policy docs, retrieval tool, merchant-scoped,
"couldn't find that in Urban Store's knowledge base" fallback.
**Done when:** chat searches catalog and answers a policy question from RAG.

### Day 5 — Front door 1 part B: active upsell + gated checkout
At cart time, chat **actively proposes a bundle** (accessories via `product_relations`)
and shows the order-total lift. Wire the chat all the way through the gated checkout.
**Done when:** a human buys a laptop + proposed accessories entirely through chat,
gated by the spine, with the upsell visibly raising the total.

### Day 6 — Front door 2: AI-buyer endpoint + graceful failure (differentiator)
`/api/agent/catalog` (structured, machine-readable). Autonomous buyer agent: discovers
a product, builds cart, completes a gated payment alone. **Graceful failure:** decline
path from §4, recovered cleanly, fully logged.
**Done when:** one command → an AI agent buys through Razorpay with no human clicks, and
a declined attempt recovers without crashing.

### Day 7 — The mirror: merchant dashboard + audit UI
`/merchant` — revenue, **AI-attributed revenue** (sum where source='ai_buyer'), orders,
AOV, all read-only. `/merchant/agent-activity` — render the audit trail.
`/merchant/orders` — read-only list.
**Done when:** a purchase (human or AI) visibly moves the dashboard numbers.

### Day 8 — Campaign orchestrator (§8)
Growth workflow queries abandoned carts → proposes campaign → `/merchant/campaigns`
preview card with Approve/Edit/Reject → approval logged → status tracked.
**Done when:** merchant approves an agent-proposed campaign and it shows active + audited.

### Day 9 — Polish + protocol framing + hardening
Empty states, loading states, error messages (no raw stack traces). Protocol-aware
framing in README + UI copy (§10). Seed a clean, coherent demo dataset. Re-test every
flow end to end. Fix what's broken.
**Done when:** every flow in the demo script (§11) runs clean twice in a row.

### Day 10 — Record + final buffer
Record the 5-minute video (§11). Reserve the rest for the thing that breaks. Something
will. This is why 10 days beats 7 — this day is real slack, not wishful.

**Fallback if Day 2 slips:** push the whole timeline right by using Day 3's buffer; if
still behind, cut the campaign orchestrator (Day 8) first — it's the most expendable
example direction. Protect the spine, conversational checkout, AI buyer, and graceful
failure. Those clear the bar.

---

## 10. Protocol-aware framing ("why now")

Track 01's "why now" names NPCI's UAP and the ACP / AP2 / x402 protocol race. You are
NOT implementing these protocols (that would blow the timeline) — you are *speaking their
language* to show you understood the moment.

- In the README: describe `/api/agent/catalog` as "an ACP/x402-style structured commerce
  interface that lets an external buyer-agent discover and transact autonomously."
- In the demo narration: "this is the agent-to-agent commerce that UAP and ACP are
  standardizing — here it's working end to end on Razorpay test-mode."
- In UI copy on the AI-catalog view: a small line noting the endpoint is designed for
  agentic-commerce protocol compatibility.

20 minutes of framing that signals depth to judges who wrote "why now" for a reason.

---

## 11. The 5-minute demo script

Customer **Rahul** buys from **Urban Store**, an AI buyer does the same autonomously,
then the merchant sees and acts on it.

| Time      | Beat |
|-----------|------|
| 0:00–0:30 | Problem + "AI-native commerce with gated money actions, on the ACP/UAP moment" |
| 0:30–1:20 | Rahul: "lightweight laptop under ₹80k for programming" → live search → recommend ThinkPad X |
| 1:20–1:50 | Rahul: "return policy?" → RAG answers from Urban Store's actual policy doc |
| 1:50–2:30 | Active upsell: chat proposes USB-C Hub + Sleeve, order total rises → add → gated checkout |
| 2:30–3:00 | Razorpay test payment → **webhook verifies** → order confirmed. Say "verified." |
| 3:00–3:35 | **AI buyer:** run the agent — discovers the catalog, buys autonomously, no human clicks |
| 3:35–3:55 | **Graceful failure:** declined payment recovering cleanly |
| 3:55–4:30 | Merchant dashboard: revenue moved, **AI-attributed revenue** shown, audit trail rendered |
| 4:30–4:50 | Campaign orchestrator: agent proposes cart recovery → merchant approves → audited |
| 4:50–5:00 | Impact: "Urban Store is now transactable by humans and AI, every rupee explainable, gated, audited." |

The moments that win it: the word **"verified,"** the **autonomous AI purchase,** the
**graceful failure,** and the **human-approved campaign.** Land those four and you've
hit the bar and all four example directions on camera.

---

## 12. Definition of done (per feature)

```
UI + API + DB + validation + error handling + loading state
   + real data + agent/tool integration (where relevant)
```

"Buy product" is done only when: cart stored → server calculates total → Razorpay order
created → checkout works → payment succeeds → **webhook verified** → payment stored →
order marked paid → inventory decremented → dashboard revenue updated.

---

## 13. The honest risk note

Even at 10 days, the failure mode that kills solo vibecoders is the same: a beautiful app
by day 5, then days lost unable to debug why checkout returns success but the order is
stuck "pending" — because you didn't understand the webhook code Claude wrote.

**Antidote:** on Day 2, don't just generate the spine — read it, ask Claude to explain
each of the 7 steps, trace a payment yourself. That one discipline is the difference
between a demo that works and one stuck on camera.

The extra 3 days over the 7-day plan are your insurance. Days 3 and 10 are deliberate
buffer. Don't spend them early on scope creep — protect them for debugging. Vibecode
everything else freely. Understand the spine.

---

## 14. Adding cut features later (the "if time remains" rule)

The plan is: **build everything in §5 (IN scope) to real "done" first. Only then add
cut features — and only the cheap ones, in strict order, only while comfortably ahead.**

This is the correct strategy, not a compromise. But it backfires without three guardrails.

### Guardrail 1 — "Done" means TRULY done, not "the happy path ran once"

The trap: core features look demo-able by Day 7, you feel great and start adding bonuses
on Day 8 — then on Day 10 a webhook idempotency bug or a flaky AI-buyer surfaces, and now
you're debugging core code *and* untangling half-finished bonuses.

A feature is done only when it passes §12: UI + API + DB + validation + error handling +
**the unhappy paths** all work. Start bonus work only when the core passes that bar — not
when it merely runs once.

### Guardrail 2 — Add cut features in THIS exact order, and stop when not comfortably ahead

Not all cut features are equal. If time remains, add in this order and stop the moment
you're not clearly ahead:

1. **Convincing campaign mock** — simulated results tick-up ("12 recovered, ₹68k") on the
   approved campaign. Cheap, reinforces the bar, high demo value.
2. **Abandoned-cart read-only view** — just a query on already-seeded data. ~2 hours.
3. **One real email via Resend** — only if Day 9/10 is calm. ~2 hours. Honestly optional
   (a real email looks identical to a mock in a 5-min video — see §on notifications).

**NEVER in this window:** full growth-analysis engine, WhatsApp/SMS, segmentation,
document-upload UI. Those aren't "if time remains" features — they're different-project
features.

Each item in the list above is small, reinforces something the bar already rewards, and
can be abandoned half-thought-out without breaking anything core. That's why they qualify.

### Guardrail 3 — Protect the buffer days (Days 3 and 10) from yourself

Days 3 and 10 are **debugging insurance, not free time to add scope.** Payment and AI
flows always have a gremlin that surfaces late. The default use of Day 10 is "make sure
the demo runs clean twice," not "add the growth agent."

Only add a bonus on a buffer day if the core is so solid you'd be comfortable demoing it
*right now*. Any doubt → harden the core instead.

### The mental model that keeps you safe

> **A polished 8-feature app beats a buggy 12-feature app every single time.**
> Judges remember one broken checkout more than three bonus screens.

At every "should I add this?" moment, the question is NOT "do I have a few hours?" — it's
**"is the core so solid I'd demo it right now?"** Yes → add. Any doubt → harden.

### One process tip that makes "add later" actually work

When building the core, do **not** leave TODO stubs or half-wired hooks for cut features.
Build the core clean and complete, as if the cut features don't exist. Bolting a bonus
onto clean code later is easy; untangling half-finished stubs under deadline is misery.