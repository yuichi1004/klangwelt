/**
 * Production origin. Open Graph tags need absolute URLs, and there is
 * nothing else in this static export for Next's `metadataBase` to infer
 * them from — there is no server to read the request host from.
 */
export const SITE_URL = "https://klangwelt-dun.vercel.app";

/**
 * Absolute URL for a site-relative path, e.g. `/ja/works/16406`. Share
 * links need one for the same reason Open Graph tags do — see the comment
 * above — so this is built from `SITE_URL` rather than `window.location`,
 * which has no precedent anywhere in this codebase and would make e2e
 * (running against `http://localhost:3100`, see `playwright.config.ts`)
 * exercise a different URL than production ever would.
 */
export function canonicalUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
