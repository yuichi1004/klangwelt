import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ComposerBrowser } from "@/components/composer-browser";
import { ComposerFallback } from "@/components/composer-fallback";
import { getMessages, isLocale, LOCALES } from "@/i18n/config";
import { buildComposerCards } from "@/lib/catalog";
import {
  DEFAULT_COMPOSER_FILTERS,
  filterComposers,
  groupComposersByEpoch,
} from "@/lib/composer-filter";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata(
  props: PageProps<"/[locale]/composers">,
): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  return { title: getMessages(locale).nav.composers };
}

export default async function ComposersPage(
  props: PageProps<"/[locale]/composers">,
) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const messages = getMessages(locale);
  const cards = buildComposerCards();
  // The default (★3 and up) view, baked into the static HTML so first paint
  // and crawlers see real content instead of a spinner. `ComposerBrowser`
  // takes over once its Suspense boundary resolves on the client.
  const defaultGroups = groupComposersByEpoch(
    filterComposers(cards, DEFAULT_COMPOSER_FILTERS),
  );

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12">
      <h1 className="font-serif text-2xl font-medium text-ink sm:text-3xl">
        {messages.nav.composers}
      </h1>

      {/*
        `ComposerBrowser` reads the filters out of the query string, which
        Next only allows inside a Suspense boundary. The fallback renders the
        same default-filtered grid, so the static HTML is never empty.
      */}
      <Suspense
        fallback={
          <ComposerFallback
            locale={locale}
            groups={defaultGroups}
            totalCount={cards.length}
          />
        }
      >
        <ComposerBrowser locale={locale} cards={cards} />
      </Suspense>
    </div>
  );
}
