import Link from "next/link";

import { ComposerThumb } from "@/components/composer-thumb";
import { FavoriteButton } from "@/components/favorite-button";
import { StarRating } from "@/components/star-rating";
import { getMessages, type Locale } from "@/i18n/config";
import { GENRE_LABELS, type Genre } from "@/lib/epochs";
import type { Stars } from "@/lib/popularity";

export interface WorkCardProps {
  locale: Locale;
  workId: string;
  title: string;
  /** Shown underneath when it differs from `title`. */
  secondaryTitle?: string;
  composerName: string;
  /**
   * `Composer.portrait`, for the thumbnail. Absent for the composers with no
   * freely licensed portrait, which fall back to an initial-letter tile.
   */
  composerPortrait?: string;
  /**
   * Letter for the fallback tile when there's no portrait. Defaults to
   * `composerName`'s first letter — pass this explicitly when `composerName`
   * is `""` to hide the redundant text (e.g. the composer's own profile
   * page's "代表曲" list) but the tile still needs a letter to fall back to.
   */
  composerInitial?: string;
  genre: Genre;
  stars: Stars;
  /** Work detail pages exist only for core works. */
  linkToDetail?: boolean;
  /**
   * The film/anime/TV title the current search matched, from
   * `matchedMediaTitle` (`src/lib/catalog.ts`) — set only when that's what
   * actually matched, so the badge never appears for an unrelated search.
   */
  mediaMatch?: string;
  /**
   * A short line above the title, e.g. why the recommendations section
   * picked this work ("If you like Chopin"). Rendered separately from the
   * chip row below, which is already crowded with the composer, genre and
   * star chips — a fifth chip there would force more wraps on narrow
   * screens, and `mediaMatch`'s `role="img"` span must stay the only one
   * per card (see `e2e/catalog.spec.ts`'s ★-chip assertions). The portrait
   * thumbnail is `alt=""`, hence `role="presentation"`, so it stays outside
   * that count.
   */
  note?: string;
}

export function WorkCard({
  locale,
  workId,
  title,
  secondaryTitle,
  composerName,
  composerPortrait,
  composerInitial,
  genre,
  stars,
  linkToDetail = true,
  mediaMatch,
  note,
}: WorkCardProps) {
  const messages = getMessages(locale);
  const body = (
    <>
      <ComposerThumb
        portrait={composerPortrait}
        composerName={composerInitial ?? composerName}
      />
      {/* pr-8 clears the absolutely-positioned favourite button: its 44px box
          ends 2px short of this column's right edge, so a long title never
          runs underneath it. */}
      <div className="min-w-0 flex-1 pr-8">
        {note && <p className="mb-1 text-xs text-accent">{note}</p>}
        <p className="font-serif text-[1.0625rem] font-medium leading-snug text-ink break-words">
          {title}
        </p>
        {secondaryTitle && secondaryTitle !== title && (
          <p className="mt-0.5 truncate text-xs text-ink-faint">
            {secondaryTitle}
          </p>
        )}
        <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-ink-soft">
          {/* min-w-0 so a long name wraps instead of widening the card. */}
          {composerName && (
            <span className="min-w-0 break-words">{composerName}</span>
          )}
          <span className="rounded-full bg-terra-surface px-2 py-0.5 text-ink">
            {GENRE_LABELS[genre][locale]}
          </span>
          <StarRating locale={locale} stars={stars} />
          {mediaMatch && (
            <span
              role="img"
              aria-label={messages.catalog.mediaMatch.replace("{title}", mediaMatch)}
              title={messages.catalog.mediaMatch.replace("{title}", mediaMatch)}
              className="flex min-w-0 items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-accent"
            >
              <span aria-hidden="true" className="truncate">
                🎬 {mediaMatch}
              </span>
            </span>
          )}
        </p>
      </div>
      {/* Absolutely positioned so its 44px touch target costs no layout
          width — as a flex child it took a whole column for a 16px glyph. */}
      <span className="absolute right-0.5 top-0.5">
        <FavoriteButton workId={workId} locale={locale} size="sm" />
      </span>
    </>
  );

  // `h-full` so cards in the same grid row end level with each other; the
  // portrait makes a ragged bottom edge obvious (issue #107).
  const className =
    "relative flex h-full items-start gap-3 rounded-lg border border-line bg-paper-raised p-4 transition-colors";

  if (!linkToDetail) {
    return <div className={className}>{body}</div>;
  }

  return (
    <Link
      href={`/${locale}/works/${workId}`}
      className={`${className} hover:border-accent/50 hover:bg-accent-soft`}
    >
      {body}
    </Link>
  );
}
