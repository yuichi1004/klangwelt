import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FavoriteButton } from "@/components/favorite-button";
import { GlossaryText } from "@/components/glossary-text";
import { StreamingButtons } from "@/components/streaming-links";
import { WorkCard } from "@/components/work-card";
import { getMessages, isLocale, LOCALES, type Locale } from "@/i18n/config";
import {
  coreWorks,
  getComposer,
  getCoreWorksByComposer,
  getWork,
} from "@/lib/catalog";
import type { Composer, Work } from "@/lib/catalog-types";
import { getWorkEditorial } from "@/lib/editorial";
import { EPOCH_LABELS, GENRE_LABELS } from "@/lib/epochs";
import { createAnnotator, glossary } from "@/lib/glossary";
import { MEDIA_KIND_LABELS, type MediaAppearance } from "@/lib/media";
import { mediaId } from "@/lib/media-index";
import { buildStreamingLinks } from "@/lib/streaming";

/**
 * Only the 1,286 core works get a page. The remaining ~24k are reachable from
 * the composer pages, which link straight out to the streaming services —
 * prerendering all of them in both languages would mean 50k pages for content
 * that is only a title and a link.
 */
export function generateStaticParams() {
  return LOCALES.flatMap((locale) =>
    coreWorks.map((work) => ({ locale, workId: work.id })),
  );
}

export async function generateMetadata(
  props: PageProps<"/[locale]/works/[workId]">,
): Promise<Metadata> {
  const { locale, workId } = await props.params;
  if (!isLocale(locale)) return {};

  const work = getWork(workId);
  if (!work) return {};
  const composer = getComposer(work.composerId);

  const title = locale === "ja" ? work.titleJa : work.title;
  const composerName =
    locale === "ja" ? composer?.nameJa : composer?.completeName;

  return {
    title: `${title} — ${composerName ?? ""}`.trim(),
    alternates: {
      languages: Object.fromEntries(
        LOCALES.map((candidate) => [candidate, `/${candidate}/works/${workId}`]),
      ),
    },
  };
}

