"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getStorefrontMerchantId } from "@/lib/merchant";
import { getSessionContext } from "@/auth/session";
import { runTool } from "@/tools";

const CART_COOKIE = "urban_cart";

export type AddToCartResult =
  | { ok: true; cartId: string; totalDisplay: string; message: string }
  | { ok: false; message: string };

/**
 * Add to cart from the catalog pages.
 *
 * Deliberately a thin wrapper over the existing `addToCart` tool — the same code
 * path the chat uses — rather than a second implementation of cart logic. The
 * cart id lives in an httpOnly cookie so a browsing visitor keeps one cart across
 * pages without the client ever choosing which cart to write to.
 */
export async function addToCartAction(
  productSlug: string,
  quantity = 1,
): Promise<AddToCartResult> {
  try {
    const merchantId = await getStorefrontMerchantId();
    const session = await getSessionContext();
    const jar = await cookies();

    // Only reuse the cookie's cart if it is still this merchant's and still open.
    const cookieCartId = jar.get(CART_COOKIE)?.value;
    let cartId: string | undefined;
    if (cookieCartId) {
      const existing = await prisma.cart.findFirst({
        where: { id: cookieCartId, merchantId, status: "active" },
        select: { id: true },
      });
      cartId = existing?.id;
    }

    const call = await runTool(
      "addToCart",
      { productSlug, quantity, ...(cartId ? { cartId } : {}) },
      {
        merchantId,
        customerId: session?.userId ?? null,
        sessionId: "storefront",
        actor: "human",
      },
    );

    if (!call.result.ok) {
      return { ok: false, message: call.result.error };
    }

    const data = call.result.data as { cartId: string; totalDisplay: string };

    jar.set(CART_COOKIE, data.cartId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    revalidatePath("/shop");
    return {
      ok: true,
      cartId: data.cartId,
      totalDisplay: data.totalDisplay,
      message: call.result.summary,
    };
  } catch {
    // Never surface an internal error to a shopper mid-purchase.
    return { ok: false, message: "We couldn't add that just now. Please try again." };
  }
}

/** The active cart for the current browser, if any. */
export async function getActiveCartSummary(): Promise<{
  cartId: string;
  itemCount: number;
} | null> {
  const jar = await cookies();
  const cartId = jar.get(CART_COOKIE)?.value;
  if (!cartId) return null;

  const merchantId = await getStorefrontMerchantId();
  const cart = await prisma.cart.findFirst({
    where: { id: cartId, merchantId, status: "active" },
    select: { id: true, items: { select: { quantity: true } } },
  });
  if (!cart) return null;

  return {
    cartId: cart.id,
    itemCount: cart.items.reduce((n, i) => n + i.quantity, 0),
  };
}
