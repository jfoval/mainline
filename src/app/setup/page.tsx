import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Set up Mainline",
  description:
    "Install Mainline on your computer and phone and sign in with a one-time emailed code. Takes about two minutes.",
  alternates: { canonical: "/setup" },
  openGraph: {
    type: "article",
    siteName: "Mainline",
    title: "Set up Mainline",
    url: "/setup",
  },
};

export default function SetupPage() {
  return (
    <div className="flex flex-1 flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Set up Mainline</h1>
        <p className="mt-1 text-sm text-muted">
          About two minutes. You&apos;ll install Mainline on your computer and your phone so
          capturing something is always one tap away.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">1. Sign in</h2>
        <p className="text-[15px] text-muted">
          There is no password to remember. You get a one-time code by email each time you sign in
          on a new device.
        </p>
        <ol className="list-decimal space-y-2 pl-5 text-[15px] text-muted">
          <li>
            Go to{" "}
            <Link href="/" className="text-accent-link underline-offset-4 hover:underline">
              mainline.support
            </Link>
            .
          </li>
          <li>Type your email address and send the sign-in email.</li>
          <li>Open the email and find the 6-digit code (the same email also has a link).</li>
          <li>Type the code back into Mainline. You&apos;re in.</li>
        </ol>
        <p className="text-sm text-muted">
          The email can take a few seconds to arrive. Check your spam folder the first time, and
          mark it as not spam so later codes land in your inbox.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">2. Install it on your computer</h2>
        <p className="text-[15px] text-muted">
          Mainline is a web app that installs like a real one, with its own window and its own icon
          in your dock or taskbar.
        </p>
        <p className="text-[15px] text-foreground">Chrome or Edge</p>
        <ol className="list-decimal space-y-2 pl-5 text-[15px] text-muted">
          <li>Open mainline.support.</li>
          <li>
            Click the install icon at the right-hand end of the address bar. If you don&apos;t see
            it, use the ⋮ menu → <span className="text-foreground">Cast, save and share</span> →{" "}
            <span className="text-foreground">Install page as app</span>.
          </li>
          <li>Confirm. Mainline opens in its own window and lands in your dock or taskbar.</li>
        </ol>
        <p className="text-[15px] text-foreground">Safari on Mac</p>
        <p className="text-[15px] text-muted">
          Open mainline.support, then <span className="text-foreground">File</span> →{" "}
          <span className="text-foreground">Add to Dock</span>.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">3. Install it on your phone</h2>
        <p className="text-[15px] text-foreground">iPhone</p>
        <ol className="list-decimal space-y-2 pl-5 text-[15px] text-muted">
          <li>Open mainline.support in Safari.</li>
          <li>
            Tap <span className="text-foreground">Share</span> →{" "}
            <span className="text-foreground">Add to Home Screen</span> →{" "}
            <span className="text-foreground">Add</span>.
          </li>
          <li>
            Open Mainline from the new home-screen icon and sign in there with a fresh emailed
            code. The installed app keeps its own sign-in, separate from Safari.
          </li>
        </ol>
        <p className="text-[15px] text-foreground">Android</p>
        <ol className="list-decimal space-y-2 pl-5 text-[15px] text-muted">
          <li>Open mainline.support in Chrome.</li>
          <li>
            Tap ⋮ → <span className="text-foreground">Add to Home screen</span> (or{" "}
            <span className="text-foreground">Install app</span>).
          </li>
          <li>Open it from the icon and sign in.</li>
        </ol>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">4. Your first five minutes</h2>
        <ol className="list-decimal space-y-2 pl-5 text-[15px] text-muted">
          <li>
            Open Capture and write down 5–10 things that are on your mind. One per capture. Type
            them or use the mic button. Don&apos;t organize anything yet.
          </li>
          <li>
            Go to Inbox and clarify them one at a time. Mainline asks what each thing is and where
            it should live.
          </li>
        </ol>
        <p className="text-[15px] text-muted">
          If words like <span className="text-foreground">next action</span>,{" "}
          <span className="text-foreground">project</span> or{" "}
          <span className="text-foreground">context</span> are new to you, read{" "}
          <Link href="/method" className="text-accent-link underline-offset-4 hover:underline">
            The Mainline method
          </Link>{" "}
          first. It&apos;s short.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Troubleshooting</h2>
        <ul className="list-disc space-y-2 pl-5 text-[15px] text-muted">
          <li>
            <span className="text-foreground">The email didn&apos;t arrive.</span> Give it a minute
            and check spam. If it still isn&apos;t there, request a new code. The old one stops
            working once you do.
          </li>
          <li>
            <span className="text-foreground">You got signed out.</span> Sign in again with a fresh
            code. Nothing is lost; your data is on the server and comes back down.
          </li>
          <li>
            <span className="text-foreground">The phone app looks like a browser tab.</span>{" "}
            You&apos;ve opened a bookmark or an old icon rather than the installed app. Delete that
            icon and add it again from mainline.support.
          </li>
        </ul>
      </section>

      <p className="text-sm text-muted">
        Next:{" "}
        <Link href="/guide" className="text-accent-link underline-offset-4 hover:underline">
          Using Mainline
        </Link>{" "}
        ·{" "}
        <Link href="/method" className="text-accent-link underline-offset-4 hover:underline">
          The Mainline method
        </Link>{" "}
        ·{" "}
        <Link href="/" className="text-accent-link underline-offset-4 hover:underline">
          Open Mainline
        </Link>
      </p>
    </div>
  );
}
