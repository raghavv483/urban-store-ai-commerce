import Link from "next/link";
import { guardMerchantPage } from "@/auth/merchant-guard";

export const dynamic = "force-dynamic";

const TABS = [
  { href: "/merchant", label: "Overview" },
  { href: "/merchant/orders", label: "Orders" },
  { href: "/merchant/campaigns", label: "Campaigns" },
  { href: "/merchant/agent-activity", label: "Agent activity" },
];

export default async function MerchantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Gate the shell too, so a non-admin never sees the merchant chrome flash
  // before a page redirects them.
  const session = await guardMerchantPage();

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="border-b pb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Urban Store · Merchant</h1>
          <span className="text-sm text-muted-foreground">{session.email}</span>
        </div>
        <nav className="mt-4 flex gap-1" aria-label="Merchant sections">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
