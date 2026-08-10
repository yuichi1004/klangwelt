/**
 * Runs the three gates from `src/lib/editorial-guard.ts` against real
 * composer entries before they are committed: enough source material to
 * write from, no year the fact sheet cannot vouch for, and no run of prose
 * that sits too close to the composer's own Wikipedia article.
 *
 * This is the one place in the project allowed to fetch Wikipedia text, and
 * it is fetched only to diff against — never written to disk, logged in
 * full, or cached, because that text is CC BY-SA and this project ships none
 * of it. See `CONTRIBUTING.md` and the header of `editorial-guard.ts`.
 *
 * Usage:
 *   npx tsx scripts/seed/check-composer-editorial.ts 145 196       # by id
 *   npx tsx scripts/seed/check-composer-editorial.ts --all         # every
 *                                                                    file under
 *                                                                    data/editorial/composers/
 *   npx tsx scripts/seed/check-composer-editorial.ts --all --calibrate
 *       Reports the highest incidental overlap seen instead of failing on
 *       today's SIMILARITY_LIMITS — used once, in Phase 0, to set them.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { ComposerEditorial, LocalizedText } from "../../src/lib/editorial";
import {
  checkSimilarity,
  hasEnoughFacts,
  ungroundedYears,
  type ComposerFactSheet,
} from "../../src/lib/editorial-guard";
import { getJson, sleep, type RawDataset } from "./openopus";

const ROOT = process.cwd();
const EDITORIAL_DIR = path.join(ROOT, "data", "editorial", "composers");
const FACTS_PATH = path.join(ROOT, "data", "raw", "composer-facts.json");
const RAW_PATH = path.join(ROOT, "data", "raw", "openopus.json");
const NAMES_JA_PATH = path.join(ROOT, "data", "ja", "composer-names.json");

const REQUEST_INTERVAL_MS = 300;

const api = (base: string, params: Record<string, string>) =>
  `${base}?${new URLSearchParams({ format: "json", ...params })}`;

interface WikiExtractResponse {
  query?: {
    pages?: Record<string, { missing?: string; extract?: string }>;
  };
}

interface WikiSearchResponse {
  query?: { search?: Array<{ title: string }> };
}

async function fetchWikipediaExtract(
  lang: "ja" | "en",
  title: string,
): Promise<string | undefined> {
  const base = `https://${lang}.wikipedia.org/w/api.php`;

  const direct = await getJson<WikiExtractResponse>(
    api(base, { action: "query", prop: "extracts", explaintext: "1", redirects: "1", titles: title }),
  );
  await sleep(REQUEST_INTERVAL_MS);
  const directPage = Object.values(direct.query?.pages ?? {})[0];
  if (directPage?.extract) return directPage.extract;

  // The composer's name as we spell it does not always match the article
  // title exactly (accents, "van" vs "von", ordering) — fall back to search.
  const search = await getJson<WikiSearchResponse>(
    api(base, { action: "query", list: "search", srsearch: title, srlimit: "1" }),
  );
  await sleep(REQUEST_INTERVAL_MS);
  const hit = search.query?.search?.[0]?.title;
  if (!hit) return undefined;

  const resolved = await getJson<WikiExtractResponse>(
    api(base, { action: "query", prop: "extracts", explaintext: "1", redirects: "1", titles: hit }),
  );
  await sleep(REQUEST_INTERVAL_MS);
  return Object.values(resolved.query?.pages ?? {})[0]?.extract;
}

interface CheckOptions {
  calibrate: boolean;
}

async function checkComposer(
  id: string,
  entry: ComposerEditorial,
  factSheet: ComposerFactSheet | undefined,
  lifespan: { birthYear: number; deathYear: number | null },
  names: { ja: string; en: string },
  options: CheckOptions,
): Promise<{ ok: boolean; maxOverlap: { ja: number; en: number } }> {
  const problems: string[] = [];
  const maxOverlap = { ja: 0, en: 0 };

  if (!hasEnoughFacts(
    factSheet ?? {
      composerId: id,
      teachers: [],
      students: [],
      notableWorks: [],
      movements: [],
      instruments: [],
      occupations: [],
      awards: [],
      employers: [],
      genres: [],
      extraYears: [],
    },
  )) {
    problems.push("fact sheet has too little material to write from");
  }

  const extracts: Record<"ja" | "en", string | undefined> = {
    ja: await fetchWikipediaExtract("ja", names.ja),
    en: await fetchWikipediaExtract("en", names.en),
  };

  const fields: Array<[string, LocalizedText | undefined]> = [
    ["biography", entry.biography],
    ["style", entry.style],
    ["impact", entry.impact],
    ["story", entry.story],
  ];

  for (const [fieldName, text] of fields) {
    if (!text) continue;
    for (const lang of ["ja", "en"] as const) {
      const badYears = ungroundedYears(
        text[lang],
        lang,
        lifespan,
        factSheet?.extraYears ?? [],
      );
      if (badYears.length > 0) {
        problems.push(
          `${fieldName}.${lang}: year(s) not grounded in the fact sheet: ${badYears.join(", ")}`,
        );
      }

      const reference = extracts[lang];
      if (!reference) continue;
      const { longestRun, exceeds } = checkSimilarity(text[lang], reference, lang);
      maxOverlap[lang] = Math.max(maxOverlap[lang], longestRun);
      if (exceeds && !options.calibrate) {
        problems.push(
          `${fieldName}.${lang}: shares a run of ${longestRun} ${lang === "ja" ? "characters" : "words"} with Wikipedia`,
        );
      }
    }
  }

  const label = `${id} (${names.en})`;
  if (problems.length === 0) {
    console.log(`✓ ${label}`);
  } else {
    console.log(`✗ ${label}`);
    for (const problem of problems) console.log(`    - ${problem}`);
  }
  if (options.calibrate) {
    console.log(`    overlap: ja=${maxOverlap.ja} chars, en=${maxOverlap.en} words`);
  }

  return { ok: problems.length === 0, maxOverlap };
}

async function main() {
  const args = process.argv.slice(2);
  const calibrate = args.includes("--calibrate");
  const useAll = args.includes("--all");
  const ids = args.filter((arg) => !arg.startsWith("--"));

  const targetIds = useAll
    ? (await readdir(EDITORIAL_DIR))
        .filter((file) => file.endsWith(".json"))
        .map((file) => path.basename(file, ".json"))
    : ids;

  if (targetIds.length === 0) {
    console.error("Usage: check-composer-editorial.ts <id...> | --all [--calibrate]");
    process.exit(1);
  }

  const dataset = JSON.parse(await readFile(RAW_PATH, "utf8")) as RawDataset;
  const rawById = new Map(dataset.composers.map((composer) => [composer.id, composer]));
  const namesJa = JSON.parse(
    await readFile(NAMES_JA_PATH, "utf8"),
  ) as Record<string, string>;

  let factSheets: ComposerFactSheet[] = [];
  try {
    factSheets = JSON.parse(await readFile(FACTS_PATH, "utf8")) as ComposerFactSheet[];
  } catch {
    console.warn(`No fact sheet file at ${path.relative(ROOT, FACTS_PATH)} — run \`npm run seed:composer-facts\` first. Continuing without it.`);
  }
  const factsById = new Map(factSheets.map((sheet) => [sheet.composerId, sheet]));

  let failures = 0;
  let overallMax = { ja: 0, en: 0 };

  for (const id of targetIds) {
    const raw = rawById.get(id);
    if (!raw) {
      console.log(`✗ ${id}: not in data/raw/openopus.json`);
      failures++;
      continue;
    }
    const entry = JSON.parse(
      await readFile(path.join(EDITORIAL_DIR, `${id}.json`), "utf8"),
    ) as ComposerEditorial;

    const deathYear = raw.death ? Number(raw.death.slice(0, 4)) : null;
    const result = await checkComposer(
      id,
      entry,
      factsById.get(id),
      { birthYear: Number(raw.birth.slice(0, 4)), deathYear },
      { ja: namesJa[id] ?? raw.complete_name, en: raw.complete_name },
      { calibrate },
    );
    if (!result.ok) failures++;
    overallMax = {
      ja: Math.max(overallMax.ja, result.maxOverlap.ja),
      en: Math.max(overallMax.en, result.maxOverlap.en),
    };
  }

  if (calibrate) {
    console.log(
      `\nHighest incidental overlap across ${targetIds.length} composer(s): ja=${overallMax.ja} chars, en=${overallMax.en} words`,
    );
  }

  console.log(`\n${targetIds.length - failures}/${targetIds.length} passed`);
  if (failures > 0 && !calibrate) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
