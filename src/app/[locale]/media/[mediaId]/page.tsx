import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/page-container";
import { WorkCard } from "@/components/work-card";
import { WorkCardGrid } from "@/components/work-card-grid";
import { getMessages, isLocale, LOCALES } from "@/i18n/config";
import { getComposer, getMediaEntry, getWork, mediaIndex } from "@/lib/catalog";
import { MEDIA_KIND_LABELS } from "@/lib/media";
import { buildOpenGraph } from "@/lib/og";

/**
 * Every production gets a page, same as composers and core works — the
 * index is small (~180 entries, see `src/lib/media-index.ts`), so there is
 * no long-tail split to worry about.
 */
export function generateStaticParams() {
  return LOCALES.flatMap((locale) =>
    mediaIndex.map((entry) => ({ locale, mediaId: entry.id })),
  );
}

export async function generateMetadata(
  props: PageProps<"/[locale]/media/[mediaId]">,
): Promise<Metadata> {
  const { locale, mediaId } = await props.params;
  if (!isLocale(locale)) return {};

  const entry = getMediaEntry(mediaId);
  if (!entry) return {};

  const messages = getMessages(locale);
  const title = entry.title[locale];

  return {
    title,
    alternates: {
      languages: Object.fromEntries(
        LOCALES.map((candidate) => [candidate, `/${candidate}/media/${mediaId}`]),
      ),
    },
    ...buildOpenGraph(locale, { title, description: messages.media.description }),
  };
}

export default async function MediaEntryPage(
  props: PageProps<"/[locale]/media/[mediaId]">,
) {
  const { locale, mediaId } = await props.params;
  if (!isLocale(locale)) notFound();

  const entry = getMediaEntry(mediaId);
  if (!entry) notFound();

  const messages = getMessages(locale);

  // Every `workId` here was verified against the core index at build time
  // (`build-catalog.ts`'s orphan check, upstream of `buildMediaIndex`), so
  // `getWork`/`getComposer` resolving is not defensive — it's just typing.
  const works = entry.works
    .map(({ workId, note }) => {
      const work = getWork(workId);
      const composer = work ? getComposer(work.composerId) : undefined;
      return work && composer ? { work, composer, note } : undefined;
    })
    .filter((item): item is NonNullable<typeof item> => item !== undefined);

  return (
    <PageContainer as="article" className="py-8 sm:py-12">
      <Link
        href={`/${locale}/media`}
        className="text-sm text-ink-faint hover:text-accent"
      >
        ← {messages.media.browseAll}
      </Link>

      <header className="mt-4">
        <h1 className="font-serif text-2xl font-medium leading-snug text-ink sm:text-3xl">
          {entry.title[locale]}
        </h1>
        {locale === "ja" && entry.title.ja !== entry.title.en && (
          <p className="mt-2 text-sm text-ink-faint">{entry.title.en}</p>
        )}
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-soft">
          <span>{entry.year}</span>
          <span className="rounded-full bg-terra-surface px-2 py-0.5 text-xs text-ink">
            {MEDIA_KIND_LABELS[entry.kind][locale]}
          </span>
        </p>
      </header>

      {works.length > 0 && (
        <section className="mt-9">
          <h2 className="mb-3 font-serif text-lg font-medium text-ink">
            {messages.media.usedIn}
          </h2>
          <WorkCardGrid>
            {works.map(({ work, composer, note }) => (
              <li key={work.id}>
                {/* The catalogue's unit is the whole work, but `note` is
                    scoped to this production's use of it — passed as
                    `appearanceNote` (not `WorkCard`'s own `note` prop, whose
                    contract is a short line above the title) so it renders
                    inside the card's own box. See `MediaSection` on the work
                    page for the equivalent card-with-note pattern. */}
                <WorkCard
                  locale={locale}
                  workId={work.id}
                  title={locale === "ja" ? work.titleJa : work.title}
                  secondaryTitle={locale === "ja" ? work.title : undefined}
                  composerName={
                    locale === "ja" ? composer.nameJa : composer.completeName
                  }
                  genre={work.genre}
                  stars={work.stars}
                  appearanceNote={note?.[locale]}
                />
              </li>
            ))}
          </WorkCardGrid>
        </section>
      )}
    </PageContainer>
  );
}
