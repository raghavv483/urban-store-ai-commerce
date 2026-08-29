"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getStorefrontMerchantId } from "@/lib/merchant";
import { getSessionContext } from "@/auth/session";
import { createCheckout, CheckoutError } from "@/payments/checkout";

const TEST_SESSION_ID = "spine-test-cart";

export type ActionResult =
  | { ok: true; message: string; data?: Record<string, unknown> }
  | { ok: false; message: string; code?: string };

/**
 * Build a fresh test cart: one ThinkPad X + one USB-C Hub.
 * Any previous test cart is closed out first so each run starts clean.
 */
export async function createTestCart(): Promise<ActionResult> {
  try {
    const merchantId = await getStorefrontMerchantId();
    const session = await getSessionContext();

    await prisma.cart.updateMany({
      where: { merchantId, sessionId: TEST_SESSION_ID, status: "active" },
      data: { status: "abandoned" },
    });

    const products = await prisma.product.findMany({
      where: { merchantId, slug: { in: ["thinkpad-x", "usb-c-hub"] }, active: true },
      select: { id: true, slug: true, priceInPaise: true },
    });

    if (products.length !== 2) {
      return { ok: false, message: "Seed products missing. Run `npm run db:seed`." };
    }

    const cart = await prisma.cart.create({
      data: {
        merchantId,
        sessionId: TEST_SESSION_ID,
        customerId: session?.userId ?? null,
        status: "active",
        totalInPaise: products.reduce((s, p) => s + p.priceInPaise, 0),
        items: {
          create: products.map((p) => ({
            productId: p.id,
            quantity: 1,
            priceAtTimePaise: p.priceInPaise,
          })),
        },
      },
      select: { id: true },
    });

    revalidatePath("/test-spine");
    return { ok: true, message: `Cart ${cart.id} created with 2 items.`, data: { cartId: cart.id } };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

/**
 * Runs spine steps 1-5. Returns what the browser needs to open Razorpay Checkout.
 * Note there is no amount parameter — the total is derived from the DB cart.
 */
export async function startCheckout(cartId: string): Promise<ActionResult> {
  try {
    const merchantId = await getStorefrontMerchantId();
    const session = await getSessionContext();

    const result = await createCheckout({
      merchantId,
      cartId,
      customerId: session?.userId ?? null,
      source: "human",
      actor: "human_checkout",
    });

    revalidatePath("/test-spine");
    return {
      ok: true,
      message: result.reused
        ? `Reused existing order ${result.orderId} (idempotent).`
        : `Created order ${result.orderId}.`,
      data: { ...result },
    };
  } catch (error) {
    if (error instanceof CheckoutError) {
      return { ok: false, message: error.message, code: error.code };
    }
    return { ok: false, message: describe(error) };
  }
}

/** Read-only snapshot for the test page. */
export async function getSpineState() {
  const merchantId = await getStorefrontMerchantId();

  const [cart, orders, products, runs] = await Promise.all([
    prisma.cart.findFirst({
      where: { merchantId, sessionId: TEST_SESSION_ID, status: "active" },
      include: { items: { include: { product: { select: { slug: true, name: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.order.findMany({
      where: { merchantId, cartId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { payments: true, items: true },
    }),
    prisma.product.findMany({
      where: { merchantId, slug: { in: ["thinkpad-x", "usb-c-hub"] } },
      select: { slug: true, stock: true, priceInPaise: true },
      orderBy: { slug: "asc" },
    }),
    prisma.agentRun.findMany({
      where: { merchantId },
      orderBy: { startedAt: "desc" },
      take: 6,
      include: { actions: { orderBy: { createdAt: "asc" } } },
    }),
  ]);

  return { cart, orders, products, runs };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
