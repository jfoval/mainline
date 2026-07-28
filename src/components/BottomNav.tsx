"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./MainNav";

/**
 * Mobile/narrow navigation: a fixed bottom tab bar (thumb-reachable, app-standard). Rendered
 * below the `lg` breakpoint — the top nav row (6 sections + Help + Sign out when signed in)
 * only fits comfortably at lg+. The bar pads itself for the home-indicator safe area; the
 * page's <main> reserves matching bottom space so content never hides under it.
 */
export function BottomNav() {
  const raw = usePathname();
  const path = raw.replace(/\/+$/, "") || "/"; // normalize trailingSlash

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto flex w-full max-w-2xl items-stretch">
        {NAV_ITEMS.map((it) => {
          const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
          return (
            <li key={it.href} className="min-w-0 flex-1">
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-[10px] font-medium ${
                  active ? "text-accent-link" : "text-muted"
                }`}
              >
                <TabIcon name={it.label} />
                <span className="truncate">{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** 18px stroke icons, one per section — same visual family as the mic icon. */
function TabIcon({ name }: { name: (typeof NAV_ITEMS)[number]["label"] }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "Capture":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      );
    case "Inbox":
      return (
        <svg {...common}>
          <path d="M22 12h-6l-2 3h-4l-2-3H2" />
          <path d="M5.5 5h13l3.5 7v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5z" />
        </svg>
      );
    case "Next":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 12.5 2.5 2.5 4.5-5" />
        </svg>
      );
    case "Projects":
      return (
        <svg {...common}>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
      );
    case "Waiting":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "Someday":
      return (
        <svg {...common}>
          <path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z" />
        </svg>
      );
  }
}
