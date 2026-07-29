"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";

/** Header nav. The active route is the only blue here; inactive items stay monochrome. */
export function MainNav() {
  const raw = usePathname();
  const path = raw.replace(/\/+$/, "") || "/"; // normalize trailingSlash

  return (
    <div className="flex items-center gap-1 text-sm">
      {NAV_ITEMS.map((it) => {
        const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "whitespace-nowrap rounded-md px-2.5 py-1.5 text-accent-link"
                : "whitespace-nowrap rounded-md px-2.5 py-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            }
          >
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
