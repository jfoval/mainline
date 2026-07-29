"use client";

import { useState } from "react";
import Link from "next/link";
import { sendMagicLink, verifyEmailCode, verifyEmailLink } from "@/lib/supabase/auth";

/**
 * Passwordless sign-in. Enter email → magic link OR the 6-digit code from the same email.
 * The code path matters on installed (home-screen) apps: iOS keeps their storage separate
 * from Safari, so a tapped link signs in the browser — only the typed code signs in the app
 * itself. Shown by AuthGate whenever the backend is configured but there's no session.
 * On success the session lands via onAuthStateChange and AuthGate swaps to the app.
 */
export function SignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
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

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const entered = code.trim();
    if (busy || entered.length < 6) return;
    setBusy(true);
    setError(null);
    // One smart box: a pasted sign-in LINK (the installed-app path — iOS can't open links
    // inside home-screen apps) or, once the email template carries it, the 6-digit code.
    const err = entered.includes("token=")
      ? await verifyEmailLink(entered)
      : await verifyEmailCode(email, entered);
    setBusy(false);
    if (err) setError(err);
  }

  if (sent) {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="text-sm text-muted">
          We emailed <span className="text-foreground">{email.trim()}</span> a six-digit code and
          a link. <span className="text-foreground">Type the code below</span>. That works
          everywhere, including the installed app. Tapping the link works too, in a browser.
        </p>
        <form onSubmit={verify} className="flex flex-col gap-3">
          <input
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6-digit code (or paste the link)"
            aria-label="Sign-in code or link"
            className="rounded-[10px] border border-border bg-surface px-3 py-2.5 text-center text-[15px] outline-none placeholder:text-muted focus:border-border-strong"
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={busy || code.trim().length < 6}
            className="btn-accent rounded-lg px-5 py-2.5 font-medium"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setSent(false);
            setCode("");
            setError(null);
          }}
          className="mt-2 text-sm text-accent-link underline-offset-4 hover:underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-sm flex-1 flex-col justify-center gap-6 py-8">
      {/* The landing page and the sign-in page are the same page on purpose: a stranger gets one
          clear line, one paragraph and a way in — nothing to scroll past, nothing to close. */}
      <div className="text-center">
        <h1 className="text-3xl font-semibold leading-tight tracking-tight">
          Get everything out of your head.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Mainline catches whatever you&apos;re carrying, in a tap and even offline, then helps you
          decide what each thing actually is, so you only ever look at what you can do right now.
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
          {busy ? "Sending…" : "Send me a sign-in code"}
        </button>
        <p className="text-center text-xs text-tertiary">
          No password. We email you a code (and a link) each time you sign in on a new device.
        </p>
      </form>

      <div className="flex items-center justify-center gap-5 text-sm">
        <Link href="/setup" className="text-accent-link underline-offset-4 hover:underline">
          How to set up
        </Link>
        <Link href="/guide" className="text-accent-link underline-offset-4 hover:underline">
          How it works
        </Link>
      </div>
    </div>
  );
}
