import { MediaGrid } from "@/components/media-grid";
import { PageContainer } from "@/components/page-container";
import { getMessages, type Locale } from "@/i18n/config";
import type { MediaCard } from "@/lib/catalog";

/**
 * The non-interactive view of the media list, used as the Suspense fallback
 * for `MediaBrowser` — same role as `ComposerFallback` plays for
 * `ComposerBrowser`. `MediaBrowser` reads the query string with
 * `useSearchParams`, which Next requires to sit inside a Suspense boundary;
 * rendering every entry unfiltered here means the exported HTML still ships
 * real content for crawlers and first paint instead of a spinner.
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
      <p data-testid="result-count" className="mb-4 text-sm text-ink-soft">
        {messages.media.resultCount.replace("{count}", cards.length.toLocaleString())}
      </p>
      <MediaGrid locale={locale} cards={cards} />
    </PageContainer>
  );
}
