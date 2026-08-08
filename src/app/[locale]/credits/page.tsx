import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getMessages, isLocale, LOCALES } from "@/i18n/config";
import { composers, portraitCredits } from "@/lib/catalog";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata(
  props: PageProps<"/[locale]/credits">,
): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  return { title: getMessages(locale).credits.heading };
}

/**
 * Full provenance for everything the site redistributes: the Open Opus data
 * dedication, and one line per portrait with author, licence and source. The
 * per-image list is what satisfies the attribution term of the CC BY and
 * CC BY-SA portraits.
 */
export default async function CreditsPage(
  props: PageProps<"/[locale]/credits">,
) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const messages = getMessages(locale);
  const nameById = new Map(
    composers.map((composer) => [
      composer.id,
      locale === "ja" ? composer.nameJa : composer.completeName,
    ]),
  );

  const sorted = [...portraitCredits].sort((a, b) =>
    (nameById.get(a.composerId) ?? "").localeCompare(
      nameById.get(b.composerId) ?? "",
      locale,
    ),
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-serif text-2xl font-medium text-ink sm:text-3xl">
        {messages.credits.heading}
      </h1>
      <p className="mt-3 text-sm text-ink-soft">{messages.credits.intro}</p>

      <section className="mt-9">
        <h2 className="font-serif text-xl font-medium text-ink">
          {messages.credits.dataHeading}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          {messages.credits.dataBody}
        </p>
        <p className="mt-2 text-sm">
          <a
            href="https://openopus.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2"
          >
            openopus.org
          </a>
          {" · "}
          <a
            href="https://creativecommons.org/publicdomain/zero/1.0/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2"
          >
            CC0 1.0
          </a>
        </p>
      </section>

      <section className="mt-9">
        <h2 className="font-serif text-xl font-medium text-ink">
          {messages.credits.servicesHeading}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          {messages.credits.servicesBody}
        </p>
      </section>

      <section className="mt-9">
        <h2 className="font-serif text-xl font-medium text-ink">
          {messages.credits.portraitsHeading}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          {messages.credits.portraitsBody}
        </p>
        <p className="mt-2 text-xs text-ink-faint">
          {messages.credits.portraitsCount.replace(
            "{count}",
            String(portraitCredits.length),
          )}
        </p>

        <ul className="mt-4 divide-y divide-line rounded-lg border border-line text-sm">
          {sorted.map((credit) => (
            <li
              key={credit.composerId}
              className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4"
            >
              <span className="font-medium break-words text-ink sm:w-52 sm:shrink-0">
                {nameById.get(credit.composerId) ?? credit.composerId}
              </span>
              <span className="min-w-0 flex-1 break-words text-ink-soft">
                {credit.author || messages.credits.unknownAuthor}
                {" · "}
                {credit.licenseUrl ? (
                  <a
                    href={credit.licenseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline underline-offset-2"
                  >
                    {credit.license}
                  </a>
                ) : (
                  credit.license
                )}
                {" · "}
                <a
                  href={credit.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline underline-offset-2"
                >
                  {messages.credits.source}
                </a>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
