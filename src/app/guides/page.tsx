import type { Metadata } from "next";
import Link from "next/link";
import { GUIDES } from "@/lib/guides";

export const metadata: Metadata = {
  title: "Guides",
  // A signpost for people already signed in; the guides it points to are the indexed pages.
  robots: { index: false, follow: true },
};

/** One door to all three guides, so they stay reachable once you're signed in. */
export default function GuidesPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Guides</h1>
        <p className="mt-1 text-sm text-muted">
          Short reads. None of them takes longer than a coffee.
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-border rounded-[10px] border border-border bg-surface">
        {GUIDES.map((g) => (
          <li key={g.href}>
            <Link href={g.href} className="block px-4 py-3.5 transition-colors hover:bg-surface-2">
              <span className="text-[15px]">{g.label}</span>
              <span className="mt-0.5 block text-xs text-muted">{g.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
