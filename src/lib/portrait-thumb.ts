/**
 * Where the card-sized copy of a portrait lives.
 *
 * `next.config.ts` sets `images.unoptimized` — the static export has no image
 * optimizer, so whatever is on disk is what ships. The stored portraits are
 * 400px wide for the 160-320px boxes on the composer pages, which is ~8x the
 * pixels a 48px work-card thumbnail needs. `scripts/build-portrait-thumbs.ts`
 * writes the smaller copies; this module is the one place that knows where
 * they go, so the script and the UI cannot drift apart.
 */

/**
 * Longest side, in pixels. Covers 2x DPR for the 48x64 box in `ComposerThumb`
 * at every aspect ratio in the collection (the tallest is 0.455, the widest
 * 2.878).
 */
export const THUMB_WIDTH = 128;

/**
 * Maps a stored portrait path to its thumbnail.
 *
 * A sub-directory rather than a `-thumb` suffix, so `data/portraits.json`'s
 * `file` stays the canonical `/portraits/{id}.jpg` that `licenses.test.ts`
 * asserts on.
 *
 * @param portrait `Composer.portrait`, e.g. `/portraits/170.jpg`
 * @returns e.g. `/portraits/thumb/170.jpg`
 */
export function portraitThumb(portrait: string): string {
  return portrait.replace(/^\/portraits\//, "/portraits/thumb/");
}
