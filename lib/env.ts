import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().startsWith("postgresql://"),
  DIRECT_URL: z.string().startsWith("postgresql://"),
  RAZORPAY_KEY_ID: z.string().min(1),
  RAZORPAY_KEY_SECRET: z.string().min(1),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1),
  // Public key id for Razorpay Checkout in the browser. Safe to expose — it is the
  // key id only, never the secret — but it must equal RAZORPAY_KEY_ID or Checkout
  // will reject orders created with the other key.
  NEXT_PUBLIC_RAZORPAY_KEY_ID: z.string().min(1),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  GROQ_API_KEY: z.string().min(1),
  // Groq speaks the OpenAI wire format, so the provider abstraction is just the
  // OpenAI SDK pointed at this base URL.
  GROQ_BASE_URL: z.string().url().default("https://api.groq.com/openai/v1"),
  // Groq retires model ids on short notice — the llama-3.x ids this project
  // originally used are already gone. Verify against GET /openai/v1/models
  // before changing these.
  LLM_MODEL: z.string().min(1).default("openai/gpt-oss-120b"),
  LLM_FAST_MODEL: z.string().min(1).default("openai/gpt-oss-20b"),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  MERCHANT_ADMIN_EMAIL: z.string().email(),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive(),
  // Local sentence-transformer run in-process by @xenova/transformers. Must agree
  // with EMBEDDING_DIMENSIONS and with the vector(N) width of knowledge_chunks.
  EMBEDDING_MODEL: z.string().min(1).default("Xenova/all-MiniLM-L6-v2"),
  APP_BASE_URL: z.string().url(),
  // Shared secret an autonomous agent presents as `Authorization: Bearer <key>`.
  // Long enough that guessing is not a realistic attack.
  AGENT_API_KEY: z.string().min(32),
  // Hard ceiling on a single agent-initiated order. The spine still derives the
  // amount from the cart; this bounds how much an agent may commit in one go.
  AGENT_MAX_ORDER_VALUE_PAISE: z.coerce.number().int().positive().default(10_000_000),
});

export type Env = z.infer<typeof envSchema>;

/** Pure parser — exported so it can be tested with arbitrary input. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n  ");
    throw new Error(`Invalid environment configuration:\n  ${details}`);
  }
  return result.data;
}

let cached: Env | null = null;

/** Validates once, on first access. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/**
 * Server-side env accessor. Lazy on purpose: validating at module-evaluation
 * time would make merely *importing* this file throw, which breaks tests and
 * any tooling that loads the module without a full environment.
 *
 * Importing this from a client component is a bug — it would attempt to inline
 * secrets into the browser bundle.
 */
export const env: Env = new Proxy({} as Env, {
  get: (_target, key: string) => getEnv()[key as keyof Env],
});
