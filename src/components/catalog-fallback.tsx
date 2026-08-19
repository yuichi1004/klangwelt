import { PageContainer } from "@/components/page-container";
import { WorkCard } from "@/components/work-card";
import { WorkCardGrid } from "@/components/work-card-grid";
import { getMessages, type Locale } from "@/i18n/config";
import type { SearchableWork } from "@/lib/catalog";

/**
 * The non-interactive view of the catalogue, used as the Suspense fallback
 * for `CatalogBrowser`.
 *
 * `CatalogBrowser` reads the query string with `useSearchParams`, which Next
 * requires to sit inside a Suspense boundary. This fallback mirrors what a
 * plain visit (no search, no filters) shows once hydrated — the results
 * list in standard-repertoire order, which is also what the hydrated
 * おすすめ順 (the default sort) shows until the client index and favourites
 * are both ready — so the exported HTML still ships real content for
 * crawlers and for first paint, instead of a spinner.
 */
export function CatalogFallback({
  locale,
  works,
  totalCount,
}: {
  locale: Locale;
  works: SearchableWork[];
  totalCount: number;
}) {
  const messages = getMessages(locale);

  return (
    <PageContainer className="py-6 sm:py-10">
      <div className="-mx-4 bg-paper px-4 py-3 sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-paper-raised px-3.5 py-2 text-sm text-ink-faint">
            {messages.filters.searchPlaceholder}
          </div>
          <div className="shrink-0 rounded-full border border-line px-3.5 py-2 text-sm text-ink-soft">
            {messages.filters.open}
          </div>
        </div>
      </div>

      <div className="mt-4">
        {/* Static duplicate of `CatalogBrowser`'s result-count line, minus
            `data-testid="result-count"` — several e2e tests use that locator
            as their "the app has hydrated" checkpoint, and a static copy
            carrying the same text would let those checks pass before
            hydration even starts. */}
        <p className="mb-4 text-sm text-ink-soft">
          {messages.catalog.resultCount.replace(
            "{count}",
            totalCount.toLocaleString(),
          )}
        </p>
        <WorkCardGrid>
          {works.map((work) => (
            <li key={work.id}>
              <WorkCard
                locale={locale}
                workId={work.id}
                title={locale === "ja" ? work.titleJa : work.title}
                secondaryTitle={locale === "ja" ? work.title : undefined}
                composerName={
                  locale === "ja" ? work.composerNameJa : work.composerName
                }
                composerPortrait={work.composerPortrait}
                genre={work.genre}
                stars={work.stars}
              />
            </li>
          ))}
        </WorkCardGrid>
      </div>
    </PageContainer>
  );
}
