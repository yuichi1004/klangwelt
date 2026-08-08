"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { WorkCard } from "@/components/work-card";
import { getMessages, type Locale } from "@/i18n/config";
import {
  fetchWorkIndex,
  filterWorks,
  joinComposers,
  sortWorks,
  type CatalogFilters,
  type ComposerOption,
  type SearchableWork,
  type SortKey,
} from "@/lib/catalog";
import { readSavedCatalogQuery, saveCatalogQuery } from "@/lib/catalog-session";
import type { WorkIndexRow } from "@/lib/catalog-types";
import {
  readFilters,
  sanitizeQueryString,
  writeFilters,
} from "@/lib/catalog-url";
import {
  EPOCHS,
  EPOCH_LABELS,
  EPOCH_YEARS,
  GENRES,
  GENRE_LABELS,
  type Epoch,
  type Genre,
} from "@/lib/epochs";

const PAGE_SIZE = 40;

/** How long typing must pause before the query is written to the URL. */
const QUERY_COMMIT_DELAY_MS = 250;

function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

export function CatalogBrowser({
  locale,
  initialWorks,
  totalCount,
  composers,
}: {
  locale: Locale;
  /** The first page of results, rendered statically for first paint and SEO. */
  initialWorks: SearchableWork[];
  totalCount: number;
  composers: ComposerOption[];
}) {
  const messages = getMessages(locale);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [indexRows, setIndexRows] = useState<WorkIndexRow[] | null>(null);

  const { filters, sort } = useMemo(
    () => readFilters(searchParams),
    [searchParams],
  );

  const [visible, setVisible] = useState(PAGE_SIZE);
  const [panelOpen, setPanelOpen] = useState(false);
  const [composerQuery, setComposerQuery] = useState("");

  /*
   * The search text lives here rather than being read back out of the URL.
   *
   * Binding `value` to `useSearchParams()` while `onChange` went through
   * `router.replace()` meant the field's value round-tripped through an
   * asynchronous navigation: React re-rendered with the *previous* query and
   * wrote it back into the input before the new one landed. Latin typing lost
   * every character but the last, and writing to `input.value` during an IME
   * composition made the browser commit it, so flick-typing ベートーベン on iOS
   * piled up as `へべべーべーとべーとー`.
   *
   * Now the field owns its text and updates synchronously; the URL is written
   * on a debounce so a shared link still carries the query.
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
  const effectiveFilters = useMemo<CatalogFilters>(
    () => ({ ...filters, query: queryText }),
    [filters, queryText],
  );

  // The full index is a separate static asset rather than inlined HTML.
  // Until it arrives, the statically rendered first page stays on screen.
  //
  // Fetched exactly once. `composers` is a fresh array on every server
  // re-render, so depending on it here would refetch 235 KB on every single
  // filter change; the join is done in a memo below instead.
  useEffect(() => {
    let cancelled = false;
    fetchWorkIndex()
      .then((rows) => {
        if (!cancelled) setIndexRows(rows);
      })
      .catch(() => {
        // Keep the server-rendered subset; browsing still works.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const works = useMemo(
    () => (indexRows ? joinComposers(indexRows, composers) : null),
    [indexRows, composers],
  );

  const update = useCallback(
    (nextFilters: CatalogFilters, nextSort: SortKey) => {
      // Remember that this navigation is ours, so when the query comes back
      // through `useSearchParams()` it is not mistaken for an external change
      // and used to overwrite what the user is typing.
      setLastUrlQuery(nextFilters.query);
      setVisible(PAGE_SIZE);
      router.replace(`/${locale}${writeFilters(nextFilters, nextSort)}`, {
        scroll: false,
      });
    },
    [locale, router],
  );

  /**
   * Keeps the filters alive across an in-page trip to a work page and back.
   *
   * Restoring only fires once per mount, and only when the URL arrives empty
   * — a shared link like `/ja?e=Baroque` always wins over whatever is saved.
   * Following a site-internal link back to `/${locale}` remounts this
   * component (it is a different route), so the restore runs; switching
   * filters while already on the catalogue does not remount it, so clearing
   * everything and then navigating elsewhere on the site does not bring the
   * old filters back.
   */
  const queryString = useMemo(() => writeFilters(filters, sort), [filters, sort]);
  const restoreChecked = useRef(false);

  useEffect(() => {
    if (!restoreChecked.current) {
      restoreChecked.current = true;
      if (queryString === "") {
        const saved = sanitizeQueryString(readSavedCatalogQuery());
        if (saved) {
          router.replace(`/${locale}${saved}`, { scroll: false });
          return;
        }
      }
    }
    saveCatalogQuery(queryString);
  }, [queryString, locale, router]);

  /**
   * Writes the search text to the URL once typing pauses.
   *
   * Re-running on every keystroke gives the debounce for free: the cleanup
   * cancels the previous timer. Nothing is scheduled while a composition is
   * open, and once the query has landed `queryText === lastUrlQuery` short-
   * circuits it — including after a chip click, which writes the URL itself.
   */
  useEffect(() => {
    if (isComposing || queryText === lastUrlQuery) return;
    const timer = setTimeout(() => {
      update({ ...filters, query: queryText }, sort);
    }, QUERY_COMMIT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isComposing, queryText, lastUrlQuery, filters, sort, update]);

  const loaded = works !== null;
  const results = useMemo(() => {
    const source = works ?? initialWorks;
    // Filters on the live text so results keep up with typing, while the URL
    // catches up on the debounce.
    return sortWorks(filterWorks(source, effectiveFilters), sort, locale);
  }, [works, initialWorks, effectiveFilters, sort, locale]);

  const composerName = (composer: ComposerOption) =>
    locale === "ja" ? composer.nameJa : composer.completeName;

  const visibleComposers = useMemo(() => {
    const needle = composerQuery.trim().toLowerCase();
    const matching = needle
      ? composers.filter((composer) =>
          `${composer.completeName} ${composer.nameJa} ${composer.name}`
            .toLowerCase()
            .includes(needle),
        )
      : composers;
    // Selected composers stay visible even when they fall outside the search.
    const selected = composers.filter((composer) =>
      filters.composerIds.includes(composer.id),
    );
    const merged = [...new Set([...selected, ...matching])];
    const label = (composer: ComposerOption) =>
      locale === "ja" ? composer.nameJa : composer.completeName;
    return merged.sort((a, b) => label(a).localeCompare(label(b), locale));
  }, [composers, composerQuery, filters.composerIds, locale]);

  const activeCount =
    filters.composerIds.length +
    filters.epochs.length +
    filters.genres.length +
    (filters.popularity === "all" ? 0 : 1) +
    (queryText ? 1 : 0);

  const clearAll = useCallback(() => {
    setComposerQuery("");
    // The field owns its text, so clearing the URL is not enough — `update`
    // marks the empty query as ours, which suppresses the usual
    // URL-to-field sync.
    setQueryText("");
    update(
      {
        query: "",
        composerIds: [],
        epochs: [],
        genres: [],
        popularity: "all",
      },
      sort,
    );
  }, [sort, update]);

  /** One removable chip per active filter, shown above the results so they
   *  can be undone individually without opening the filter panel. */
  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> =
      [];

    if (queryText) {
      chips.push({
        key: "query",
        label: queryText,
        onRemove: () => {
          setQueryText("");
          update({ ...effectiveFilters, query: "" }, sort);
        },
      });
    }
    if (filters.popularity !== "all") {
      chips.push({
        key: "popularity",
        label: messages.filters[filters.popularity],
        onRemove: () => update({ ...effectiveFilters, popularity: "all" }, sort),
      });
    }
    for (const epoch of filters.epochs) {
      chips.push({
        key: `epoch-${epoch}`,
        label: EPOCH_LABELS[epoch][locale],
        onRemove: () =>
          update(
            { ...effectiveFilters, epochs: toggleIn(filters.epochs, epoch) },
            sort,
          ),
      });
    }
    for (const genre of filters.genres) {
      chips.push({
        key: `genre-${genre}`,
        label: GENRE_LABELS[genre][locale],
        onRemove: () =>
          update(
            { ...effectiveFilters, genres: toggleIn(filters.genres, genre) },
            sort,
          ),
      });
    }
    for (const composerId of filters.composerIds) {
      const composer = composers.find((candidate) => candidate.id === composerId);
      if (!composer) continue;
      chips.push({
        key: `composer-${composerId}`,
        label: locale === "ja" ? composer.nameJa : composer.completeName,
        onRemove: () =>
          update(
            {
              ...effectiveFilters,
              composerIds: toggleIn(filters.composerIds, composerId),
            },
            sort,
          ),
      });
    }

    return chips;
  }, [
    queryText,
    filters.popularity,
    filters.epochs,
    filters.genres,
    filters.composerIds,
    composers,
    effectiveFilters,
    sort,
    update,
    messages.filters,
    locale,
  ]);

  const filterPanel = (
    <div className="space-y-6">
      <FilterGroup id="search" label={messages.filters.search}>
        <input
          type="search"
          aria-label={messages.filters.search}
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
          placeholder={messages.filters.searchPlaceholder}
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
          {(["all", "popular", "recommended"] as const).map((value) => (
            <Chip
              key={value}
              active={filters.popularity === value}
              onClick={() => update({ ...effectiveFilters, popularity: value }, sort)}
            >
              {messages.filters[value === "all" ? "all" : value]}
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
                update(
                  { ...effectiveFilters, epochs: toggleIn(filters.epochs, epoch) },
                  sort,
                )
              }
              title={EPOCH_YEARS[epoch]}
            >
              {EPOCH_LABELS[epoch][locale]}
            </Chip>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup id="genre" label={messages.filters.genre}>
        <div className="flex flex-wrap gap-1.5">
          {GENRES.map((genre: Genre) => (
            <Chip
              key={genre}
              active={filters.genres.includes(genre)}
              onClick={() =>
                update(
                  { ...effectiveFilters, genres: toggleIn(filters.genres, genre) },
                  sort,
                )
              }
            >
              {GENRE_LABELS[genre][locale]}
            </Chip>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup
        id="composer"
        label={
          filters.composerIds.length
            ? `${messages.filters.composer} · ${messages.filters.selected.replace("{count}", String(filters.composerIds.length))}`
            : messages.filters.composer
        }
      >
        <input
          type="search"
          aria-label={messages.filters.composerPlaceholder}
          value={composerQuery}
          onChange={(event) => setComposerQuery(event.target.value)}
          placeholder={messages.filters.composerPlaceholder}
          className="mb-2 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
        />
        <ul className="max-h-64 space-y-0.5 overflow-y-auto rounded-md border border-line p-1">
          {visibleComposers.map((composer) => (
            <li key={composer.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-ink-soft hover:bg-accent-soft/50">
                <input
                  type="checkbox"
                  checked={filters.composerIds.includes(composer.id)}
                  onChange={() =>
                    update(
                      {
                        ...effectiveFilters,
                        composerIds: toggleIn(filters.composerIds, composer.id),
                      },
                      sort,
                    )
                  }
                  className="accent-[var(--color-accent)]"
                />
                <span className="min-w-0 flex-1 truncate">
                  {composerName(composer)}
                </span>
                <span className="text-xs text-ink-faint">
                  {composer.coreWorkCount}
                </span>
              </label>
            </li>
          ))}
        </ul>
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
            {!loaded || results.length === totalCount
              ? messages.catalog.resultCount.replace(
                  "{count}",
                  (loaded ? results.length : totalCount).toLocaleString(),
                )
              : messages.catalog.resultCountFiltered
                  .replace("{count}", results.length.toLocaleString())
                  .replace("{total}", totalCount.toLocaleString())}
          </p>

          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <span className="sr-only sm:not-sr-only">
              {messages.catalog.sortLabel}
            </span>
            <select
              value={sort}
              onChange={(event) =>
                update(effectiveFilters, event.target.value as SortKey)
              }
              className="rounded-md border border-line bg-paper px-2 py-1.5 text-sm text-ink"
            >
              <option value="popular">{messages.catalog.sortPopular}</option>
              <option value="title">{messages.catalog.sortTitle}</option>
              <option value="composer">{messages.catalog.sortComposer}</option>
            </select>
          </label>

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
            <button
              type="button"
              onClick={clearAll}
              className="ml-1 text-sm text-accent underline underline-offset-2"
            >
              {messages.filters.clearAll}
            </button>
          </div>
        )}

        {results.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line p-10 text-center">
            <p className="text-ink-soft">{messages.filters.noResults}</p>
            <p className="mt-1 text-sm text-ink-faint">
              {messages.filters.noResultsHint}
            </p>
          </div>
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              {results.slice(0, visible).map((work) => (
                <li key={work.id}>
                  <WorkCard
                    locale={locale}
                    workId={work.id}
                    title={locale === "ja" ? work.titleJa : work.title}
                    secondaryTitle={locale === "ja" ? work.title : undefined}
                    composerName={
                      locale === "ja" ? work.composerNameJa : work.composerName
                    }
                    genre={work.genre}
                    popular={work.popular}
                    recommended={work.recommended}
                  />
                </li>
              ))}
            </ul>

            {visible < results.length && (
              <button
                type="button"
                onClick={() => setVisible((count) => count + PAGE_SIZE)}
                className="mt-6 w-full rounded-md border border-line py-3 text-sm text-ink-soft hover:border-accent/40 hover:text-accent"
              >
                {messages.filters.showMore}
              </button>
            )}
          </>
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
              {messages.catalog.resultCount.replace(
                "{count}",
                (loaded ? results.length : totalCount).toLocaleString(),
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A labelled block of filter controls. The heading is tied to the group with
 * `aria-labelledby` so screen readers announce, say, "Period, group" before
 * the chips inside — the chips alone give no clue what they filter.
 */
function FilterGroup({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  const headingId = `filter-${id}-label`;
  return (
    <div role="group" aria-labelledby={headingId}>
      <h3
        id={headingId}
        className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint"
      >
        {label}
      </h3>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
        active
          ? "border-accent bg-accent-soft text-accent"
          : "border-line text-ink-soft hover:border-accent/40"
      }`}
    >
      {children}
    </button>
  );
}

/** A chip for the active-filters row: its own label plus a `×` to remove it. */
function RemovableChip({
  onRemove,
  ariaLabel,
  children,
}: {
  onRemove: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={ariaLabel}
      className="flex max-w-full items-center gap-1.5 rounded-full border border-accent bg-accent-soft px-3 py-1.5 text-sm text-accent"
    >
      <span className="min-w-0 truncate break-words">{children}</span>
      <span aria-hidden="true">×</span>
    </button>
  );
}
