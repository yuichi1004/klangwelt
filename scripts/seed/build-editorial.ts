/**
 * Assembles the hand-written composer and work notes into the single JSON
 * files `src/lib/editorial.ts` imports at build time.
 *
 * Composer entries are authored one-per-file under `data/editorial/composers/`
 * and work entries one-per-composer under `data/editorial/works/` (see
 * `CONTRIBUTING.md`), so that writing or revising one entry never touches —
 * and never requires reading — the others. This script is the only place
 * that reads either whole set at once, and it only reassembles a flat lookup
 * table per kind; it does not rewrite the source files.
 *
 * Run after editing any file under `data/editorial/composers/` or
 * `data/editorial/works/`: `npm run build:editorial`.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  ComposerEditorial,
  LocalizedText,
  WorkEditorial,
} from "../../src/lib/editorial";

const ROOT = process.cwd();
const COMPOSER_SOURCE_DIR = path.join(ROOT, "data", "editorial", "composers");
const COMPOSER_OUTPUT = path.join(ROOT, "data", "editorial", "composers.json");
const WORK_SOURCE_DIR = path.join(ROOT, "data", "editorial", "works");
const WORK_OUTPUT = path.join(ROOT, "data", "editorial", "works.json");
const CORE_WORKS_PATH = path.join(ROOT, "data", "catalog", "core-works.json");
const CATALOG_COMPOSERS_PATH = path.join(ROOT, "data", "catalog", "composers.json");

interface CoreWork {
  id: string;
  composerId: string;
  stars: number;
}

/**
 * Advisory length bands for the shortened ★3 prose style (CONTRIBUTING.md,
 * "★3解説の長さと構成"). ★4/★5 entries are exempt — they were written to a
 * longer, already-shipped standard and this must not retroactively flag
 * them. This is a warning, not a gate: a work with unusually little or a lot
 * to say can still legitimately fall outside the band.
 */
const LENGTH_BAND_STAR = 3;
const LENGTH_BANDS: Record<
  "structure" | "story",
  { ja: [number, number]; en: [number, number] }
> = {
  structure: { ja: [90, 140], en: [35, 50] },
  story: { ja: [120, 190], en: [50, 75] },
};

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

