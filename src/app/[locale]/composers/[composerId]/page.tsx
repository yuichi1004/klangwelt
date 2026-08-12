import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ComposerAllWorks } from "@/components/composer-all-works";
import { ComposerFlag } from "@/components/composer-flag";
import { ComposerPortrait } from "@/components/composer-portrait";
import { GlossaryText } from "@/components/glossary-text";
import { StarRating } from "@/components/star-rating";
import { WorkCard } from "@/components/work-card";
import { getMessages, isLocale, LOCALES } from "@/i18n/config";
import {
  composers,
  getComposer,
  getCoreWorksByComposer,
  getPortraitCredit,
} from "@/lib/catalog";
import { COUNTRY_LABELS } from "@/lib/countries";
import { getComposerEditorial } from "@/lib/editorial";
import { EPOCH_LABELS, EPOCH_YEARS } from "@/lib/epochs";
import { createAnnotator, glossary } from "@/lib/glossary";

export function generateStaticParams() {
  return LOCALES.flatMap((locale) =>
    composers.map((composer) => ({ locale, composerId: composer.id })),
  );
}

export async function generateMetadata(
  props: PageProps<"/[locale]/composers/[composerId]">,
): Promise<Metadata> {
  const { locale, composerId } = await props.params;
  if (!isLocale(locale)) return {};

  const composer = getComposer(composerId);
  if (!composer) return {};

  return {
    title: locale === "ja" ? composer.nameJa : composer.completeName,
    alternates: {
      languages: Object.fromEntries(
        LOCALES.map((candidate) => [
          candidate,
          `/${candidate}/composers/${composerId}`,
        ]),
      ),
    },
  };
}

