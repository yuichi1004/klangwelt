import Image from "next/image";

import { portraitThumb } from "@/lib/portrait-thumb";

/**
 * The composer's face at work-card size.
 *
 * Separate from `ComposerPortrait`, which is "portrait plus its attribution"
 * and keyed on a credit — passing it a portrait without one renders its
 * initial-letter fallback instead of the image. Here the attribution lives on
 * `/credits` and on the composer's own page, so the thumbnail carries no
 * caption and no `title`.
 *
 * The box is 3:4, which is the median aspect ratio of the collection (0.762),
 * so most portraits fill it with only a sliver of letterboxing. `h-full
 * w-full object-contain` makes a crop geometrically impossible — the
 * portraits include CC BY-SA files, and cropping one would make it an
 * adaptation (see `CONTRIBUTING.md`'s 肖像画 section and
 * `composer-portrait.tsx`). `ComposerPortrait`'s `showCredit={false}` branch
 * uses the same `object-contain`-on-both-axes approach as of issue #111; it
 * used to be `max-h-full w-auto` inside `overflow-hidden`, which bounded
 * only the height and let wide portraits silently clip instead of
 * letterbox.
 *
 * The dark `bg-paper` well matters beyond taste: many portraits are
 * engravings on white, which glare against the olive page (issue #111).
 *
 * This component never crops, regardless of licence — that stays true even
 * though a small, PD-only exception exists for the *source* file offline
 * (`scripts/trim-portrait-margins.ts`, issue #122): it may trim a uniform
 * plain margin baked into a public-domain portrait before it ever reaches
 * `public/portraits/`. Nothing here changes because of that.
 */
export function ComposerThumb({
  portrait,
  composerName,
}: {
  /** `Composer.portrait`; absent for the composers with no free portrait. */
  portrait?: string;
  /** Only used for the initial-letter fallback. */
  composerName: string;
}) {
  if (!portrait) {
    return (
      <div
        // The card is a link, so a label here would be read as part of its
        // accessible name ("ベ 交響曲第5番…"). The composer's name is already
        // text, a few pixels to the right.
        aria-hidden="true"
        className="flex h-16 w-12 shrink-0 items-center justify-center rounded border border-line bg-accent-soft font-serif text-xl font-semibold text-accent"
      >
        {composerName.charAt(0)}
      </div>
    );
  }

  return (
    <div className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-line bg-paper">
      {/* Decorative: the composer's name is rendered as text in the same
          card, and any alt text would be concatenated into the card link's
          accessible name. */}
      <Image
        src={portraitThumb(portrait)}
        alt=""
        width={96}
        height={128}
        className="h-full w-full object-contain"
      />
    </div>
  );
}
