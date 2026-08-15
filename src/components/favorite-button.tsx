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
        size === "sm" ? "p-1.5" : "p-2"
      } ${
        active
          ? "text-accent"
          : "text-ink-faint hover:bg-accent-soft hover:text-accent"
      }`}
    >
      <HeartIcon
        filled={active}
        className={size === "sm" ? "h-4 w-4" : "h-5 w-5"}
      />
    </button>
  );
}

function HeartIcon({ filled, className }: { filled: boolean; className: string }) {
  if (filled) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
        <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  );
}
