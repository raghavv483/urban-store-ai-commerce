/**
 * Autonomous AI buyer — Track 01's differentiator.
 *
 *   npx tsx --env-file=.env.local scripts/ai-buyer.ts
 *   npx tsx --env-file=.env.local scripts/ai-buyer.ts --fail
 *
 * Discovers the catalog, picks a product, builds a cart, checks out through the
 * gated spine, and settles — with no browser and no human clicks.
 *
 * ── An honest note about "completes a real payment" ──────────────────────────
 * The Razorpay ORDER is genuinely real: created through their API with a real
 * order id, for an amount the spine derived from the database.
 *
 * The PAYMENT is settled by posting a correctly HMAC-signed webhook to our own
 * endpoint. That exercises the entire real settlement path — signature
 * verification, idempotency, the paid transition, inventory decrement, the audit
 * row — but no card is charged, because charging one headlessly needs Razorpay's
 * server-to-server API (`payments.createPaymentJson`), which requires S2S to be
 * enabled on the account and is not on by default in test mode.
 *
 * So: the money path is real, the card charge is simulated. Said plainly here so
 * nobody has to guess which half is which.
 * ────────────────────────────────────────────────────────────────────────────
 */

import crypto from "node:crypto";

const BASE = process.env.AGENT_TARGET_URL ?? "http://localhost:3000";
const KEY = process.env.AGENT_API_KEY ?? "";
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
const SESSION = `ai-buyer-${Date.now()}`;
const FAIL_MODE = process.argv.includes("--fail");

let step = 0;
const log = (msg: string) => console.log(`  ${String(++step).padStart(2, "0")}  ${msg}`);
const detail = (msg: string) => console.log(`      ${msg}`);
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    "x-agent-session": SESSION,
  };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${path} returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const e = body as { error?: string; code?: string };
    throw new Error(`${path} → ${res.status} ${e.code ?? ""} ${e.error ?? text.slice(0, 160)}`);
  }
  return body as T;
}

type CatalogProduct = {
  slug: string;
  name: string;
  category: string;
  priceInPaise: number;
  priceDisplay: string;
  stock: number;
  inStock: boolean;
  compatibleWith: string[];
};

/**
 * Settlement. Signs the payload exactly as Razorpay would and posts it to our
 * webhook, so the endpoint's signature check is genuinely exercised — a wrong
 * secret here fails exactly as a forged webhook would.
 */
async function settle(
  razorpayOrderId: string,
  amountInPaise: number,
  outcome: "captured" | "failed",
): Promise<void> {
  const event = {
    event: outcome === "captured" ? "payment.captured" : "payment.failed",
    payload: {
      payment: {
        entity: {
          id: `pay_agent_${crypto.randomBytes(8).toString("hex")}`,
          order_id: razorpayOrderId,
          amount: amountInPaise,
          currency: "INR",
          method: "card",
          ...(outcome === "failed"
            ? {
                error_code: "BAD_REQUEST_ERROR",
                error_description: "Payment declined by the issuing bank.",
              }
            : {}),
        },
      },
    },
  };

  const raw = JSON.stringify(event);
  const signature = crypto.createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex");

  const res = await fetch(`${BASE}/api/webhooks/razorpay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-razorpay-signature": signature },
    body: raw,
  });
  if (!res.ok) {
    throw new Error(`Webhook rejected the settlement (${res.status}). Check RAZORPAY_WEBHOOK_SECRET.`);
  }
}

async function attemptPurchase(
  target: CatalogProduct,
  shouldFail: boolean,
): Promise<"paid" | "failed"> {
  const cart = await call<{ cartId: string; totalInPaise: number }>("/api/agent/cart", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ productSlug: target.slug, quantity: 1 }),
  });
  log(`Cart created — ${cart.cartId}`);
  detail(`Server-computed total ${rupees(cart.totalInPaise)} (the agent never sent a price)`);

  const order = await call<{
    orderId: string;
    razorpayOrderId: string;
    amountInPaise: number;
  }>("/api/agent/checkout", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ cartId: cart.cartId }),
  });
  log(`Order created — ${order.orderId} for ${rupees(order.amountInPaise)}`);
  detail(`Razorpay order ${order.razorpayOrderId}`);

  log(shouldFail ? "Submitting a payment that will be declined…" : "Submitting payment…");
  await settle(order.razorpayOrderId, order.amountInPaise, shouldFail ? "failed" : "captured");

  const status = await call<{ status: string; errorDescription: string | null }>(
    `/api/agent/order/${order.orderId}`,
    { headers: authHeaders() },
  );

  if (status.status === "paid") {
    log(`Order confirmed PAID — ${rupees(order.amountInPaise)}`);
    return "paid";
  }

  log(`Payment declined — order marked ${status.status.toUpperCase()}`);
  detail(status.errorDescription ?? "no reason given");
  detail("Nothing charged. Inventory untouched. Cart still open.");
  return "failed";
}

async function main() {
  console.log("");
  console.log("  URBAN STORE — AUTONOMOUS AI BUYER");
  console.log(`  ${FAIL_MODE ? "graceful-failure run" : "purchase run"} · session ${SESSION}`);
  console.log("  " + "─".repeat(62));

  if (!KEY) throw new Error("AGENT_API_KEY is not set. Run with --env-file=.env.local");
  if (!WEBHOOK_SECRET) throw new Error("RAZORPAY_WEBHOOK_SECRET is not set.");

  // ---- 1. Discover, with no credentials at all ----
  const catalog = await call<{
    merchant: { name: string };
    products: CatalogProduct[];
    returnPolicy: { windowDays: number };
  }>("/api/agent/catalog");
  log(`Discovered ${catalog.products.length} products at ${catalog.merchant.name}`);
  detail(`Return window ${catalog.returnPolicy.windowDays} days · no auth needed to browse`);

  // ---- 2. Choose, using the machine-readable fields ----
  const laptops = catalog.products
    .filter((p) => p.category === "Laptops" && p.inStock)
    .sort((a, b) => a.priceInPaise - b.priceInPaise);

  if (laptops.length === 0) {
    console.log("\n  No laptop in stock. Nothing to buy.\n");
    process.exit(0);
  }

  const target = laptops[0];
  log(`Selected ${target.name} — ${target.priceDisplay}, ${target.stock} in stock`);
  detail(
    `Rule: cheapest in-stock laptop. Compatible accessories: ${
      target.compatibleWith.join(", ") || "none listed"
    }`,
  );

  // ---- 3. Buy ----
  const outcome = await attemptPurchase(target, FAIL_MODE);

  if (outcome === "paid") {
    console.log("  " + "─".repeat(62));
    console.log(`  DONE — bought ${target.name} with zero human clicks.\n`);
    return;
  }

  // ---- 4. Graceful failure: retry exactly once, then stop cleanly ----
  log("Retrying once with a fresh order…");
  const retry = await attemptPurchase(target, false);

  console.log("  " + "─".repeat(62));
  if (retry === "paid") {
    console.log(`  RECOVERED — declined once, retried, bought ${target.name}.\n`);
  } else {
    // Reported, not thrown: a stuck retry loop is worse than a clean stop.
    console.log("  STOPPED — payment failed twice. No order left pending, nothing charged.\n");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\n  FAILED — ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
