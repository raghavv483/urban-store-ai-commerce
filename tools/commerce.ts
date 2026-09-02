import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { formatPaise } from "@/lib/money";
import { priceCart, CartError } from "@/payments/cart";
import { createCheckout, CheckoutError } from "@/payments/checkout";
import { ok, fail, type AgentTool } from "./types";

export const getCart: AgentTool = {
  name: "getCart",
  effect: "read",
  description:
    "Read the current contents and server-computed total of a cart. Use before checkout, or for 'what's in my cart'.",
  inputSchema: z.object({
    cartId: z.string().min(1).max(64),
  }),
  async execute(input, ctx) {
    const { cartId } = input as { cartId: string };
    try {
      const priced = await priceCart(prisma, ctx.merchantId, cartId);
      return ok(
        {
          cartId: priced.cartId,
          lines: priced.lines.map((l) => ({
            slug: l.slug,
            name: l.name,
            quantity: l.quantity,
            unitPriceInPaise: l.unitPriceInPaise,
            lineTotalDisplay: formatPaise(l.unitPriceInPaise * l.quantity),
          })),
          totalInPaise: priced.totalInPaise,
          totalDisplay: formatPaise(priced.totalInPaise),
        },
        `Cart has ${priced.lines.length} line(s) totalling ${formatPaise(priced.totalInPaise)}.`,
      );
    } catch (error) {
      if (error instanceof CartError) return fail(error.code, error.message);
      throw error;
    }
  },
};

export const addToCart: AgentTool = {
  name: "addToCart",
  effect: "write",
  description:
    "Add a product to a cart by slug, creating the cart if no cartId is given. Quantity defaults to 1. Returns the updated cart total.",
  inputSchema: z.object({
    productSlug: z.string().min(1).max(64),
    quantity: z.number().int().min(1).max(10).default(1),
    cartId: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe("omit to start a new cart"),
  }),
  async execute(input, ctx) {
    const { productSlug, quantity, cartId } = input as {
      productSlug: string;
      quantity: number;
      cartId?: string;
    };

    const product = await prisma.product.findFirst({
      where: { merchantId: ctx.merchantId, slug: productSlug, active: true },
      select: { id: true, name: true, priceInPaise: true, stock: true },
    });
    if (!product) return fail("NOT_FOUND", `No product with slug "${productSlug}".`);
    if (product.stock < quantity) {
      return fail(
        "INSUFFICIENT_STOCK",
        `Only ${product.stock} of ${product.name} available (asked for ${quantity}).`,
      );
    }

    let targetCartId = cartId;
    if (targetCartId) {
      const existing = await prisma.cart.findFirst({
        where: { id: targetCartId, merchantId: ctx.merchantId, status: "active" },
        select: { id: true },
      });
      if (!existing) return fail("CART_NOT_FOUND", `No active cart ${targetCartId}.`);
    } else {
      const created = await prisma.cart.create({
        data: {
          merchantId: ctx.merchantId,
          customerId: ctx.customerId,
          sessionId: ctx.sessionId,
          status: "active",
          totalInPaise: 0,
        },
        select: { id: true },
      });
      targetCartId = created.id;
    }

    await prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: targetCartId, productId: product.id } },
      update: { quantity: { increment: quantity } },
      create: {
        cartId: targetCartId,
        productId: product.id,
        quantity,
        priceAtTimePaise: product.priceInPaise,
      },
    });

    const priced = await priceCart(prisma, ctx.merchantId, targetCartId);
    await prisma.cart.update({
      where: { id: targetCartId },
      data: { totalInPaise: priced.totalInPaise },
    });

    return ok(
      {
        cartId: targetCartId,
        added: { slug: productSlug, quantity },
        totalInPaise: priced.totalInPaise,
        totalDisplay: formatPaise(priced.totalInPaise),
      },
      `Added ${quantity} × ${product.name}. Cart total ${formatPaise(priced.totalInPaise)}.`,
    );
  },
};

/**
 * The ONLY tool that reaches the money spine.
 *
 * Note what the schema does NOT contain: there is no amount, price, or currency field.
 * The agent can only name a cart. `createCheckout` then re-derives the total from the
 * database, re-verifies inventory, and enforces idempotency — regardless of anything
 * the model said (CLAUDE.md prime directive + safety rules 1 and 3).
 *
 * If a buyer tells the agent "pay ₹1" for a ₹74,999 cart, there is no field in this
 * schema capable of carrying that instruction to Razorpay.
 */
export const createRazorpayOrder: AgentTool = {
  name: "createRazorpayOrder",
  description:
    "Start checkout for a cart: creates a payment order for the cart's server-computed total. You cannot specify an amount — the backend always charges what the cart is actually worth. Use only after the buyer has confirmed they want to pay.",
  effect: "money",
  inputSchema: z.object({
    cartId: z.string().min(1).max(64),
  }),
  async execute(input, ctx) {
    const { cartId } = input as { cartId: string };
    try {
      const result = await createCheckout({
        merchantId: ctx.merchantId,
        cartId,
        customerId: ctx.customerId,
        source: ctx.actor === "ai_buyer" ? "ai_buyer" : "human",
        actor: ctx.actor === "ai_buyer" ? "system" : "human_checkout",
      });

      return ok(
        {
          orderId: result.orderId,
          razorpayOrderId: result.razorpayOrderId,
          amountInPaise: result.amountInPaise,
          amountDisplay: formatPaise(result.amountInPaise),
          reused: result.reused,
        },
        result.reused
          ? `Reused existing order ${result.orderId} for ${formatPaise(result.amountInPaise)} (idempotent).`
          : `Created order ${result.orderId} for ${formatPaise(result.amountInPaise)}, awaiting payment.`,
      );
    } catch (error) {
      if (error instanceof CheckoutError) return fail(error.code, error.message);
      if (error instanceof CartError) return fail(error.code, error.message);
      throw error;
    }
  },
};

