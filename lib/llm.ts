import "server-only";
import OpenAI from "openai";
import type { z } from "zod";
import { env } from "@/lib/env";

/**
 * LLM provider abstraction.
 *
 * Everything above this file talks in terms of `complete()` / `completeJson()` and
 * never imports the OpenAI SDK directly, so swapping Groq for another provider is a
 * change to this file alone. Groq is wire-compatible with OpenAI, so the SDK is
 * simply pointed at GROQ_BASE_URL.
 *
 * This module is server-only: GROQ_API_KEY must never reach the browser.
 */

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmTier = "reasoning" | "fast";

let client: OpenAI | null = null;

function openai(): OpenAI {
  client ??= new OpenAI({
    apiKey: env.GROQ_API_KEY,
    baseURL: env.GROQ_BASE_URL,
    timeout: env.LLM_TIMEOUT_MS,
    // We do our own backoff below so we can distinguish rate limits from
    // hard failures and report them in the audit trail.
    maxRetries: 0,
  });
  return client;
}

export function modelFor(tier: LlmTier): string {
  return tier === "fast" ? env.LLM_FAST_MODEL : env.LLM_MODEL;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly code: "RATE_LIMITED" | "TIMEOUT" | "PROVIDER_ERROR" | "BAD_OUTPUT",
    readonly attempts: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof OpenAI.APIError) {
    // 429 = Groq free-tier rate limit; 5xx = transient provider trouble.
    return error.status === 429 || (error.status !== undefined && error.status >= 500);
  }
  return error instanceof OpenAI.APIConnectionError;
}

/** Exponential backoff with jitter. Groq's free tier rate-limits per minute. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  const maxAttempts = env.LLM_MAX_RETRIES + 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === maxAttempts) break;
      const backoffMs = Math.min(8000, 2 ** (attempt - 1) * 500) + Math.random() * 250;
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  if (lastError instanceof OpenAI.APIError && lastError.status === 429) {
    throw new LlmError(
      "The model provider is rate limiting us. Try again in a moment.",
      "RATE_LIMITED",
      maxAttempts,
    );
  }
  if (lastError instanceof OpenAI.APIConnectionTimeoutError) {
    throw new LlmError("The model provider timed out.", "TIMEOUT", maxAttempts);
  }
  throw new LlmError(
    lastError instanceof Error ? lastError.message : String(lastError),
    "PROVIDER_ERROR",
    maxAttempts,
  );
}

/** Free-text completion. Used for short natural-language summaries, never for decisions. */
export async function complete(
  messages: LlmMessage[],
  opts: { tier?: LlmTier; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const res = await withRetry(() =>
    openai().chat.completions.create({
      model: modelFor(opts.tier ?? "reasoning"),
      messages,
      max_tokens: opts.maxTokens ?? 512,
      temperature: opts.temperature ?? 0.2,
    }),
  );
  return res.choices[0]?.message?.content?.trim() ?? "";
}

/**
 * Structured completion: the model must return JSON, which is then validated against
 * a Zod schema. CLAUDE.md requires structured agent outputs rather than parsing free
 * text — if the model returns something off-schema this throws rather than letting a
 * malformed decision flow downstream.
 */
export async function completeJson<T>(
  messages: LlmMessage[],
  schema: z.ZodType<T>,
  opts: { tier?: LlmTier; maxTokens?: number } = {},
): Promise<T> {
  const res = await withRetry(() =>
    openai().chat.completions.create({
      model: modelFor(opts.tier ?? "fast"),
      messages,
      // The gpt-oss models emit reasoning tokens before their answer. With a long
      // system prompt and a tight cap they run out mid-JSON, and Groq rejects the
      // whole call with "Failed to validate JSON". Keep the reasoning short and
      // leave real headroom for the answer.
      max_tokens: opts.maxTokens ?? 2048,
      temperature: 0,
      response_format: { type: "json_object" },
      // Not in the OpenAI types; Groq accepts it for gpt-oss models.
      ...({ reasoning_effort: "low" } as Record<string, unknown>),
    }),
  );

  const raw = res.choices[0]?.message?.content?.trim() ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LlmError(
      `Model did not return valid JSON: ${raw.slice(0, 200)}`,
      "BAD_OUTPUT",
      1,
    );
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new LlmError(
      `Model output failed schema validation: ${result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
      "BAD_OUTPUT",
      1,
    );
  }
  return result.data;
}
