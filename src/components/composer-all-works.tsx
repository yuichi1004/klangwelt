"use client";

import { useEffect, useState } from "react";

import { WorkCard } from "@/components/work-card";
import { getMessages, type Locale } from "@/i18n/config";
import { fetchAllWorksByComposer } from "@/lib/catalog";
import type { Work } from "@/lib/catalog-types";
import { GENRES, GENRE_LABELS, type Genre } from "@/lib/epochs";

const PAGE_SIZE = 60;

/**
 * A composer's complete catalogue, fetched on demand.
 *
 * Only ~1,286 of the 25,195 works are bundled into the app; the rest live in
 * `public/data/works/<id>.json` and are pulled in when someone actually opens
 * this section. Works outside the core index have no detail page, so their
 * cards are not links.
 */
export function ComposerAllWorks({
  locale,
  composerId,
  coreWorkIds,
  totalCount,
}: {
  locale: Locale;
  composerId: string;
  coreWorkIds: string[];
  totalCount: number;
}) {
  const messages = getMessages(locale);
  const [open, setOpen] = useState(false);
  const [works, setWorks] = useState<Work[] | null>(null);
  const [error, setError] = useState(false);
  const [genre, setGenre] = useState<Genre | "all">("all");
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    if (!open || works || error) return;
    let cancelled = false;
    fetchAllWorksByComposer(composerId)
      .then((loaded) => {
        if (!cancelled) setWorks(loaded);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, works, error, composerId]);

  const core = new Set(coreWorkIds);
  const filtered = (works ?? []).filter(
    (work) => genre === "all" || work.genre === genre,
  );

  return (
    <section className="mt-10">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg border border-line bg-paper-raised px-5 py-4 text-sm text-ink-soft transition-colors hover:border-accent/50 hover:bg-accent-soft"
      >
        <span className="font-serif text-lg font-medium text-ink">
          {messages.composer.allWorks}
        </span>
        <span className="text-ink-faint">
          {messages.composer.allWorksCount.replace(
            "{count}",
            totalCount.toLocaleString(),
          )}{" "}
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="mt-4">
          {error && (
            <p className="rounded-lg border border-dashed border-line p-5 text-sm text-ink-faint">
              {messages.filters.noResults}
            </p>
          )}

          {!works && !error && (
            <p className="p-5 text-sm text-ink-faint">
              {messages.composer.loadingWorks}
            </p>
          )}

          {works && (
            <>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {(["all", ...GENRES] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setGenre(value as Genre | "all");
                      setVisible(PAGE_SIZE);
                    }}
                    aria-pressed={genre === value}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      genre === value
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line text-ink-soft hover:border-accent/40"
                    }`}
                  >
                    {value === "all"
                      ? messages.filters.all
                      : GENRE_LABELS[value][locale]}
                  </button>
                ))}
              </div>

              <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                {filtered.slice(0, visible).map((work) => (
                  <li key={work.id}>
                    <WorkCard
                      locale={locale}
                      workId={work.id}
                      title={locale === "ja" ? work.titleJa : work.title}
                      secondaryTitle={locale === "ja" ? work.title : undefined}
                      composerName=""
                      genre={work.genre}
                      popular={work.popular}
                      recommended={work.recommended}
                      linkToDetail={core.has(work.id)}
                    />
                  </li>
                ))}
              </ul>

              {visible < filtered.length && (
                <button
                  type="button"
                  onClick={() => setVisible((count) => count + PAGE_SIZE)}
                  className="mt-4 w-full rounded-md border border-line py-3 text-sm text-ink-soft hover:border-accent/40 hover:text-accent"
                >
                  {messages.filters.showMore}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
