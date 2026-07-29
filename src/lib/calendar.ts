/**
 * Calendar HANDOFF — not calendar sync.
 *
 * GTD keeps the calendar as the "hard landscape": things that must happen on a specific day or
 * at a specific time. Mainline's lists deliberately have no due dates, so a day-specific item
 * leaves for your real calendar instead. Two exits, both one-way and both offline-capable:
 *
 *   • a prefilled Google Calendar link (the common case), and
 *   • an .ics file, which Apple Calendar, Outlook and everything else understand.
 *
 * No accounts to connect, no tokens to expire, nothing to break at 6am. Pure functions here —
 * the "now" and the uid are passed in so this is testable.
 */

export interface CalendarEvent {
  title: string;
  /** Optional longer text (we pass the action's notes). */
  details?: string | null;
  /** Local calendar day, "YYYY-MM-DD". */
  date: string;
  /** Local 24h time, "HH:MM". Omitted/empty = an all-day event. */
  time?: string | null;
  /** Length in minutes for a timed event. Ignored for all-day. */
  durationMinutes?: number;
}

/** "YYYY-MM-DD" + optional "HH:MM" → a local Date. Returns null if either is malformed. */
function toLocalDate(date: string, time?: string | null): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!d) return null;
  let hh = 0;
  let mm = 0;
  if (time) {
    const t = /^(\d{2}):(\d{2})$/.exec(time);
    if (!t) return null;
    hh = Number(t[1]);
    mm = Number(t[2]);
    if (hh > 23 || mm > 59) return null;
  }
  const out = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), hh, mm, 0, 0);
  return Number.isNaN(out.getTime()) ? null : out;
}

const pad = (n: number) => `${n}`.padStart(2, "0");

/** UTC basic format, e.g. 20260812T140000Z — what both Google and iCalendar want for instants. */
function utcStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Date-only basic format, e.g. 20260812 — all-day events carry no timezone at all. */
function dayStamp(date: string): string {
  return date.replaceAll("-", "");
}

/** The day after `date` — all-day events are half-open ranges in both formats. */
function nextDayStamp(date: string): string {
  const d = toLocalDate(date);
  if (!d) return dayStamp(date);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

/** The two stamps Google/ICS need, or null when the input doesn't parse. */
function range(event: CalendarEvent): { start: string; end: string; allDay: boolean } | null {
  if (!event.time) {
    const start = dayStamp(event.date);
    if (!/^\d{8}$/.test(start)) return null;
    return { start, end: nextDayStamp(event.date), allDay: true };
  }
  const start = toLocalDate(event.date, event.time);
  if (!start) return null;
  const end = new Date(start.getTime() + (event.durationMinutes ?? 60) * 60_000);
  return { start: utcStamp(start), end: utcStamp(end), allDay: false };
}

/** A prefilled "new event" link. Opens the user's own Google Calendar; nothing is sent by us. */
export function googleCalendarUrl(event: CalendarEvent): string | null {
  const r = range(event);
  if (!r || !event.title.trim()) return null;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title.trim(),
    dates: `${r.start}/${r.end}`,
  });
  if (event.details?.trim()) params.set("details", event.details.trim());
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Escape per RFC 5545 §3.3.11 — backslash, semicolon, comma, and newlines. */
function escapeText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll(/\r?\n/g, "\\n");
}

/**
 * A single-event .ics document. `uid` and `now` are injected (no hidden globals) — the uid only
 * needs to be unique per event so a re-import updates rather than duplicates.
 */
export function icsFile(event: CalendarEvent, uid: string, now: Date): string | null {
  const r = range(event);
  if (!r || !event.title.trim()) return null;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mainline//Weekly//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    r.allDay ? `DTSTART;VALUE=DATE:${r.start}` : `DTSTART:${r.start}`,
    r.allDay ? `DTEND;VALUE=DATE:${r.end}` : `DTEND:${r.end}`,
    `SUMMARY:${escapeText(event.title.trim())}`,
  ];
  if (event.details?.trim()) lines.push(`DESCRIPTION:${escapeText(event.details.trim())}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

/** A safe-ish filename for the download ("Call the dentist" → "call-the-dentist.ics"). */
export function icsFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "event"}.ics`;
}
