"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { useModalOverlay } from "@/components/use-modal-overlay";
import { writeStoredLocale } from "@/lib/backup";
import { getMessages, LOCALES, LOCALE_LABELS, type Locale } from "@/i18n/config";

/** Swaps the leading locale segment, keeping the rest of the path. */
function swapLocale(pathname: string, target: Locale): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return `/${target}`;
  segments[0] = target;
  return `/${segments.join("/")}`;
}

export function SiteHeader({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const pathname = usePathname() ?? `/${locale}`;
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const links = [
    { href: `/${locale}`, label: messages.nav.catalog },
    { href: `/${locale}/composers`, label: messages.nav.composers },
    { href: `/${locale}/media`, label: messages.nav.media },
    { href: `/${locale}/favorites`, label: messages.nav.favorites },
  ];

  const isActive = (href: string) =>
    href === `/${locale}` ? pathname === href : pathname.startsWith(href);

  /* Escape, the background scroll lock (#108) and a Tab trap, all shared
     with composer-browser.tsx's filter sheet since #109 — the two overlays
     had drifted apart, with the sheet missing every one of them.
     The trap's container is the whole <header>, not just the dropdown:
     everything the scrim leaves interactive — the wordmark, the language
     pills, the ☰ toggle and the dropdown itself — lives inside it, so that
     is exactly the set a user can still see and reach. */
  useModalOverlay(menuOpen, closeMenu, headerRef);

  return (
    <>
      <header
        ref={headerRef}
        className="sticky top-0 z-30 border-b border-line bg-paper-raised/90 backdrop-blur"
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href={`/${locale}`}
            className="mr-auto flex items-center gap-2.5 font-serif text-xl font-medium tracking-tight text-ink"
          >
            {/* Decorative: the wordmark beside it already names the site, so
                announcing the image too would just repeat it. */}
            <Image
              src="/logo-mark.png"
              alt=""
              width={28}
              height={28}
              priority
              className="h-7 w-7 rounded-md"
            />
            <span className="hidden min-[360px]:inline">{messages.site.name}</span>
          </Link>

          <nav className="hidden items-center gap-1 sm:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                  isActive(link.href)
                    ? "bg-accent-soft text-accent"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1 rounded-full border border-line p-0.5">
            {LOCALES.map((candidate) => (
              <Link
                key={candidate}
                href={swapLocale(pathname, candidate)}
                hrefLang={candidate}
                // Remember the choice so `/` sends the visitor here next time.
                onClick={() => writeStoredLocale(candidate)}
                className={`rounded-full whitespace-nowrap px-2.5 py-1 text-xs font-medium transition-colors ${
                  candidate === locale
                    ? "bg-accent-fill text-accent-ink"
                    : "text-ink-faint hover:text-ink"
                }`}
              >
                {LOCALE_LABELS[candidate]}
              </Link>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? messages.nav.close : messages.nav.menu}
            className="rounded-md border border-line px-2.5 py-1.5 text-sm text-ink-soft sm:hidden"
          >
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>

        {menuOpen && (
          <nav className="border-t border-line bg-paper-raised px-4 pb-3 shadow-lg sm:hidden">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeMenu}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={`block rounded-md px-2 py-2.5 text-sm ${
                  isActive(link.href) ? "text-accent" : "text-ink-soft"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {/* Scrim behind the dropdown: grounds it against the page and doubles
          as "tap outside to close" (same pattern as composer-browser.tsx's
          mobile filter sheet — the catalogue's filter panel is an inline
          disclosure, not a sheet, since #118). z-[25]: above
          catalog-browser.tsx's sticky search/filter row (z-20 — same level
          would let it paint over the scrim, since it comes later in the
          DOM) but below the header's own z-30, so the dropdown stays crisp
          on top of it. Above z-30 sits install-prompt.tsx's bottom sheet
          (z-[35] — a non-modal banner, not part of this trap), and above
          that the modal sheets themselves sit at z-40, over all of it. */}
      {menuOpen && (
        <button
          type="button"
          aria-label={messages.nav.close}
          onClick={closeMenu}
          className="fixed inset-0 z-[25] bg-black/40 sm:hidden"
        />
      )}
    </>
  );
}
