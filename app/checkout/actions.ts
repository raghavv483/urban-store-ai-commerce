"use server";

import { revalidatePath } from "next/cache";
import { getStorefrontMerchantId } from "@/lib/merchant";
import { getSessionContext } from "@/auth/session";
import { runTool } from "@/tools";

export type CartEditResult =
  | { ok: true; message: string; empty: boolean }
  | { ok: false; message: string };

/**
 * Cart edits from the checkout page. Wraps the same tools the chat and the agent
 * use — `addToCart` to increase, `removeFromCart` to decrease or remove — so
 * there is exactly one implementation of cart mutation in the codebase.
 *
 * Changing the cart never changes what gets charged directly: the spine re-prices
 * from the database at checkout regardless, and a cart edited after an order was
 * created will cancel that stale order rather than charge the old total.
 */
async function ctx() {
  const merchantId = await getStorefrontMerchantId();
  const session = await getSessionContext();
  return {
    merchantId,
    customerId: session?.userId ?? null,
    sessionId: "storefront",
    actor: "human" as const,
  };
}

export async function removeLine(
  cartId: string,
  productSlug: string,
): Promise<CartEditResult> {
  try {
    const call = await runTool("removeFromCart", { cartId, productSlug }, await ctx());
    if (!call.result.ok) return { ok: false, message: call.result.error };
    revalidatePath("/checkout");
    return {
      ok: true,
      message: call.result.summary,
      empty: (call.result.data as { empty?: boolean }).empty === true,
    };
  } catch {
    return { ok: false, message: "We couldn't update your cart. Please try again." };
  }
}

export async function changeQuantity(
  cartId: string,
  productSlug: string,
  direction: "up" | "down",
): Promise<CartEditResult> {
  try {
    const call =
      direction === "up"
        ? await runTool("addToCart", { cartId, productSlug, quantity: 1 }, await ctx())
        : await runTool(
            "removeFromCart",
            { cartId, productSlug, quantity: 1 },
            await ctx(),
          );

    if (!call.result.ok) return { ok: false, message: call.result.error };
    revalidatePath("/checkout");
    return {
      ok: true,
      message: call.result.summary,
      empty: (call.result.data as { empty?: boolean }).empty === true,
    };
  } catch {
    return { ok: false, message: "We couldn't update your cart. Please try again." };
  }
}
