import { ComposerGrid } from "@/components/composer-grid";
import { PageContainer } from "@/components/page-container";
import { getMessages, type Locale } from "@/i18n/config";
import type { ComposerEpochGroup } from "@/lib/composer-filter";

/**
 * The non-interactive view of the composer list, used as the Suspense
 * fallback for `ComposerBrowser` — same role as `CatalogFallback` plays for
 * `CatalogBrowser`.
 *
 * `ComposerBrowser` reads the query string with `useSearchParams`, which Next
 * requires to sit inside a Suspense boundary. Rendering the default (★3 and
 * up) grid as the fallback means the exported HTML still ships real content
 * for crawlers and for first paint, instead of a spinner.
 */
export function ComposerFallback({
  locale,
  groups,
  totalCount,
}: {
  locale: Locale;
  groups: ComposerEpochGroup[];
  totalCount: number;
}) {
  const messages = getMessages(locale);
  const resultCount = groups.reduce((sum, group) => sum + group.members.length, 0);

  return (
    <PageContainer className="gap-8 py-6 lg:flex lg:py-10">
      <aside className="hidden w-72 shrink-0 lg:block">
        <h2 className="mb-4 text-sm font-semibold text-ink">
          {messages.filters.heading}
        </h2>
      </aside>

      <div className="min-w-0 flex-1">
        <p className="mb-4 text-sm text-ink-soft">
          {messages.composers.resultCountFiltered
            .replace("{count}", resultCount.toLocaleString())
            .replace("{total}", totalCount.toLocaleString())}
        </p>
        <ComposerGrid locale={locale} groups={groups} />
      </div>
    </PageContainer>
  );
}
