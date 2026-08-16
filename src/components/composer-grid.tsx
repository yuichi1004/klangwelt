import Link from "next/link";

import { ComposerFlag } from "@/components/composer-flag";
import { ComposerPortrait } from "@/components/composer-portrait";
import { StarRating } from "@/components/star-rating";
import type { Locale } from "@/i18n/config";
import type { ComposerEpochGroup } from "@/lib/composer-filter";
import { EPOCH_LABELS, EPOCH_YEARS } from "@/lib/epochs";

/**
 * The composer list's grid, grouped by period — moved out of the page
 * component so both the interactive `ComposerBrowser` and its Suspense
 * fallback (`ComposerFallback`) render the exact same markup.
 */
export function ComposerGrid({
  locale,
  groups,
}: {
  locale: Locale;
  groups: ComposerEpochGroup[];
}) {
  return (
    <>
      {groups.map((group) => (
        <section key={group.epoch} className="mt-10">
          <h2 className="mb-4 flex items-baseline gap-3 border-b border-line pb-2">
            <span className="font-serif text-xl font-medium text-ink">
              {EPOCH_LABELS[group.epoch][locale]}
            </span>
            <span className="text-xs text-ink-faint">
              {EPOCH_YEARS[group.epoch]}
            </span>
            <span className="ml-auto text-xs text-ink-faint">
              {group.members.length}
            </span>
          </h2>

          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {group.members.map((composer) => (
              <li key={composer.id}>
                <Link
                  href={`/${locale}/composers/${composer.id}`}
                  className="group block"
                >
                  <ComposerPortrait
                    locale={locale}
                    composer={composer}
                    credit={composer.credit}
                    size={128}
                    showCredit={false}
                  />
                  <p className="mt-2 flex items-start gap-1.5 text-sm font-medium leading-snug text-ink group-hover:text-accent">
                    {composer.nationality && (
                      <ComposerFlag
                        locale={locale}
                        country={composer.nationality.country}
                      />
                    )}
                    {/* Reserves 2 lines regardless of actual length, so the
                        meta row below starts at the same height whether a
                        name wraps or not (issue #111). */}
                    <span className="min-w-0 line-clamp-2 min-h-11">
                      {locale === "ja" ? composer.nameJa : composer.completeName}
                    </span>
                  </p>
                  <p
                    data-testid="composer-meta"
                    className="flex items-center gap-1.5 text-xs text-ink-faint"
                  >
                    <span>
                      {composer.birthYear}
                      {composer.deathYear === null
                        ? "–"
                        : `–${composer.deathYear}`}{" "}
                      · {composer.coreWorkCount}
                    </span>
                    <StarRating locale={locale} stars={composer.stars} />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
