import Link from "next/link";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { getSessionContext } from "@/auth/session";

export async function SiteHeader() {
  const session = await getSessionContext();

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/shop" className="text-lg font-bold tracking-tight">
          Urban Store
        </Link>

        <nav className="flex items-center gap-6">
          <Link href="/shop" className="text-sm hover:underline">
            Shop
          </Link>

          {session?.role === "merchant_admin" ? (
            <Link href="/merchant" className="text-sm font-medium hover:underline">
              Merchant
            </Link>
          ) : null}

          <Show when="signed-in">
            <UserButton />
          </Show>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                Sign in
              </button>
            </SignInButton>
          </Show>
        </nav>
      </div>
    </header>
  );
}
