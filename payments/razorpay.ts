import "server-only";
import Razorpay from "razorpay";
import { env } from "@/lib/env";

/**
 * Razorpay client. Server-only: RAZORPAY_KEY_SECRET must never reach the browser.
 * The browser only ever sees NEXT_PUBLIC_RAZORPAY_KEY_ID, which is the public key id.
 */
let client: Razorpay | null = null;

export function razorpay(): Razorpay {
  client ??= new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });
  return client;
}

/** Razorpay rejects receipts longer than 40 chars. */
export function toReceipt(orderId: string): string {
  return orderId.slice(0, 40);
}
