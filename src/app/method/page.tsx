import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "The Mainline method",
  description:
    "The system behind Mainline in plain English: capture, clarify, organize, reflect, engage, and the vocabulary the app uses.",
  alternates: { canonical: "/method" },
  openGraph: {
    type: "article",
    siteName: "Mainline",
    title: "The Mainline method",
    url: "/method",
  },
};

export default function MethodPage() {
  return (
    <div className="flex flex-1 flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">The Mainline method</h1>
        <p className="mt-1 text-sm text-muted">
          You can&apos;t hold your commitments in your head and think clearly at the same time. The
          method is a way of putting them somewhere you trust, so your attention is free for the
          work itself.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Capture</h2>
        <p className="text-[15px] text-muted">
          Get everything out of your head and into one place: commitments, ideas, half-thoughts,
          the thing you keep meaning to do. Your mind is good at having ideas and bad at holding
          them, and it will keep reminding you at exactly the wrong moment until you write it down.
          The bar for capturing has to be near zero, or you won&apos;t do it.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Clarify</h2>
        <p className="text-[15px] text-muted">
          Take each captured thing and decide what it actually is. Is it something you&apos;re
          committed to doing? If so, what does done look like, and what is the very next physical
          action? Most stalling isn&apos;t laziness. It&apos;s an undecided item sitting on your list
          in a form you can&apos;t act on.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Organize</h2>
        <p className="text-[15px] text-muted">
          Put each thing where you&apos;ll see it at the moment you can act on it. Actions go on a
          list by context; multi-step outcomes become projects; delegated things go on a waiting
          list; maybes go to someday; facts you&apos;ll want later go to reference; anything tied
          to a specific day goes on your calendar. The lists aren&apos;t bureaucracy. They&apos;re how
          the right option finds you.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Reflect</h2>
        <p className="text-[15px] text-muted">
          Once a week, look over the whole thing: empty your inboxes, confirm every project has a
          next action, check what you&apos;re waiting on, scan your maybes. This is the habit
          everything else rests on. Skip it and the lists go stale, you stop believing them, and
          your head quietly takes the job back.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Engage</h2>
        <p className="text-[15px] text-muted">
          Now just choose. When the lists are current, picking what to do next is a quick read of
          where you are, how much time you have, and what matters most. The point of the system
          isn&apos;t to tell you what to do. It&apos;s to make your own judgement reliable.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">The words we use</h2>
        <ul className="list-disc space-y-2 pl-5 text-[15px] text-muted">
          <li>
            <span className="text-foreground">Next action:</span> the very next physical, visible
            thing you&apos;d do. &quot;Email Sarah for the venue list&quot;, not &quot;plan
            trip&quot;. If you can&apos;t picture yourself doing it, it isn&apos;t one yet.
          </li>
          <li>
            <span className="text-foreground">Project:</span> any outcome that needs more than one
            action. Not necessarily big; &quot;replace the kitchen tap&quot; is a project.
          </li>
          <li>
            <span className="text-foreground">Context:</span> where you are or what you need to
            hand in order to do something: at a computer, on the phone, out running errands, with
            your manager. You sort by context because that&apos;s what actually limits you.
          </li>
          <li>
            <span className="text-foreground">The two-minute rule:</span> if the action takes
            under two minutes, do it now. Tracking it would cost more than doing it.
          </li>
          <li>
            <span className="text-foreground">Waiting for:</span> anything you&apos;ve handed to
            someone else. It&apos;s still your commitment; you just aren&apos;t the one acting
            next.
          </li>
          <li>
            <span className="text-foreground">Someday / maybe:</span> real possibilities you
            aren&apos;t committing to right now. Keeping them here rather than on your action lists
            is what stops those lists becoming noise.
          </li>
          <li>
            <span className="text-foreground">Reference:</span> no action needed, but you&apos;ll
            want it later. A place, a link, a number.
          </li>
          <li>
            <span className="text-foreground">Horizons:</span> the altitudes above your daily
            lists: your purpose, your vision of where this is going, your goals, and the areas of
            life you keep standing. Review these monthly, not weekly, and use them to check that
            your projects are the right projects.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Why it works</h2>
        <p className="text-[15px] text-muted">
          A system you trust is one your mind will let go of. Once it stops rehearsing your
          commitments in the background, you get a clear head, and a clear head makes better
          decisions about what deserves your time. That&apos;s the whole trade: a small amount of
          upkeep each week, in exchange for not carrying it all.
        </p>
      </section>

      <p className="text-sm text-muted">
        The Mainline method is built on the ideas in David Allen&apos;s Getting Things Done.
        Mainline is not affiliated with or endorsed by the David Allen Company.
      </p>

      <p className="text-sm text-muted">
        Next:{" "}
        <Link href="/guide" className="text-accent-link underline-offset-4 hover:underline">
          Using Mainline
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
