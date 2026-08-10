/**
 * Assembles the hand-written composer notes into the single JSON file
 * `src/lib/editorial.ts` imports at build time.
 *
 * Each composer is authored in its own file under `data/editorial/composers/`
 * (see `CONTRIBUTING.md`) so that writing or revising one entry never touches
 * — and never requires reading — the other 219. This script is the only
 * place that reads the whole set at once, and it only reassembles a flat
 * lookup table; it does not rewrite the source files.
 *
 * Run after editing any file under `data/editorial/composers/`:
 * `npm run build:editorial`.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ComposerEditorial, LocalizedText } from "../../src/lib/editorial";

const ROOT = process.cwd();
const SOURCE_DIR = path.join(ROOT, "data", "editorial", "composers");
const OUTPUT = path.join(ROOT, "data", "editorial", "composers.json");

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Every localized field must be written in both languages — a one-sided
 * entry would silently render blank in the other language rather than
 * falling back to the "not written yet" placeholder, which looks broken
 * rather than incomplete.
 */
function checkLocalizedText(
  field: unknown,
  path: string,
  errors: string[],
): field is LocalizedText {
  if (field === undefined) return true;
  if (typeof field !== "object" || field === null) {
    errors.push(`${path}: must be an object with "ja" and "en"`);
    return false;
  }
  const record = field as Record<string, unknown>;
  for (const lang of ["ja", "en"] as const) {
    if (!isNonEmptyString(record[lang])) {
      errors.push(`${path}.${lang}: missing or empty`);
    }
  }
  return true;
}

function checkKeywords(
  field: unknown,
  path: string,
  errors: string[],
): void {
  if (field === undefined) return;
  if (typeof field !== "object" || field === null) {
    errors.push(`${path}: must be an object with "ja" and "en" arrays`);
    return;
  }
  const record = field as Record<string, unknown>;
  for (const lang of ["ja", "en"] as const) {
    const list = record[lang];
    if (!Array.isArray(list) || list.length === 0) {
      errors.push(`${path}.${lang}: must be a non-empty array`);
      continue;
    }
    if (list.length > 5) {
      errors.push(`${path}.${lang}: has ${list.length} entries, keep it to 3-5`);
    }
    if (!list.every(isNonEmptyString)) {
      errors.push(`${path}.${lang}: every keyword must be a non-empty string`);
    }
  }
}

function validateEntry(
  id: string,
  entry: ComposerEditorial,
  errors: string[],
): void {
  checkLocalizedText(entry.biography, `${id}.biography`, errors);
  checkLocalizedText(entry.style, `${id}.style`, errors);
  checkLocalizedText(entry.impact, `${id}.impact`, errors);
  checkLocalizedText(entry.story, `${id}.story`, errors);
  checkKeywords(entry.keywords, `${id}.keywords`, errors);

  const hasAnyContent =
    entry.biography || entry.style || entry.impact || entry.story;
  if (!hasAnyContent) {
    errors.push(`${id}: file exists but has no content — delete it instead`);
  }
}

async function main() {
  const files = (await readdir(SOURCE_DIR)).filter((file) =>
    file.endsWith(".json"),
  );

  const errors: string[] = [];
  const entries: Record<string, ComposerEditorial> = {};

  for (const file of files) {
    const id = path.basename(file, ".json");
    if (!/^\d+$/.test(id)) {
      errors.push(`${file}: filename must be a bare composer id, e.g. "145.json"`);
      continue;
    }

    let parsed: ComposerEditorial;
    try {
      parsed = JSON.parse(
        await readFile(path.join(SOURCE_DIR, file), "utf8"),
      ) as ComposerEditorial;
    } catch (error) {
      errors.push(`${file}: invalid JSON — ${(error as Error).message}`);
      continue;
    }

    validateEntry(id, parsed, errors);
    entries[id] = parsed;
  }

  if (errors.length > 0) {
    console.error(`${errors.length} problem(s) found:\n`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  const sorted = Object.fromEntries(
    Object.entries(entries).sort(([a], [b]) => Number(a) - Number(b)),
  );

  await writeFile(OUTPUT, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`${Object.keys(sorted).length} composer entries → ${path.relative(ROOT, OUTPUT)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