export default async function ComposerPage(
  props: PageProps<"/[locale]/composers/[composerId]">,
) {
  const { locale, composerId } = await props.params;
  if (!isLocale(locale)) notFound();

  const composer = getComposer(composerId);
  if (!composer) notFound();

  const messages = getMessages(locale);
  const editorial = getComposerEditorial(composerId);
  const credit = getPortraitCredit(composerId);
  const coreWorks = getCoreWorksByComposer(composerId);
  // One annotator for the whole page, called in the order the reader
  // actually encounters each block (style, then biography, impact, story)
  // so a term already underlined once does not repeat further down the
  // page. See `createAnnotator` in `src/lib/glossary.ts`.
  const annotate = createAnnotator(glossary, locale);
  // `coreWorks` is already sorted by 定番度 score (see build-catalog.ts), so
  // the first few are the highest-rated works with no extra work here.
  const startHereWorks = coreWorks.slice(0, 3);

  const name = locale === "ja" ? composer.nameJa : composer.completeName;
  const lifespan =
    composer.deathYear === null
      ? messages.common.yearsLiving.replace("{birth}", String(composer.birthYear))
      : messages.common.years
          .replace("{birth}", String(composer.birthYear))
          .replace("{death}", String(composer.deathYear));

  return (
    <article className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href={`/${locale}/composers`}
        className="text-sm text-ink-faint hover:text-accent"
      >
        ← {messages.composer.browseAll}
      </Link>

      <header className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
        <ComposerPortrait locale={locale} composer={composer} credit={credit} />

        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-2xl font-medium text-ink sm:text-3xl">
            {name}
          </h1>
          {locale === "ja" && composer.nameJa !== composer.completeName && (
            <p className="mt-1.5 text-sm text-ink-faint">
              {composer.completeName}
            </p>
          )}
          <dl className="mt-4 space-y-1.5 text-sm">
            {composer.nationality && (
              <div className="flex gap-3">
                <dt className="w-20 shrink-0 text-ink-faint">
                  {messages.composer.nationality}
                </dt>
                <dd className="text-ink-soft">
                  <span className="inline-flex items-center gap-1.5">
                    <ComposerFlag
                      locale={locale}
                      country={composer.nationality.country}
                      size={14}
                    />
                    {COUNTRY_LABELS[composer.nationality.country][locale]}
                  </span>
                  {composer.nationality.note && (
                    <p className="mt-1 text-xs text-ink-faint">
                      {composer.nationality.note[locale]}
                    </p>
                  )}
                </dd>
              </div>
            )}
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-ink-faint">
                {messages.composer.born}
              </dt>
              <dd className="text-ink-soft">{lifespan}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-ink-faint">
                {messages.composer.epoch}
              </dt>
              <dd className="text-ink-soft">
                {EPOCH_LABELS[composer.epoch][locale]}
                <span className="ml-2 text-xs text-ink-faint">
                  {EPOCH_YEARS[composer.epoch]}
                </span>
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-ink-faint">
                {messages.composer.workCount}
              </dt>
              <dd className="text-ink-soft">
                {composer.workCount.toLocaleString()}
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-ink-faint">
                {messages.rating.label}
              </dt>
              <dd className="text-ink-soft">
                <StarRating locale={locale} stars={composer.stars} variant="full" />
              </dd>
            </div>
          </dl>
        </div>
      </header>

      {(editorial?.style || editorial?.keywords) && (
        <section className="mt-9 rounded-xl border border-accent/40 bg-accent-soft/40 p-5 sm:p-6">
          <h2 className="mb-3 font-serif text-lg font-medium text-ink">
            {messages.composer.styleHeading}
          </h2>
          {editorial.keywords && (
            <ul className="mb-3 flex flex-wrap gap-1.5">
              {editorial.keywords[locale].map((word) => (
                <li
                  key={word}
                  className="rounded-full bg-accent-fill px-2.5 py-1 text-xs font-medium text-accent-ink"
                >
                  {word}
                </li>
              ))}
            </ul>
          )}
          {editorial.style && (
            <p className="whitespace-pre-line text-[0.9375rem] leading-loose text-ink-soft">
              <GlossaryText
                locale={locale}
                glossary={glossary}
                segments={annotate(editorial.style[locale])}
              />
            </p>
          )}
          {startHereWorks.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-faint">
                {messages.composer.startHere}
              </span>
              {startHereWorks.map((work) => (
                <Link
                  key={work.id}
                  href={`/${locale}/works/${work.id}`}
                  className="rounded-full border border-accent/50 bg-paper px-3 py-1 text-sm text-accent hover:bg-accent-soft"
                >
                  {locale === "ja" ? work.titleJa : work.title}
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {editorial ? (
        <>
          {editorial.biography && (
            <section className="mt-9">
              <h2 className="mb-3 font-serif text-lg font-medium text-ink">
                {messages.composer.biographyHeading}
              </h2>
              <p className="whitespace-pre-line text-[0.9375rem] leading-loose text-ink-soft">
                <GlossaryText
                  locale={locale}
                  glossary={glossary}
                  segments={annotate(editorial.biography[locale])}
                />
              </p>
            </section>
          )}

          {editorial.impact && (
            <section className="mt-9">
              <h2 className="mb-3 font-serif text-lg font-medium text-ink">
                {messages.composer.impactHeading}
              </h2>
              <p className="whitespace-pre-line text-[0.9375rem] leading-loose text-ink-soft">
                <GlossaryText
                  locale={locale}
                  glossary={glossary}
                  segments={annotate(editorial.impact[locale])}
                />
              </p>
            </section>
          )}

          {editorial.story && (
            <section className="mt-9">
              <h2 className="mb-3 font-serif text-lg font-medium text-ink">
                {messages.composer.storyHeading}
              </h2>
              <p className="whitespace-pre-line text-[0.9375rem] leading-loose text-ink-soft">
                <GlossaryText
                  locale={locale}
                  glossary={glossary}
                  segments={annotate(editorial.story[locale])}
                />
              </p>
            </section>
          )}
        </>
      ) : (
        <section className="mt-9">
          <h2 className="mb-3 font-serif text-lg font-medium text-ink">
            {messages.composer.biographyHeading}
          </h2>
          <p className="rounded-lg border border-dashed border-line p-5 text-sm text-ink-faint">
            {messages.composer.biographyMissing}
          </p>
        </section>
      )}

      {coreWorks.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-3 font-serif text-lg font-medium text-ink">
            {messages.composer.coreWorks}
          </h2>
          <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {coreWorks.map((work) => (
              <li key={work.id}>
                <WorkCard
                  locale={locale}
                  workId={work.id}
                  title={locale === "ja" ? work.titleJa : work.title}
                  secondaryTitle={locale === "ja" ? work.title : undefined}
                  composerName=""
                  genre={work.genre}
                  stars={work.stars}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <ComposerAllWorks
        locale={locale}
        composerId={composer.id}
        coreWorkIds={coreWorks.map((work) => work.id)}
        totalCount={composer.workCount}
      />
    </article>
  );
}
