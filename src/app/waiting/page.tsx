import type { Metadata } from "next";
import { WaitingList } from "@/components/WaitingList";

export const metadata: Metadata = {
  title: "Waiting For",
  // Private screen — nothing here for a crawler (see app/robots.ts).
  robots: { index: false, follow: false },
};

export default function WaitingPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Waiting For</h1>
        <p className="mt-1 text-sm text-muted">
          Delegated or blocked: someone else&apos;s move, oldest first.
        </p>
      </div>
      <WaitingList />
    </div>
  );
}
