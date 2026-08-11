/**
 * Copies the flag SVGs the site actually uses out of `flag-icons` (MIT,
 * vendored as a devDependency) into `public/flags/`, self-hosting them
 * instead of depending on the package — or a CDN — at runtime.
 *
 * Same shape as `build-icons.ts`: run manually, output committed, `next
 * build` never depends on this or on `flag-icons` being installed.
 *
 * `src/lib/countries.ts`'s `COUNTRY_LABELS` is the single source of which
 * countries the site can show — this script copies exactly those and no
 * others, so an unused flag never ships. Run after adding a country there:
 * `npm run build:flags`.
 */
import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { COUNTRY_LABELS } from "../src/lib/countries";

const SOURCE_DIR = path.join(
  process.cwd(),
  "node_modules",
  "flag-icons",
  "flags",
  "4x3",
);
const OUT_DIR = path.join(process.cwd(), "public", "flags");

async function main() {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const codes = Object.keys(COUNTRY_LABELS).sort();
  for (const code of codes) {
    const file = `${code.toLowerCase()}.svg`;
    await copyFile(path.join(SOURCE_DIR, file), path.join(OUT_DIR, file));
    console.log(file);
  }

  console.log(`\n${codes.length} flag(s) written to public/flags/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
