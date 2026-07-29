"use client";

/**
 * "This has to happen on a day" → hand it to the real calendar and let it go.
 *
 * Mainline's lists carry no due dates by design (GTD: the calendar is the hard landscape, and a
 * list full of invented deadlines stops meaning anything). So a day-specific item exits here —
 * a prefilled Google link or an .ics file, both one-way. Nothing is connected, nothing syncs
 * back, and once it's on the calendar you can take it off the list.
 */
import { useState } from "react";
import { googleCalendarUrl, icsFile, icsFilename } from "@/lib/calendar";
import { restoreAction, setActionStatus } from "@/lib/gtd/store";
import type { Action } from "@/lib/gtd/types";
import { dayKey } from "@/lib/gtd/views";
import { showUndo } from "@/lib/undo";

export function CalendarHandoff({ action }: { action: Action }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [handedOff, setHandedOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = dayKey(new Date());

  const event = {
    title: action.title,
    details: action.notes,
    date,
    time: time || null,
  };
  const googleUrl = date ? googleCalendarUrl(event) : null;

  function downloadIcs() {
    const text = icsFile(event, action.id, new Date());
    if (!text) {
      setError("That date doesn't look right.");
      return;
    }
    try {
      const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = icsFilename(action.title);
      a.click();
      // Revoke on the next tick — Safari needs the URL alive through the click.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setHandedOff(true);
    } catch {
      setError("Couldn't build the file on this device.");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-border-strong hover:text-foreground"
      >
        Calendar…
      </button>
    );
  }

  return (
    <div className="w-full rounded-[10px] border border-border bg-surface-2 p-3">
      <p className="text-sm text-muted">
        Day-specific? Put it on your calendar. Mainline won&apos;t keep a copy.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          min={today}
          onChange={(e) => {
            setDate(e.target.value);
            setHandedOff(false);
          }}
          aria-label={`Calendar date for ${action.title}`}
          className="rounded-[10px] border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-border-strong"
        />
        <input
          type="time"
          value={time}
          onChange={(e) => {
            setTime(e.target.value);
            setHandedOff(false);
          }}
          aria-label={`Time (optional) for ${action.title}`}
          className="rounded-[10px] border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-border-strong"
        />
        <span className="text-xs text-tertiary">{time ? "1 hour" : "all day"}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        {googleUrl ? (
          <a
            href={googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setHandedOff(true)}
            className="btn-accent rounded-lg px-3 py-1.5 font-medium"
          >
            Add to Google Calendar
          </a>
        ) : (
          <span className="rounded-lg border border-border px-3 py-1.5 text-tertiary">
            Pick a date
          </span>
        )}
        <button
          type="button"
          disabled={!date}
          onClick={downloadIcs}
          className="rounded-lg border border-border px-3 py-1.5 text-muted transition-colors hover:border-border-strong hover:text-foreground disabled:opacity-40"
        >
          Download .ics
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
            setHandedOff(false);
          }}
          className="ml-auto rounded-lg px-3 py-1.5 text-muted hover:text-foreground"
        >
          Close
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {handedOff && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3">
          <p className="text-sm text-muted">On your calendar now?</p>
          <button
            type="button"
            onClick={() => {
              const prev = { ...action };
              void setActionStatus(action.id, "done");
              showUndo({ label: "Off the list", onUndo: () => void restoreAction(prev) });
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-border-strong hover:text-foreground"
          >
            Take it off the list
          </button>
        </div>
      )}
    </div>
  );
}
