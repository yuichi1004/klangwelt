import type { MediaCard } from "./catalog";
import type { MediaKind } from "./media";

/**
 * The `/media` list's filters — mirroring `ComposerFilters` in shape, but
 * with only two axes (kind, text) and no default floor to omit. Small
 * enough (issue #91: ~180 entries) that this is the whole filter panel, no
 * further narrowing needed.
 */
export interface MediaFilters {
  query: string;
  kinds: MediaKind[];
}

export const DEFAULT_MEDIA_FILTERS: MediaFilters = { query: "", kinds: [] };

/** Cards per page in the `/media` list (issue #115). A multiple of 1, 2 and
 *  3 so the last row of a page is never a lone orphan at any breakpoint (see
 *  `MediaGrid`). Smaller than the catalogue's `PAGE_SIZE` (40) because the
 *  media list has ~180 entries, not 1,321 — six pages, not thirty-three. */
export const MEDIA_PAGE_SIZE = 36;

export function filterMediaCards(
  cards: MediaCard[],
  filters: MediaFilters,
): MediaCard[] {
  const query = filters.query.trim().toLowerCase();
  const kinds = new Set<string>(filters.kinds);

  return cards.filter((card) => {
    if (kinds.size > 0 && !kinds.has(card.kind)) return false;
    if (query) {
      const haystack = `${card.title.ja} ${card.title.en}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}
