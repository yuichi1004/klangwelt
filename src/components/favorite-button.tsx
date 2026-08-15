"use client";

import { useFavorites } from "@/components/favorites-provider";
import { getMessages, type Locale } from "@/i18n/config";

export function FavoriteButton({
  workId,
  locale,
  size = "md",
}: {
  workId: string;
  locale: Locale;
  size?: "sm" | "md";
}) {
  const { isFavorite, toggleFavorite, ready } = useFavorites();
  const messages = getMessages(locale);
  const active = ready && isFavorite(workId);

  return (
    <button
      type="button"
      onClick={(event) => {
        // The button often sits inside a link to the work.
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite(workId);
      }}
      aria-pressed={active}
      aria-label={active ? messages.favorites.remove : messages.favorites.add}
      title={active ? messages.favorites.remove : messages.favorites.add}
      className={`shrink-0 rounded-full transition-colors ${
        size === "sm" ? "p-1.5 text-base" : "p-2 text-xl"
      } ${
        active
          ? "text-accent"
          : "text-ink-faint hover:bg-accent-soft hover:text-accent"
      }`}
    >
      <span aria-hidden="true">{active ? "♥" : "♡"}</span>
    </button>
  );
}
