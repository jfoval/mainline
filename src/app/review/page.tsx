import type { Metadata } from "next";
import { WeeklyReview } from "@/components/WeeklyReview";

export const metadata: Metadata = {
  title: "Weekly Review",
  // Private screen — nothing here for a crawler (see app/robots.ts).
  robots: { index: false, follow: false },
};

export default function ReviewPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Weekly Review</h1>
        <p className="mt-1 text-sm text-muted">
          Twenty quiet minutes that keep the whole system trustworthy.
        </p>
      </div>
      <WeeklyReview />
    </div>
  );
}
