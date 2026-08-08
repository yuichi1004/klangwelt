import Image from "next/image";

import { getMessages, type Locale } from "@/i18n/config";
import type { Composer } from "@/lib/catalog-types";
import type { PortraitCredit } from "@/lib/licenses";

/**
 * Portrait plus its attribution.
 *
 * The credit is always shown, not just for CC BY/BY-SA files: it is required
 * for those, and good practice for the public-domain ones. The image is only
 * ever scaled, never cropped or recoloured, so a share-alike portrait does
 * not become an adaptation.
 */
export function ComposerPortrait({
  locale,
  composer,
  credit,
  size = 160,
  showCredit = true,
}: {
  locale: Locale;
  composer: Composer;
  credit?: PortraitCredit;
  size?: number;
  /**
   * Off in the composer grid, where 220 caption lines would drown the page.
   * The credit is still carried by the image `title`, and in full on the
   * composer's own page and on `/credits`.
   */
  showCredit?: boolean;
}) {
  const messages = getMessages(locale);

  if (!composer.portrait || !credit) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex shrink-0 items-center justify-center rounded-lg border border-line bg-accent-soft text-3xl font-semibold text-accent"
        aria-label={messages.composer.noPortrait}
      >
        {composer.name.charAt(0)}
      </div>
    );
  }

  const author = credit.author || messages.credits.unknownAuthor;
  const creditText = messages.composer.portraitCredit
    .replace("{author}", author)
    .replace("{license}", credit.license);

  const image = (
    <Image
      src={composer.portrait}
      alt={locale === "ja" ? composer.nameJa : composer.completeName}
      title={creditText}
      width={size}
      height={size}
      className={
        showCredit
          ? "h-auto w-full rounded-lg border border-line object-contain"
          : "max-h-full w-auto object-contain"
      }
    />
  );

  if (!showCredit) {
    return (
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-paper"
        style={{ width: size, height: size }}
      >
        {image}
      </div>
    );
  }

  return (
    <figure className="shrink-0" style={{ width: size }}>
      {image}
      <figcaption className="mt-1.5 break-words text-[11px] leading-snug text-ink-faint">
        {creditText}{" "}
        <a
          href={credit.licenseUrl || credit.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-accent"
        >
          {messages.composer.portraitSource}
        </a>
      </figcaption>
    </figure>
  );
}
