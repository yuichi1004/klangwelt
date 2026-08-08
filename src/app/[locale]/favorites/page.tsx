import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FavoritesList } from "@/components/favorites-list";
import { getMessages, isLocale, LOCALES } from "@/i18n/config";
import { buildComposerOptions } from "@/lib/catalog";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata(
  props: PageProps<"/[locale]/favorites">,
): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  return {
    title: getMessages(locale).favorites.heading,
    robots: { index: false },
  };
}

export default async function FavoritesPage(
  props: PageProps<"/[locale]/favorites">,
) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const messages = getMessages(locale);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-serif text-2xl font-medium text-ink sm:text-3xl">
        {messages.favorites.heading}
      </h1>
      <p className="mb-6 mt-2 text-xs text-ink-faint">
        {messages.favorites.storageNote}
      </p>

      <FavoritesList locale={locale} composers={buildComposerOptions()} />
    </div>
  );
}
