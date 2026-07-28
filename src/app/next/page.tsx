import { NextActionsList } from "@/components/NextActionsList";

export default function NextActionsPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Next Actions</h1>
        <p className="mt-1 text-sm text-muted">
          What you can actually do right now, grouped by context.
        </p>
      </div>
      <NextActionsList />
    </div>
  );
}
