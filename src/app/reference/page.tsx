import type { Metadata } from "next";
import { ReferenceIndex } from "@/components/ReferenceIndex";

export const metadata: Metadata = {
  title: "Reference",
  // Private screen — nothing here for a crawler (see app/robots.ts).
  robots: { index: false, follow: false },
};

export default function ReferencePage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reference</h1>
        <p className="mt-1 text-sm text-muted">
          Where things live, not the things themselves. One searchable line each.
        </p>
      </div>
      <ReferenceIndex />
    </div>
  );
}
