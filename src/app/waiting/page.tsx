import { WaitingList } from "@/components/WaitingList";

export default function WaitingPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Waiting For</h1>
        <p className="mt-1 text-sm text-muted">
          Delegated or blocked — someone else&apos;s move, oldest first.
        </p>
      </div>
      <WaitingList />
    </div>
  );
}
