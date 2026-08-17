import Link from "next/link";

import { MediaKindChip } from "@/components/media-kind-chip";
import { getMessages, type Locale } from "@/i18n/config";
import type { MediaCard } from "@/lib/catalog";

/**
 * A film/anime/TV production as a `/media` list card. No poster image —
 * unlike composer portraits, sourcing one per production would mean
 * clearing a licence for each (issue #91 explicitly leaves this for later,
 * confirmed again out of scope in #115), so the card is typography-only:
 * title, year, kind, and a preview of the most standard work used in it.
 *
 * The third line used to be a bare work count, which read "1曲" on 90% of
 * cards — a number nobody could act on. It now previews the actual work
 * (`MediaCard.preview`, picked by `compareByStandard` in `catalog.ts`),
 * truncated to one line so every card in a grid row stays the same height.
 */
export function MediaCardTile({
  locale,
  card,
}: {
  locale: Locale;
  card: MediaCard;
}) {
  const messages = getMessages(locale);
  const preview =
    card.workCount > 1
      ? messages.media.previewMore
          .replace("{title}", card.preview[locale])
          .replace("{count}", String(card.workCount - 1))
      : card.preview[locale];

  return (
    // h-full so cards in the same grid row end level with each other, same
    // reasoning as `WorkCard` (issue #107).
    <Link
      href={`/${locale}/media/${card.id}`}
      className="flex h-full flex-col rounded-lg border border-line bg-paper-raised px-4 py-3 transition-colors hover:border-accent/50 hover:bg-accent-soft"
    >
      <p className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 line-clamp-2 font-serif text-base font-medium leading-snug text-ink break-words">
          {card.title[locale]}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-ink-faint">
          {card.year}
        </span>
      </p>
      <p className="mt-1.5 flex items-center gap-2 text-xs text-ink-soft">
        <MediaKindChip locale={locale} kind={card.kind} />
        <span className="min-w-0 flex-1 truncate">{preview}</span>
      </p>
    </Link>
  );
}
