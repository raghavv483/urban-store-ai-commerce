import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { formatPaise } from "@/lib/money";
import { complete } from "@/lib/llm";
import { ok, fail, type AgentTool } from "./types";

/**
 * Growth tools (ARCHITECTURE §5). Bounded on purpose: an agent may look at
 * abandoned carts and *propose* a recovery campaign. It cannot activate one, and
 * it cannot send anything — no email, SMS or WhatsApp exists in this codebase.
 * Activation is a human decision, recorded with an approval status.
 */

/** Carts below this are not worth a recovery campaign. */
const HIGH_VALUE_THRESHOLD_PAISE = 5_000_000; // ₹50,000

/**
 * Recovery rates for abandoned-cart campaigns realistically sit in the low tens
 * of percent. 20% is a deliberately conservative planning figure, and the UI
 * always labels it an estimate — never a promise.
 */
const ASSUMED_RECOVERY_RATE = 0.2;

export const getAbandonedCarts: AgentTool = {
  name: "getAbandonedCarts",
  effect: "read",
  description:
    "List abandoned carts for this store with their value and contents. Use to size a cart-recovery opportunity before proposing a campaign.",
  inputSchema: z.object({
    minValueInPaise: z
      .number()
      .int()
      .min(0)
      .default(HIGH_VALUE_THRESHOLD_PAISE)
      .describe("ignore carts below this value"),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  async execute(input, ctx) {
    const { minValueInPaise, limit } = input as { minValueInPaise: number; limit: number };

    const carts = await prisma.cart.findMany({
      where: { merchantId: ctx.merchantId, status: "abandoned" },
      include: {
        items: { include: { product: { select: { name: true, slug: true } } } },
        events: {
          where: { eventType: "abandoned" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { totalInPaise: "desc" },
      take: limit,
    });

    const qualifying = carts
      .filter((c) => c.totalInPaise >= minValueInPaise && c.items.length > 0)
      .map((c) => ({
        cartId: c.id,
        totalInPaise: c.totalInPaise,
        totalDisplay: formatPaise(c.totalInPaise),
        itemCount: c.items.reduce((n, i) => n + i.quantity, 0),
        products: c.items.map((i) => `${i.product.name} ×${i.quantity}`),
        abandonedAt: c.events[0]?.createdAt ?? c.updatedAt,
      }));

    const totalInPaise = qualifying.reduce((s, c) => s + c.totalInPaise, 0);

    return ok(
      {
        carts: qualifying,
        cartCount: qualifying.length,
        totalValueInPaise: totalInPaise,
        totalValueDisplay: formatPaise(totalInPaise),
        thresholdInPaise: minValueInPaise,
      },
      qualifying.length === 0
        ? `No abandoned carts above ${formatPaise(minValueInPaise)}.`
        : `${qualifying.length} abandoned cart(s) worth ${formatPaise(totalInPaise)} above the ${formatPaise(minValueInPaise)} threshold.`,
    );
  },
};

/**
 * Strips artefacts the model adds despite being told not to: a leading "1." from
 * treating the request as a list, wrapping quotes, or a "Subject:" line. Cheaper
 * and more reliable than re-prompting, and this copy is merchant-editable anyway.
 */
function cleanCopy(raw: string): string {
  return raw
    .trim()
    .replace(/^\s*(subject|body|message)\s*:\s*/i, "")
    .replace(/^\s*\d+[.)]\s*/, "")
    .replace(/^["'“‘]|["'”’]$/g, "")
    .trim();
}

const FALLBACK_COPY = (count: number, display: string) =>
  `You left something behind at Urban Store. ${count === 1 ? "Your cart is" : "Carts like yours are"} still saved, ${display} of it, and everything in ${count === 1 ? "it is" : "them is"} still in stock. Pick up where you left off — free delivery on orders above ₹999, and 14 days to change your mind.`;

export const proposeCampaign: AgentTool = {
  name: "proposeCampaign",
  effect: "write",
  description:
    "Draft a cart-recovery campaign for the merchant to review. Creates a PROPOSED campaign only — it never activates one and never sends anything. A human must approve it.",
  inputSchema: z.object({
    minValueInPaise: z.number().int().min(0).default(HIGH_VALUE_THRESHOLD_PAISE),
  }),
  async execute(input, ctx) {
    const { minValueInPaise } = input as { minValueInPaise: number };

    const carts = await prisma.cart.findMany({
      where: { merchantId: ctx.merchantId, status: "abandoned" },
      include: { items: { include: { product: { select: { name: true } } } } },
      orderBy: { totalInPaise: "desc" },
    });

    const targets = carts.filter(
      (c) => c.totalInPaise >= minValueInPaise && c.items.length > 0,
    );

    if (targets.length === 0) {
      return fail(
        "NO_TARGETS",
        `No abandoned carts above ${formatPaise(minValueInPaise)} to recover.`,
      );
    }

    const cartValueInPaise = targets.reduce((s, c) => s + c.totalInPaise, 0);
    // Rounded to whole paise: money stays an integer everywhere, estimate or not.
    const estimatedRecoveryInPaise = Math.round(cartValueInPaise * ASSUMED_RECOVERY_RATE);

    const topProducts = [
      ...new Set(targets.flatMap((c) => c.items.map((i) => i.product.name))),
    ].slice(0, 4);

    // The LLM writes the customer-facing copy and nothing else. It does not pick
    // the audience, compute the value, or decide whether the campaign runs.
    let content: string;
    try {
      content = await complete(
        [
          {
            role: "system",
            content: [
              "You write short cart-recovery messages for an Indian electronics store called Urban Store.",
              "Output ONLY the message body as plain prose. No numbered list, no bullets, no subject line, no greeting placeholder, no sign-off, and no preamble such as 'Here is'.",
              "Two to three sentences. Warm and plain. No exclamation marks, no emoji, and never invent a discount, coupon or offer the store has not stated.",
            ].join("\n\n"),
          },
          {
            role: "user",
            // "for N shoppers" made the model write N separate variants. One
            // message goes to the whole segment, so ask for exactly one and say
            // it must not name a specific product.
            content: `Write ONE single message that will be sent to every shopper in this segment. Not one per shopper, not variants — one message, two to three sentences.

It must work for all of them, so do not name any specific product. The carts contain a mix of items such as ${topProducts.join(", ")}. The store offers free delivery above ₹999 and a 14-day return window.`,
          },
        ],
        // gpt-oss spends tokens reasoning before it answers; a tight cap truncated
        // the copy mid-sentence.
        { tier: "reasoning", maxTokens: 700 },
      );
      content = cleanCopy(content);
      if (!content) throw new Error("empty");
    } catch {
      // Copy is not worth failing a proposal over — the merchant can edit it.
      content = FALLBACK_COPY(targets.length, formatPaise(cartValueInPaise));
    }

    const campaign = await prisma.campaign.create({
      data: {
        merchantId: ctx.merchantId,
        type: "cart_recovery",
        name: `Cart recovery — ${targets.length} cart${targets.length === 1 ? "" : "s"}, ${formatPaise(cartValueInPaise)}`,
        // Always `proposed`. Nothing an agent does may create an active campaign.
        status: "proposed",
        targetDefinition: {
          segment: `Abandoned carts worth ${formatPaise(minValueInPaise)} or more`,
          cartIds: targets.map((c) => c.id),
          cartCount: targets.length,
          cartValueInPaise,
          estimatedRecoveryInPaise,
          assumedRecoveryRate: ASSUMED_RECOVERY_RATE,
          topProducts,
        },
        content: content.trim(),
        createdByAgent: "growth_agent",
      },
      select: { id: true, name: true, status: true },
    });

    return ok(
      {
        campaignId: campaign.id,
        name: campaign.name,
        status: campaign.status,
        cartCount: targets.length,
        cartValueInPaise,
        cartValueDisplay: formatPaise(cartValueInPaise),
        estimatedRecoveryInPaise,
        estimatedRecoveryDisplay: formatPaise(estimatedRecoveryInPaise),
        content: content.trim(),
        requiresApproval: true,
      },
      `Proposed a cart-recovery campaign for ${targets.length} cart(s) worth ${formatPaise(cartValueInPaise)}; estimated recovery ${formatPaise(estimatedRecoveryInPaise)}. Awaiting merchant approval — nothing sent.`,
    );
  },
};
