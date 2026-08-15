import Link from "next/link";

import { getMessages, type Locale } from "@/i18n/config";
import type { MediaCard } from "@/lib/catalog";
import { MEDIA_KIND_LABELS } from "@/lib/media";

/**
 * A film/anime/TV production as a `/media` list card. No poster image —
 * unlike composer portraits, sourcing one per production would mean
 * clearing a licence for each (issue #91 explicitly leaves this for later),
 * so the card is typography-only: title, year, kind, and how many works
 * from the catalogue are used in it.
 */
export function MediaCardTile({
  locale,
  card,
}: {
  locale: Locale;
  card: MediaCard;
}) {
  const messages = getMessages(locale);

  return (
    <Link
      href={`/${locale}/media/${card.id}`}
      className="block rounded-lg border border-line bg-paper-raised p-4 transition-colors hover:border-accent/50 hover:bg-accent-soft"
    >
      <p className="font-serif text-base font-medium leading-snug text-ink break-words">
        {card.title[locale]}
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
        <span>{card.year}</span>
        <span className="rounded-full bg-terra-surface px-2 py-0.5 text-ink">
          {MEDIA_KIND_LABELS[card.kind][locale]}
        </span>
      </p>
      <p className="mt-1.5 text-xs text-ink-faint">
        {messages.media.workCount.replace("{count}", String(card.workCount))}
      </p>
    </Link>
  );
}
