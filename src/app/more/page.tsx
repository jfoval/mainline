import type { Metadata } from "next";
import Link from "next/link";
import { MORE_ITEMS } from "@/lib/nav";

export const metadata: Metadata = {
  title: "More",
  // Private screen — nothing here for a crawler (see app/robots.ts).
  robots: { index: false, follow: false },
};

/** Everything that isn't daily: the lists you visit on purpose rather than by habit. */
export default function MorePage() {
  const items = [...MORE_ITEMS];
  // Support tickets need the backend — same gate as the header's Help link.
  const helpAvailable =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">More</h1>
        <p className="mt-1 text-sm text-muted">The rest of your system.</p>
      </div>
      <ul className="flex flex-col divide-y divide-border rounded-[10px] border border-border bg-surface">
        {items.map((it) => (
          <li key={it.href}>
            <Link href={it.href} className="block px-4 py-3.5 transition-colors hover:bg-surface-2">
              <span className="text-[15px]">{it.label}</span>
              <span className="mt-0.5 block text-xs text-muted">{it.hint}</span>
            </Link>
          </li>
        ))}
        {helpAvailable && (
          <li>
            <Link href="/help" className="block px-4 py-3.5 transition-colors hover:bg-surface-2">
              <span className="text-[15px]">Help &amp; feedback</span>
              <span className="mt-0.5 block text-xs text-muted">
                Tell us what&apos;s broken or missing.
              </span>
            </Link>
          </li>
        )}
      </ul>
    </div>
  );
}
