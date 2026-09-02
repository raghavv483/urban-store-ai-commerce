"use client";

/**
 * A tiny bus for "the cart changed".
 *
 * The header is a server component that reads the cart count during render, so
 * it cannot subscribe to client state directly. Rather than lift the whole cart
 * into a client context — which would mean threading a provider through every
 * server page for one badge — whoever changes the cart announces it and the
 * interested widgets listen.
 *
 * Two events, because the two directions have genuinely different triggers: an
 * add happens in a server action the clicking component already awaits, while a
 * clear happens when a *webhook* settles a payment — which the browser only
 * learns about by asking. Payment can also complete inside a Razorpay popup with
 * no navigation at all, so without this the header badge would sit on a stale
 * count until the shopper reloaded by hand.
 */

export const CART_ADDED = "urban:cart-added";

export type CartAddedDetail = {
  productName: string;
  totalDisplay: string;
  cartId: string;
  itemCount: number;
};

export function announceCartAdded(detail: CartAddedDetail): void {
  window.dispatchEvent(
    new CustomEvent<CartAddedDetail>(CART_ADDED, { detail }),
  );
}

export function onCartAdded(
  handler: (detail: CartAddedDetail) => void,
): () => void {
  const listener = (e: Event) =>
    handler((e as CustomEvent<CartAddedDetail>).detail);
  window.addEventListener(CART_ADDED, listener);
  return () => window.removeEventListener(CART_ADDED, listener);
}

export const CART_CLEARED = "urban:cart-cleared";

/**
 * The shopper's cart is closed and no longer theirs to check out.
 *
 * Only announce this once the server has actually confirmed it — a payment is
 * settled by the signed webhook, never by the browser saying so. Emptying the
 * badge on an unconfirmed payment would tell the shopper their order went
 * through when it may not have.
 */
export function announceCartCleared(): void {
  window.dispatchEvent(new CustomEvent(CART_CLEARED));
}

export function onCartCleared(handler: () => void): () => void {
  const listener = () => handler();
  window.addEventListener(CART_CLEARED, listener);
  return () => window.removeEventListener(CART_CLEARED, listener);
}
