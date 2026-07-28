import { SomedayList } from "@/components/SomedayList";

export default function SomedayPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Someday / Maybe</h1>
        <p className="mt-1 text-sm text-muted">
          Not now, maybe later. Nothing here is lost — reactivate anything when its time comes.
        </p>
      </div>
      <SomedayList />
    </div>
  );
}
