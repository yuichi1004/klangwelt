import Link from "next/link";

import { PageContainer } from "@/components/page-container";
import { WorkCard } from "@/components/work-card";
import { WorkCardGrid } from "@/components/work-card-grid";
import { getMessages, type Locale } from "@/i18n/config";
import { EMPTY_FILTERS, type SearchableWork } from "@/lib/catalog";
import { writeFilters } from "@/lib/catalog-url";

/**
 * The non-interactive view of the catalogue, used as the Suspense fallback
 * for `CatalogBrowser`.
 *
 * `CatalogBrowser` reads the query string with `useSearchParams`, which Next
 * requires to sit inside a Suspense boundary. This fallback mirrors what a
 * plain visit (no search, no filters) shows once hydrated — the discovery
 * feed, top of the standard-repertoire ranking — so the exported HTML still
 * ships real content for crawlers and for first paint, instead of a spinner.
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
        <WorkCardGrid>
          {works.slice(0, 12).map((work) => (
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
        <div className="mt-6 text-center">
          <Link
            href={`/${locale}${writeFilters(EMPTY_FILTERS, "standard", true)}`}
            className="text-sm text-accent underline underline-offset-2"
          >
            {messages.catalog.browseAll.replace(
              "{count}",
              totalCount.toLocaleString(),
            )}
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}
