import Image from "next/image";

import { COUNTRY_LABELS, type CountryCode } from "@/lib/countries";
import type { Locale } from "@/i18n/config";

/**
 * A composer's main-nationality flag, self-hosted from `public/flags/`
 * (see `scripts/build-flags.ts`) rather than an emoji — flag emoji render as
 * a bare two-letter code on Windows 10 and earlier, which this site's
 * everything-self-hosted approach (portraits, icons) would otherwise be the
 * only exception to.
 */
export function ComposerFlag({
  locale,
  country,
  size = 16,
}: {
  locale: Locale;
  country: CountryCode;
  size?: number;
}) {
  const label = COUNTRY_LABELS[country][locale];
  return (
    <Image
      src={`/flags/${country.toLowerCase()}.svg`}
      alt={label}
      title={label}
      // flag-icons' 4x3 set is 4:3.
      width={Math.round(size * (4 / 3))}
      height={size}
      className="inline-block shrink-0 rounded-[2px] border border-line align-middle"
    />
  );
}
