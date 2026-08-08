import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CatalogBrowser } from "@/components/catalog-browser";
import { CatalogFallback } from "@/components/catalog-fallback";
import { getMessages, isLocale, LOCALES } from "@/i18n/config";
import {
  buildComposerOptions,
  buildSearchIndex,
  catalogMeta,
} from "@/lib/catalog";
import { sortWorks } from "@/lib/catalog";

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
  const initialWorks = sortWorks(buildSearchIndex(), "popular", locale).slice(
    0,
    INITIAL_WORKS,
  );

  return (
    <>
      <section className="border-b border-terra/40 bg-terra-surface">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-20">
          <h1 className="font-serif text-[1.75rem] font-medium leading-snug text-ink sm:text-4xl">
            {messages.site.tagline}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-loose text-ink-soft">
            {messages.site.description}
          </p>
          <p className="mt-6 text-xs text-ink-faint">
            {locale === "ja"
              ? `作曲家 ${catalogMeta.composerCount}名 / 楽曲 ${catalogMeta.coreWorkCount.toLocaleString()}曲`
              : `${catalogMeta.composerCount} composers · ${catalogMeta.coreWorkCount.toLocaleString()} works`}
          </p>
        </div>
      </section>

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
