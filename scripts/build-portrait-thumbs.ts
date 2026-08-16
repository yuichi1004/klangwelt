/**
 * Writes the card-sized copies of the composer portraits into
 * `public/portraits/thumb/`.
 *
 * Same shape as `build-flags.ts`: run manually, output committed, `next build`
 * never depends on this or on `sharp` being installed. The static export has
 * no image optimizer (`next.config.ts` sets `images.unoptimized`), so serving
 * the 400px originals into the 48px thumbnail on a work card would ship ~8x
 * the bytes a card needs — 40 cards is ~800KB of portraits instead of ~120KB.
 *
 * Purely a resize: no crop, no recolour. `CONTRIBUTING.md`'s portrait rules
 * only allow scaling, so that a share-alike file does not become an
 * adaptation. `fit: "inside"` preserves the aspect ratio; do not change it to
 * `cover`.
 *
 * Run after `npm run seed:portraits`:
 *
 *     npm run build:portrait-thumbs
 *
 * `licenses.test.ts` fails if a portrait has no thumbnail, which is what
 * catches forgetting this step — the alternative failure mode is a silently
 * broken image in production.
 *
 * Re-running with the same inputs and the same sharp build produces identical
 * bytes, so the diff is empty. Upgrading sharp/libvips re-encodes all of them
 * at once; that is expected, and the same as `build-icons.ts`.
 */
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import portraitCredits from "../data/portraits.json";
import { portraitThumb, THUMB_WIDTH } from "../src/lib/portrait-thumb";
import type { PortraitCredit } from "../src/lib/licenses";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const OUT_DIR = path.join(PUBLIC_DIR, "portraits", "thumb");

async function main() {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  // Driven by the credits rather than a readdir of `public/portraits`, so the
  // thumbnails cover exactly the files we have cleared for redistribution —
  // and so a re-run never picks up `thumb/` itself.
  const credits = portraitCredits as PortraitCredit[];
  let bytes = 0;

  for (const credit of credits) {
    const source = path.join(PUBLIC_DIR, credit.file);
    const destination = path.join(PUBLIC_DIR, portraitThumb(credit.file));
    const { size } = await sharp(source)
      .resize({
        width: THUMB_WIDTH,
        height: THUMB_WIDTH,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 75, progressive: true })
      .toFile(destination);

    bytes += size;
    console.log(`${credit.composerId}.jpg  ${Math.round(size / 1024)}KB`);
  }

  console.log(
    `\n${credits.length} thumbnail(s) written to public/portraits/thumb/ (${(
      bytes / 1024 / 1024
    ).toFixed(1)}MB)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
