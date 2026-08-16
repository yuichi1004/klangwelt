/**
 * Trims a uniform plain margin baked into the *source* JPEG of a
 * public-domain portrait — issue #122.
 *
 * #111 found that a display-side fix (`object-contain`, #123) couldn't
 * explain why some composers' faces look 2-3x smaller than others in the
 * grid: a handful of source files have a large plain background baked into
 * the pixels themselves (e.g. Purcell, Couperin, Albinoni — measured border
 * luminance 184-254 out of 255). `CONTRIBUTING.md`'s scale-only rule exists
 * to keep a CC BY-SA portrait from becoming an adaptation; it does not apply
 * here; per `requiresAttribution()` (`src/lib/licenses.ts`), a
 * public-domain file carries no share-alike term to violate. This script is
 * the one, audited exception CONTRIBUTING.md's 肖像画 section carves out for
 * that case, and it applies ONLY to `!requiresAttribution(license)` files —
 * CC BY / CC BY-SA portraits are always skipped.
 *
 * Two-phase, per file:
 *   1. Detect — sample the outermost 2px of each edge (greyscale) and
 *      compare the mean brightness to `BORDER_BRIGHTNESS_THRESHOLD`. This is
 *      the same heuristic used to find the 18 composers issue #122 lists; a
 *      full-bleed dark portrait (the Corelli control, 57.2) sits over 100
 *      points below it.
 *   2. Attempt — run `sharp.trim()` and classify the result via
 *      `classifyTrimResult` (`src/lib/portrait-trim.ts`): too small a change
 *      means there was no real margin (skip); too large a change means the
 *      algorithm likely ate into the actual portrait (flag for manual
 *      review, do not touch the file); anything in between is adopted.
 *
 * Defaults to a dry run — prints what it would do without writing anything.
 * Pass `--write` to actually overwrite `public/portraits/<id>.jpg`.
 * `npm run build:portrait-thumbs` must be re-run afterwards to regenerate
 * the 128px card thumbnails from the trimmed originals — this script does
 * not touch `public/portraits/thumb/` or `data/portraits.json` (the
 * `commonsFile`/`author`/`license`/`sourceUrl` credit fields stay accurate;
 * a public-domain file requires no attribution in the first place).
 *
 * Not idempotent against `npm run seed:portraits`: a full re-seed rebuilds
 * every portrait from Wikidata/Commons from scratch and will silently
 * restore the original (margin-included) image for any id this script
 * trimmed. See CONTRIBUTING.md.
 *
 *     npx tsx scripts/trim-portrait-margins.ts           # dry run
 *     npx tsx scripts/trim-portrait-margins.ts --write   # apply
 */
import path from "node:path";

import sharp from "sharp";

import portraitCredits from "../data/portraits.json";
import type { PortraitCredit } from "../src/lib/licenses";
import { requiresAttribution } from "../src/lib/licenses";
import {
  BORDER_BRIGHTNESS_THRESHOLD,
  classifyTrimResult,
  isMarginCandidate,
} from "../src/lib/portrait-trim";

const PUBLIC_DIR = path.join(process.cwd(), "public");

/**
 * Mean greyscale luminance (0-255) of the outermost 2px on each edge.
 * Deliberately shallow — see the doc comment on `BORDER_BRIGHTNESS_THRESHOLD`
 * for why sampling further inward misses oval-vignette cases.
 */
async function measureBorderBrightness(file: string): Promise<number> {
  const { data, info } = await sharp(file)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: iw, height: ih } = info;
  const at = (x: number, y: number) => data[y * iw + x];

  let sum = 0;
  let count = 0;
  for (let x = 0; x < iw; x += 1) {
    for (const y of [0, 1, ih - 2, ih - 1]) {
      if (y < 0 || y >= ih) continue;
      sum += at(x, y);
      count++;
    }
  }
  for (let y = 0; y < ih; y += 1) {
    for (const x of [0, 1, iw - 2, iw - 1]) {
      if (x < 0 || x >= iw) continue;
      sum += at(x, y);
      count++;
    }
  }
  return sum / count;
}

const TRIM_THRESHOLD = 15;

async function main() {
  const write = process.argv.slice(2).includes("--write");
  const credits = (portraitCredits as PortraitCredit[]).filter(
    (credit) => !requiresAttribution(credit.license),
  );

  console.log(
    `Scanning ${credits.length} public-domain-equivalent portrait(s) ` +
      `(border brightness > ${BORDER_BRIGHTNESS_THRESHOLD} is a candidate)` +
      (write ? " — WRITE MODE" : " — dry run, pass --write to apply") +
      "\n",
  );

  let adopted = 0;
  let needsReview = 0;

  for (const credit of credits) {
    const file = path.join(PUBLIC_DIR, credit.file);
    const brightness = await measureBorderBrightness(file);
    if (!isMarginCandidate(brightness)) continue;

    const original = await sharp(file).metadata();
    const trimmed = sharp(file).trim({ threshold: TRIM_THRESHOLD });
    const trimmedBuffer = await trimmed.toBuffer();
    const trimmedMeta = await sharp(trimmedBuffer).metadata();

    const verdict = classifyTrimResult({
      originalWidth: original.width!,
      originalHeight: original.height!,
      trimmedWidth: trimmedMeta.width!,
      trimmedHeight: trimmedMeta.height!,
    });

    const label = `${credit.composerId} (border ${brightness.toFixed(1)}): ` +
      `${original.width}x${original.height} -> ${trimmedMeta.width}x${trimmedMeta.height}`;

    if (verdict === "skip") {
      console.log(`${label}  SKIP (no real margin found)`);
      continue;
    }
    if (verdict === "needs-review") {
      needsReview++;
      console.log(`${label}  NEEDS REVIEW (trim looked too aggressive, left untouched)`);
      continue;
    }

    adopted++;
    console.log(`${label}  ${write ? "TRIMMED" : "would trim"}`);
    if (write) {
      await sharp(trimmedBuffer)
        .jpeg({ quality: 82, progressive: true })
        .toFile(file);
    }
  }

  console.log(
    `\n${adopted} adopted, ${needsReview} flagged for manual review.` +
      (write
        ? " Run `npm run build:portrait-thumbs` next to regenerate card thumbnails."
        : " Re-run with --write to apply."),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
