import { describe, it, expect } from "vitest";
import { parseEnv } from "./env";

const valid = {
  DATABASE_URL: "postgresql://u:p@host:6543/postgres",
  DIRECT_URL: "postgresql://u:p@host:5432/postgres",
  RAZORPAY_KEY_ID: "rzp_test_abc",
  RAZORPAY_KEY_SECRET: "secret",
  RAZORPAY_WEBHOOK_SECRET: "whsec",
  NEXT_PUBLIC_RAZORPAY_KEY_ID: "rzp_test_abc",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_abc",
  CLERK_SECRET_KEY: "sk_test_abc",
  GROQ_API_KEY: "gsk_abc",
  MERCHANT_ADMIN_EMAIL: "owner@urbanstore.test",
  EMBEDDING_DIMENSIONS: "384",
  APP_BASE_URL: "http://localhost:3000",
  AGENT_API_KEY: "a".repeat(64),
};

describe("parseEnv", () => {
  it("returns a typed object when every variable is present", () => {
    const env = parseEnv(valid);
    expect(env.DATABASE_URL).toBe(valid.DATABASE_URL);
    expect(env.MERCHANT_ADMIN_EMAIL).toBe("owner@urbanstore.test");
  });

  it("coerces EMBEDDING_DIMENSIONS to a number", () => {
    expect(parseEnv(valid).EMBEDDING_DIMENSIONS).toBe(384);
  });

  it("throws and names the missing variable", () => {
    const { CLERK_SECRET_KEY: _omitted, ...missing } = valid;
    expect(() => parseEnv(missing)).toThrow(/CLERK_SECRET_KEY/);
  });

  it("rejects a merchant admin email that is not an email", () => {
    expect(() => parseEnv({ ...valid, MERCHANT_ADMIN_EMAIL: "nope" })).toThrow(
      /MERCHANT_ADMIN_EMAIL/,
    );
  });

  it("rejects a DATABASE_URL that is not a postgres URL", () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: "mysql://x" })).toThrow(
      /DATABASE_URL/,
    );
  });
});
