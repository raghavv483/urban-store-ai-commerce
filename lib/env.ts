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
  MERCHANT_ADMIN_EMAIL: z.string().email(),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive(),
  APP_BASE_URL: z.string().url(),
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
