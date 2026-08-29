import "server-only";
import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { completeJson, complete, LlmError } from "@/lib/llm";
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
 * Day 3 router/supervisor.
 *
 * classify → execute → respond
 *
 * The LLM's only job is to pick a tool and fill its arguments. It never touches the
 * database, never calls Razorpay, and never decides an amount. Everything after
 * `classify` is deterministic code (CLAUDE.md prime directive).
 *
 * Deliberately NOT built: self-correcting retrieval loops, multi-agent handoff, RAG
 * (Day 4). One router plus one tool-calling workflow, per ARCHITECTURE §4.
 */

const RouterState = Annotation.Root({
  message: Annotation<string>(),
  ctx: Annotation<ToolContext>(),
  cartId: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  decision: Annotation<RouterDecision | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  calls: Annotation<ToolCallRecord[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  reply: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
  error: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

const CLASSIFY_SYSTEM = `You are the router for an electronics store's shopping assistant.

Pick exactly ONE tool to answer the customer's message, and fill in its arguments.

Available tools:
{TOOLS}

Rules:
- Prices in the catalog are stored in PAISE. ₹80,000 is 8000000 paise. Always convert.
- Product slugs look like: thinkpad-x, dell-xps-13, macbook-air-m3, monitor-27-4k,
  mechanical-keyboard, wireless-mouse, usb-c-hub, laptop-sleeve-14, noise-cancel-headset.
- Categories are exactly: Laptops, Monitors, Accessories, Audio.
- If the customer wants to browse or find products, use searchProducts.
- If they ask about one specific product's details, use getProduct.
- If they ask whether something is in stock, use getInventory.
- If they ask what goes with a product, use getRecommendations.
- If they want to add something to a cart, use addToCart.
- If they ask what's in their cart, use getCart.
- If they want to pay or check out, use createRazorpayOrder. You cannot set an amount;
  the backend charges the cart's real total.
- If they ask whether a payment succeeded, use getPaymentStatus.
- If the message is about return policy, warranty, shipping or anything answered by
  documents rather than live data, set intent to "unsupported" and tool to null —
  that capability does not exist yet.
- If no tool fits, set intent "unsupported" and tool null.

"intent" MUST be exactly one of these strings — no others:
  product_search    (browsing or finding products)      -> searchProducts
  product_detail    (details of one named product)      -> getProduct
  inventory_check   (is it in stock, how many left)     -> getInventory
  recommendation    (what goes with this)               -> getRecommendations
  cart_operation    (add to cart, view cart)            -> addToCart | getCart
  checkout          (pay, buy, check out)               -> createRazorpayOrder
  payment_status    (did my payment work)               -> getPaymentStatus
  unsupported       (anything else, incl. policy docs)  -> null

"tool" MUST be the exact tool NAME from the list above (e.g. "createRazorpayOrder"),
never the intent name, or null when intent is "unsupported".

Respond with ONLY a JSON object, no prose and no markdown fence:
{"intent": "<one of the eight above>", "tool": "<exact tool name>" or null, "args": { ... }, "reasoning": "one short sentence"}

The reasoning must be one plain sentence about WHICH tool you picked and why.
Do not include step-by-step thinking.`;

async function classify(state: typeof RouterState.State) {
  try {
    const decision = await completeJson(
      [
        { role: "system", content: CLASSIFY_SYSTEM.replace("{TOOLS}", describeTools()) },
        { role: "user", content: state.message },
      ],
      routerDecisionSchema,
      { tier: "fast" },
    );
    return { decision };
  } catch (error) {
    // Log the real cause server-side. The user gets a clean message, but a
    // silent catch would make routing failures invisible to the operator.
    console.error("[router.classify] failed:", error);
    const message =
      error instanceof LlmError
        ? error.code === "RATE_LIMITED"
          ? "The assistant is rate limited right now. Please try again in a moment."
          : "The assistant could not understand that request."
        : "The assistant is unavailable.";
    return { error: message, decision: null };
  }
}

async function execute(state: typeof RouterState.State) {
  const decision = state.decision;
  if (!decision || !decision.tool || !isToolName(decision.tool)) {
    return { calls: [] };
  }

  const args = { ...decision.args } as Record<string, unknown>;

  // Cart identity is session state, never a model decision. The model has been
  // observed inventing ids ("cart123"), so when the server knows which cart this
  // conversation owns we OVERWRITE whatever the model supplied rather than merely
  // filling a gap — otherwise a hallucinated id decides which cart gets charged.
  if (
    state.cartId &&
    ["getCart", "addToCart", "createRazorpayOrder"].includes(decision.tool)
  ) {
    args.cartId = state.cartId;
  } else if (!state.cartId && typeof args.cartId === "string") {
    // No server-known cart: a model-supplied id is not trustworthy, so drop it and
    // let the tool report a missing cart instead of acting on a guess.
    delete args.cartId;
  }

  const record = await runTool(decision.tool, args, state.ctx);
  return { calls: [record] };
}

async function respond(state: typeof RouterState.State) {
  if (state.error) return { reply: state.error };

  const decision = state.decision;
  if (!decision || !decision.tool) {
    return {
      reply:
        "I can help with browsing products, stock, carts and checkout. Policy questions aren't wired up yet.",
    };
  }

  const call = state.calls.at(-1);
  if (!call) return { reply: "I couldn't run that request." };

  if (!call.result.ok) {
    // Deterministic, honest error text — no model call needed, and no stack traces.
    return { reply: call.result.error };
  }

  try {
    const reply = await complete(
      [
        {
          role: "system",
          content:
            "You write one or two short sentences for a shopper, based only on the JSON tool result given. Never invent products, prices or stock. Prices are in paise; use the *Display fields when present.",
        },
        {
          role: "user",
          content: `Customer asked: ${state.message}\n\nTool ${call.tool} returned:\n${JSON.stringify(
            call.result.data,
          ).slice(0, 4000)}`,
        },
      ],
      { tier: "reasoning", maxTokens: 200 },
    );
    return { reply: reply || call.result.summary };
  } catch {
    // If the summariser is rate limited, the deterministic summary still works.
    return { reply: call.result.summary };
  }
}

const graph = new StateGraph(RouterState)
  .addNode("classify", classify)
  .addNode("execute", execute)
  .addNode("respond", respond)
  .addEdge(START, "classify")
  .addEdge("classify", "execute")
  .addEdge("execute", "respond")
  .addEdge("respond", END)
  .compile();

export type AgentReply = {
  reply: string;
  intent: RouterDecision["intent"] | "error";
  tool: string | null;
  toolOk: boolean | null;
  data: unknown;
  agentRunId: string;
};

/** Run one turn through the router and write the audit row. */
export async function runAgentTurn(input: {
  message: string;
  ctx: ToolContext;
  cartId?: string | null;
}): Promise<AgentReply> {
  const state = await graph.invoke({
    message: input.message,
    ctx: input.ctx,
    cartId: input.cartId ?? null,
  });

  const call = state.calls.at(-1) ?? null;
  const decision = state.decision;

  const agentRunId = await auditAgentRun({
    ctx: input.ctx,
    agentName: "router",
    trigger: `chat:${input.ctx.sessionId ?? "anonymous"}`,
    userMessage: input.message,
    decisionSummary: state.error
      ? `Routing failed: ${state.error}`
      : `Intent ${decision?.intent ?? "unknown"}; picked ${decision?.tool ?? "no tool"}. ${
          decision?.reasoning ?? ""
        }`.trim(),
    calls: state.calls,
    failed: Boolean(state.error),
  });

  return {
    reply: state.reply,
    intent: state.error ? "error" : (decision?.intent ?? "unsupported"),
    tool: decision?.tool ?? null,
    toolOk: call ? call.result.ok : null,
    data: call?.result.ok ? call.result.data : null,
    agentRunId,
  };
}

/** Exposed for tests: classification only, no tool execution, no audit. */
export async function classifyOnly(message: string): Promise<RouterDecision | null> {
  const out = await classify({
    message,
    ctx: {} as ToolContext,
    cartId: null,
    decision: null,
    calls: [],
    reply: "",
    error: null,
  });
  return out.decision ?? null;
}