export const getPaymentStatus: AgentTool = {
  name: "getPaymentStatus",
  effect: "read",
  description:
    "Check whether an order has been paid, is still pending, or failed — and why it failed. Use for 'did my payment go through'.",
  inputSchema: z.object({
    orderId: z.string().min(1).max(64),
  }),
  async execute(input, ctx) {
    const { orderId } = input as { orderId: string };
    const order = await prisma.order.findFirst({
      where: { id: orderId, merchantId: ctx.merchantId },
      include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!order) return fail("NOT_FOUND", `No order ${orderId} for this merchant.`);

    const payment = order.payments[0] ?? null;
    return ok(
      {
        orderId: order.id,
        status: order.status,
        totalInPaise: order.totalInPaise,
        totalDisplay: formatPaise(order.totalInPaise),
        paymentStatus: payment?.status ?? null,
        errorCode: payment?.errorCode ?? null,
        errorDescription: payment?.errorDescription ?? null,
      },
      order.status === "paid"
        ? `Order ${order.id} is paid (${formatPaise(order.totalInPaise)}).`
        : order.status === "failed"
          ? `Order ${order.id} failed${payment?.errorDescription ? `: ${payment.errorDescription}` : ""}. Nothing was charged.`
          : `Order ${order.id} is ${order.status}; no confirmed payment yet.`,
    );
  },
};

/**
 * Remove a line, or reduce its quantity (ARCHITECTURE §5's `removeFromCart`).
 *
 * Quantity 0 — or omitting it — removes the line entirely. Reducing below the
 * current quantity leaves the remainder. Cart mutations are never money
 * movement: the total is still re-derived by the spine at checkout.
 */
export const removeFromCart: AgentTool = {
  name: "removeFromCart",
  effect: "write",
  description:
    "Remove a product from a cart, or reduce how many of it are in the cart. Omit quantity to remove the line entirely.",
  inputSchema: z.object({
    cartId: z.string().min(1).max(64),
    productSlug: z.string().min(1).max(64),
    quantity: z
      .number()
      .int()
      .min(0)
      .max(10)
      .optional()
      .describe("how many to take out; omit or 0 to remove the line"),
  }),
  async execute(input, ctx) {
    const { cartId, productSlug, quantity } = input as {
      cartId: string;
      productSlug: string;
      quantity?: number;
    };

    const cart = await prisma.cart.findFirst({
      where: { id: cartId, merchantId: ctx.merchantId, status: "active" },
      select: { id: true },
    });
    if (!cart) return fail("CART_NOT_FOUND", `No active cart ${cartId}.`);

    const product = await prisma.product.findFirst({
      where: { merchantId: ctx.merchantId, slug: productSlug },
      select: { id: true, name: true },
    });
    if (!product) return fail("NOT_FOUND", `No product with slug "${productSlug}".`);

    const line = await prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId, productId: product.id } },
      select: { quantity: true },
    });
    if (!line) return fail("NOT_IN_CART", `${product.name} is not in this cart.`);

    const takeOut = quantity && quantity > 0 ? quantity : line.quantity;
    const remaining = line.quantity - takeOut;

    if (remaining <= 0) {
      await prisma.cartItem.delete({
        where: { cartId_productId: { cartId, productId: product.id } },
      });
    } else {
      await prisma.cartItem.update({
        where: { cartId_productId: { cartId, productId: product.id } },
        data: { quantity: remaining },
      });
    }

    // An emptied cart has no total to price, so report it rather than throwing.
    const stillHasItems = await prisma.cartItem.count({ where: { cartId } });
    if (stillHasItems === 0) {
      await prisma.cart.update({ where: { id: cartId }, data: { totalInPaise: 0 } });
      return ok(
        { cartId, removed: productSlug, totalInPaise: 0, totalDisplay: formatPaise(0), empty: true },
        `Removed ${product.name}. The cart is now empty.`,
      );
    }

    const priced = await priceCart(prisma, ctx.merchantId, cartId);
    await prisma.cart.update({
      where: { id: cartId },
      data: { totalInPaise: priced.totalInPaise },
    });

    return ok(
      {
        cartId,
        removed: productSlug,
        remainingQuantity: Math.max(remaining, 0),
        totalInPaise: priced.totalInPaise,
        totalDisplay: formatPaise(priced.totalInPaise),
        empty: false,
      },
      remaining > 0
        ? `Removed ${takeOut} × ${product.name}. Cart total ${formatPaise(priced.totalInPaise)}.`
        : `Removed ${product.name}. Cart total ${formatPaise(priced.totalInPaise)}.`,
    );
  },
};
