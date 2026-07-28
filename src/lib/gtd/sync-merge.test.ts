import { describe, expect, it } from "vitest";
import { normalizeIso, parseMs, shouldAdopt } from "./sync-merge";

describe("parseMs", () => {
  it("parses both client 'Z' and Postgres '+00:00' forms to the same instant", () => {
    expect(parseMs("2026-07-28T03:11:22.123Z")).toBe(parseMs("2026-07-28T03:11:22.123+00:00"));
  });

  it("treats absent/garbage as 0 (loses every comparison)", () => {
    expect(parseMs(null)).toBe(0);
    expect(parseMs(undefined)).toBe(0);
    expect(parseMs("not-a-date")).toBe(0);
  });
});

describe("shouldAdopt", () => {
  const t1 = "2026-07-28T00:00:00.000Z";
  const t2 = "2026-07-28T00:00:01.000Z";

  it("adopts strictly-newer server rows", () => {
    expect(shouldAdopt(t1, t2)).toBe(true);
  });

  it("keeps local on equal instants (echo of our own push), even across formats", () => {
    expect(shouldAdopt(t1, t1)).toBe(false);
    expect(shouldAdopt(t1, "2026-07-28T00:00:00.000+00:00")).toBe(false);
  });

  it("keeps local when the server row is older", () => {
    expect(shouldAdopt(t2, t1)).toBe(false);
  });

  it("adopts when there is no local row", () => {
    expect(shouldAdopt(undefined, t1)).toBe(true);
  });

  it("string comparison would get the cross-format case wrong; instants don't", () => {
    const serverOlder = "2026-07-28T00:00:00.500+00:00"; // instant-older than local…
    const local = "2026-07-28T00:00:01.000Z";
    expect(serverOlder > local).toBe(false); // (lexicographic happens to agree here…)
    expect("2026-07-28T00:00:01.000+00:00" > local).toBe(false); // …but lies on equal seconds
    expect(shouldAdopt(local, "2026-07-28T00:00:01.000+00:00")).toBe(false); // equal instant → keep
  });
});

describe("normalizeIso", () => {
  it("rewrites '+00:00' to the canonical 'Z' form without changing the instant", () => {
    expect(normalizeIso("2026-07-28T03:11:22.123+00:00")).toBe("2026-07-28T03:11:22.123Z");
  });

  it("is idempotent on already-canonical strings and passes null/garbage through", () => {
    expect(normalizeIso("2026-07-28T03:11:22.123Z")).toBe("2026-07-28T03:11:22.123Z");
    expect(normalizeIso(null)).toBeNull();
    expect(normalizeIso("garbage")).toBe("garbage");
  });
});
