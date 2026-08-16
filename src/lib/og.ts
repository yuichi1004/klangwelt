/**
 * Open Graph metadata shared across pages.
 *
 * Next's metadata merging does not deep-merge the `openGraph` field between
 * a layout and a page: if a page sets `openGraph` at all, it must supply the
 * complete object, or fields the layout set (`siteName`, `type`, `locale`)
 * silently disappear from that page's tags. `buildOpenGraph` exists so every
 * page gets the same shape without repeating that pitfall.
 */
import type { Metadata } from "next";

import { getMessages, type Locale } from "@/i18n/config";
import type { Composer } from "./catalog-types";
import { requiresAttribution, type PortraitCredit } from "./licenses";

export const DEFAULT_OG_IMAGE = {
  url: "/og-default.png",
  width: 1200,
  height: 630,
};

export interface OgImage {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
}

export function buildOpenGraph(
  locale: Locale,
  args: { title: string; description: string; image?: OgImage },
): Pick<Metadata, "openGraph"> {
  return {
    openGraph: {
      title: args.title,
      description: args.description,
      siteName: getMessages(locale).site.name,
      locale: locale === "ja" ? "ja_JP" : "en_US",
      type: "website",
      images: [args.image ?? DEFAULT_OG_IMAGE],
    },
  };
}

/**
 * The image for a composer's own page, and (reused) for their works' pages.
 * `undefined` when there is no portrait, so the caller falls back to
 * `DEFAULT_OG_IMAGE` via `buildOpenGraph`.
 *
 * Never crops or resizes the portrait — same "scale only" rule as
 * `ComposerPortrait` — so referencing it here needs no new rights check
 * beyond what already lets it be displayed on the page. Licences that
 * require attribution (CC BY / CC BY-SA) get it in `alt`, since the image
 * itself is never modified to carry a caption.
 */
export function composerOgImage(
  composer: Pick<Composer, "portrait">,
  credit: PortraitCredit | undefined,
  fallbackAlt: string,
): OgImage | undefined {
  if (!composer.portrait || !credit) return undefined;
  return {
    url: composer.portrait,
    alt: requiresAttribution(credit.license)
      ? `${credit.author} / ${credit.license}`
      : fallbackAlt,
  };
}
