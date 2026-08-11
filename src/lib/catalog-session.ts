/**
 * Remembers a filter panel's query string for the lifetime of a browser tab,
 * so following a link to a work or composer page and back does not reset it.
 * Shared by the catalogue (`CatalogBrowser`) and the composer list
 * (`ComposerBrowser`), one storage key each.
 *
 * sessionStorage rather than localStorage: the point is to survive an
 * in-page navigation, not to have a filter choice persist across visits or
 * leak into a `/ja` link shared with someone else. Read access is always run
 * through the caller's own `sanitizeQueryString`/`sanitizeComposerQueryString`
 * — this module does not trust its own storage any more than `favorites.ts`
 * trusts localStorage.
 */
export const CATALOG_STORAGE_KEY = "klangwelt.catalog.v1";
export const COMPOSERS_STORAGE_KEY = "klangwelt.composers.v1";

export function readSavedQuery(key: string): string {
  try {
    return window.sessionStorage.getItem(key) ?? "";
  } catch {
    // Safari in private mode throws on storage access.
    return "";
  }
}

export function saveQuery(key: string, query: string): void {
  try {
    window.sessionStorage.setItem(key, query);
  } catch {
    // Storage full or blocked: filters just won't survive this navigation.
  }
}
