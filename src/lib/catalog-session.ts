/**
 * Remembers the catalogue's filters for the lifetime of a browser tab, so
 * following a link to a work and back does not reset them.
 *
 * sessionStorage rather than localStorage: the point is to survive an
 * in-page navigation, not to have a filter choice persist across visits or
 * leak into a `/ja` link shared with someone else. Read access is always run
 * through `sanitizeQueryString` by the caller — this module does not trust
 * its own storage any more than `favorites.ts` trusts localStorage.
 */
export const CATALOG_STORAGE_KEY = "klangwelt.catalog.v1";

export function readSavedCatalogQuery(): string {
  try {
    return window.sessionStorage.getItem(CATALOG_STORAGE_KEY) ?? "";
  } catch {
    // Safari in private mode throws on storage access.
    return "";
  }
}

export function saveCatalogQuery(query: string): void {
  try {
    window.sessionStorage.setItem(CATALOG_STORAGE_KEY, query);
  } catch {
    // Storage full or blocked: filters just won't survive this navigation.
  }
}
