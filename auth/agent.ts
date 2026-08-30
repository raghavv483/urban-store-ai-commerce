import "server-only";
import crypto from "node:crypto";
import { env } from "@/lib/env";
import { getStorefrontMerchantId } from "@/lib/merchant";
import type { ToolContext } from "@/tools";

/**
 * The autonomous-agent auth boundary.
 *
 * This is the second front door into the same gated spine: humans arrive through
 * Clerk and the chat, machines arrive through a bearer key and these endpoints.
 * Both funnel into identical tools, so an agent gets no capability a human lacks.
 *
 * The key comparison is constant-time. A plain `===` on a secret leaks its prefix
 * through timing, the same reason the Razorpay webhook uses `timingSafeEqual`.
 */

export class AgentAuthError extends Error {
  constructor(message = "Unauthorized.") {
    super(message);
    this.name = "AgentAuthError";
  }
}

/** Constant-time compare that tolerates unequal lengths without throwing. */
function secretsMatch(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Verifies the bearer token and builds the agent's context.
 *
 * `merchantId` is resolved server-side from the storefront slug and `actor` is
 * pinned to "ai_buyer" — neither can be influenced by the request. An agent
 * cannot name a merchant, cannot claim to be a human, and cannot widen its scope
 * (CLAUDE.md safety rule 6).
 */
export async function requireAgentContext(request: Request): Promise<ToolContext> {
  const header = request.headers.get("authorization");
  if (!header) throw new AgentAuthError();

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) throw new AgentAuthError();
  if (!secretsMatch(token, env.AGENT_API_KEY)) throw new AgentAuthError();

  const merchantId = await getStorefrontMerchantId();

  return {
    merchantId,
    customerId: null,
    // Groups every action from one agent run in the audit trail.
    sessionId: request.headers.get("x-agent-session") ?? "ai-buyer",
    actor: "ai_buyer",
  };
}

/** Policy ceiling for a single agent-initiated order (CLAUDE.md: bounded actions). */
export function agentOrderCapInPaise(): number {
  return env.AGENT_MAX_ORDER_VALUE_PAISE;
}
