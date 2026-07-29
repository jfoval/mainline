import type { Metadata } from "next";
import { HorizonsEditor } from "@/components/HorizonsEditor";

export const metadata: Metadata = {
  title: "Horizons",
  // Private screen — nothing here for a crawler (see app/robots.ts).
  robots: { index: false, follow: false },
};

export default function HorizonsPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Horizons</h1>
        <p className="mt-1 text-sm text-muted">
          The altitudes above your projects. Write them in your own words. The first review of
          each month puts them next to your project list and asks whether they still agree.
        </p>
      </div>
      <HorizonsEditor />
    </div>
  );
}
