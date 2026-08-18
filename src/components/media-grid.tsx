import { MediaCardTile } from "@/components/media-card";
import type { Locale } from "@/i18n/config";
import type { MediaCard } from "@/lib/catalog";

/**
 * The `/media` list's card grid, shared between the interactive
 * `MediaBrowser` and its Suspense fallback (`MediaFallback`) so both render
 * the exact same markup — same split as `ComposerGrid`/`ComposerFallback`.
 */
export function MediaGrid({
  locale,
  cards,
}: {
  locale: Locale;
  cards: MediaCard[];
}) {
  return (
    <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <li key={card.id}>
          <MediaCardTile locale={locale} card={card} />
        </li>
      ))}
    </ul>
  );
}
