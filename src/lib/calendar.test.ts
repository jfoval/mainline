import { describe, expect, it } from "vitest";
import { googleCalendarUrl, icsFile, icsFilename } from "./calendar";

const NOW = new Date(Date.UTC(2026, 7, 1, 9, 30, 0));

describe("googleCalendarUrl", () => {
  it("builds an all-day event as a half-open day range", () => {
    const url = googleCalendarUrl({ title: "Dentist", date: "2026-08-12" });
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("text=Dentist");
    expect(url).toContain("dates=20260812%2F20260813");
  });

  it("rolls an all-day event over a month boundary", () => {
    expect(googleCalendarUrl({ title: "x", date: "2026-08-31" })).toContain(
      "dates=20260831%2F20260901",
    );
  });

  it("builds a timed event in UTC, one hour long by default", () => {
    const url = googleCalendarUrl({ title: "Call", date: "2026-08-12", time: "14:00" }) ?? "";
    const dates = decodeURIComponent(new URL(url).searchParams.get("dates") ?? "");
    const [start, end] = dates.split("/");
    // The input is a LOCAL wall-clock time, so the expectation is built the same way rather
    // than hard-coded to one timezone's UTC offset.
    const basic = (d: Date) => d.toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}/, "");
    expect(start).toBe(basic(new Date(2026, 7, 12, 14, 0)));
    expect(end).toBe(basic(new Date(2026, 7, 12, 15, 0)));
  });

  it("carries notes as details and refuses malformed input", () => {
    expect(googleCalendarUrl({ title: "x", date: "2026-08-12", details: "bring the form" })).toContain(
      "details=bring+the+form",
    );
    expect(googleCalendarUrl({ title: "x", date: "12/08/2026" })).toBeNull();
    expect(googleCalendarUrl({ title: "x", date: "2026-08-12", time: "25:00" })).toBeNull();
    expect(googleCalendarUrl({ title: "   ", date: "2026-08-12" })).toBeNull();
  });
});

describe("icsFile", () => {
  it("emits a DATE-valued all-day event with CRLF line endings", () => {
    const ics = icsFile({ title: "Dentist", date: "2026-08-12" }, "uid-1", NOW) ?? "";
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260812");
    expect(ics).toContain("DTEND;VALUE=DATE:20260813");
    expect(ics).toContain("UID:uid-1");
    expect(ics).toContain("DTSTAMP:20260801T093000Z");
    expect(ics).toContain("\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("escapes commas, semicolons, backslashes and newlines in text", () => {
    const ics =
      icsFile(
        { title: "Call Ann, then Bo; ok", date: "2026-08-12", details: "line1\nline2\\end" },
        "uid-2",
        NOW,
      ) ?? "";
    expect(ics).toContain("SUMMARY:Call Ann\\, then Bo\\; ok");
    expect(ics).toContain("DESCRIPTION:line1\\nline2\\\\end");
  });

  it("refuses malformed input", () => {
    expect(icsFile({ title: "x", date: "nope" }, "uid", NOW)).toBeNull();
  });
});

describe("icsFilename", () => {
  it("slugs the title and always ends in .ics", () => {
    expect(icsFilename("Call the dentist!")).toBe("call-the-dentist.ics");
    expect(icsFilename("   ")).toBe("event.ics");
  });
});
