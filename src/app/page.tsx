import Link from "next/link";
import { CaptureBox } from "@/components/CaptureBox";

export default function CapturePage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Capture</h1>
        <p className="mt-1 text-sm text-muted">
          Get it out of your head. It saves instantly — even offline.
        </p>
      </div>
      <CaptureBox />
      <p className="text-sm text-muted">
        Everything lands in your{" "}
        <Link href="/inbox" className="text-accent-link underline-offset-4 hover:underline">
          inbox
        </Link>
        .
      </p>
    </div>
  );
}
