/**
 * Pure last-write-wins decisions for gtd sync — kept out of the engine so they're unit-testable.
 *
 * LWW compares INSTANTS (epoch ms), never raw strings: the client writes "…Z" ISO strings while
 * Postgres returns "…+00:00", and lexicographic comparison across those formats lies.
 */

/** Epoch ms for an ISO-ish timestamp; 0 (loses every comparison) when absent/unparseable. */
export function parseMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Should a server row replace the local one? Strictly-newer only — an equal timestamp keeps the
 * local row, so echoes of our own pushes are no-ops and never churn the UI or the outbox.
 */
export function shouldAdopt(
  localUpdatedAt: string | null | undefined,
  serverUpdatedAt: string | null | undefined,
): boolean {
  return parseMs(serverUpdatedAt) > parseMs(localUpdatedAt);
}

/** Re-serialize a timestamp to the client's canonical "…Z" ISO form (idempotent; instant
 *  unchanged). Keeps every stored string uniform so plain string sorts stay correct. */
export function normalizeIso<T extends string | null>(value: T): T {
  if (value == null || value === "") return value;
  const ms = Date.parse(value);
  return (Number.isNaN(ms) ? value : new Date(ms).toISOString()) as T;
}
