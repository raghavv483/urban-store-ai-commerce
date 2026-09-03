import "server-only";
import {
  Annotation,
  StateGraph,
  START,
  END,
  MemorySaver,
} from "@langchain/langgraph";
import { completeJson, complete, LlmError } from "@/lib/llm";
import { formatPaise } from "@/lib/money";
import { NO_KNOWLEDGE_MESSAGE } from "@/tools/knowledge";
import {
  auditAgentRun,
  describeTools,
  isToolName,
  routerDecisionSchema,
  runTool,
  type RouterDecision,
  type ToolCallRecord,
  type ToolContext,
} from "@/tools";

/**
 * Router / supervisor.
 *
 *   classify → execute → respond
 *
 * The LLM's only jobs are picking tools and filling their arguments, then wording the
 * final answer from data the tools returned. It never touches the database, never
 * calls Razorpay, and never decides an amount (CLAUDE.md prime directive).
 *
 * Agentic RAG (ARCHITECTURE §4): the router decides per query *where the answer lives*
 * — live DB, the knowledge base, or both — rather than blindly retrieving every time.
 *
 * Conversation state lives in LangGraph's checkpointer, keyed by thread id, so history
 * is not threaded manually through every call site.
 */

const RouterState = Annotation.Root({
  message: Annotation<string>(),
  ctx: Annotation<ToolContext>(),
  cartId: Annotation<string | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
  /** Prior turns, accumulated by the checkpointer across invocations on one thread. */
  history: Annotation<Array<{ role: "user" | "assistant"; content: string }>>({
    reducer: (prev, next) => [...prev, ...next].slice(-12),
    default: () => [],
  }),
  decision: Annotation<RouterDecision | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
  // REPLACE, not append. The checkpointer persists state across turns on a thread,
  // so an appending reducer carried the previous turn's tool results into the next
  // one — a policy answer then leaked into an unrelated product search and the
  // model answered from stale context. `execute` always emits the complete list
  // for its own turn, so replacing is both correct and sufficient.
  calls: Annotation<ToolCallRecord[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  reply: Annotation<string>({ reducer: (_p, n) => n, default: () => "" }),
  error: Annotation<string | null>({ reducer: (_p, n) => n, default: () => null }),
  /**
   * An accessory the assistant has offered but the customer has not yet accepted.
   * Survives between turns via the checkpointer so a bare "yes" can be resolved.
   * Nothing is ever added to the cart while this is set — it is an offer, not a
   * pending action (CLAUDE.md: the customer must confirm before any cart change).
   */
  pendingUpsell: Annotation<PendingUpsell | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
  /** Set on the turn an offer was accepted, so the reply can show the total lift. */
  upsellAccepted: Annotation<PendingUpsell | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
});

type PendingUpsell = {
  slug: string;
  name: string;
  priceInPaise: number;
  /** Cart total at the moment the offer was made — the "up from" figure. */
  baseTotalInPaise: number;
  anchorName: string;
};

/** Short, unambiguous acceptances. Anything else falls through to the model. */
const AFFIRMATIVE =
  /^(yes|yes please|yeah|yep|yup|sure|ok|okay|please|please do|go ahead|sounds good|do it|add it|add that|add them|why not|definitely|absolutely)\b[.!]?$/i;
const NEGATIVE =
  /^(no|no thanks|no thank you|nope|nah|not now|maybe later|skip|i'?m good|that'?s all|no need)\b[.!]?$/i;

const CLASSIFY_SYSTEM = `You are the router for Urban Store's shopping assistant.

Decide WHERE the answer lives, then pick the tool(s) to get it.

Available tools:
{TOOLS}

Two sources exist:
- LIVE DATA (the catalog, stock, carts, orders) -> product/cart/checkout tools.
- KNOWLEDGE BASE (written store policy: returns, refunds, warranty, shipping,
  laptop buying advice) -> searchKnowledgeBase or getReturnPolicy.

Pick a "secondaryTool" ONLY when the question genuinely needs both sources.
Example: "best in-stock laptop under 80k for programming" needs searchProducts
(live price and stock) AND searchKnowledgeBase (the buying guide's advice).
A plain policy question needs only the knowledge base. A plain stock question
needs only live data. Leave secondaryTool null when one source suffices.

Rules:
- Catalog prices are in PAISE. ₹80,000 is 8000000 paise. Always convert.
- searchProducts "query" is a literal text match on product names and descriptions.
  Use it ONLY for words that would appear in a product name ("thinkpad", "hub").
  For a use case ("for programming", "for gaming", "for work") do NOT put it in
  query — use category and maxPriceInPaise instead, and get the advice from
  searchKnowledgeBase as the secondary tool.
- Product slugs, by category:
  Laptops: thinkpad-x, dell-xps-13, macbook-air-m3, asus-zenbook-14,
    hp-spectre-x360, macbook-pro-14.
  Monitors: monitor-24-fhd, monitor-27-4k, ultrawide-34.
  Accessories: mechanical-keyboard, wireless-mouse, usb-c-hub,
    laptop-sleeve-14, laptop-stand-alu, webcam-1080p, docking-station,
    external-ssd-1tb, cable-organizer.
  Audio: noise-cancel-headset, wired-earbuds, desk-speaker.
- Categories are exactly: Laptops, Monitors, Accessories, Audio.
- Returns, refunds, warranty, delivery, shipping, "how long do I have",
  "can I send it back" -> getReturnPolicy for returns/refunds specifically,
  otherwise searchKnowledgeBase.
- Buying advice ("which laptop should I get for coding", "how much RAM do I need")
  -> searchKnowledgeBase.
- You cannot set a payment amount. createRazorpayOrder charges the cart's real total.
- "buy me a thinkpad x", "I want to buy the macbook air", "get me a usb-c hub" name a
  SPECIFIC product and mean: put it in the cart now. Use addToCart with that slug and
  intent cart_operation. Do NOT use searchProducts for these.
- But "buy me a laptop", "I want to buy something for coding" name NO specific product.
  Use searchProducts so the shopper can choose. Never pick a product for someone who
  did not name one.

"intent" MUST be exactly one of:
  product_search   product_detail   inventory_check   recommendation
  cart_operation   checkout         payment_status    policy_question
  unsupported

"tool" MUST be an exact tool NAME from the list above, never an intent name,
or null when intent is "unsupported".

Respond with ONLY a JSON object, no prose and no markdown fence:
{"intent":"...","tool":"...","args":{...},"secondaryTool":null,"secondaryArgs":{},"reasoning":"one short sentence"}`;

async function classify(state: typeof RouterState.State) {
  const offer = state.pendingUpsell;
  const said = state.message.trim();

  // A standing offer turns "yes" into an unambiguous instruction, so resolve it
  // deterministically rather than asking the model to infer what "it" meant. This
  // is also the safer path: the accessory added is exactly the one offered.
  if (offer && AFFIRMATIVE.test(said)) {
    return {
      decision: {
        intent: "cart_operation" as const,
        tool: "addToCart" as const,
        args: { productSlug: offer.slug, quantity: 1 },
        secondaryTool: null,
        secondaryArgs: {},
        reasoning: `Customer accepted the suggested ${offer.name}.`,
      },
      upsellAccepted: offer,
      pendingUpsell: null,
    };
  }

  if (offer && NEGATIVE.test(said)) {
    // Declined. Drop the offer so it is not re-pitched, and say nothing more
    // about it — one suggestion, not a sales pitch.
    return {
      decision: {
        intent: "unsupported" as const,
        tool: null,
        args: {},
        secondaryTool: null,
        secondaryArgs: {},
        reasoning: "Customer declined the suggested accessory.",
      },
      pendingUpsell: null,
    };
  }

  const recent = state.history
    .slice(-6)
    .map((m) => `${m.role === "user" ? "Customer" : "Assistant"}: ${m.content}`)
    .join("\n");

  try {
    const decision = await completeJson(
      [
        { role: "system", content: CLASSIFY_SYSTEM.replace("{TOOLS}", describeTools()) },
        ...(recent
          ? [
              {
                role: "system" as const,
                content: `Conversation so far (for resolving "it", "that one"):\n${recent}`,
              },
            ]
          : []),
        { role: "user", content: state.message },
      ],
      routerDecisionSchema,
      { tier: "fast" },
    );
    return { decision };
  } catch (error) {
    console.error("[router.classify] failed:", error);
    const message =
      error instanceof LlmError
        ? error.code === "RATE_LIMITED"
          ? "I'm being rate limited right now — try again in a moment."
          : "I couldn't understand that request."
        : "The assistant is unavailable.";
    return { error: message, decision: null };
  }
}

/** Cart identity is session state, never a model decision. */
function withServerCartId(
  tool: string,
  rawArgs: Record<string, unknown>,
  cartId: string | null,
): Record<string, unknown> {
  const args = { ...rawArgs };
  const cartTools = ["getCart", "addToCart", "createRazorpayOrder"];
  if (cartTools.includes(tool)) {
    if (cartId) args.cartId = cartId;
    else if (typeof args.cartId === "string") delete args.cartId;
  }
  return args;
}

async function execute(state: typeof RouterState.State) {
  const decision = state.decision;
  if (!decision?.tool || !isToolName(decision.tool)) return { calls: [] };

  const calls: ToolCallRecord[] = [];

  // getCart and createRazorpayOrder need a cart that exists. Without one the Zod
  // schema rejects the call and the shopper would see "Arguments rejected by
  // getCart's schema — cartId: Invalid input", which is an internal detail, not an
  // answer. Say the useful thing instead (CLAUDE.md: never expose internals).
  if (!state.cartId && ["getCart", "createRazorpayOrder"].includes(decision.tool)) {
    return {
      calls: [
        {
          tool: decision.tool,
          input: {},
          result: {
            ok: false as const,
            code: "NO_CART",
            error:
              decision.tool === "getCart"
                ? "Your cart is empty at the moment. Tell me what you're after and I'll add it."
                : "There's nothing in your cart to pay for yet. Add something first and I'll take you through checkout.",
            summary: "No active cart for this conversation.",
          },
          durationMs: 0,
        },
      ],
      pendingUpsell: null,
    };
  }

  calls.push(
    await runTool(
      decision.tool,
      withServerCartId(decision.tool, decision.args, state.cartId),
      state.ctx,
    ),
  );

  // Agentic RAG: run the second source too when the router asked for one.
  const secondary = decision.secondaryTool;
  if (secondary && isToolName(secondary) && secondary !== decision.tool) {
    const secondaryArgs = (decision.secondaryArgs ?? {}) as Record<string, unknown>;
    // Knowledge tools need a query; fall back to the raw question if the model
    // did not supply one.
    if (
      (secondary === "searchKnowledgeBase" || secondary === "getReturnPolicy") &&
      typeof secondaryArgs.query !== "string"
    ) {
      secondaryArgs.query = state.message;
    }
    calls.push(
      await runTool(
        secondary,
        withServerCartId(secondary, secondaryArgs, state.cartId),
        state.ctx,
      ),
    );
  }

  // ---- Active upsell (PRD feature 10) ----
  // After something lands in the cart, look for a curated accessory to suggest.
  // This only ever *proposes*; the cart is not touched until the customer agrees.
  let pendingUpsell: PendingUpsell | null = null;
  const addCall = calls.find((c) => c.tool === "addToCart" && c.result.ok);

  if (addCall && addCall.result.ok && !state.upsellAccepted) {
    const added = addCall.result.data as {
      cartId?: string;
      totalInPaise?: number;
      added?: { slug?: string };
    };
    const anchorSlug = added.added?.slug;

    if (anchorSlug && added.cartId && typeof added.totalInPaise === "number") {
      pendingUpsell = await proposeAccessory({
        anchorSlug,
        cartId: added.cartId,
        cartTotalInPaise: added.totalInPaise,
        ctx: state.ctx,
      });
    }
  }

  return { calls, pendingUpsell };
}

/**
 * Picks one accessory worth mentioning: highest-scoring cross-sell relation that is
 * in stock and not already in the cart. Returns null when there is nothing sensible
 * to suggest, which is the common case for accessories themselves.
 */
async function proposeAccessory(input: {
  anchorSlug: string;
  cartId: string;
  cartTotalInPaise: number;
  ctx: ToolContext;
}): Promise<PendingUpsell | null> {
  const recs = await runTool(
    "getRecommendations",
    { slug: input.anchorSlug, limit: 3 },
    input.ctx,
  );
  if (!recs.result.ok) return null;

  const candidates = (recs.result.data as Array<{
    slug: string;
    name: string;
    priceInPaise: number;
    stock: number;
  }>) ?? [];
  if (candidates.length === 0) return null;

  // Never suggest something the customer already has in the cart.
  const cart = await runTool("getCart", { cartId: input.cartId }, input.ctx);
  const inCart = new Set<string>(
    cart.result.ok
      ? ((cart.result.data as { lines?: Array<{ slug: string }> }).lines ?? []).map(
          (l) => l.slug,
        )
      : [],
  );

  const pick = candidates.find((c) => c.stock > 0 && !inCart.has(c.slug));
  if (!pick) return null;

  const anchorName =
    (cart.result.ok
      ? (cart.result.data as { lines?: Array<{ slug: string; name: string }> }).lines?.find(
          (l) => l.slug === input.anchorSlug,
        )?.name
      : undefined) ?? input.anchorSlug;

  return {
    slug: pick.slug,
    name: pick.name,
    priceInPaise: pick.priceInPaise,
    baseTotalInPaise: input.cartTotalInPaise,
    anchorName,
  };
}

const GROUNDING_RULES = `You are Urban Store's shopping assistant. Write 1-3 short sentences.

Ground every factual claim in the TOOL RESULTS below. You may not state a policy,
price, stock level, delivery time or warranty term that is not present in them.

Read ALL of the results before answering, including later ones — the answer is often
in the second or third chunk, not the first. Never say the policy "doesn't specify"
or "doesn't mention" something without checking every chunk you were given; if any
chunk addresses it, use that chunk.

If the results genuinely do not answer the question, say so plainly rather than
guessing. Prices are in paise; always use the *Display fields (e.g. "₹74,999").
Do not invent products. Plain prose — no markdown headings or bullet lists.`;

async function respond(state: typeof RouterState.State) {
  if (state.error) return { reply: state.error };

  const decision = state.decision;
  const calls = state.calls;

  // An accepted suggestion gets a deterministic reply: the whole point is showing
  // the total moving, and a model paraphrase could blur the two figures.
  const accepted = state.upsellAccepted;
  if (accepted) {
    const addCall = calls.find((c) => c.tool === "addToCart");
    if (addCall?.result.ok) {
      const data = addCall.result.data as { totalInPaise?: number };
      const now = data.totalInPaise ?? accepted.baseTotalInPaise + accepted.priceInPaise;
      return {
        reply: `Added the ${accepted.name}. Cart total is now ${formatPaise(now)}, up from ${formatPaise(accepted.baseTotalInPaise)}.`,
      };
    }
    if (addCall && !addCall.result.ok) {
      return { reply: addCall.result.error };
    }
  }

  // Declined, or nothing to do.
  if (!decision?.tool || calls.length === 0) {
    if (decision?.reasoning?.includes("declined")) {
      return { reply: "No problem. Anything else I can help you find?" };
    }
    return {
      reply:
        "I can help you browse products, check stock, answer questions about returns, warranty and delivery, and take you through checkout. What are you looking for?",
    };
  }

  const failed = calls.filter((c) => !c.result.ok);
  if (failed.length === calls.length) {
    // Every source failed — report the real reason, no invention.
    return { reply: failed[0].result.ok === false ? failed[0].result.error : "That didn't work." };
  }

  // Honesty guardrail: if the ONLY source consulted was the knowledge base and it
  // found nothing, say exactly that. Never let the model fill the gap.
  const knowledgeCalls = calls.filter(
    (c) => c.tool === "searchKnowledgeBase" || c.tool === "getReturnPolicy",
  );
  const knowledgeFoundNothing =
    knowledgeCalls.length > 0 &&
    knowledgeCalls.every(
      (c) =>
        c.result.ok &&
        (c.result.data as { found?: boolean } | null)?.found === false,
    );
  if (knowledgeFoundNothing && knowledgeCalls.length === calls.length) {
    return { reply: NO_KNOWLEDGE_MESSAGE };
  }

  const context = calls
    .filter((c) => c.result.ok)
    .map((c) => `TOOL ${c.tool} RETURNED:\n${JSON.stringify(c.result.ok ? c.result.data : null).slice(0, 3500)}`)
    .join("\n\n");

  try {
    const reply = await complete(
      [
        { role: "system", content: GROUNDING_RULES },
        {
          role: "user",
          content: `Customer asked: ${state.message}\n\n${context}${
            knowledgeFoundNothing
              ? `\n\nNOTE: the knowledge base had nothing on this. Say "${NO_KNOWLEDGE_MESSAGE}" for the policy part, then answer only what the other tool returned.`
              : ""
          }`,
        },
      ],
      { tier: "reasoning", maxTokens: 300 },
    );
    return { reply: appendSuggestion(reply || calls[0].result.summary, state.pendingUpsell) };
  } catch {
    // Summariser unavailable — the deterministic tool summary still tells the truth.
    return {
      reply: appendSuggestion(
        calls.map((c) => c.result.summary).join(" "),
        state.pendingUpsell,
      ),
    };
  }
}

/**
 * One short line, appended deterministically rather than left to the model — which
 * would otherwise invent accessory names and prices. Names the product and its real
 * price and stops; no bundle pitch, no second ask.
 */
function appendSuggestion(reply: string, offer: PendingUpsell | null): string {
  if (!offer) return reply;
  return `${reply.trim()} Most people pair the ${offer.anchorName} with the ${offer.name} (${formatPaise(offer.priceInPaise)}) — want me to add it?`;
}

const checkpointer = new MemorySaver();

const graph = new StateGraph(RouterState)
  .addNode("classify", classify)
  .addNode("execute", execute)
  .addNode("respond", respond)
  .addEdge(START, "classify")
  .addEdge("classify", "execute")
  .addEdge("execute", "respond")
  .addEdge("respond", END)
  .compile({ checkpointer });

export type AgentProduct = {
  slug: string;
  name: string;
  category: string;
  priceInPaise: number;
  stock: number;
};

export type AgentReply = {
  reply: string;
  intent: RouterDecision["intent"] | "error";
  tools: string[];
  toolOk: boolean | null;
  /** Products to render as inline cards, extracted from whichever tool returned them. */
  products: AgentProduct[];
  sources: Array<{ title: string; docType: string }>;
  data: unknown;
  agentRunId: string;
};

/** Pulls anything card-shaped out of the tool results. */
function extractProducts(calls: ToolCallRecord[]): AgentProduct[] {
  const out: AgentProduct[] = [];
  for (const call of calls) {
    if (!call.result.ok) continue;
    const data = call.result.data;
    const rows = Array.isArray(data) ? data : [data];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      if (
        typeof r.slug === "string" &&
        typeof r.name === "string" &&
        typeof r.priceInPaise === "number"
      ) {
        out.push({
          slug: r.slug,
          name: r.name,
          category: typeof r.category === "string" ? r.category : "",
          priceInPaise: r.priceInPaise,
          stock: typeof r.stock === "number" ? r.stock : 0,
        });
      }
    }
  }
  // De-duplicate: a combined DB+RAG answer can surface the same product twice.
  return out.filter((p, i) => out.findIndex((q) => q.slug === p.slug) === i).slice(0, 6);
}

