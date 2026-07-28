import { FeedbackForm } from "@/components/FeedbackForm";

export default function HelpPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Help & feedback</h1>
        <p className="mt-1 text-sm text-muted">
          Hit a problem, or wish Mainline did something it doesn&apos;t? Tell me — it goes
          straight to the person building this.
        </p>
      </div>
      <FeedbackForm />
    </div>
  );
}
