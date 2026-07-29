/**
 * Normalize a link the user typed into something a browser will actually follow.
 *
 * The bug this exists for: "www.nurik.ai" in an href has no scheme, so it's a RELATIVE path —
 * the browser resolves it against the current page and you get a 404 on your own site. Nobody
 * types "https://" when jotting a note, so we add it.
 *
 * Schemes are allowed by default rather than allow-listed: "where things live" is often an app,
 * and obsidian://, notion://, things:// and message:// are exactly the sort of pointer this
 * field is for. Only the schemes that can execute in the page are refused.
 */

/** Schemes that turn a link into code execution. Never rendered as an href. */
const DANGEROUS = ["javascript:", "data:", "vbscript:", "blob:"];

/**
 * Returns a followable URL, or null when there's nothing usable (empty, or a refused scheme).
 * Pure and total: never throws, whatever the input.
 */
export function normalizeUrl(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  if (DANGEROUS.some((s) => lower.startsWith(s))) return null;

  // Already carries a scheme ("https:", "mailto:", "obsidian:")? Leave it alone.
  // The pattern is RFC 3986's: letter, then letters/digits/+/-/. before the colon.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;

  // A bare "//example.com" inherits the page's scheme; make it explicit instead.
  if (raw.startsWith("//")) return `https:${raw}`;

  // Anything else is a bare host or path — assume the web's default.
  return `https://${raw}`;
}
