"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MediaGrid } from "@/components/media-grid";
import { Chip, FilterGroup, toggleIn } from "@/components/filter-controls";
import { PageContainer } from "@/components/page-container";
import { getMessages, type Locale } from "@/i18n/config";
import type { MediaCard } from "@/lib/catalog";
import { MEDIA_KINDS, MEDIA_KIND_LABELS } from "@/lib/media";
import {
  DEFAULT_MEDIA_FILTERS,
  filterMediaCards,
  type MediaFilters,
} from "@/lib/media-filter";
import { readMediaFilters, writeMediaFilters } from "@/lib/media-url";

/** How long typing must pause before the query is written to the URL. */
const QUERY_COMMIT_DELAY_MS = 250;

/**
 * The `/media` list, filterable by kind and title — the film/anime/TV
 * counterpart of `ComposerBrowser`, reusing its filter-panel building blocks
 * (`filter-controls.tsx`). Deliberately smaller in scope than
 * `ComposerBrowser`: only two filter axes and ~180 entries mean no sidebar,
 * no mobile sheet and no sessionStorage restore — the chips and search box
 * sit inline above the grid (see issue #91's design notes).
 */
export function MediaBrowser({
  locale,
  cards,
}: {
  locale: Locale;
  cards: MediaCard[];
}) {
  const messages = getMessages(locale);
  const router = useRouter();
  const searchParams = useSearchParams();

  const filters = useMemo(() => readMediaFilters(searchParams), [searchParams]);

  /*
   * The search text lives here rather than being read back out of the URL —
   * same IME-safety reasoning as `ComposerBrowser`'s `queryText`: binding
   * `value` straight to `useSearchParams()` loses characters mid-composition
   * because the field re-renders with the previous query before the
   * `router.replace()` navigation lands.
   */
  const [queryText, setQueryText] = useState(filters.query);
  const [lastUrlQuery, setLastUrlQuery] = useState(filters.query);
  // State rather than a ref: ending a composition has to re-run the effect
  // below so the finished word gets written to the URL.
  const [isComposing, setIsComposing] = useState(false);

  // Back/forward changes the query from outside. Adjusting state during
  // render is React's documented answer here; an effect would trip the
  // project's no-setState-in-effect rule and render one stale frame.
  if (filters.query !== lastUrlQuery) {
    setLastUrlQuery(filters.query);
    setQueryText(filters.query);
  }

  /** The filters as the user currently sees them, including text that has
   *  not reached the URL yet. */
  const effectiveFilters = useMemo<MediaFilters>(
    () => ({ ...filters, query: queryText }),
    [filters, queryText],
  );

  const update = useCallback(
    (nextFilters: MediaFilters) => {
      setLastUrlQuery(nextFilters.query);
      router.replace(`/${locale}/media${writeMediaFilters(nextFilters)}`, {
        scroll: false,
      });
    },
    [locale, router],
  );

  /** Writes the search text to the URL once typing pauses. */
  useEffect(() => {
    if (isComposing || queryText === lastUrlQuery) return;
    const timer = setTimeout(() => {
      update({ ...filters, query: queryText });
    }, QUERY_COMMIT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isComposing, queryText, lastUrlQuery, filters, update]);

  const results = useMemo(
    () => filterMediaCards(cards, effectiveFilters),
    [cards, effectiveFilters],
  );

  const activeCount =
    filters.kinds.length + (queryText ? 1 : 0);

  return (
    <PageContainer className="py-6 sm:py-10">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <FilterGroup id="media-search" label={messages.media.search}>
          <input
            type="search"
            aria-label={messages.media.search}
            value={queryText}
            onChange={(event) => setQueryText(event.target.value)}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={(event) => {
              // Safari fires compositionend *before* the final input event
              // and Chrome after it, so read the value here rather than
              // relying on onChange having already run.
              setQueryText(event.currentTarget.value);
              setIsComposing(false);
            }}
            placeholder={messages.media.search}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
            className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faint sm:w-72"
          />
        </FilterGroup>

        <FilterGroup id="media-kind" label={messages.media.kindFilter}>
          <div className="flex flex-wrap gap-1.5">
            {MEDIA_KINDS.map((kind) => (
              <Chip
                key={kind}
                active={filters.kinds.includes(kind)}
                onClick={() =>
                  update({ ...effectiveFilters, kinds: toggleIn(filters.kinds, kind) })
                }
              >
                {MEDIA_KIND_LABELS[kind][locale]}
              </Chip>
            ))}
          </div>
        </FilterGroup>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setQueryText("");
              update(DEFAULT_MEDIA_FILTERS);
            }}
            className="text-sm text-accent underline underline-offset-2 sm:mb-2.5"
          >
            {messages.filters.reset}
          </button>
        )}
      </div>

      <p data-testid="result-count" className="mt-5 text-sm text-ink-soft">
        {results.length === cards.length
          ? messages.media.resultCount.replace(
              "{count}",
              results.length.toLocaleString(),
            )
          : messages.media.resultCountFiltered
              .replace("{count}", results.length.toLocaleString())
              .replace("{total}", cards.length.toLocaleString())}
      </p>

      {results.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-line p-10 text-center">
          <p className="text-ink-soft">{messages.media.empty}</p>
        </div>
      ) : (
        <div className="mt-6">
          <MediaGrid locale={locale} cards={results} />
        </div>
      )}
    </PageContainer>
  );
}
