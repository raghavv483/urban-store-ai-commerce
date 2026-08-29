"use client";

import { useState, useTransition } from "react";
import Script from "next/script";
import { createTestCart, startCheckout, type ActionResult } from "./actions";

type CheckoutData = {
  orderId: string;
  razorpayOrderId: string;
  amountInPaise: number;
  razorpayKeyId: string;
  reused: boolean;
  priceDrift: boolean;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export function SpineControls({ activeCartId }: { activeCartId: string | null }) {
  const [pending, startTransition] = useTransition();
  const [log, setLog] = useState<string[]>([]);
  const [checkout, setCheckout] = useState<CheckoutData | null>(null);

  const say = (line: string) =>
    setLog((prev) => [`${new Date().toLocaleTimeString()}  ${line}`, ...prev].slice(0, 12));

  const handle = (label: string, fn: () => Promise<ActionResult>) => {
    startTransition(async () => {
      say(`${label}…`);
      const res = await fn();
      say(res.ok ? `✅ ${res.message}` : `❌ ${res.message}${res.code ? ` [${res.code}]` : ""}`);
      if (res.ok && res.data && "razorpayOrderId" in res.data) {
        setCheckout(res.data as unknown as CheckoutData);
      }
    });
  };

  function openRazorpay() {
    if (!checkout) return;
    if (!window.Razorpay) {
      say("❌ Razorpay script not loaded yet — wait a second and retry.");
      return;
    }
    // The amount shown here comes from the server response, which came from the
    // DB cart. The browser cannot change what is charged: Razorpay bills against
    // the order created server-side.
    const rzp = new window.Razorpay({
      key: checkout.razorpayKeyId,
      order_id: checkout.razorpayOrderId,
      name: "Urban Store",
      description: `Order ${checkout.orderId}`,
      handler: () => {
        say("Razorpay reported success in the browser. This is NOT proof of payment —");
        say("the order only becomes paid when the signed webhook arrives. Refresh below.");
      },
      modal: {
        ondismiss: () => say("Checkout dismissed. Order stays pending; nothing charged."),
      },
      theme: { color: "#111827" },
    });
    rzp.open();
  }

  return (
    <div className="space-y-4">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handle("Creating test cart", createTestCart)}
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          1. Create test cart
        </button>

        <button
          onClick={() =>
            activeCartId
              ? handle("Starting checkout", () => startCheckout(activeCartId))
              : say("❌ No active cart. Create one first.")
          }
          disabled={pending || !activeCartId}
          className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          2. Start checkout (steps 1–5)
        </button>

        <button
          onClick={() =>
            activeCartId
              ? handle("Starting checkout AGAIN", () => startCheckout(activeCartId))
              : say("❌ No active cart.")
          }
          disabled={pending || !activeCartId}
          className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          2b. Checkout again (must reuse)
        </button>

        <button
          onClick={openRazorpay}
          disabled={!checkout}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          3. Pay with Razorpay
        </button>

        <button
          onClick={() => window.location.reload()}
          className="rounded-md border px-4 py-2 text-sm font-medium"
        >
          Refresh state
        </button>
      </div>

      {checkout ? (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <div className="font-medium">
            Order {checkout.orderId} {checkout.reused ? "(reused — idempotent)" : "(new)"}
          </div>
          <div className="text-muted-foreground">
            Razorpay order {checkout.razorpayOrderId} · ₹
            {(checkout.amountInPaise / 100).toLocaleString("en-IN")}
            {checkout.priceDrift ? " · price changed since item was added" : ""}
          </div>
        </div>
      ) : null}

      {log.length > 0 ? (
        <pre className="max-h-56 overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">
          {log.join("\n")}
        </pre>
      ) : null}
    </div>
  );
}
