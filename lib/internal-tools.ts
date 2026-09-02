import "server-only";
import { getEnv } from "./env";

/**
 * Is the internal payment harness (`/test-spine`) available?
 *
 * It creates synthetic carts and drives real Razorpay order creation, so it is
 * developer tooling, not a customer surface. It briefly leaked onto `/checkout`,
 * where a shopper clicking "1. Create test cart" ended up on a cart that was not
 * the one they had been filling. Gating it in one place makes that hard to
 * repeat.
 *
 * Enabled in development, and in a production build only with an explicit
 * `ENABLE_TEST_SPINE=true`. The gate is applied to the page AND to every server
 * action behind it — a server action is a public endpoint, so hiding only the UI
 * would not actually close it.
 */
export function isInternalToolingEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || getEnv().ENABLE_TEST_SPINE;
}
