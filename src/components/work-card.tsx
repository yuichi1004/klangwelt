import Link from "next/link";

import { FavoriteButton } from "@/components/favorite-button";
import { getMessages, type Locale } from "@/i18n/config";
import { GENRE_LABELS, type Genre } from "@/lib/epochs";

export interface WorkCardProps {
  locale: Locale;
  workId: string;
  title: string;
  /** Shown underneath when it differs from `title`. */
  secondaryTitle?: string;
  composerName: string;
  genre: Genre;
  popular: boolean;
  recommended: boolean;
  /** Work detail pages exist only for core works. */
  linkToDetail?: boolean;
}

export function WorkCard({
  locale,
  workId,
  title,
  secondaryTitle,
  composerName,
  genre,
  popular,
  recommended,
  linkToDetail = true,
}: WorkCardProps) {
  const messages = getMessages(locale);

  const body = (
    <>
      <div className="min-w-0 flex-1">
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
          {popular && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-accent">
              {messages.filters.popular}
            </span>
          )}
          {!popular && recommended && (
            <span className="rounded-full border border-line px-2 py-0.5 text-ink-faint">
              {messages.filters.recommended}
            </span>
          )}
        </p>
      </div>
      <FavoriteButton workId={workId} locale={locale} size="sm" />
    </>
  );

  const className =
    "flex items-start gap-3 rounded-lg border border-line bg-paper-raised p-5 transition-colors";

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
