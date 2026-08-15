"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

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

  const links = [
    { href: `/${locale}`, label: messages.nav.catalog },
    { href: `/${locale}/composers`, label: messages.nav.composers },
    { href: `/${locale}/media`, label: messages.nav.media },
    { href: `/${locale}/favorites`, label: messages.nav.favorites },
  ];

  const isActive = (href: string) =>
    href === `/${locale}` ? pathname === href : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper-raised/90 backdrop-blur">
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
        <nav className="border-t border-line px-4 pb-3 sm:hidden">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
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
  );
}