export default async function WorkPage(
  props: PageProps<"/[locale]/works/[workId]">,
) {
  const { locale, workId } = await props.params;
  if (!isLocale(locale)) notFound();

  const work = getWork(workId);
  if (!work) notFound();
  const composer = getComposer(work.composerId);
  if (!composer) notFound();

  const messages = getMessages(locale);
  const editorial = getWorkEditorial(workId);
  // Independent from the composer page's own annotator (each is a fresh
  // `createAnnotator` call): "first occurrence" is scoped per page, not per
  // site, so a term already shown on the composer's profile can still be
  // shown again here.
  const annotate = createAnnotator(glossary, locale);
  const links = buildStreamingLinks(work, composer.completeName);

  const title = locale === "ja" ? work.titleJa : work.title;
  const showOriginal = locale === "ja" && work.titleJa !== work.title;
  const composerName = locale === "ja" ? composer.nameJa : composer.completeName;

  const siblings = getCoreWorksByComposer(composer.id)
    .filter((sibling) => sibling.id !== work.id)
    .slice(0, 6);

  return (
    <article className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href={`/${locale}`}
        className="text-sm text-ink-faint hover:text-accent"
      >
        ← {messages.work.backToCatalog}
      </Link>

      <header className="mt-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-2xl font-medium leading-snug text-ink sm:text-3xl">
            {title}
          </h1>
          {showOriginal && (
            <p className="mt-2 text-sm text-ink-faint">{work.title}</p>
          )}
          <Link
            href={`/${locale}/composers/${composer.id}`}
            className="mt-3 inline-block text-sm text-accent underline underline-offset-2"
          >
            {composerName}
          </Link>
        </div>
        <FavoriteButton workId={work.id} locale={locale} />
      </header>

      <section className="mt-8">
        <h2 className="mb-3 font-serif text-lg font-medium text-ink">
          {messages.work.listenHeading}
        </h2>
        <StreamingButtons locale={locale} links={links} />
      </section>

      <WorkDataPanel locale={locale} work={work} composer={composer} />

      <section className="mt-8">
        <h2 className="mb-3 font-serif text-lg font-medium text-ink">
          {messages.work.notesHeading}
        </h2>
        {editorial ? (
          <div className="space-y-6">
            {editorial.structure && (
              <div>
                <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-faint">
                  {messages.work.structureHeading}
                </h3>
                <p className="whitespace-pre-line text-[0.9375rem] leading-loose text-ink-soft">
                  <GlossaryText
                    locale={locale}
                    glossary={glossary}
                    segments={annotate(editorial.structure[locale])}
                  />
                </p>
              </div>
            )}
            {editorial.story && (
              <div>
                <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-faint">
                  {messages.work.storyHeading}
                </h3>
                <p className="whitespace-pre-line text-[0.9375rem] leading-loose text-ink-soft">
                  <GlossaryText
                    locale={locale}
                    glossary={glossary}
                    segments={annotate(editorial.story[locale])}
                  />
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-line p-5 text-sm leading-relaxed text-ink-faint">
            {messages.work.notesMissing}
          </p>
        )}
      </section>

      {work.media && <MediaSection locale={locale} media={work.media} />}

      {siblings.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-3 font-serif text-lg font-medium text-ink">
            {messages.work.moreByComposer.replace("{name}", composerName)}
          </h2>
          <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {siblings.map((sibling) => (
              <li key={sibling.id}>
                <WorkCard
                  locale={locale}
                  workId={sibling.id}
                  title={locale === "ja" ? sibling.titleJa : sibling.title}
                  composerName={composerName}
                  genre={sibling.genre}
                  stars={sibling.stars}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

/**
 * Facts derived from the title by the parser, so every work has this panel
 * even when no one has written notes for it yet.
 */
function WorkDataPanel({
  locale,
  work,
  composer,
}: {
  locale: Locale;
  work: Work;
  composer: Composer;
}) {
  const messages = getMessages(locale);
  const { facts } = work;

  const lifespan =
    composer.deathYear === null
      ? messages.common.yearsLiving.replace("{birth}", String(composer.birthYear))
      : messages.common.years
          .replace("{birth}", String(composer.birthYear))
          .replace("{death}", String(composer.deathYear));

  const rows: Array<[string, string | undefined]> = [
    [messages.work.composer, `${locale === "ja" ? composer.nameJa : composer.completeName} (${lifespan})`],
    [messages.work.epoch, EPOCH_LABELS[composer.epoch][locale]],
    [messages.work.genre, GENRE_LABELS[work.genre][locale]],
    [
      messages.work.form,
      locale === "ja" ? (facts.formJa ?? facts.form) : facts.form,
    ],
    [
      messages.work.number,
      facts.number === undefined
        ? undefined
        : locale === "ja"
          ? `第${facts.number}番`
          : `No. ${facts.number}`,
    ],
    [messages.work.key, locale === "ja" ? facts.keyJa : facts.key],
    [
      messages.work.catalogue,
      (locale === "ja" ? facts.catalogueJa : facts.catalogue).join(" / ") ||
        undefined,
    ],
    [
      messages.work.nickname,
      locale === "ja" ? facts.nicknameJa : facts.nickname,
    ],
    [messages.work.instrumentation, facts.instrumentation],
  ];

  const visible = rows.filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <section className="mt-8">
      <h2 className="mb-3 font-serif text-lg font-medium text-ink">
        {messages.work.dataHeading}
      </h2>
      <dl className="overflow-hidden rounded-lg border border-line">
        {visible.map(([label, value], index) => (
          <div
            key={label}
            className={`flex gap-4 px-4 py-3 text-sm ${
              index % 2 === 0 ? "bg-paper-raised" : "bg-paper"
            }`}
          >
            <dt className="w-28 shrink-0 text-ink-faint">{label}</dt>
            <dd className="min-w-0 flex-1 text-ink-soft">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Hand-curated in `data/media.json`. The catalogue's unit is the whole work,
 * but the cue a film uses is very often one movement or a short excerpt of
 * it, so `note` — shown right under the title — is what actually tells the
 * reader "this is the bit you know" rather than leaving them to guess which
 * part of, say, a whole Wagner opera plays in the scene.
 *
 * The title links to `/media/[id]` (issue #91), where the id is recomputed
 * with `mediaId()` rather than stored on `MediaAppearance` itself — it is
 * always the same value `buildMediaIndex` used to build that page, so there
 * is nothing to keep in sync.
 */
function MediaSection({
  locale,
  media,
}: {
  locale: Locale;
  media: MediaAppearance[];
}) {
  const messages = getMessages(locale);

  return (
    <section className="mt-8">
      <h2 className="mb-3 font-serif text-lg font-medium text-ink">
        {messages.work.mediaHeading}
      </h2>
      <ul className="space-y-3">
        {media.map((appearance) => (
          <li
            key={mediaId(appearance.title.en, appearance.year)}
            className="rounded-lg border border-line bg-paper-raised p-4"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <Link
                href={`/${locale}/media/${mediaId(appearance.title.en, appearance.year)}`}
                className="font-serif text-base font-medium text-ink underline underline-offset-2 hover:text-accent"
              >
                {appearance.title[locale]}
              </Link>
              <span className="text-xs text-ink-faint">{appearance.year}</span>
              <span className="rounded-full bg-terra-surface px-2 py-0.5 text-xs text-ink">
                {MEDIA_KIND_LABELS[appearance.kind][locale]}
              </span>
            </div>
            {appearance.note && (
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                {appearance.note[locale]}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
