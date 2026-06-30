import Link from "next/link";
import { InboxList } from "@/components/InboxList";
import { ResetLocalDataButton } from "@/components/ResetLocalDataButton";

export default function InboxPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
          <p className="mt-1 text-sm text-muted">Everything you&apos;ve captured, newest first.</p>
        </div>
        <Link
          href="/"
          className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
        >
          + Capture
        </Link>
      </div>
      <InboxList />
      <div className="mt-auto flex justify-end pt-4">
        <ResetLocalDataButton />
      </div>
    </div>
  );
}
