import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Using Mainline",
  description:
    "What each part of Mainline does: Capture, Inbox, Next, Projects, Waiting, Someday, Reference, Horizons and the weekly review.",
  alternates: { canonical: "/guide" },
  openGraph: {
    type: "article",
    siteName: "Mainline",
    title: "Using Mainline",
    url: "/guide",
  },
};

export default function GuidePage() {
  return (
    <div className="flex flex-1 flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Using Mainline</h1>
        <p className="mt-1 text-sm text-muted">
          Every part of the app, in the order you&apos;ll meet it. Nothing here takes long to
          learn.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Capture</h2>
        <p className="text-[15px] text-muted">
          The home screen is one big box. Type a thought and save it, or tap the mic and say it.
          It saves instantly and works offline. Captures live on the device and sync up the moment
          you&apos;re back online. Capture is deliberately dumb: no deciding, no sorting, just get
          it out of your head.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Inbox &amp; clarifying</h2>
        <p className="text-[15px] text-muted">
          Everything you capture lands in the Inbox as raw text, waiting to be decided. Clarifying
          asks one question first: is it actionable? If yes, it becomes a next action (verb-first,
          with a context, and an optional under-two-minutes flag), a project (an outcome plus its
          first action), or a waiting-for (whose court the ball is in). If no, it goes to Someday,
          Reference, or the trash.
        </p>
        <p className="text-[15px] text-muted">
          Nothing in Mainline has a due date, on purpose. When something genuinely has to happen on
          a particular day, open it in Next and tap <span className="text-foreground">Calendar…</span>{" "}
          to get a prefilled Google Calendar link or an .ics file for Apple, Outlook and the rest.
          Then you can take it off the list. You already have a calendar; dated things
          belong there, where you actually look for them.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Next actions &amp; contexts</h2>
        <p className="text-[15px] text-muted">
          Next holds everything you could actually do, grouped by context: where you are or what
          you need to hand. Check things off as you go. From Next you can open Contexts to add,
          rename or archive your own; make them match your real life rather than a template.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Projects</h2>
        <p className="text-[15px] text-muted">
          A project is any outcome that needs more than one action. Each one lists its actions as a
          checklist with a progress count, and you can add the next action inline without leaving
          the page. Projects with no next action are flagged as stalled. That flag is the single most
          useful signal in the app.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Waiting</h2>
        <p className="text-[15px] text-muted">
          Anything you&apos;ve handed to someone else sits here, oldest first, with its age
          showing. That&apos;s your nudge list: when something has been waiting too long, you chase
          it. Without this list, delegated work quietly disappears.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Someday &amp; resurfacing</h2>
        <p className="text-[15px] text-muted">
          Someday is for things you might do one day but aren&apos;t committing to now. Nothing
          here is lost. Set a resurface date on a Someday item, or on an action, and it hides
          until that day, then reappears in your Inbox to be decided again.
        </p>
        <p className="text-[15px] text-muted">
          Someday items, projects and actions all take a free-text note for longer thinking. When a
          Someday item&apos;s note has outgrown it, promote it to a project in one tap and the note
          comes along.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Reference</h2>
        <p className="text-[15px] text-muted">
          Reference answers &ldquo;where did I put that?&rdquo;. Each entry is a note to yourself
          about where something is kept: &ldquo;Dyson warranty: in Gmail, search Dyson&rdquo;,
          &ldquo;Lease: blue folder in the hall cupboard&rdquo;. You can add a link, tie it to a
          project, and search the lot. Mainline doesn&apos;t hold the documents themselves; it
          holds where you left them.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Horizons</h2>
        <p className="text-[15px] text-muted">
          Four editable notes (Purpose, Vision, Goals, Areas of Focus) sitting above your daily
          lists. You won&apos;t touch them most weeks. They exist so that once a month you can
          check whether the projects you&apos;re actually running are the ones that matter.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">The weekly review</h2>
        <p className="text-[15px] text-muted">
          Review walks you through a guided pass: empty every inbox (Mainline&apos;s, your email,
          the pile of paper on your desk), make sure every project has a next action, check what
          you&apos;re waiting on, and scan Someday. Mainline tracks when you last reviewed and
          nudges you after a week. The first review of each month adds a Horizons step so you check
          your projects against your Purpose, Vision, Goals and Areas.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Finding everything</h2>
        <p className="text-[15px] text-muted">
          The bar along the bottom (or the row along the top, on a big screen) holds what you touch
          daily: Capture, Inbox, Next, Projects, Waiting and Review. Someday, Reference, Horizons
          and your Contexts live one tap deeper, under <span className="text-foreground">More</span>.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Good habits</h2>
        <ul className="list-disc space-y-2 pl-5 text-[15px] text-muted">
          <li>Capture the moment you think of it. Never trust yourself to remember.</li>
          <li>Clarify the Inbox to zero regularly. An inbox that never empties stops meaning anything.</li>
          <li>Do the weekly review. It&apos;s what makes the lists trustworthy.</li>
          <li>Keep dated things on your calendar, not in your lists.</li>
        </ul>
        <p className="text-[15px] text-muted">
          Everything syncs across your signed-in devices automatically, and anything that feels
          destructive gives you a ten-second undo, so you can move fast without being careful.
        </p>
      </section>

      <p className="text-sm text-muted">
        Next:{" "}
        <Link href="/method" className="text-accent-link underline-offset-4 hover:underline">
          The Mainline method
        </Link>{" "}
        ·{" "}
        <Link href="/setup" className="text-accent-link underline-offset-4 hover:underline">
          Set up Mainline
        </Link>{" "}
        ·{" "}
        <Link href="/" className="text-accent-link underline-offset-4 hover:underline">
          Open Mainline
        </Link>
      </p>
    </div>
  );
}
