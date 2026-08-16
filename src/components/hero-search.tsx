"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { getMessages, type Locale } from "@/i18n/config";
import { EMPTY_FILTERS } from "@/lib/catalog";
import { writeFilters } from "@/lib/catalog-url";

/**
 * A real, always-visible search field in the hero, so a first-time visitor —
 * mobile in particular — is not left scrolling past the hero and the
 * favourites-based recommendations before finding anything to search with.
 */
export function HeroSearch({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const router = useRouter();
  const [value, setValue] = useState("");

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        router.push(
          `/${locale}${writeFilters({ ...EMPTY_FILTERS, query: value.trim() }, "standard")}`,
        );
      }}
      className="mt-6 flex items-center overflow-hidden rounded-full border border-line bg-paper pl-4 shadow-sm focus-within:border-accent sm:mt-8 sm:max-w-md"
    >
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={messages.filters.searchPlaceholder}
        aria-label={messages.hero.searchLabel}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="search"
        className="w-full min-w-0 bg-transparent py-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
      />
      <button
        type="submit"
        aria-label={messages.hero.searchCta}
        className="flex h-11 w-11 shrink-0 items-center justify-center text-ink-faint transition-colors hover:text-accent"
      >
        <SearchIcon className="h-5 w-5" />
      </button>
    </form>
  );
}

function SearchIcon({ className }: { className: string }) {
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
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}
