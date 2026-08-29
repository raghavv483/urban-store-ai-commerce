import { redirect } from "next/navigation";
import Link from "next/link";
import { requireMerchantAdmin, ForbiddenError, UnauthorizedError } from "@/auth/session";

export const metadata = { title: "Merchant · Urban Store" };

export default async function MerchantPage() {
  let session;
  try {
    session = await requireMerchantAdmin();
  } catch (error) {
    // The route matcher in `middleware.ts` already forces sign-in for
    // `/merchant(.*)`, so `UnauthorizedError` should be rare here — it can
    // still happen if session sync itself fails (see
    // `resolveSessionContextSafely`). `ForbiddenError` is the expected case:
    // a signed-in customer who is not the merchant admin. Both are handled
    // the same way — bounce to the storefront rather than showing a raw
    // error — since neither is a bug the visitor can do anything about.
    if (error instanceof ForbiddenError || error instanceof UnauthorizedError) {
      redirect("/shop");
    }
    throw error;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Merchant admin</h1>
      <p className="mt-2 text-muted-foreground">
        You are signed in with merchant admin access.
      </p>

      <dl className="mt-8 divide-y rounded-lg border">
        <div className="flex justify-between px-4 py-3 text-sm">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="font-medium">{session.email}</dd>
        </div>
        <div className="flex justify-between px-4 py-3 text-sm">
          <dt className="text-muted-foreground">Role</dt>
          <dd className="font-medium">{session.role}</dd>
        </div>
      </dl>

      <p className="mt-8 text-sm">
        <Link href="/shop" className="underline hover:no-underline">
          ← Back to shop
        </Link>
      </p>
    </main>
  );
}
