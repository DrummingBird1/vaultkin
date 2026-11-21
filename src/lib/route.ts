/**
 * @file src/lib/route.ts
 * Typed hash routes: `#/<page>` or `#/<page>/<section>` (e.g. `#/settings/sync`).
 *
 * Hash routing works the same under Electron's file:// and in a browser tab,
 * and gives Back/Forward for free. Routes never carry vault data — entry ids
 * and search text stay in memory, so nothing sensitive lands in history.
 */
export const PAGES = ["vault", "authenticator", "generator", "health", "settings"] as const;
export type ActivePage = (typeof PAGES)[number];

export interface Route {
  page: ActivePage;
  section?: string;
}

const SECTION_RE = /^[a-z][a-z0-9-]{0,31}$/;

export function parseHash(hash: string): Route | null {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const page = parts[0] as ActivePage | undefined;
  if (!page || !(PAGES as readonly string[]).includes(page)) return null;
  const section = parts[1];
  return section && SECTION_RE.test(section) ? { page, section } : { page };
}

export function formatHash(r: Route): string {
  return `#/${r.page}${r.section && SECTION_RE.test(r.section) ? `/${r.section}` : ""}`;
}
