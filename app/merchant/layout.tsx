import { guardMerchantPage } from "@/auth/merchant-guard";
import { NavTabs } from "./nav-tabs";

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
      <header className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div>
            <div className="text-eyebrow uppercase text-primary">
              Merchant console
            </div>
            <h1 className="mt-1.5 text-title">Urban Store</h1>
          </div>
          <div className="flex items-center gap-2.5 rounded-full border bg-card py-1.5 pl-1.5 pr-3.5">
            <span
              aria-hidden="true"
              className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
            >
              {session.email.slice(0, 1).toUpperCase()}
            </span>
            <span className="text-meta text-muted-foreground">
              {session.email}
            </span>
          </div>
        </div>
        <NavTabs tabs={TABS} />
      </header>
      {children}
    </div>
  );
}
