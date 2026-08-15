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
 * module and draws a fresh one. "Shuffle" reassigns it explicitly.
 */
let visitSeed: number | null = null;

function drawSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
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
 * "Next thing to listen to", computed entirely client-side from the
 * visitor's favourites (see `src/lib/recommend.ts`). Renders nothing until
 * favourites have been read from localStorage and the work index has
 * arrived, and nothing at all when there are no favourites yet — the
 * catalogue below is the entry point for a first-time visitor, not this.
 */
export function Recommendations({
  locale,
  composers,
}: {
  locale: Locale;
  composers: ComposerOption[];
}) {
  const { workIds, ready } = useFavorites();
  const messages = getMessages(locale);
  const [works, setWorks] = useState<SearchableWork[] | null>(null);
  // Lazy `useState` initialiser, not an effect: it runs once per mount and
  // is idempotent (the module-level cache short-circuits Strict Mode's
  // double invocation), so it is the sanctioned one-shot escape hatch for a
  // value that does not need to be pure across renders — unlike the seed's
  // *consequences* (the picks below), which do need to wait for real data
  // and so stay effect-driven. The picks stay `null` regardless of which
  // seed value lands here, so there is nothing for a hydration mismatch to
  // grab onto.
  const [seed, setSeed] = useState<number>(() => {
    if (visitSeed === null) visitSeed = drawSeed();
    return visitSeed;
  });
  const [picks, setPicks] = useState<Recommendation[] | null>(null);

  // Same memoised fetch the catalogue browser and the favourites list use.
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
  // pointer. The list only changes when `seed` changes (reload or Shuffle).
  const favoriteIdsRef = useRef<string[]>(workIds);
  useEffect(() => {
    favoriteIdsRef.current = workIds;
  }, [workIds]);

  useEffect(() => {
    if (!ready || works === null) return;
    const byId = new Map(works.map((work) => [work.id, work]));
    const favorites = favoriteIdsRef.current
      .map((id) => byId.get(id))
      .filter((work): work is SearchableWork => work !== undefined);

    if (favorites.length === 0) {
      setPicks(null);
      return;
    }

    const profile = buildTasteProfile(favorites);
    const recentlyShown = readSeen();
    const result = recommend(works, profile, { seed, recentlyShown });
    setPicks(result);
    pushSeen(result.map((r) => r.work.id));
  }, [ready, works, seed]);

  function shuffle() {
    visitSeed = drawSeed();
    setSeed(visitSeed);
  }

  if (!ready || works === null || picks === null || picks.length === 0) {
    return null;
  }

  return (
    <section
      className="mx-auto max-w-6xl px-4 py-8 sm:px-6"
      data-testid="discover"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg font-medium text-ink">
            {messages.discover.heading}
          </h2>
          <p className="mt-1 text-sm text-ink-faint">{messages.discover.hint}</p>
        </div>
        <button
          type="button"
          onClick={shuffle}
          className="text-sm text-accent underline underline-offset-2"
        >
          {messages.discover.refresh}
        </button>
      </div>
      <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {picks.map(({ work, reason }) => (
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
    </section>
  );
}
