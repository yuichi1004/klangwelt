import Link from "next/link";

import { DEFAULT_LOCALE, getMessages } from "@/i18n/config";

/**
 * A static export cannot read the locale here, so this uses the default
 * language and offers both entry points.
 */
export default function NotFound() {
  const messages = getMessages(DEFAULT_LOCALE);

  return (
    <div className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
      <h1 className="font-serif text-2xl font-medium text-ink">
        {messages.common.notFound}
      </h1>
      <p className="mt-3 text-sm text-ink-soft">{messages.common.notFoundBody}</p>
      <p className="mt-6 text-sm">
        <Link
          href={`/${DEFAULT_LOCALE}`}
          className="text-accent underline underline-offset-2"
        >
          {messages.common.backHome}
        </Link>
      </p>
    </div>
  );
}
