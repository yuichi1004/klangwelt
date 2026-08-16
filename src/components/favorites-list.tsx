"use client";

import { useEffect, useState } from "react";

import { useFavorites } from "@/components/favorites-provider";
import { WorkCard } from "@/components/work-card";
import { getMessages, type Locale } from "@/i18n/config";
import {
  fetchWorkIndex,
  joinComposers,
  type ComposerOption,
  type SearchableWork,
} from "@/lib/catalog";

/**
 * Renders entirely on the client: the static HTML cannot know what is in the
 * visitor's localStorage. Until `ready` flips, nothing is shown rather than
 * an "empty" message that would immediately be replaced.
 */
export function FavoritesList({
  locale,
  composers,
}: {
  locale: Locale;
  composers: ComposerOption[];
}) {
  const { workIds, ready } = useFavorites();
  const messages = getMessages(locale);
  const [works, setWorks] = useState<SearchableWork[] | null>(null);

  // Same cached asset the catalogue page uses, so this is usually a hit.
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

  if (!ready || works === null) {
    return <p className="text-sm text-ink-faint">{messages.common.loading}</p>;
  }

  const byId = new Map(works.map((work) => [work.id, work]));
  // Preserve the order favourites were added in, newest first.
  const saved = workIds
    .map((id) => byId.get(id))
    .filter((work): work is SearchableWork => work !== undefined);

  if (saved.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line p-10 text-center">
        <p className="text-ink-soft">{messages.favorites.empty}</p>
        <p className="mt-1 text-sm text-ink-faint">
          {messages.favorites.emptyHint}
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="mb-4 text-sm text-ink-soft">
        {messages.favorites.count.replace("{count}", String(saved.length))}
      </p>
      <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {saved.map((work) => (
          <li key={work.id}>
            <WorkCard
              locale={locale}
              workId={work.id}
              title={locale === "ja" ? work.titleJa : work.title}
              secondaryTitle={locale === "ja" ? work.title : undefined}
              composerName={
                locale === "ja" ? work.composerNameJa : work.composerName
              }
              composerPortrait={work.composerPortrait}
              genre={work.genre}
              stars={work.stars}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
