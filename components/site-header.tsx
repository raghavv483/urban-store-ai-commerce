import Link from "next/link";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { getSessionContext } from "@/auth/session";
import { getActiveCartSummary } from "@/app/shop/actions";

export async function SiteHeader() {
  const [session, cart] = await Promise.all([
    getSessionContext(),
    getActiveCartSummary(),
  ]);

  return (
    <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
        <Link
          href="/shop"
          className="text-[17px] font-bold tracking-tight transition-opacity hover:opacity-70"
        >
          Urban Store
        </Link>

        <nav className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/shop"
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Shop
          </Link>

          {/*
            The conversational storefront is the whole point of this project and
            was previously reachable only by typing the URL. It gets the visual
            weight of a primary action, not a nav link.
          */}
          <Link
            href="/ai-shopping"
            className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            <SparkIcon />
            <span className="hidden sm:inline">Shop with AI</span>
            <span className="sm:hidden">AI</span>
          </Link>

          {cart && cart.itemCount > 0 ? (
            <Link
              href={`/checkout?cartId=${cart.cartId}`}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted"
            >
              <CartIcon />
              <span className="tabular-nums">{cart.itemCount}</span>
              <span className="sr-only">items in cart, go to checkout</span>
            </Link>
          ) : null}

          {session?.role === "merchant_admin" ? (
            <Link
              href="/merchant"
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Merchant
            </Link>
          ) : null}

          <Show when="signed-in">
            <UserButton />
          </Show>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted">
                Sign in
              </button>
            </SignInButton>
          </Show>
        </nav>
      </div>
    </header>
  );
}

function SparkIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0l1.6 4.6L14 6.2l-4.4 1.6L8 12.4 6.4 7.8 2 6.2l4.4-1.6L8 0zM13 10l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1.5 1.5h1.8l1.5 8h7.2l1.5-5.5H4.4" />
      <circle cx="6.5" cy="13" r="1.1" />
      <circle cx="12" cy="13" r="1.1" />
    </svg>
  );
}
