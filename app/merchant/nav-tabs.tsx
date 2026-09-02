"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "@/components/motion";

/**
 * Merchant section tabs.
 *
 * The active marker is a single shared element (`layoutId`), so switching tabs
 * slides it rather than cross-fading two underlines. That is the one place on
 * the dashboard where motion carries information: it shows where you came from.
 */
export function NavTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav className="-mb-px mt-5 flex gap-1" aria-label="Merchant sections">
      {tabs.map((t) => {
        // "/merchant" must not match every child route.
        const active =
          t.href === "/merchant"
            ? pathname === "/merchant"
            : pathname.startsWith(t.href);

        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`relative rounded-t-md px-3 py-2 text-meta transition-colors ${
              active
                ? "text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            {t.label}
            {active ? (
              <motion.span
                layoutId="merchant-tab-underline"
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
