import "server-only";
import type { z } from "zod";

/**
 * The agent → system boundary.
 *
 * An agent may ONLY act through a registered tool. It gets no Prisma client, no
 * Razorpay client, and no ability to run arbitrary queries (CLAUDE.md safety rule 5).
 *
 * The single most important property here: `merchantId` lives in `ToolContext`, which
 * is built server-side from the authenticated session — it is NOT a field on any tool's
 * input schema. An LLM literally cannot express "query merchant X" because there is
 * nowhere in the schema to put it (CLAUDE.md safety rule 6).
 */
export type ToolContext = {
  /** Always derived server-side. Never from model output. */
  merchantId: string;
  /** Present when a human is signed in; null for guest or autonomous-agent sessions. */
  customerId: string | null;
  /** Groups audit rows belonging to one conversation. */
  sessionId: string | null;
  /** Who is acting — drives the `source` on any order created. */
  actor: "human" | "ai_buyer";
};

export type ToolResult<T> =
  | { ok: true; data: T; summary: string }
  | { ok: false; error: string; code: string; summary: string };

export type AgentTool<TInput = unknown, TOutput = unknown> = {
  name: string;
  /** Shown to the model. Say what it does AND when to pick it. */
  description: string;
  inputSchema: z.ZodType<TInput>;
  /**
   * What the tool is allowed to do. Drives the policy decision recorded in the
   * audit trail, so it must be accurate — calling a write "read-only" makes the
   * audit lie about what an agent did.
   */
  effect: "read" | "write" | "money";
  execute: (input: TInput, ctx: ToolContext) => Promise<ToolResult<TOutput>>;
};

export function ok<T>(data: T, summary: string): ToolResult<T> {
  return { ok: true, data, summary };
}

export function fail(code: string, error: string): ToolResult<never> {
  return { ok: false, code, error, summary: `Failed: ${error}` };
}
