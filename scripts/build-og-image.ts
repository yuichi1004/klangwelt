/**
 * Generates the default Open Graph share-card image (1200×630), used
 * wherever a page has no more specific image of its own — the homepage,
 * favourites/credits/media listings, and any composer or work page whose
 * composer has no freely licensed portrait.
 *
 * Reuses the same brand crop as `build-icons.ts` (see that file for the crop
 * rationale) so the mark is identical everywhere on the site, just composited
 * onto a wider canvas instead of resized to a square icon.
 *
 * Run manually after changing the artwork: `npm run build:og-image`.
 * The output is committed, so `next build` never depends on this.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const SOURCE = path.join(process.cwd(), "assets", "brand", "klangwelt-k.jpg");
const OUT_DIR = path.join(process.cwd(), "public");
const OUT_FILE = "og-default.png";

// Same square crop around the K as build-icons.ts.
const CROP = { left: 192, top: 123, width: 660, height: 660 };

const CANVAS = { width: 1200, height: 630 };
const MARK_SIZE = 440;
// --color-paper in globals.css, so the card matches the site's own background
// rather than the icon's parchment ground.
const BACKGROUND = "#2c3630";

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const mark = await sharp(SOURCE)
    .extract(CROP)
    .resize(MARK_SIZE, MARK_SIZE, { kernel: "lanczos3" })
    .png()
    .toBuffer();

  const card = await sharp({
    create: {
      width: CANVAS.width,
      height: CANVAS.height,
      channels: 3,
      background: BACKGROUND,
    },
  })
    .composite([{ input: mark, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  await writeFile(path.join(OUT_DIR, OUT_FILE), card);
  console.log(`${OUT_FILE.padEnd(22)} ${CANVAS.width}×${CANVAS.height}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
