import Link from "next/link";
import { NextActionsList } from "@/components/NextActionsList";

export default function NextActionsPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Next Actions</h1>
          <p className="mt-1 text-sm text-muted">
            What you can actually do right now, grouped by context.
          </p>
        </div>
        <Link
          href="/contexts"
          className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-border-strong hover:text-foreground"
        >
          Edit contexts
        </Link>
      </div>
      <NextActionsList />
    </div>
  );
}
