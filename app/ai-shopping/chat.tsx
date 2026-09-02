"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { motion, AnimatePresence, EASE, pressable } from "@/components/motion";
import type { ProductListItem } from "@/types/product";

type Source = { title: string; docType: string };

type Turn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  products?: ProductListItem[];
  sources?: Source[];
  pending?: boolean;
  /** Set when this turn changed the cart, so checkout is one click away. */
  checkoutCartId?: string | null;
};

const OPENERS = [
  "Find me a laptop under ₹80,000",
  "Can I return it after 10 days?",
  "What accessories go with the MacBook Air M3?",
  "Best in-stock laptop for programming under ₹90,000",
];

export function Chat({ initialCartId }: { initialCartId: string | null }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [cartId, setCartId] = useState<string | null>(initialCartId);
  const threadId = useRef<string>(
    `thread-${Math.random().toString(36).slice(2)}-${Date.now()}`,
  );
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  // Grow the composer with the message instead of scrolling a one-line box.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;

    const userTurn: Turn = {
      id: crypto.randomUUID(),
      role: "user",
      text: message,
    };
    const pendingTurn: Turn = {
      id: crypto.randomUUID(),
      role: "assistant",
      text: "",
      pending: true,
    };
    setTurns((t) => [...t, userTurn, pendingTurn]);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, threadId: threadId.current, cartId }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Request failed.");
      if (data.cartId) setCartId(data.cartId);

      setTurns((t) =>
        t.map((turn) =>
          turn.id === pendingTurn.id
            ? {
                ...turn,
                pending: false,
                text: data.reply ?? "",
                products: (data.products ?? []).map(
                  (p: {
                    slug: string;
                    name: string;
                    category: string;
                    priceInPaise: number;
                    stock: number;
                  }) => ({
                    id: p.slug,
                    slug: p.slug,
                    name: p.name,
                    category: p.category,
                    priceInPaise: p.priceInPaise,
                    stock: p.stock,
                    imageUrl: null,
                  }),
                ),
                sources: data.sources ?? [],
                // A turn that put something in the cart offers checkout right
                // there, rather than making the shopper hunt for the footer link.
                checkoutCartId: (data.tools ?? []).includes("addToCart")
                  ? (data.cartId ?? null)
                  : null,
              }
            : turn,
        ),
      );
    } catch (error) {
      setTurns((t) =>
        t.map((turn) =>
          turn.id === pendingTurn.id
            ? {
                ...turn,
                pending: false,
                text:
                  error instanceof Error
                    ? error.message
                    : "Something went wrong. Nothing was charged.",
              }
            : turn,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-6 py-8">
          {turns.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="py-10"
            >
              <div className="text-eyebrow uppercase text-primary">
                Conversational commerce
              </div>
              <h1 className="mt-3 text-display">What are you shopping for?</h1>
              <p className="mt-3 max-w-xl text-body text-muted-foreground">
                Ask about products, stock, returns, warranty or delivery. I
                answer policy questions only from Urban Store&apos;s own
                documents.
              </p>

              <div className="mt-8 grid gap-2.5 sm:grid-cols-2">
                {OPENERS.map((o, i) => (
                  <motion.button
                    key={o}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.35,
                      ease: EASE,
                      delay: 0.08 + i * 0.05,
                    }}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => send(o)}
                    className="group flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3.5 text-left text-meta transition-colors hover:border-primary/40 hover:bg-primary/[0.04]"
                  >
                    <span>{o}</span>
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      &rarr;
                    </span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ) : (
            <div className="space-y-7">
              <AnimatePresence initial={false}>
                {turns.map((turn) =>
                  turn.role === "user" ? (
                    <motion.div
                      key={turn.id}
                      layout="position"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className="flex justify-end"
                    >
                      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-meta text-primary-foreground">
                        {turn.text}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={turn.id}
                      layout="position"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className="space-y-3.5"
                    >
                      {turn.pending ? (
                        <Thinking />
                      ) : (
                        <p className="max-w-[85%] whitespace-pre-wrap text-body">
                          {turn.text}
                        </p>
                      )}

                      {turn.products && turn.products.length > 0 ? (
                        <div className="grid gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-3">
                          {turn.products.map((p, i) => (
                            <motion.div
                              key={p.slug}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{
                                duration: 0.32,
                                ease: EASE,
                                delay: i * 0.05,
                              }}
                            >
                              <ProductCard product={p} compact />
                            </motion.div>
                          ))}
                        </div>
                      ) : null}

                      {turn.checkoutCartId ? (
                        <motion.a
                          {...pressable}
                          href={`/checkout?cartId=${turn.checkoutCartId}`}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-meta font-medium text-primary-foreground"
                        >
                          Go to checkout
                          <span aria-hidden="true">&rarr;</span>
                        </motion.a>
                      ) : null}

                      {turn.sources && turn.sources.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <span className="text-xs text-muted-foreground">
                            Source{turn.sources.length > 1 ? "s" : ""}
                          </span>
                          {turn.sources.map((s) => (
                            <span
                              key={s.title}
                              className="rounded-md border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground"
                            >
                              {s.title}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </motion.div>
                  ),
                )}
              </AnimatePresence>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t bg-background/80 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl px-6 py-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2 rounded-2xl border bg-card p-2 transition-shadow focus-within:border-primary/40 focus-within:shadow-[0_0_0_3px] focus-within:shadow-primary/10"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="Ask about products, returns, delivery…"
              className="max-h-40 flex-1 resize-none bg-transparent px-2 py-2 text-body outline-none placeholder:text-muted-foreground"
              disabled={busy}
            />
            <motion.button
              {...pressable}
              type="submit"
              disabled={busy || !input.trim()}
              className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-meta font-medium text-primary-foreground transition-opacity disabled:opacity-40"
            >
              Send
            </motion.button>
          </form>
          <p className="mt-2.5 text-center text-xs text-muted-foreground">
            {cartId ? (
              <>
                Cart active ·{" "}
                <Link
                  href={`/checkout?cartId=${cartId}`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  go to checkout
                </Link>
              </>
            ) : (
              "Policy answers come only from Urban Store's knowledge base."
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Thinking indicator. Three dots on a shared sine, offset in time — a small
 * signal that the request is alive, sized so it does not read as content.
 */
function Thinking() {
  return (
    <div className="flex items-center gap-1.5" aria-label="Thinking">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground"
          animate={{ opacity: [0.25, 1, 0.25], y: [0, -2.5, 0] }}
          transition={{
            duration: 1.1,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.15,
          }}
        />
      ))}
    </div>
  );
}
