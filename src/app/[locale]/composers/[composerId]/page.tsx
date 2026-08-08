import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ComposerAllWorks } from "@/components/composer-all-works";
import { ComposerPortrait } from "@/components/composer-portrait";
import { WorkCard } from "@/components/work-card";
import { getMessages, isLocale, LOCALES } from "@/i18n/config";
import {
  composers,
  getComposer,
  getCoreWorksByComposer,
  getPortraitCredit,
} from "@/lib/catalog";
import { getComposerEditorial } from "@/lib/editorial";
import { EPOCH_LABELS, EPOCH_YEARS } from "@/lib/epochs";

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
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {name}
          </h1>
          {locale === "ja" && composer.nameJa !== composer.completeName && (
            <p className="mt-1.5 text-sm text-ink-faint">
              {composer.completeName}
            </p>
          )}
          <dl className="mt-4 space-y-1.5 text-sm">
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
          </dl>
        </div>
      </header>

      <section className="mt-9">
        <h2 className="mb-3 text-sm font-semibold text-ink">
          {messages.composer.biographyHeading}
        </h2>
        {editorial?.biography ? (
          <div className="space-y-5">
            <p className="whitespace-pre-line text-sm leading-relaxed text-ink-soft">
              {editorial.biography[locale]}
            </p>
            {editorial.story && (
              <div>
                <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-faint">
                  {messages.composer.storyHeading}
                </h3>
                <p className="whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                  {editorial.story[locale]}
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-line p-5 text-sm text-ink-faint">
            {messages.composer.biographyMissing}
          </p>
        )}
      </section>

      {coreWorks.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold text-ink">
            {messages.composer.coreWorks}
          </h2>
          <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {coreWorks.map((work) => (
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
