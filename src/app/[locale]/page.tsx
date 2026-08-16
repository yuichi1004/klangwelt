import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CatalogBrowser } from "@/components/catalog-browser";
import { CatalogFallback } from "@/components/catalog-fallback";
import { HeroSearch } from "@/components/hero-search";
import { Recommendations } from "@/components/recommendations";
import { getMessages, isLocale, LOCALES } from "@/i18n/config";
import {
  buildComposerOptions,
  buildSearchIndex,
  catalogMeta,
  EMPTY_FILTERS,
} from "@/lib/catalog";
import { sortWorks } from "@/lib/catalog";
import { writeFilters } from "@/lib/catalog-url";
import { EPOCH_LABELS, GENRE_LABELS } from "@/lib/epochs";

/** Matches the client's page size so the list does not jump on hydration. */
const INITIAL_WORKS = 40;

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function CatalogPage(props: PageProps<"/[locale]">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const messages = getMessages(locale);
  const composers = buildComposerOptions();
  // Only the first page is baked into the HTML — enough for first paint and
  // for crawlers. The browser then fetches the full index as a cacheable
  // static asset and takes over the filtering.
  const initialWorks = sortWorks(buildSearchIndex(), "standard", locale).slice(
    0,
    INITIAL_WORKS,
  );

  // A handful of one-tap entries into the catalogue, so the hero offers an
  // action beyond scrolling. Plain links — `writeFilters` already builds the
  // same URLs the filter panel does, so no client state is needed here.
  const heroShortcuts = [
    {
      href: writeFilters({ ...EMPTY_FILTERS, epochs: ["Baroque"] }, "standard"),
      label: EPOCH_LABELS.Baroque[locale],
    },
    {
      href: writeFilters({ ...EMPTY_FILTERS, epochs: ["Romantic"] }, "standard"),
      label: EPOCH_LABELS.Romantic[locale],
    },
    {
      href: writeFilters({ ...EMPTY_FILTERS, genres: ["Keyboard"] }, "standard"),
      label: GENRE_LABELS.Keyboard[locale],
    },
    {
      href: writeFilters({ ...EMPTY_FILTERS, genres: ["Orchestral"] }, "standard"),
      label: GENRE_LABELS.Orchestral[locale],
    },
    {
      href: writeFilters({ ...EMPTY_FILTERS, minStars: 5 }, "standard"),
      label: messages.filters.starsOnly,
    },
  ];

  return (
    <>
      <section className="border-b border-terra/40 bg-terra-surface">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
          <h1 className="font-serif text-[1.75rem] font-medium leading-snug text-ink sm:text-4xl">
            {messages.site.tagline}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-loose text-ink-soft">
            {messages.site.description}
          </p>

          <HeroSearch locale={locale} />

          <div
            role="group"
            aria-label={messages.hero.quickFiltersLabel}
            className="mt-3 flex flex-wrap gap-1.5"
          >
            {heroShortcuts.map((shortcut) => (
              <Link
                key={shortcut.href}
                href={`/${locale}${shortcut.href}`}
                className="rounded-full border border-line px-3 py-1.5 text-sm text-ink-soft transition-colors hover:border-accent/40 hover:text-accent"
              >
                {shortcut.label}
              </Link>
            ))}
          </div>

          <p className="mt-6 text-sm text-ink-soft">
            {locale === "ja"
              ? `作曲家 ${catalogMeta.composerCount}名 / 楽曲 ${catalogMeta.coreWorkCount.toLocaleString()}曲`
              : `${catalogMeta.composerCount} composers · ${catalogMeta.coreWorkCount.toLocaleString()} works`}
          </p>
        </div>
      </section>

      <Recommendations locale={locale} composers={composers} />

      {/*
        `CatalogBrowser` reads the filters out of the query string, which Next
        only allows inside a Suspense boundary. The fallback renders the same
        first page of results, so the static HTML is never empty.
      */}
      <Suspense
        fallback={
          <CatalogFallback
            locale={locale}
            works={initialWorks}
            totalCount={catalogMeta.coreWorkCount}
          />
        }
      >
        <CatalogBrowser
          locale={locale}
          initialWorks={initialWorks}
          totalCount={catalogMeta.coreWorkCount}
          composers={composers}
        />
      </Suspense>
    </>
  );
}
