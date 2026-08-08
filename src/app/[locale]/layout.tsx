import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { notFound } from "next/navigation";

import "../globals.css";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { FavoritesProvider } from "@/components/favorites-provider";
import { getMessages, isLocale, LOCALES, type Locale } from "@/i18n/config";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/**
 * This is the root layout: there is no `app/layout.tsx`, so `[locale]` is the
 * topmost segment and can set `<html lang>` correctly for each language
 * without a client-side patch. `/` is served by `public/index.html`, which
 * redirects based on the browser's language.
 */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata(
  props: LayoutProps<"/[locale]">,
): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  const messages = getMessages(locale);

  return {
    title: {
      default: `${messages.site.name} — ${messages.site.tagline}`,
      template: `%s | ${messages.site.name}`,
    },
    description: messages.site.description,
    alternates: {
      languages: Object.fromEntries(
        LOCALES.map((candidate) => [candidate, `/${candidate}`]),
      ),
    },
  };
}

export default async function LocaleLayout(props: LayoutProps<"/[locale]">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  return (
    <html lang={locale} className={inter.variable}>
      <body className="flex min-h-screen flex-col font-sans">
        <FavoritesProvider>
          <SiteHeader locale={locale as Locale} />
          <main className="flex-1">{props.children}</main>
          <SiteFooter locale={locale as Locale} />
        </FavoritesProvider>
      </body>
    </html>
  );
}
