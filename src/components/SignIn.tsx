"use client";

import { useState } from "react";
import { sendMagicLink } from "@/lib/supabase/auth";

/**
 * Passwordless sign-in. Enter email → magic link → back into the app. Shown by AuthGate whenever
 * the backend is configured but there's no session.
 */
export function SignIn() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const addr = email.trim();
    if (!addr || busy) return;
    setBusy(true);
    setError(null);
    const err = await sendMagicLink(addr);
    setBusy(false);
    if (err) setError(err);
    else setSent(true);
  }

  if (sent) {
    return (
      <div className="mx-auto flex max-w-sm flex-1 flex-col justify-center gap-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="text-sm text-muted">
          We sent a sign-in link to <span className="text-foreground">{email.trim()}</span>. Open it
          on this device to continue.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-2 text-sm text-accent-link underline-offset-4 hover:underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-sm flex-1 flex-col justify-center gap-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to Mainline</h1>
        <p className="mt-1 text-sm text-muted">
          Sync your captures across devices. No password — we email you a link.
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email address"
          className="rounded-[10px] border border-border bg-surface px-3 py-2.5 text-base outline-none placeholder:text-muted focus:border-border-strong"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="btn-accent rounded-lg px-5 py-2.5 font-medium"
        >
          {busy ? "Sending…" : "Send magic link"}
        </button>
      </form>
    </div>
  );
}
