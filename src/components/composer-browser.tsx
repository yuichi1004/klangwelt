"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ComposerGrid } from "@/components/composer-grid";
import {
  Chip,
  FilterGroup,
  RemovableChip,
  starChipLabel,
  toggleIn,
} from "@/components/filter-controls";
import { getMessages, type Locale } from "@/i18n/config";
import type { ComposerCard } from "@/lib/catalog";
import {
  COMPOSERS_STORAGE_KEY,
  readSavedQuery,
  saveQuery,
} from "@/lib/catalog-session";
import {
  DEFAULT_COMPOSER_FILTERS,
  filterComposers,
  groupComposersByEpoch,
  type ComposerFilters,
} from "@/lib/composer-filter";
import {
  readComposerFilters,
  sanitizeComposerQueryString,
  writeComposerFilters,
} from "@/lib/composer-url";
import { EPOCHS, EPOCH_LABELS, EPOCH_YEARS, type Epoch } from "@/lib/epochs";

/** How long typing must pause before the query is written to the URL. */
const QUERY_COMMIT_DELAY_MS = 250;

/**
 * The composer list, filterable by 定番度, period and name — the composer
 * counterpart of `CatalogBrowser`, sharing its filter-panel components
 * (`filter-controls.tsx`) and its overall shape so the two lists feel like
 * one product. Smaller than `CatalogBrowser` in scope: 220 composers arrive
 * in `cards` already, so there is no lazy index fetch, no pagination and no
 * sort control — just filter, group by period, and render.
 */
