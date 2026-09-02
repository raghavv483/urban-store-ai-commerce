"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Script from "next/script";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { beginCheckout, getCheckoutStatus } from "./actions";
import { announceCartCleared } from "@/lib/cart-events";
import { motion, AnimatePresence, EASE, pressable } from "@/components/motion";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

type Phase =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  /** Razorpay reported success in the browser. That is NOT proof of payment. */
  | { kind: "confirming"; orderId: string }
  | { kind: "paid" }
  | { kind: "failed"; message: string }
  /** Webhook did not arrive in time. Neither confirmed nor denied. */
  | { kind: "unconfirmed"; orderId: string }
  | { kind: "dismissed" };

/** Poll cadence for the webhook. ~40s total, which covers a slow tunnel. */
const POLL_MS = 2000;
const POLL_LIMIT = 20;

/**
 * The customer's Pay action.
 *
 * One button, not a numbered harness: it starts the checkout server-side and
 * opens Razorpay with the order the server created. The browser never supplies
 * an amount — `beginCheckout` re-prices the cart in the database and Razorpay
 * bills against that server-created order.
 *
 * After Razorpay's in-page callback fires the component polls the server until
 * the signed webhook settles the order. That poll is what drives every piece of
 * "payment finished" UI, including emptying the header cart badge: payment can
 * complete inside a popup with no navigation, so nothing else would ever tell
 * the header its cart is gone.
 *
 * The three outcomes are kept distinct on purpose. Only a confirmed `paid`
 * clears the cart; a `failed` says nothing was charged; a webhook that never
 * arrives says exactly that rather than guessing in either direction.
 */
export function PayButton({
  cartId,
  totalDisplay,
  disabled,
  disabledReason,
}: {
  cartId: string;
  totalDisplay: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const router = useRouter();

  // Survives re-renders so a stray second poll loop can't start.
  const polling = useRef(false);

  const settle = useCallback(
    (next: Phase) => {
      polling.current = false;
      setPhase(next);
      if (next.kind === "paid") {
        // The same transaction that marked the order paid closed the cart, so
        // the badge can now empty. Announce first for an instant header update,
        // then refresh so the server's own count agrees on the next render.
        announceCartCleared();
        router.refresh();
      }
    },
    [router],
  );

  useEffect(() => {
    if (phase.kind !== "confirming") return;

    const orderId = phase.orderId;
    polling.current = true;
    let tries = 0;

    const timer = setInterval(async () => {
      if (!polling.current) return;
      tries += 1;

      const res = await getCheckoutStatus(orderId);
      if (!polling.current) return;

      if (res.ok && res.status === "paid") {
        settle({ kind: "paid" });
        return;
      }
      if (res.ok && res.status === "failed") {
        settle({ kind: "failed", message: res.message });
        return;
      }
      if (tries >= POLL_LIMIT) {
        settle({ kind: "unconfirmed", orderId });
      }
    }, POLL_MS);

    return () => {
      polling.current = false;
      clearInterval(timer);
    };
  }, [phase, settle]);

  function pay() {
    setPhase({ kind: "idle" });
    startTransition(async () => {
      const res = await beginCheckout(cartId);
      if (!res.ok) {
        setPhase({ kind: "error", message: res.message });
        return;
      }

      if (!window.Razorpay) {
        setPhase({
          kind: "error",
          message:
            "Payment window is still loading. Give it a moment and try again.",
        });
        return;
      }

      const rzp = new window.Razorpay({
        key: res.razorpayKeyId,
        order_id: res.razorpayOrderId,
        name: "Urban Store",
        description: `Order ${res.orderId}`,
        handler: () => setPhase({ kind: "confirming", orderId: res.orderId }),
        modal: {
          // Only a dismissal with nothing in flight means "changed my mind" —
          // closing the sheet after paying must not overwrite the confirmation.
          ondismiss: () =>
            setPhase((p) =>
              p.kind === "confirming" ? p : { kind: "dismissed" },
            ),
        },
        theme: { color: "#49389c" },
      });
      rzp.open();
    });
  }

  if (disabled) {
    return (
      <button
        disabled
        className="w-full cursor-not-allowed rounded-lg border bg-muted/50 px-4 py-3 text-body font-medium text-muted-foreground"
      >
        {disabledReason ?? "Checkout unavailable"}
      </button>
    );
  }

  // Once paid the cart is gone; offering "Pay" again would only error.
  if (phase.kind === "paid") {
    return (
      <div>
        <div className="rounded-lg border border-emerald-300/60 bg-emerald-50 p-4 text-center dark:border-emerald-500/30 dark:bg-emerald-950/40">
          <Tick />
          <p className="mt-2 text-heading text-emerald-800 dark:text-emerald-300">
            Payment confirmed
          </p>
          <p className="mt-1 text-meta text-emerald-800/80 dark:text-emerald-300/80">
            Confirmed by Razorpay&apos;s signed webhook, not by the browser.
          </p>
        </div>
        <Link
          href="/shop"
          className="mt-3 block rounded-lg border bg-card px-4 py-2.5 text-center text-meta font-medium transition-colors hover:bg-muted"
        >
          Continue shopping
        </Link>
      </div>
    );
  }

  const busy = pending || phase.kind === "confirming";

  return (
    <div>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
      />

      <motion.button
        {...pressable}
        onClick={pay}
        disabled={busy}
        className="w-full rounded-lg bg-primary px-4 py-3 text-body font-medium text-primary-foreground transition-opacity disabled:opacity-60"
      >
        {pending
          ? "Preparing your order…"
          : phase.kind === "confirming"
            ? "Confirming payment…"
            : `Pay ${totalDisplay}`}
      </motion.button>

      <AnimatePresence mode="wait">
        {phase.kind === "error" ? (
          <Note key="err" tone="error">
            {phase.message}
          </Note>
        ) : phase.kind === "failed" ? (
          <Note key="failed" tone="error">
            {phase.message} Your cart is still here, so you can try again.
          </Note>
        ) : phase.kind === "confirming" ? (
          <Note key="conf" tone="muted">
            Payment submitted. Waiting for Razorpay&apos;s signed webhook — your
            order is only confirmed once that arrives.
          </Note>
        ) : phase.kind === "unconfirmed" ? (
          <Note key="unconf" tone="muted">
            Still waiting on Razorpay&apos;s webhook for order {phase.orderId}.
            Nothing is lost — the order settles as soon as it arrives, and the
            merchant dashboard will show the outcome.
          </Note>
        ) : phase.kind === "dismissed" ? (
          <Note key="dis" tone="muted">
            Payment window closed. Nothing was charged — your cart is still
            here.
          </Note>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Tick() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="mx-auto h-7 w-7 text-emerald-600 dark:text-emerald-400"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
      <motion.path
        d="M7.5 12.5l3 3 6-6"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.35, ease: EASE }}
      />
    </svg>
  );
}

function Note({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "ok" | "error" | "muted";
}) {
  const cls =
    tone === "error"
      ? "border-destructive/30 bg-destructive/5 text-destructive"
      : tone === "ok"
        ? "border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300"
        : "border-border bg-muted/50 text-muted-foreground";

  return (
    <motion.p
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22, ease: EASE }}
      className="overflow-hidden"
    >
      <span
        className={`mt-3 block rounded-lg border px-3 py-2.5 text-meta leading-relaxed ${cls}`}
      >
        {children}
      </span>
    </motion.p>
  );
}
