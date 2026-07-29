/**
 * The app's navigation shape, in a plain (non-"use client") module so BOTH server components
 * (the /more page) and client components (MainNav, BottomNav) can read the actual arrays —
 * importing data from a client module across the boundary yields a proxy, not the value.
 *
 * Seven is the ceiling for a thumb-reachable tab bar, so everything below daily use lives one
 * tap deeper on /more.
 */
export const NAV_ITEMS = [
  { href: "/", label: "Capture" },
  { href: "/inbox", label: "Inbox" },
  { href: "/next", label: "Next" },
  { href: "/projects", label: "Projects" },
  { href: "/waiting", label: "Waiting" },
  { href: "/review", label: "Review" },
  { href: "/more", label: "More" },
] as const;

export const MORE_ITEMS = [
  { href: "/someday", label: "Someday / Maybe", hint: "Things you might do, kept safe." },
  { href: "/reference", label: "Reference", hint: "Where things live, not the things." },
  { href: "/horizons", label: "Horizons", hint: "Purpose, vision, goals, areas of focus." },
  { href: "/contexts", label: "Contexts", hint: "Your @home, @errands, @anyone list." },
  { href: "/guides", label: "Guides", hint: "How the app works, the method, and installing it." },
] as const;
