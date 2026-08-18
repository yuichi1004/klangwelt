import { MediaGrid } from "@/components/media-grid";
import { PageContainer } from "@/components/page-container";
import { getMessages, type Locale } from "@/i18n/config";
import type { MediaCard } from "@/lib/catalog";
import { MEDIA_KIND_LABELS, MEDIA_KINDS } from "@/lib/media";
import { MEDIA_PAGE_SIZE } from "@/lib/media-filter";

/**
 * The non-interactive view of the media list, used as the Suspense fallback
 * for `MediaBrowser` — same role as `ComposerFallback` plays for
 * `ComposerBrowser`. `MediaBrowser` reads the query string with
 * `useSearchParams`, which Next requires to sit inside a Suspense boundary;
 * this fallback is what the exported static HTML actually ships, so it
 * renders the same first page `MediaBrowser` shows on load — same
 * `MEDIA_PAGE_SIZE` cards, an inert mirror of the filter row and the "show
 * more" bar — so hydration swaps in the interactive version without a
 * layout jump (issue #115; rendering all ~180 cards here was the page's
 * original 13,000px problem, not just `MediaBrowser`'s).
 */
export function MediaFallback({
  locale,
  cards,
}: {
  locale: Locale;
  cards: MediaCard[];
}) {
  const messages = getMessages(locale);

  return (
    <PageContainer className="py-6 sm:py-10">
      <div className="flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-6 sm:gap-y-4">
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
            {messages.media.search}
          </h3>
          <div className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink-faint sm:w-72">
            {messages.media.search}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
            {messages.media.kindFilter}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {MEDIA_KINDS.map((kind) => (
              <span
                key={kind}
                className="rounded-full border border-line px-3 py-1.5 text-sm text-ink-soft"
              >
                {MEDIA_KIND_LABELS[kind][locale]}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p data-testid="result-count" className="mt-5 text-sm text-ink-soft">
        {messages.media.resultCount.replace("{count}", cards.length.toLocaleString())}
      </p>

      <div className="mt-6">
        <MediaGrid locale={locale} cards={cards.slice(0, MEDIA_PAGE_SIZE)} />

        {cards.length > MEDIA_PAGE_SIZE && (
          <div className="mt-6 w-full rounded-md border border-line py-3 text-center text-sm text-ink-soft">
            {messages.filters.showMore}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