function validateComposerEntry(
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

async function buildComposers(): Promise<Record<string, ComposerEditorial>> {
  const files = (await readdir(COMPOSER_SOURCE_DIR)).filter((file) =>
    file.endsWith(".json"),
  );

  const errors: string[] = [];
  const entries: Record<string, ComposerEditorial> = {};

  for (const file of files) {
    const id = path.basename(file, ".json");
    if (!/^\d+$/.test(id)) {
      errors.push(`composers/${file}: filename must be a bare composer id, e.g. "145.json"`);
      continue;
    }

    let parsed: ComposerEditorial;
    try {
      parsed = JSON.parse(
        await readFile(path.join(COMPOSER_SOURCE_DIR, file), "utf8"),
      ) as ComposerEditorial;
    } catch (error) {
      errors.push(`composers/${file}: invalid JSON — ${(error as Error).message}`);
      continue;
    }

    validateComposerEntry(id, parsed, errors);
    entries[id] = parsed;
  }

  if (errors.length > 0) {
    console.error(`${errors.length} composer problem(s) found:\n`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  return Object.fromEntries(
    Object.entries(entries).sort(([a], [b]) => Number(a) - Number(b)),
  );
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function charCount(text: string): number {
  return [...text].length;
}

function checkLengthAdvisory(
  workId: string,
  entry: WorkEditorial,
  stars: number,
  warnings: string[],
): void {
  if (stars > LENGTH_BAND_STAR) return;
  for (const field of ["structure", "story"] as const) {
    const text = entry[field];
    if (!text) continue;
    const bands = LENGTH_BANDS[field];
    const jaLen = charCount(text.ja);
    const enLen = wordCount(text.en);
    if (jaLen < bands.ja[0] || jaLen > bands.ja[1]) {
      warnings.push(
        `${workId}.${field}.ja: ${jaLen} chars, outside the ★${LENGTH_BAND_STAR} advisory band ${bands.ja[0]}-${bands.ja[1]}`,
      );
    }
    if (enLen < bands.en[0] || enLen > bands.en[1]) {
      warnings.push(
        `${workId}.${field}.en: ${enLen} words, outside the ★${LENGTH_BAND_STAR} advisory band ${bands.en[0]}-${bands.en[1]}`,
      );
    }
  }
}

async function buildWorks(): Promise<Record<string, WorkEditorial>> {
  const coreWorks = JSON.parse(
    await readFile(CORE_WORKS_PATH, "utf8"),
  ) as CoreWork[];
  const coreWorkById = new Map(coreWorks.map((work) => [work.id, work]));

  const catalogComposers = JSON.parse(
    await readFile(CATALOG_COMPOSERS_PATH, "utf8"),
  ) as Array<{ id: string }>;
  const catalogComposerIds = new Set(catalogComposers.map((c) => c.id));

  const files = (await readdir(WORK_SOURCE_DIR)).filter((file) =>
    file.endsWith(".json"),
  );

  const errors: string[] = [];
  const warnings: string[] = [];
  const entries: Record<string, WorkEditorial> = {};
  const seenIds = new Map<string, string>(); // work id -> file it first appeared in

  for (const file of files) {
    const composerId = path.basename(file, ".json");
    if (!/^\d+$/.test(composerId)) {
      errors.push(`works/${file}: filename must be a bare composer id, e.g. "145.json"`);
      continue;
    }
    if (!catalogComposerIds.has(composerId)) {
      errors.push(`works/${file}: composer ${composerId} not in data/catalog/composers.json`);
      continue;
    }

    let parsed: Record<string, WorkEditorial>;
    try {
      parsed = JSON.parse(
        await readFile(path.join(WORK_SOURCE_DIR, file), "utf8"),
      ) as Record<string, WorkEditorial>;
    } catch (error) {
      errors.push(`works/${file}: invalid JSON — ${(error as Error).message}`);
      continue;
    }

    for (const [workId, entry] of Object.entries(parsed)) {
      const label = `works/${file}#${workId}`;

      const dup = seenIds.get(workId);
      if (dup) {
        errors.push(`${label}: duplicate of ${dup} — a work id must appear in exactly one file`);
        continue;
      }
      seenIds.set(workId, `works/${file}`);

      const coreWork = coreWorkById.get(workId);
      if (!coreWork) {
        errors.push(`${label}: not in data/catalog/core-works.json`);
        continue;
      }
      if (coreWork.composerId !== composerId) {
        errors.push(
          `${label}: belongs to composer ${coreWork.composerId}, not ${composerId} — check for a copy-paste into the wrong file`,
        );
        continue;
      }

      checkLocalizedText(entry.structure, `${label}.structure`, errors);
      checkLocalizedText(entry.story, `${label}.story`, errors);
      if (!entry.structure && !entry.story) {
        errors.push(`${label}: neither structure nor story is set — delete the entry instead`);
        continue;
      }

      checkLengthAdvisory(workId, entry, coreWork.stars, warnings);
      entries[workId] = entry;
    }
  }

  if (warnings.length > 0) {
    console.warn(`${warnings.length} length advisory warning(s) (not fatal):\n`);
    for (const warning of warnings) console.warn(`  ⚠ ${warning}`);
    console.warn("");
  }

  if (errors.length > 0) {
    console.error(`${errors.length} work problem(s) found:\n`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  return Object.fromEntries(
    Object.entries(entries).sort(([a], [b]) => Number(a) - Number(b)),
  );
}

async function main() {
  const composers = await buildComposers();
  await writeFile(COMPOSER_OUTPUT, `${JSON.stringify(composers, null, 2)}\n`);
  console.log(
    `${Object.keys(composers).length} composer entries → ${path.relative(ROOT, COMPOSER_OUTPUT)}`,
  );

  const works = await buildWorks();
  await writeFile(WORK_OUTPUT, `${JSON.stringify(works, null, 2)}\n`);
  const composerCount = new Set(
    (await readdir(WORK_SOURCE_DIR)).filter((f) => f.endsWith(".json")),
  ).size;
  console.log(
    `${Object.keys(works).length} work entries across ${composerCount} composers → ${path.relative(ROOT, WORK_OUTPUT)}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
