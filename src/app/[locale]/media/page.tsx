import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { MediaBrowser } from "@/components/media-browser";
import { MediaFallback } from "@/components/media-fallback";
import { getMessages, isLocale, LOCALES } from "@/i18n/config";
import { buildMediaCards } from "@/lib/catalog";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata(
  props: PageProps<"/[locale]/media">,
): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  return { title: getMessages(locale).nav.media };
}

export default async function MediaPage(props: PageProps<"/[locale]/media">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const messages = getMessages(locale);
  const cards = buildMediaCards();

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12">
      <h1 className="font-serif text-2xl font-medium text-ink sm:text-3xl">
        {messages.media.heading}
      </h1>
      <p className="mt-2 text-sm text-ink-soft">{messages.media.description}</p>

      {/*
        `MediaBrowser` reads the filters out of the query string, which Next
        only allows inside a Suspense boundary. The fallback renders the same
        unfiltered grid, so the static HTML is never empty.
      */}
      <Suspense fallback={<MediaFallback locale={locale} cards={cards} />}>
        <MediaBrowser locale={locale} cards={cards} />
      </Suspense>
    </div>
  );
}
