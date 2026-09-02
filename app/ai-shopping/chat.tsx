"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ProductCard } from "@/components/product-card";
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

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;

    const userTurn: Turn = { id: crypto.randomUUID(), role: "user", text: message };
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
            <div className="py-10">
              <h1 className="text-3xl font-semibold tracking-tight">
                What are you shopping for?
              </h1>
              <p className="mt-2 text-muted-foreground">
                Ask about products, stock, returns, warranty or delivery. I answer
                policy questions only from Urban Store&apos;s own documents.
              </p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {OPENERS.map((o) => (
                  <button
                    key={o}
                    onClick={() => send(o)}
                    className="rounded-lg border px-4 py-3 text-left text-sm transition-colors hover:bg-muted"
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {turns.map((turn) =>
                turn.role === "user" ? (
                  <div key={turn.id} className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-foreground px-4 py-2.5 text-sm text-background">
                      {turn.text}
                    </div>
                  </div>
                ) : (
                  <div key={turn.id} className="space-y-3">
                    {turn.pending ? (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Dot delay="0ms" />
                        <Dot delay="150ms" />
                        <Dot delay="300ms" />
                      </div>
                    ) : (
                      <p className="max-w-[85%] text-[15px] leading-relaxed">
                        {turn.text}
                      </p>
                    )}

                    {turn.products && turn.products.length > 0 ? (
                      <div className="grid gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-3">
                        {turn.products.map((p) => (
                          <ProductCard key={p.slug} product={p} compact />
                        ))}
                      </div>
                    ) : null}

                    {turn.checkoutCartId ? (
                      <a
                        href={`/checkout?cartId=${turn.checkoutCartId}`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3.5 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
                      >
                        Go to checkout
                        <span aria-hidden="true">&rarr;</span>
                      </a>
                    ) : null}

                    {turn.sources && turn.sources.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Source
                        {turn.sources.length > 1 ? "s" : ""}:{" "}
                        {turn.sources.map((s) => s.title).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                ),
              )}
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t bg-background">
        <div className="mx-auto w-full max-w-3xl px-6 py-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2 rounded-2xl border bg-background p-2 shadow-sm focus-within:ring-1 focus-within:ring-foreground/20"
          >
            <textarea
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
              className="max-h-32 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-muted-foreground"
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity disabled:opacity-40"
            >
              Send
            </button>
          </form>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {cartId ? (
              <>
                Cart active ·{" "}
                <Link href={`/checkout?cartId=${cartId}`} className="underline">
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

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-current"
      style={{ animationDelay: delay }}
    />
  );
}
