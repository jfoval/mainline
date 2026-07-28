"use client";

import { useState } from "react";
import { getSupabase, isSupabaseEnabled } from "@/lib/supabase/client";

/**
 * Support / feature-request form. Writes straight to the `feedback` table (RLS: own rows only);
 * the row is the ticket — an email notification layer arrives with the custom-domain session.
 * Direct network write by design (no offline queue): feedback is a conversation with the
 * maintainer, not part of the trusted GTD system, so a clear "try again online" is honest.
 */
export function FeedbackForm() {
  const [kind, setKind] = useState<"support" | "feature">("support");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tickets live in the backend — the offline/self-host build has no inbox to send to.
  if (!isSupabaseEnabled()) {
    return <p className="text-sm text-muted">Feedback is available in the hosted (signed-in) app.</p>;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !message.trim()) return;
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase()
      .from("feedback")
      .insert({ kind, message: message.trim().slice(0, 4000) });
    setBusy(false);
    if (err) {
      setError("Couldn't send — check your connection and try again.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-[15px]">
          Got it — thank you. {kind === "feature" ? "Every idea gets read." : "I'll take a look."}
        </p>
        <button
          type="button"
          onClick={() => {
            setSent(false);
            setMessage("");
          }}
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted transition-colors hover:border-border-strong hover:text-foreground"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setKind("support")}
          aria-pressed={kind === "support"}
          className={
            kind === "support"
              ? "rounded-full border border-accent px-4 py-1.5 text-sm text-accent-link"
              : "rounded-full border border-border px-4 py-1.5 text-sm text-muted transition-colors hover:text-foreground"
          }
        >
          Something&apos;s wrong
        </button>
        <button
          type="button"
          onClick={() => setKind("feature")}
          aria-pressed={kind === "feature"}
          className={
            kind === "feature"
              ? "rounded-full border border-accent px-4 py-1.5 text-sm text-accent-link"
              : "rounded-full border border-border px-4 py-1.5 text-sm text-muted transition-colors hover:text-foreground"
          }
        >
          Feature idea
        </button>
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={6}
        placeholder={
          kind === "support"
            ? "What happened? What did you expect instead?"
            : "What would make Mainline better for you?"
        }
        aria-label="Your message"
        className="w-full resize-none rounded-[10px] border border-border bg-surface p-3 text-[15px] leading-relaxed outline-none placeholder:text-muted focus:border-border-strong"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={busy || !message.trim()}
        className="btn-accent self-start rounded-lg px-5 py-2.5 font-medium"
      >
        {busy ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
