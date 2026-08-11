import type { ComposerCard } from "./catalog";
import { EPOCHS, type Epoch } from "./epochs";

/**
 * The composer list's filters, deliberately smaller than `CatalogFilters`
 * (`catalog.ts`) — there is no genre or per-composer selection here, only
 * what issue #30 asked for: search, period, and 定番度.
 */
export interface ComposerFilters {
  query: string;
  epochs: Epoch[];
  /**
   * Minimum 定番度. `1` means "no filter" — every composer has at least ★1,
   * unlike the work list's `0`, which is a real absence of a floor. See
   * `starChipLabel` in `filter-controls.tsx`.
   */
  minStars: 1 | 3 | 4 | 5;
}

/**
 * ★3 and up excludes the ~127 composers with only a handful of works (or
 * none at all — see `check:curation`), so the list opens as a usable
 * overview instead of 220 names dominated by names nobody recognises.
 */
export const DEFAULT_COMPOSER_FILTERS: ComposerFilters = {
  query: "",
  epochs: [],
  minStars: 3,
};

export function filterComposers(
  cards: ComposerCard[],
  filters: ComposerFilters,
): ComposerCard[] {
  const query = filters.query.trim().toLowerCase();
  const epochs = new Set<string>(filters.epochs);

  return cards.filter((card) => {
    if (card.stars < filters.minStars) return false;
    if (epochs.size > 0 && !epochs.has(card.epoch)) return false;
    if (query) {
      const haystack =
        `${card.completeName} ${card.nameJa} ${card.name}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export interface ComposerEpochGroup {
  epoch: Epoch;
  members: ComposerCard[];
}

/**
 * Groups by period in the order music history runs, dropping any period with
 * nobody left in it — the point of issue #30's third requirement: a filtered
 * list should not show empty "Medieval" or "21st Century" headings.
 */
export function groupComposersByEpoch(
  cards: ComposerCard[],
): ComposerEpochGroup[] {
  return EPOCHS.map((epoch) => ({
    epoch,
    members: cards
      .filter((card) => card.epoch === epoch)
      .sort((a, b) => a.birthYear - b.birthYear),
  })).filter((group) => group.members.length > 0);
}
