/**
 * Generates the favicon set from the brand artwork.
 *
 * Source: `assets/brand/klangwelt-k.jpg` — a drawn serif K whose flourish
 * turns into a stave and a violin body. Its ink is #b45c42, which is within a
 * shade of the palette's terracotta (#B35A42), so the icons sit naturally
 * beside the rest of the site.
 *
 * Run manually after changing the artwork: `npm run build:icons`.
 * The output is committed, so `next build` never depends on this.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const SOURCE = path.join(process.cwd(), "assets", "brand", "klangwelt-k.jpg");
const OUT_DIR = path.join(process.cwd(), "public");

/**
 * Square crop around the K.
 *
 * The glyph occupies x 289–755, y 166–740 in the 1170×917 original, so it is
 * tall and narrow; the frame is sized off its height. At 660 the K fills ~87%
 * with a 6.5% margin — large enough to still read as a K at 16px, with enough
 * edge left that iOS's corner rounding cannot bite into it. Fitting the whole
 * stave in shrank the letter until it turned to mush at favicon sizes, and
 * cropping tighter than this put the baseline on the frame edge.
 */
const CROP = { left: 192, top: 123, width: 660, height: 660 };

/** Sizes packed into favicon.ico, which browsers pick from by context. */
const ICO_SIZES = [16, 32, 48];

const PNG_ICONS = [
  { file: "icon-32.png", size: 32 },
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  // iOS composites this onto the home screen and adds its own rounding, so it
  // must be opaque — which the parchment ground already gives us.
  { file: "apple-touch-icon.png", size: 180 },
  // Shown in the site header at 28px. Sized for a 3× display rather than
  // reusing icon-192.png, which would put 55 kB on every page for a mark
  // that never renders above 84 physical pixels.
  { file: "logo-mark.png", size: 96 },
];

function render(size: number): Promise<Buffer> {
  return sharp(SOURCE)
    .extract(CROP)
    .resize(size, size, { kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Sampled from the corners of `CROP` (i.e. the same background `render()`
 * already puts around the K for every icon above) — averages to roughly
 * rgb(239, 236, 223). Used to pad the maskable variants below so they blend
 * with the rest of the set rather than introducing a new tone.
 */
const PARCHMENT = { r: 0xef, g: 0xec, b: 0xdf, alpha: 1 };

/**
 * Maskable icons for Android's adaptive-icon system: the OS applies its own
 * shape mask (circle, squircle, ...) over the full square, so only the
 * inner ~80% "safe zone" is guaranteed to stay visible. `CROP` fills ~87% of
 * its square with the K — safe for a favicon, which is never masked, but
 * enough to clip the glyph here. This shrinks the K to 72% of the frame
 * (comfortably inside the 80% zone, since the K's own flourish already eats
 * into its margin) and pads the rest with the same parchment tone the other
 * icons already carry, so the full square stays opaque as the maskable spec
 * requires.
 */
const MASKABLE_INNER_RATIO = 0.72;

const MASKABLE_ICONS = [
  { file: "icon-maskable-192.png", size: 192 },
  { file: "icon-maskable-512.png", size: 512 },
];

async function renderMaskable(size: number): Promise<Buffer> {
  const inner = Math.round(size * MASKABLE_INNER_RATIO);
  const pad = Math.floor((size - inner) / 2);
  const trailingPad = size - inner - pad;
  const glyph = await sharp(SOURCE)
    .extract(CROP)
    .resize(inner, inner, { kernel: "lanczos3" })
    .toBuffer();
  return sharp(glyph)
    .extend({
      top: pad,
      bottom: trailingPad,
      left: pad,
      right: trailingPad,
      background: PARCHMENT,
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Wraps PNGs in an ICO container.
 *
 * The format is a 6-byte header, one 16-byte directory entry per image, then
 * the payloads. PNG-inside-ICO is understood by every browser in use, so this
 * needs no encoder dependency.
 */
function buildIco(images: Array<{ size: number; data: Buffer }>): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;

  images.forEach((image, index) => {
    const entry = index * 16;
    // 256 is stored as 0; every size we ship is below that anyway.
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, entry);
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, entry + 1);
    directory.writeUInt8(0, entry + 2); // palette colours
    directory.writeUInt8(0, entry + 3); // reserved
    directory.writeUInt16LE(1, entry + 4); // colour planes
    directory.writeUInt16LE(32, entry + 6); // bits per pixel
    directory.writeUInt32LE(image.data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += image.data.length;
  });

  return Buffer.concat([
    header,
    directory,
    ...images.map((image) => image.data),
  ]);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const { file, size } of PNG_ICONS) {
    await writeFile(path.join(OUT_DIR, file), await render(size));
    console.log(`${file.padEnd(22)} ${size}×${size}`);
  }

  for (const { file, size } of MASKABLE_ICONS) {
    await writeFile(path.join(OUT_DIR, file), await renderMaskable(size));
    console.log(`${file.padEnd(22)} ${size}×${size} (maskable)`);
  }

  const icoImages = await Promise.all(
    ICO_SIZES.map(async (size) => ({ size, data: await render(size) })),
  );
  const ico = buildIco(icoImages);
  await writeFile(path.join(OUT_DIR, "favicon.ico"), ico);
  console.log(
    `${"favicon.ico".padEnd(22)} ${ICO_SIZES.join(", ")} (${ico.length} bytes)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
