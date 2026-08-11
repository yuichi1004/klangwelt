import { WorkCard } from "@/components/work-card";
import { getMessages, type Locale } from "@/i18n/config";
import type { SearchableWork } from "@/lib/catalog";

/**
 * The non-interactive view of the catalogue, used as the Suspense fallback
 * for `CatalogBrowser`.
 *
 * `CatalogBrowser` reads the query string with `useSearchParams`, which Next
 * requires to sit inside a Suspense boundary. Rendering the first page of
 * results as the fallback means the exported HTML still ships real content
 * for crawlers and for first paint, instead of a spinner.
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
    <div className="mx-auto max-w-6xl gap-8 px-4 py-6 sm:px-6 lg:flex lg:py-10">
      <aside className="hidden w-72 shrink-0 lg:block">
        <h2 className="mb-4 text-sm font-semibold text-ink">
          {messages.filters.heading}
        </h2>
      </aside>

      <div className="min-w-0 flex-1">
        <p className="mb-4 text-sm text-ink-soft">
          {messages.catalog.resultCount.replace(
            "{count}",
            totalCount.toLocaleString(),
          )}
        </p>
        <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
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
                genre={work.genre}
                stars={work.stars}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
