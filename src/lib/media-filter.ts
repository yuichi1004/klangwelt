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
