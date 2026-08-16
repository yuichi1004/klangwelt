"use client";

import { useEffect, useRef, useState } from "react";

import { useFavorites } from "@/components/favorites-provider";
import { WorkCard } from "@/components/work-card";
import { getMessages, type Locale } from "@/i18n/config";
import {
  fetchWorkIndex,
  joinComposers,
  type ComposerOption,
  type SearchableWork,
} from "@/lib/catalog";
import { pushSeen, readSeen } from "@/lib/discover-seen";
import { EPOCH_LABELS, GENRE_LABELS } from "@/lib/epochs";
import { buildTasteProfile, recommend, type Recommendation } from "@/lib/recommend";

/**
 * Module scope, not component state: set once by the first mount of any
 * page during this load and reused by every later navigation within the
 * SPA, so the lineup stays put while browsing. A full reload re-imports the
 * module and draws a fresh one.
 */
let visitSeed: number | null = null;

function drawSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

/** Cards added per initial load or "show more" click. */
const BATCH_SIZE = 12;

function resolveFavorites(
  favoriteIds: readonly string[],
  source: readonly SearchableWork[],
): SearchableWork[] {
  const byId = new Map(source.map((work) => [work.id, work]));
  return favoriteIds
    .map((id) => byId.get(id))
    .filter((work): work is SearchableWork => work !== undefined);
}

function reasonNote(
  reason: Recommendation["reason"],
  locale: Locale,
  composers: ComposerOption[],
): string | undefined {
  const messages = getMessages(locale);
  switch (reason.kind) {
    case "composer": {
      const composer = composers.find((c) => c.id === reason.composerId);
      if (!composer) return undefined;
      const name = locale === "ja" ? composer.nameJa : composer.completeName;
      return messages.discover.reason.composer.replace("{name}", name);
    }
    case "genre":
      return messages.discover.reason.genre.replace(
        "{label}",
        GENRE_LABELS[reason.genre][locale],
      );
    case "epoch":
      return messages.discover.reason.epoch.replace(
        "{label}",
        EPOCH_LABELS[reason.epoch][locale],
      );
    case "popular":
      return undefined;
  }
}

/**
 * The "no specific search" journey: something to listen to without setting
 * any filter. Built from the visitor's favourites when they have any;
 * `recommend()` degrades gracefully to a popularity-weighted pick under an
 * empty taste profile otherwise (`buildTasteProfile([]) === EMPTY_PROFILE`,
 * see `src/lib/recommend.ts`), so the same call serves both cases — no
 * separate "popular picks" code path to keep in sync.
 */
export function Recommendations({
  locale,
  composers,
  initialWorks,
}: {
  locale: Locale;
  composers: ComposerOption[];
  /** Popularity-sorted works, rendered until favourites and the work index
   *  are both ready. Keeps first paint — and the static export's HTML —
   *  from ever showing an empty feed. */
  initialWorks: SearchableWork[];
}) {
  const { workIds, ready } = useFavorites();
  const messages = getMessages(locale);
  const [works, setWorks] = useState<SearchableWork[] | null>(null);
  // Lazy `useState` initialiser, not an effect: it runs once per mount and
  // is idempotent (the module-level cache short-circuits Strict Mode's
  // double invocation), so it is the sanctioned one-shot escape hatch for a
  // value that does not need to be pure across renders — unlike the picks
  // below, which do need to wait for real data and so stay effect-driven.
  const [seed] = useState<number>(() => {
    if (visitSeed === null) visitSeed = drawSeed();
    return visitSeed;
  });
  const [picks, setPicks] = useState<Recommendation[] | null>(null);
  const [canLoadMore, setCanLoadMore] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchWorkIndex()
      .then((rows) => {
        if (!cancelled) setWorks(joinComposers(rows, composers));
      })
      .catch(() => {
        if (!cancelled) setWorks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [composers]);

  // Read outside the effect below so favouriting or unfavouriting a work
  // during this visit cannot retrigger a recompute: pressing the heart on a
  // recommended card must not make that card vanish out from under the
  // pointer. The list only grows via "show more"; nothing else re-derives it.
  const favoriteIdsRef = useRef<string[]>(workIds);
  useEffect(() => {
    favoriteIdsRef.current = workIds;
  }, [workIds]);

  useEffect(() => {
    if (!ready || works === null) return;
    const favorites = resolveFavorites(favoriteIdsRef.current, works);
    const profile = buildTasteProfile(favorites);
    const result = recommend(works, profile, {
      seed,
      count: BATCH_SIZE,
      recentlyShown: readSeen(),
    });
    setPicks(result);
    setCanLoadMore(result.length >= BATCH_SIZE);
    pushSeen(result.map((r) => r.work.id));
  }, [ready, works, seed]);

  function showMore() {
    if (works === null || picks === null) return;
    const profile = buildTasteProfile(resolveFavorites(favoriteIdsRef.current, works));
    // Distinct per batch so it doesn't just reproduce the same picks.
    const nextSeed = (seed + picks.length * 2654435761) >>> 0;
    const more = recommend(works, profile, {
      seed: nextSeed,
      count: BATCH_SIZE,
      exclude: picks.map((r) => r.work.id),
      recentlyShown: readSeen(),
    });
    setPicks([...picks, ...more]);
    setCanLoadMore(more.length >= BATCH_SIZE);
    pushSeen(more.map((r) => r.work.id));
  }

  return (
    <section
      className="mx-auto max-w-6xl px-4 pb-8 pt-2 sm:px-6"
      data-testid="discover"
    >
      <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {picks === null
          ? initialWorks.slice(0, BATCH_SIZE).map((work) => (
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
                  stars={work.stars}
                />
              </li>
            ))
          : picks.map(({ work, reason }) => (
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
                  stars={work.stars}
                  note={reasonNote(reason, locale, composers)}
                />
              </li>
            ))}
      </ul>
      {picks !== null && canLoadMore && (
        <button
          type="button"
          onClick={showMore}
          className="mt-6 w-full rounded-md border border-line py-3 text-sm text-ink-soft hover:border-accent/40 hover:text-accent"
        >
          {messages.filters.showMore}
        </button>
      )}
    </section>
  );
}