function extractSources(calls: ToolCallRecord[]): Array<{ title: string; docType: string }> {
  const out: Array<{ title: string; docType: string }> = [];
  for (const call of calls) {
    if (!call.result.ok) continue;
    const data = call.result.data as { chunks?: Array<{ title?: string; docType?: string }> };
    for (const c of data?.chunks ?? []) {
      if (c.title && c.docType) out.push({ title: c.title, docType: c.docType });
    }
  }
  return out.filter((s, i) => out.findIndex((t) => t.docType === s.docType) === i);
}

/** Run one conversational turn. `threadId` keeps history server-side. */
export async function runAgentTurn(input: {
  message: string;
  ctx: ToolContext;
  cartId?: string | null;
  threadId?: string;
}): Promise<AgentReply> {
  const threadId = input.threadId ?? input.ctx.sessionId ?? "default";

  const state = await graph.invoke(
    {
      message: input.message,
      ctx: input.ctx,
      cartId: input.cartId ?? null,
      history: [{ role: "user" as const, content: input.message }],
      calls: [],
      // Reset per turn. The checkpointer would otherwise carry this forward and
      // every subsequent reply would claim an accessory had just been accepted.
      // `pendingUpsell` is deliberately NOT reset here — it has to survive into the
      // next turn for a bare "yes" to mean anything.
      upsellAccepted: null,
    },
    { configurable: { thread_id: threadId } },
  );

  const decision = state.decision;
  const calls = state.calls ?? [];

  // Record the assistant's turn so the next classify() can resolve "it"/"that one".
  await graph.updateState(
    { configurable: { thread_id: threadId } },
    { history: [{ role: "assistant" as const, content: state.reply }] },
  );

  const agentRunId = await auditAgentRun({
    ctx: input.ctx,
    agentName: "router",
    trigger: `chat:${threadId}`,
    userMessage: input.message,
    decisionSummary: state.error
      ? `Routing failed: ${state.error}`
      : `Intent ${decision?.intent ?? "unknown"}; used ${
          calls.map((c) => c.tool).join(" + ") || "no tool"
        }. ${decision?.reasoning ?? ""}`.trim(),
    calls,
    failed: Boolean(state.error),
  });

  return {
    reply: state.reply,
    intent: state.error ? "error" : (decision?.intent ?? "unsupported"),
    tools: calls.map((c) => c.tool),
    toolOk: calls.length ? calls.every((c) => c.result.ok) : null,
    products: extractProducts(calls),
    sources: extractSources(calls),
    data: calls[0]?.result.ok ? calls[0].result.data : null,
    agentRunId,
  };
}

/** Exposed for tests: classification only — no tool execution, no audit. */
export async function classifyOnly(message: string): Promise<RouterDecision | null> {
  const out = await classify({
    message,
    ctx: {} as ToolContext,
    cartId: null,
    history: [],
    decision: null,
    calls: [],
    reply: "",
    error: null,
    pendingUpsell: null,
    upsellAccepted: null,
  });
  return out.decision ?? null;
}
