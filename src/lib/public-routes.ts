/**
 * Pages a stranger can read without signing in: the sign-in page IS the landing page, and its
 * two quiet links have to lead somewhere. Everything else stays behind AuthGate.
 *
 * Plain module (no "use client") so both the gate and the nav can import it.
 */
const PUBLIC_ROUTES = ["/setup", "/guide", "/method"] as const;

/** Path-prefix match, tolerant of the trailing slash the static export uses. */
export function isPublicRoute(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return PUBLIC_ROUTES.some((r) => path === r || path.startsWith(`${r}/`));
}
