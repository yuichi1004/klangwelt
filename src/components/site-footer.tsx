import Link from "next/link";

import { getMessages, type Locale } from "@/i18n/config";
import { catalogMeta } from "@/lib/catalog";

export function SiteFooter({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);

  return (
    <footer className="mt-16 border-t border-line bg-paper-raised">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-ink-faint sm:px-6">
        <p className="text-ink-soft">{messages.site.tagline}</p>
        <p className="mt-3">
          {locale === "ja"
            ? `作曲家 ${catalogMeta.composerCount}名 / 楽曲 ${catalogMeta.coreWorkCount.toLocaleString()}曲を収録。`
            : `${catalogMeta.composerCount} composers, ${catalogMeta.coreWorkCount.toLocaleString()} works.`}
        </p>
        <p className="mt-3">
          {locale === "ja" ? "データ提供: " : "Data from "}
          <a
            href="https://openopus.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2"
          >
            Open Opus
          </a>
          {locale === "ja" ? "（CC0 1.0）・" : " (CC0 1.0) and "}
          <a
            href="https://commons.wikimedia.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2"
          >
            Wikimedia Commons
          </a>
          {". "}
          <Link
            href={`/${locale}/credits`}
            className="text-accent underline underline-offset-2"
          >
            {messages.nav.credits}
          </Link>
          {" · "}
          <Link
            href={`/${locale}/terms`}
            className="text-accent underline underline-offset-2"
          >
            {messages.nav.terms}
          </Link>
        </p>
      </div>
    </footer>
  );
}
