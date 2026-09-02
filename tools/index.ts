import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordMoneyAction } from "@/payments/audit";
import type { AgentTool, ToolContext, ToolResult } from "./types";
import { searchProducts, getProduct, getInventory, getRecommendations } from "./catalog";
import {
  getCart,
  addToCart,
  removeFromCart,
  createRazorpayOrder,
  getPaymentStatus,
} from "./commerce";
import { searchKnowledgeBase, getReturnPolicy } from "./knowledge";
import { getAbandonedCarts, proposeCampaign } from "./growth";

export * from "./types";

/** The complete tool surface. If it is not in here, an agent cannot do it. */
export const TOOLS = {
  searchProducts,
  getProduct,
  getInventory,
  getRecommendations,
  getCart,
  addToCart,
  removeFromCart,
  createRazorpayOrder,
  getPaymentStatus,
  searchKnowledgeBase,
  getReturnPolicy,
  getAbandonedCarts,
  proposeCampaign,
} as const satisfies Record<string, AgentTool>;

export type ToolName = keyof typeof TOOLS;

export const TOOL_NAMES = Object.keys(TOOLS) as ToolName[];

export function isToolName(value: string): value is ToolName {
  return value in TOOLS;
}

/** A compact catalogue of tools for the router prompt. */
export function describeTools(): string {
  return TOOL_NAMES.map((name) => {
    const tool = TOOLS[name];
    const shape = (tool.inputSchema as unknown as { shape?: Record<string, unknown> }).shape;
    const args = shape ? Object.keys(shape).join(", ") : "";
    return `- ${name}(${args}): ${tool.description}`;
  }).join("\n");
}

/** Audit wording per tool effect. Must describe what the tool actually did. */
const POLICY_BY_EFFECT: Record<"read" | "write" | "money", string> = {
  read: "allow: read-only, merchant-scoped",
  write: "allow: writes cart state only, no money movement",
  money: "allow: money tool — amount re-derived server-side by the spine, agent cannot set it",
};

export type ToolCallRecord = {
  tool: ToolName;
  input: unknown;
  result: ToolResult<unknown>;
  durationMs: number;
};

/**
 * The single execution path for every tool call.
 *
 * Validates the model's arguments against the tool's Zod schema BEFORE any code runs —
 * unknown keys (an injected `merchantId`, a smuggled `amount`) are rejected here rather
 * than reaching a query. Then runs the tool with a server-built context.
 *
 * Every call is timed and returned for audit. Nothing else in the codebase should call
 * `tool.execute` directly.
 */
export async function runTool(
  name: string,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<ToolCallRecord> {
  const started = Date.now();

  if (!isToolName(name)) {
    return {
      tool: name as ToolName,
      input: rawInput,
      result: { ok: false, code: "UNKNOWN_TOOL", error: `No tool named "${name}".`, summary: `No tool named "${name}".` },
      durationMs: Date.now() - started,
    };
  }

  const tool = TOOLS[name];
  // `strict()` where possible: a model that invents an extra field gets rejected,
  // not silently obeyed.
  const parsed = tool.inputSchema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return {
      tool: name,
      input: rawInput,
      result: {
        ok: false,
        code: "INVALID_INPUT",
        error: `Arguments rejected by ${name}'s schema — ${detail}`,
        summary: `Rejected invalid arguments for ${name}.`,
      },
      durationMs: Date.now() - started,
    };
  }

  try {
    const result = await tool.execute(parsed.data, ctx);
    return { tool: name, input: parsed.data, result, durationMs: Date.now() - started };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      tool: name,
      input: parsed.data,
      result: {
        ok: false,
        code: "TOOL_ERROR",
        error: message,
        summary: `${name} threw: ${message}`,
      },
      durationMs: Date.now() - started,
    };
  }
}

/**
 * Writes one `agent_runs` row plus one `agent_actions` row per tool call.
 * Decision summaries only — never raw chain-of-thought (CLAUDE.md safety rule 4).
 */
export async function auditAgentRun(input: {
  ctx: ToolContext;
  agentName: string;
  trigger: string;
  userMessage: string;
  decisionSummary: string;
  calls: ToolCallRecord[];
  failed?: boolean;
}): Promise<string> {
  const anyFailed =
    input.failed === true || input.calls.some((c) => !c.result.ok);

  return recordMoneyAction(prisma, {
    merchantId: input.ctx.merchantId,
    actor: input.ctx.actor === "ai_buyer" ? "system" : "human_checkout",
    // Without this the audit files every agent run under the blanket actor and a
    // merchant cannot tell an autonomous purchase from a webhook — which is the
    // one distinction /merchant/agent-activity exists to show.
    agentName: input.agentName,
    trigger: input.trigger,
    sessionId: input.ctx.sessionId,
    inputSummary: input.userMessage.slice(0, 500),
    outputSummary: input.decisionSummary.slice(0, 1000),
    status: anyFailed ? "failed" : "succeeded",
    actions: input.calls.map((c) => ({
      actionType: c.tool,
      parameters: (c.input ?? {}) as Prisma.InputJsonValue,
      policyDecision: POLICY_BY_EFFECT[TOOLS[c.tool]?.effect ?? "read"],
      result: {
        ok: c.result.ok,
        summary: c.result.summary,
        durationMs: c.durationMs,
        ...(c.result.ok ? {} : { code: c.result.code }),
      } as Prisma.InputJsonValue,
    })),
  });
}

/** Zod schema for what the router must emit. Exported so tests can reuse it. */
export const routerDecisionSchema = z.object({
  intent: z.enum([
    "product_search",
    "product_detail",
    "inventory_check",
    "recommendation",
    "cart_operation",
    "checkout",
    "payment_status",
    "policy_question",
    "unsupported",
  ]),
  // A strict enum, not a free string: a model that emits an intent name here
  // (a real failure mode — it returned "checkout" instead of
  // "createRazorpayOrder") is rejected by the schema instead of silently
  // resolving to no tool at all.
  tool: z
    .enum([
      "searchProducts",
      "getProduct",
      "getInventory",
      "getRecommendations",
      "getCart",
      "addToCart",
      "removeFromCart",
      "createRazorpayOrder",
      "getPaymentStatus",
      "searchKnowledgeBase",
      "getReturnPolicy",
    ])
    .nullable(),
  args: z.record(z.string(), z.unknown()).default({}),
  // Agentic RAG (ARCHITECTURE §4): some questions need live DB data AND policy
  // text — "best in-stock laptop under 80k for programming" needs both the catalog
  // and the buying guide. One optional second tool covers that without turning the
  // router into a planner.
  secondaryTool: z
    .enum([
      "searchProducts",
      "getProduct",
      "getInventory",
      "getRecommendations",
      "searchKnowledgeBase",
      "getReturnPolicy",
    ])
    .nullish()
    .default(null),
  secondaryArgs: z.record(z.string(), z.unknown()).nullish().default({}),
  reasoning: z.string().max(300).describe("one short sentence, no chain-of-thought"),
});

export type RouterDecision = z.infer<typeof routerDecisionSchema>;