export function ComposerBrowser({
  locale,
  cards,
}: {
  locale: Locale;
  cards: ComposerCard[];
}) {
  const messages = getMessages(locale);
  const router = useRouter();
  const searchParams = useSearchParams();

  const filters = useMemo(
    () => readComposerFilters(searchParams),
    [searchParams],
  );

  const [panelOpen, setPanelOpen] = useState(false);

  /*
   * The search text lives here rather than being read back out of the URL —
   * same IME-safety reasoning as `CatalogBrowser`'s `queryText`. Binding
   * `value` straight to `useSearchParams()` loses characters mid-composition
   * because the field re-renders with the previous query before the
   * `router.replace()` navigation lands. See that component's comment for
   * the full story (flick-typing on iOS was the bug that surfaced it).
   */
  const [queryText, setQueryText] = useState(filters.query);
  const [lastUrlQuery, setLastUrlQuery] = useState(filters.query);
  // State rather than a ref: ending a composition has to re-run the effect
  // below so the finished word gets written to the URL.
  const [isComposing, setIsComposing] = useState(false);

  // Back/forward and "clear filters" change the query from outside. Adjusting
  // state during render is React's documented answer here; an effect would
  // trip the project's no-setState-in-effect rule and render one stale frame.
  if (filters.query !== lastUrlQuery) {
    setLastUrlQuery(filters.query);
    setQueryText(filters.query);
  }

  /** The filters as the user currently sees them, including text that has
   *  not reached the URL yet. */
  const effectiveFilters = useMemo<ComposerFilters>(
    () => ({ ...filters, query: queryText }),
    [filters, queryText],
  );

  const update = useCallback(
    (nextFilters: ComposerFilters) => {
      // Remember that this navigation is ours, so when the query comes back
      // through `useSearchParams()` it is not mistaken for an external change
      // and used to overwrite what the user is typing.
      setLastUrlQuery(nextFilters.query);
      router.replace(`/${locale}/composers${writeComposerFilters(nextFilters)}`, {
        scroll: false,
      });
    },
    [locale, router],
  );

  /**
   * Keeps the filters alive across an in-page trip to a composer page and
   * back — same mechanism as `CatalogBrowser`'s restore, under its own
   * storage key so the two lists don't clobber each other's saved query.
   */
  const queryString = useMemo(() => writeComposerFilters(filters), [filters]);
  const restoreChecked = useRef(false);

  useEffect(() => {
    if (!restoreChecked.current) {
      restoreChecked.current = true;
      if (queryString === "") {
        const saved = sanitizeComposerQueryString(
          readSavedQuery(COMPOSERS_STORAGE_KEY),
        );
        if (saved) {
          router.replace(`/${locale}/composers${saved}`, { scroll: false });
          return;
        }
      }
    }
    saveQuery(COMPOSERS_STORAGE_KEY, queryString);
  }, [queryString, locale, router]);

  /**
   * Writes the search text to the URL once typing pauses. See
   * `CatalogBrowser`'s identical effect for why this doubles as the
   * debounce.
   */
  useEffect(() => {
    if (isComposing || queryText === lastUrlQuery) return;
    const timer = setTimeout(() => {
      update({ ...filters, query: queryText });
    }, QUERY_COMMIT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isComposing, queryText, lastUrlQuery, filters, update]);

  const results = useMemo(
    () => filterComposers(cards, effectiveFilters),
    [cards, effectiveFilters],
  );
  const groups = useMemo(() => groupComposersByEpoch(results), [results]);

  // Counts only what differs from the default view (★3+, no period, no
  // search) — the star filter being "on" out of the box should not make the
  // reset button appear before the user has touched anything.
  const activeCount =
    filters.epochs.length +
    (filters.minStars !== DEFAULT_COMPOSER_FILTERS.minStars ? 1 : 0) +
    (queryText ? 1 : 0);

  const clearAll = useCallback(() => {
    setQueryText("");
    update(DEFAULT_COMPOSER_FILTERS);
  }, [update]);

  /** One removable chip per filter that differs from the default, shown
   *  above the results so it can be undone without opening the panel. */
  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> =
      [];

    if (queryText) {
      chips.push({
        key: "query",
        label: queryText,
        onRemove: () => {
          setQueryText("");
          update({ ...effectiveFilters, query: "" });
        },
      });
    }
    // Shown whenever there is any floor at all — including the default ★3,
    // which is otherwise invisible and would silently hide ~127 composers.
    // Removing it goes to `1` ("no floor"), not back to the default `3`.
    if (filters.minStars > 1) {
      chips.push({
        key: "popularity",
        label: starChipLabel(messages.filters, filters.minStars, false),
        onRemove: () => update({ ...effectiveFilters, minStars: 1 }),
      });
    }
    for (const epoch of filters.epochs) {
      chips.push({
        key: `epoch-${epoch}`,
        label: EPOCH_LABELS[epoch][locale],
        onRemove: () =>
          update({
            ...effectiveFilters,
            epochs: toggleIn(filters.epochs, epoch),
          }),
      });
    }

    return chips;
  }, [
    queryText,
    filters.minStars,
    filters.epochs,
    effectiveFilters,
    update,
    messages.filters,
    locale,
  ]);

  const filterPanel = (
    <div className="space-y-6">
      <FilterGroup id="search" label={messages.filters.composerPlaceholder}>
        <input
          type="search"
          aria-label={messages.filters.composerPlaceholder}
          value={queryText}
          onChange={(event) => setQueryText(event.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={(event) => {
            // Safari fires compositionend *before* the final input event and
            // Chrome after it, so read the value here rather than relying on
            // onChange having already run.
            setQueryText(event.currentTarget.value);
            setIsComposing(false);
          }}
          placeholder={messages.filters.composerPlaceholder}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="search"
          className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
        />
      </FilterGroup>

      <FilterGroup id="popularity" label={messages.filters.popularity}>
        <div className="flex flex-wrap gap-1.5">
          {([1, 3, 4, 5] as const).map((value) => (
            <Chip
              key={value}
              active={filters.minStars === value}
              ariaLabel={starChipLabel(messages.filters, value, true)}
              onClick={() => update({ ...effectiveFilters, minStars: value })}
            >
              {starChipLabel(messages.filters, value, false)}
            </Chip>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup id="epoch" label={messages.filters.epoch}>
        <div className="flex flex-wrap gap-1.5">
          {EPOCHS.map((epoch: Epoch) => (
            <Chip
              key={epoch}
              active={filters.epochs.includes(epoch)}
              onClick={() =>
                update({
                  ...effectiveFilters,
                  epochs: toggleIn(filters.epochs, epoch),
                })
              }
              title={EPOCH_YEARS[epoch]}
            >
              {EPOCH_LABELS[epoch][locale]}
            </Chip>
          ))}
        </div>
      </FilterGroup>

      {activeCount > 0 && (
        <button
          type="button"
          onClick={clearAll}
          className="text-sm text-accent underline underline-offset-2"
        >
          {messages.filters.reset}
        </button>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl gap-8 px-4 py-6 sm:px-6 lg:flex lg:py-10">
      <aside className="hidden w-72 shrink-0 lg:block">
        <h2 className="mb-4 text-sm font-semibold text-ink">
          {messages.filters.heading}
        </h2>
        {filterPanel}
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <p data-testid="result-count" className="mr-auto text-sm text-ink-soft">
            {results.length === cards.length
              ? messages.composers.resultCount.replace(
                  "{count}",
                  results.length.toLocaleString(),
                )
              : messages.composers.resultCountFiltered
                  .replace("{count}", results.length.toLocaleString())
                  .replace("{total}", cards.length.toLocaleString())}
          </p>

          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="rounded-full border border-line px-3 py-1.5 text-sm text-ink-soft lg:hidden"
          >
            {messages.filters.open}
            {activeCount > 0 && (
              <span className="ml-1.5 rounded-full bg-accent px-1.5 text-xs text-paper">
                {activeCount}
              </span>
            )}
          </button>
        </div>

        {activeChips.length > 0 && (
          <div
            role="group"
            aria-label={messages.filters.active}
            className="mb-4 flex flex-wrap items-center gap-1.5"
          >
            {activeChips.map((chip) => (
              <RemovableChip
                key={chip.key}
                onRemove={chip.onRemove}
                ariaLabel={messages.filters.remove.replace("{name}", chip.label)}
              >
                {chip.label}
              </RemovableChip>
            ))}
            {/* Only when something differs from the default view — the ★3
                chip alone (the untouched default) should not offer a "clear
                all" that has nothing extra to clear. */}
            {activeCount > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="ml-1 text-sm text-accent underline underline-offset-2"
              >
                {messages.filters.clearAll}
              </button>
            )}
          </div>
        )}

        {groups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line p-10 text-center">
            <p className="text-ink-soft">{messages.filters.noComposers}</p>
            <p className="mt-1 text-sm text-ink-faint">
              {messages.filters.noResultsHint}
            </p>
          </div>
        ) : (
          <ComposerGrid locale={locale} groups={groups} />
        )}
      </div>

      {panelOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label={messages.nav.close}
            onClick={() => setPanelOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-line bg-paper p-5">
            <div className="mb-4 flex items-center">
              <h2 className="mr-auto text-sm font-semibold text-ink">
                {messages.filters.heading}
              </h2>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-soft"
              >
                {messages.nav.close}
              </button>
            </div>
            {filterPanel}
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="mt-6 w-full rounded-full bg-accent-fill py-3.5 text-sm font-semibold text-accent-ink"
            >
              {messages.composers.resultCount.replace(
                "{count}",
                results.length.toLocaleString(),
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
