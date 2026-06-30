"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Capture" },
  { href: "/inbox", label: "Inbox" },
];

/** Header nav. The active route is the only blue here; inactive items stay monochrome. */
export function MainNav() {
  const raw = usePathname();
  const path = raw.replace(/\/+$/, "") || "/"; // normalize trailingSlash

  return (
    <div className="flex items-center gap-1 text-sm">
      {items.map((it) => {
        const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded-md px-3 py-1.5 text-accent-link"
                : "rounded-md px-3 py-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            }
          >
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
