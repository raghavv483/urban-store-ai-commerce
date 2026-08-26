# PRD — Urban Store AI Commerce OS

**Razorpay Buildathon · Track 01 (AI Growth & Agentic Commerce)**
**Builder:** solo · **Timeline:** ~10 days · **Status:** to build

---

## 1. Problem

Online shopping still assumes a human does all the work: search, compare, read policies,
add to cart, check out. Meanwhile, AI shopping agents are emerging that want to buy *on
a person's behalf* — but there's no clean way for a merchant to be "shoppable" by an AI,
and no safe way to let AI reasoning drive real payments.

Track 01's framing: agent-to-agent commerce (NPCI's UAP; the ACP / AP2 / x402 protocol
race) is the open problem of the year, and Razorpay's in-app pilots are already live.

## 2. What we're building (one line)

An AI-native electronics store where **both humans and autonomous AI agents can shop and
pay**, with every money action explainable, bounded, gated, and audited — plus a merchant
dashboard that shows and grows revenue.

## 3. Who it's for

- **Customer (human):** wants to buy the right product by *talking*, not searching.
- **AI buyer (autonomous agent):** wants to discover a merchant's catalog and transact
  end-to-end with no human clicks.
- **Merchant (store owner):** wants to see revenue (including AI-driven revenue), audit
  what the AI did, and grow sales with AI help under human approval.

## 4. The core strategy: one spine, two front doors, one mirror

One gated transaction backend ("the spine"). Two different buyers in front of it, and a
dashboard reading from it.

- **Front door 1 — Human buyer:** conversational shopping + active upsell → gated checkout.
- **Front door 2 — AI buyer:** autonomous agent hits a machine-readable catalog endpoint
  and completes a gated payment on its own. *(The differentiator.)*
- **The mirror — Merchant dashboard:** reads what the spine wrote (revenue, AI-attributed
  revenue, orders, audit trail) + a light campaign orchestrator (propose → approve → track).

Both halves share the same spine — that's how a solo dev covers all of Track 01 without
building parallel systems.

## 5. The bar we're graded against (Track 01)

> Every money action **explainable, bounded, and gated**. Show the **audit trail** and
> **one failure handled gracefully**.

Every feature decision serves this bar first. The bar rewards depth on the transaction
layer, not breadth of features.

---

## 6. Features

### P0 — must have (the win depends on these)

| # | Feature | What it does |
|---|---------|--------------|
| 1 | Auth + roles | Clerk; customer vs merchant_admin, server-side scoping |
| 2 | Product catalog | Real products from DB; `/shop` with cards, filters, detail pages |
| 3 | **Transaction spine** | Server-side total, inventory check, idempotent Razorpay order, signature-verified webhook, audit row |
| 4 | Conversational checkout | Chat that searches, recommends, upsells, drives gated checkout |
| 5 | Agentic RAG | Router picks source per query: DB for live data, pgvector for policies, both when needed |
| 6 | **AI-buyer endpoint** | Machine-readable catalog + autonomous agent that buys end-to-end |
| 7 | **Graceful failure** | Declined payment caught, logged, recovered cleanly — no stuck order |
| 8 | Merchant dashboard | Revenue, **AI-attributed revenue**, orders, AOV (read-only) |
| 9 | **Audit trail UI** | `/merchant/agent-activity` renders every logged agent decision |

### P1 — should have (adds Track 01 coverage)

| # | Feature | What it does |
|---|---------|--------------|
| 10 | Active upsell | Chat proposes a bundle at cart time; order total visibly rises |
| 11 | Campaign orchestrator | Agent proposes cart-recovery campaign → merchant Approve/Edit/Reject → tracked |
| 12 | Protocol-aware framing | README + UI copy referencing ACP/AP2/x402/UAP |

### P2 — only if comfortably ahead (see build spec §14)

Convincing campaign mock (simulated recovery numbers) → abandoned-cart read-only view →
one real email via Resend. Nothing beyond this in the 10-day window.

## 7. Explicitly NOT building

Full autonomous growth-analysis engine · real notification sending (email/SMS/WhatsApp) ·
real abandoned-cart detection engine (seed a few instead) · document-upload/ingestion UI ·
customer segmentation / personalization engine · voice commerce · microservices ·
merchant staff roles & settings pages · 15+ agents · custom ML training · blockchain ·
computer vision.

Reason: anything that costs days but is invisible in a 5-minute demo or doesn't touch the
bar is out.

---

## 8. The demo merchant & data

**Urban Store** — electronics. Seed products (₹): ThinkPad X 74,999 · Dell XPS 13 94,999 ·
MacBook Air M3 89,999 · 27" 4K Monitor 18,999 · Mechanical Keyboard 3,999 · Wireless Mouse
1,299 · USB-C Hub 2,499 · Laptop Sleeve 14" 1,499 · Noise-cancel Headset 6,999.

Cross-sell: ThinkPad X → Hub/Sleeve/Mouse · MacBook Air → Hub/Sleeve · Dell XPS → Hub/Headset
· Monitor → Keyboard/Mouse.

Also seed: a few prior orders (so the dashboard isn't empty) and a few abandoned carts
(so the campaign feature has something to act on). Synthetic policy docs for RAG: return,
refund, warranty, shipping, laptop buying guide, payment FAQ.

## 9. Success criteria (definition of "this project succeeded")

- A human can buy a laptop + accessories entirely through chat, gated by the spine.
- An AI agent can buy a product autonomously through Razorpay with zero human clicks.
- A declined payment recovers cleanly, with no stuck/broken order state.
- The merchant dashboard reflects real revenue and AI-attributed revenue.
- The audit trail shows a readable record of every agent decision.
- The 5-minute demo runs clean twice in a row.

## 10. The demo story (5 minutes)

Customer **Rahul** buys a ThinkPad X by talking (search → RAG policy answer → upsell →
gated checkout → **verified** payment). Then an **AI buyer** does the same autonomously.
Then a **declined payment recovers** cleanly. Then the **merchant dashboard** shows the
revenue move and the **audit trail**; the merchant approves an **AI-proposed campaign**.
Full beat sheet: `urban-store-build-spec.md` §11.

The four moments that win it: the word **"verified,"** the **autonomous AI purchase,** the
**graceful failure,** and the **human-approved campaign.**