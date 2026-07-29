import type { Metadata } from "next";
import { ContextsManager } from "@/components/ContextsManager";

export const metadata: Metadata = {
  title: "Contexts",
  // Private screen — nothing here for a crawler (see app/robots.ts).
  robots: { index: false, follow: false },
};

export default function ContextsPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contexts</h1>
        <p className="mt-1 text-sm text-muted">
          Where you can do things, or with whom: @computer, @errands, a person you meet with.
          Everyone buckets differently; keep as few as your life actually needs.
        </p>
      </div>
      <ContextsManager />
    </div>
  );
}
