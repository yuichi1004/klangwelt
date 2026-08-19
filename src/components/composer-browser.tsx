"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { ComposerGrid } from "@/components/composer-grid";
import {
  Chip,
  FilterGroup,
  RemovableChip,
  starChipLabel,
  toggleIn,
} from "@/components/filter-controls";
import { PageContainer } from "@/components/page-container";
import { useModalOverlay } from "@/components/use-modal-overlay";
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
  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetHeadingId = useId();
  const closePanel = useCallback(() => setPanelOpen(false), []);

  // Escape, the Tab trap, the scroll lock behind the sheet and focus back on
  // the 絞り込み button when it closes — all of #109's modal behaviour,
  // shared with the header menu (`use-modal-overlay.ts`).
  useModalOverlay(panelOpen, closePanel, sheetRef);

  // The sheet is `lg:hidden`, so a rotate/resize past `lg` would leave
  // `panelOpen` true with nothing on screen — and the page behind still
  // locked by `useModalOverlay`. Close it instead of trying to keep an
  // invisible modal coherent.
  useEffect(() => {
    if (!panelOpen) return;
    const wide = window.matchMedia("(min-width: 64rem)");
    const closeIfWide = () => {
      if (wide.matches) setPanelOpen(false);
    };
    wide.addEventListener("change", closeIfWide);
    return () => wide.removeEventListener("change", closeIfWide);
  }, [panelOpen]);

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
    <PageContainer className="gap-8 py-6 lg:flex lg:py-10">
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
        /* A real modal, not a floating div (#109): `useModalOverlay` traps
           Tab inside the dialog, locks the page behind it and routes
           Escape to `closePanel`. The scrim stays a labelled <button> so a
           tap outside closes it, and it is deliberately *outside* the
           dialog and therefore outside the trap — a full-screen button in
           the tab order is noise, and keyboard users have Escape and
           閉じる. */
        <div className="fixed inset-0 z-40 flex flex-col justify-end lg:hidden">
          <button
            type="button"
            aria-label={messages.nav.close}
            onClick={closePanel}
            className="absolute inset-0 bg-black/40"
          />

          {/* `flex flex-col` here plus `min-h-0 flex-1` on the middle is
              what keeps the handle, the heading and the CTA on screen while
              the filters scroll. `min-h-0` is not optional: a flex child
              refuses to shrink below its content height by default, so
              without it the filter list pushes the CTA off the bottom
              edge — the same "no persistent way to close" the sheet had
              before (#109).
              `85dvh` rather than `85vh`: with mobile Safari's URL bar
              showing, `vh` measures the *large* viewport and the sheet's
              last row ends up under the browser chrome. */}
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={sheetHeadingId}
            tabIndex={-1}
            className="relative flex max-h-[85dvh] flex-col rounded-t-2xl border-t border-line bg-paper"
          >
            <div className="shrink-0 px-5 pt-2.5">
              {/* Decorative: the sheet is not draggable. The pill is the
                  convention that makes it read as something that came up
                  from the bottom edge rather than a card that landed
                  there. */}
              <span
                aria-hidden="true"
                className="mx-auto mb-3 block h-1 w-9 rounded-full bg-line"
              />
              <div className="flex items-center pb-3">
                <h2
                  id={sheetHeadingId}
                  className="mr-auto text-sm font-semibold text-ink"
                >
                  {messages.filters.heading}
                </h2>
                <button
                  type="button"
                  onClick={closePanel}
                  className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-soft"
                >
                  {messages.nav.close}
                </button>
              </div>
            </div>

            {/* The sheet's only scrolling region. `overscroll-contain` is
                the half of the scroll lock that `overflow: hidden` on
                <body> does not cover on iOS Safari: a flick that runs past
                the end of this box otherwise carries on into the page
                behind it. */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-1">
              {filterPanel}
            </div>

            {/* Pinned, so the way out is always one tap away no matter how
                far the filters are scrolled. */}
            <div className="shrink-0 border-t border-line px-5 pb-5 pt-4">
              <button
                type="button"
                onClick={closePanel}
                className="w-full rounded-full bg-accent-fill py-3.5 text-sm font-semibold text-accent-ink"
              >
                {messages.composers.showResults.replace(
                  "{count}",
                  results.length.toLocaleString(),
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
