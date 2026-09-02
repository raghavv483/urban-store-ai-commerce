"use server";

import { revalidatePath } from "next/cache";
import { getStorefrontMerchantId } from "@/lib/merchant";
import { getSessionContext } from "@/auth/session";
import { runTool } from "@/tools";
import { createCheckout, CheckoutError } from "@/payments/checkout";

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
    const call = await runTool(
      "removeFromCart",
      { cartId, productSlug },
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
    return {
      ok: false,
      message: "We couldn't update your cart. Please try again.",
    };
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
        ? await runTool(
            "addToCart",
            { cartId, productSlug, quantity: 1 },
            await ctx(),
          )
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
    return {
      ok: false,
      message: "We couldn't update your cart. Please try again.",
    };
  }
}

export type BeginCheckoutResult =
  | {
      ok: true;
      orderId: string;
      razorpayOrderId: string;
      amountInPaise: number;
      razorpayKeyId: string;
      reused: boolean;
    }
  | { ok: false; message: string };

/**
 * The customer-facing "Pay" action.
 *
 * Runs the same `createCheckout` spine the test harness and the agent API run —
 * there is one checkout implementation, not a separate customer one. Note there
 * is still no amount parameter: the total is re-derived from the DB cart inside
 * `createCheckout`, so nothing the browser sends can change what is charged.
 */
export async function beginCheckout(
  cartId: string,
): Promise<BeginCheckoutResult> {
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

    return {
      ok: true,
      orderId: result.orderId,
      razorpayOrderId: result.razorpayOrderId,
      amountInPaise: result.amountInPaise,
      razorpayKeyId: result.razorpayKeyId,
      reused: result.reused,
    };
  } catch (error) {
    if (error instanceof CheckoutError) {
      return { ok: false, message: error.message };
    }
    // Never leak an internal error to a shopper mid-purchase.
    return {
      ok: false,
      message: "We couldn't start checkout just now. Nothing was charged.",
    };
  }
}

export type CheckoutStatus =
  | { ok: true; status: "paid" | "failed" | "pending"; message: string }
  | { ok: false; message: string };

/**
 * Has the signed webhook settled this order yet?
 *
 * The browser asks; it never asserts. Razorpay's in-page success callback fires
 * before the webhook lands, so this is the only thing that can honestly move the
 * UI to "paid" — and by extension the only thing that may empty the header
 * badge, since the cart is closed in the same transaction that marks the order
 * paid.
 *
 * Read-only, and goes through the same `getPaymentStatus` tool the chat and the
 * agent API use rather than re-reading orders a third way.
 */
export async function getCheckoutStatus(
  orderId: string,
): Promise<CheckoutStatus> {
  try {
    const call = await runTool("getPaymentStatus", { orderId }, await ctx());
    if (!call.result.ok) {
      return { ok: false, message: call.result.error };
    }

    const { status } = call.result.data as { status: string };
    return {
      ok: true,
      status:
        status === "paid" ? "paid" : status === "failed" ? "failed" : "pending",
      message: call.result.summary,
    };
  } catch {
    return {
      ok: false,
      message: "Couldn't check the payment status just now.",
    };
  }
}
