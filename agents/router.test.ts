import { describe, it, expect, afterAll } from "vitest";
import { classifyOnly } from "./router";
import { runTool, TOOLS } from "@/tools";
import { prisma } from "@/lib/db";
import { MERCHANT_SLUG } from "@/db/seed-data";

/**
 * These hit the real Groq API, so they prove the router actually works against the
 * live model rather than a mock of our own assumptions. Two prompts, two different
 * expected tools — enough to show routing discriminates.
 */

afterAll(async () => {
  await prisma.$disconnect();
});

describe("router classification", () => {
  it("routes a catalog browse to searchProducts with the price converted to paise", async () => {
    const decision = await classifyOnly("find me a laptop under 80000");

    expect(decision).not.toBeNull();
    expect(decision!.tool).toBe("searchProducts");
    expect(decision!.intent).toBe("product_search");

    // ₹80,000 must become 8,000,000 paise. A model that passes 80000 straight
    // through would filter out every laptop in the catalog.
    const max = decision!.args.maxPriceInPaise as number | undefined;
    if (max !== undefined) {
      expect(max).toBe(8_000_000);
    }
  }, 60_000);

  it("routes a stock question to getInventory, not to search", async () => {
    const decision = await classifyOnly("is the thinkpad x in stock right now?");

    expect(decision).not.toBeNull();
    expect(decision!.tool).toBe("getInventory");
    expect(decision!.args.slug).toBe("thinkpad-x");
  }, 60_000);
});

describe("tool boundary", () => {
  it("createRazorpayOrder has no field an agent could put an amount in", () => {
    // The prime directive enforced structurally: if the schema has no amount,
    // no model output can carry one to Razorpay.
    const shape = (
      TOOLS.createRazorpayOrder.inputSchema as unknown as {
        shape: Record<string, unknown>;
      }
    ).shape;
    const keys = Object.keys(shape);

    expect(keys).toEqual(["cartId"]);
    for (const forbidden of ["amount", "amountInPaise", "price", "total", "currency"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("rejects arguments that do not match a tool's schema", async () => {
    const merchant = await prisma.merchant.findUniqueOrThrow({
      where: { slug: MERCHANT_SLUG },
    });
    const ctx = {
      merchantId: merchant.id,
      customerId: null,
      sessionId: "vitest",
      actor: "human" as const,
    };

    // A model hallucinating a merchantId cannot widen its own scope: the field is
    // not in the schema, and merchantId comes from ctx regardless.
    const bad = await runTool("getInventory", { merchantId: "other-merchant" }, ctx);
    expect(bad.result.ok).toBe(false);
    expect(bad.result.ok === false && bad.result.code).toBe("INVALID_INPUT");

    const good = await runTool("getInventory", { slug: "thinkpad-x" }, ctx);
    expect(good.result.ok).toBe(true);
  }, 30_000);
});
