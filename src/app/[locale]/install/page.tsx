import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/page-container";
import { getMessages, isLocale, LOCALES } from "@/i18n/config";
import { buildOpenGraph } from "@/lib/og";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata(
  props: PageProps<"/[locale]/install">,
): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  const messages = getMessages(locale);
  return {
    title: messages.install.heading,
    ...buildOpenGraph(locale, {
      title: messages.install.heading,
      description: messages.install.intro,
    }),
  };
}

/**
 * Platform-by-platform instructions for adding the site to a home screen —
 * linked from `installPrompt.tsx`'s iOS branch (which has no native install
 * button to offer) and from the footer, for anyone who dismissed that sheet
 * and wants it back. No user-agent branching: the export is fully static, so
 * every platform's steps are shown to every visitor rather than guessed at.
 */
export default async function InstallPage(
  props: PageProps<"/[locale]/install">,
) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const messages = getMessages(locale);
  const { install } = messages;

  return (
    <PageContainer className="py-8 sm:py-12">
      <div className="max-w-3xl">
        <h1 className="font-serif text-2xl font-medium text-ink sm:text-3xl">
          {install.heading}
        </h1>
        <p className="mt-3 text-sm text-ink-soft">{install.intro}</p>

        <section className="mt-9">
          <h2 className="font-serif text-xl font-medium text-ink">
            {install.platformsHeading}
          </h2>
          {install.platforms.map((platform) => (
            <div key={platform.heading} className="mt-6">
              <h3 className="text-base font-medium text-ink">
                {platform.heading}
              </h3>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                {platform.body}
              </p>
            </div>
          ))}
        </section>

        <section className="mt-9">
          <h2 className="font-serif text-xl font-medium text-ink">
            {install.favoritesNoteHeading}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {install.favoritesNoteBody}
          </p>
          <p className="mt-2 text-sm">
            <Link
              href={`/${locale}/favorites`}
              className="text-accent underline underline-offset-2"
            >
              {install.favoritesNoteLinkText}
            </Link>
          </p>
        </section>

        <section className="mt-9">
          <h2 className="font-serif text-xl font-medium text-ink">
            {install.removeHeading}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {install.removeBody}
          </p>
        </section>
      </div>
    </PageContainer>
  );
}
