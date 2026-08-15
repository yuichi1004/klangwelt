import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getMessages, isLocale, LOCALES } from "@/i18n/config";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata(
  props: PageProps<"/[locale]/terms">,
): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  return { title: getMessages(locale).terms.heading };
}

export default async function TermsPage(props: PageProps<"/[locale]/terms">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const messages = getMessages(locale);
  const { terms } = messages;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-serif text-2xl font-medium text-ink sm:text-3xl">
        {terms.heading}
      </h1>
      <p className="mt-3 text-sm text-ink-soft">{terms.intro}</p>
      <p className="mt-1 text-xs text-ink-faint">{terms.updated}</p>

      <section className="mt-9">
        <h2 className="font-serif text-xl font-medium text-ink">
          {terms.termsHeading}
        </h2>
        {terms.termsClauses.map((clause) => (
          <div key={clause.heading} className="mt-6">
            <h3 className="text-base font-medium text-ink">
              {clause.heading}
            </h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
              {clause.body}
            </p>
            {clause.linkHref ? (
              <p className="mt-2 text-sm">
                <Link
                  href={`/${locale}${clause.linkHref}`}
                  className="text-accent underline underline-offset-2"
                >
                  {clause.linkText}
                </Link>
              </p>
            ) : null}
          </div>
        ))}
      </section>

      <section className="mt-9">
        <h2 className="font-serif text-xl font-medium text-ink">
          {terms.disclaimerHeading}
        </h2>
        {terms.disclaimerClauses.map((clause) => (
          <div key={clause.heading} className="mt-6">
            <h3 className="text-base font-medium text-ink">
              {clause.heading}
            </h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
              {clause.body}
            </p>
            {clause.linkHref ? (
              <p className="mt-2 text-sm">
                <Link
                  href={`/${locale}${clause.linkHref}`}
                  className="text-accent underline underline-offset-2"
                >
                  {clause.linkText}
                </Link>
              </p>
            ) : null}
          </div>
        ))}
      </section>
    </div>
  );
}
