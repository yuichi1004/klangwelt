import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ComposerPortrait } from "@/components/composer-portrait";
import { StarRating } from "@/components/star-rating";
import { getMessages, isLocale, LOCALES } from "@/i18n/config";
import { composers, getPortraitCredit } from "@/lib/catalog";
import { EPOCHS, EPOCH_LABELS, EPOCH_YEARS } from "@/lib/epochs";

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

  // Grouped by period, which reads as a rough timeline of music history.
  const byEpoch = EPOCHS.map((epoch) => ({
    epoch,
    members: composers
      .filter((composer) => composer.epoch === epoch)
      .sort((a, b) => a.birthYear - b.birthYear),
  })).filter((group) => group.members.length > 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-serif text-2xl font-medium text-ink sm:text-3xl">
        {messages.nav.composers}
      </h1>

      {byEpoch.map((group) => (
        <section key={group.epoch} className="mt-10">
          <h2 className="mb-4 flex items-baseline gap-3 border-b border-line pb-2">
            <span className="font-serif text-xl font-medium text-ink">
              {EPOCH_LABELS[group.epoch][locale]}
            </span>
            <span className="text-xs text-ink-faint">
              {EPOCH_YEARS[group.epoch]}
            </span>
            <span className="ml-auto text-xs text-ink-faint">
              {group.members.length}
            </span>
          </h2>

          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {group.members.map((composer) => (
              <li key={composer.id}>
                <Link
                  href={`/${locale}/composers/${composer.id}`}
                  className="group block"
                >
                  <ComposerPortrait
                    locale={locale}
                    composer={composer}
                    credit={getPortraitCredit(composer.id)}
                    size={128}
                    showCredit={false}
                  />
                  <p className="mt-2 text-sm font-medium leading-snug text-ink group-hover:text-accent">
                    {locale === "ja" ? composer.nameJa : composer.completeName}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-ink-faint">
                    <span>
                      {composer.birthYear}
                      {composer.deathYear === null
                        ? "–"
                        : `–${composer.deathYear}`}{" "}
                      · {composer.coreWorkCount}
                    </span>
                    <StarRating locale={locale} stars={composer.stars} />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
