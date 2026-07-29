import type { Metadata } from "next";
import Link from "next/link";
import { FeedbackForm } from "@/components/FeedbackForm";
import { GUIDES } from "@/lib/guides";

export const metadata: Metadata = {
  title: "Help",
  // Private screen — nothing here for a crawler (see app/robots.ts).
  robots: { index: false, follow: false },
};

/** Help first (the guides), feedback second — in that order, because most "help" turns out to
 *  be "nobody told me how this works", and the guides are otherwise only on the signed-out page. */
export default function HelpPage() {
  return (
    <div className="flex flex-1 flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Help &amp; feedback</h1>
        <p className="mt-1 text-sm text-muted">
          Start with the guides. If that doesn&apos;t answer it, tell me below.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">How Mainline works</h2>
        <ul className="mt-1 flex flex-col divide-y divide-border rounded-[10px] border border-border bg-surface">
          {GUIDES.map((g) => (
            <li key={g.href}>
              <Link href={g.href} className="block px-4 py-3 transition-colors hover:bg-surface-2">
                <span className="text-[15px]">{g.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{g.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <h2 className="text-lg font-medium">Something wrong, or missing?</h2>
        <p className="text-sm text-muted">
          Tell me. It goes straight to the person building this.
        </p>
        <FeedbackForm />
      </section>
    </div>
  );
}
