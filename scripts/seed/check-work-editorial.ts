/**
 * Runs the year-grounding and Wikipedia-similarity gates from
 * `src/lib/editorial-guard.ts` against real work entries before they are
 * committed — the same two checks `check-composer-editorial.ts` runs for
 * composers, applied to the built `data/editorial/works.json`.
 *
 * `works.json` is a generated artifact assembled by `npm run build:editorial`
 * from the per-composer source files under `data/editorial/works/` — run
 * that first, or this checks stale prose and a pass here means nothing.
 *
 * There is no automated fact source for individual works (unlike composers'
 * Wikidata fetch): song/work titles do not match Wikidata items reliably
 * enough to fetch unattended. Instead, years outside the composer's own
 * lifespan (e.g. a posthumous premiere or publication) must be recorded by
 * hand in `data/editorial/work-facts.json` while researching the entry.
 *
 * This is the one place (besides the composer equivalent) allowed to fetch
 * Wikipedia text, and it is fetched only to diff against — never written to
 * disk, logged in full, or cached, because that text is CC BY-SA and this
 * project ships none of it. See `CONTRIBUTING.md` and the header of
 * `editorial-guard.ts`.
 *
 * Usage:
 *   npx tsx scripts/seed/check-work-editorial.ts 16406 16238        # by id
 *   npx tsx scripts/seed/check-work-editorial.ts --composer 145     # every
 *                                                    entry for that composer
 *   npx tsx scripts/seed/check-work-editorial.ts --all              # every
 *                                                       entry in works.json
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { WorkEditorial, LocalizedText } from "../../src/lib/editorial";
import { checkSimilarity, maskPhrases, ungroundedYears } from "../../src/lib/editorial-guard";
import { getJson, sleep } from "./openopus";

const ROOT = process.cwd();
const WORKS_PATH = path.join(ROOT, "data", "editorial", "works.json");
const FACTS_PATH = path.join(ROOT, "data", "editorial", "work-facts.json");
const CORE_WORKS_PATH = path.join(ROOT, "data", "catalog", "core-works.json");
const COMPOSERS_PATH = path.join(ROOT, "data", "catalog", "composers.json");

const REQUEST_INTERVAL_MS = 300;

interface CoreWork {
  id: string;
  composerId: string;
  title: string;
}

interface CatalogComposer {
  id: string;
  completeName: string;
  nameJa: string;
  birthYear: number;
  deathYear: number | null;
}

interface WorkFacts {
  extraYears?: number[];
  /**
   * Literal strings (usually the work's own title) masked out of the prose
   * before the similarity check runs, so a proper noun that's merely long —
   * not a paraphrase — doesn't trip the char-run limit against an unrelated
   * reference article (typically the composer's own biography, when no
   * dedicated work article exists). See `maskPhrases` in editorial-guard.ts.
   */
  allowedPhrases?: string[];
}

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

/**
 * Work titles alone are far too generic to hit the right article directly
 * ("Symphony no. 5" matches dozens of composers), so this always searches
 * with the composer's name appended and takes the top hit.
 */
async function fetchWorkWikipediaExtract(
  lang: "ja" | "en",
  workTitle: string,
  composerName: string,
): Promise<string | undefined> {
  const base = `https://${lang}.wikipedia.org/w/api.php`;

  const search = await getJson<WikiSearchResponse>(
    api(base, {
      action: "query",
      list: "search",
      srsearch: `${workTitle} ${composerName}`,
      srlimit: "1",
    }),
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

interface CheckResult {
  ok: boolean;
  maxOverlap: { ja: number; en: number };
  /** Languages for which no Wikipedia reference was found at all — the
   *  similarity gate silently did not run for these, so a pass proves
   *  nothing about them. Common for obscure works, especially in ja. */
  ungatedLangs: Array<"ja" | "en">;
}

async function checkWork(
  id: string,
  entry: WorkEditorial,
  work: CoreWork,
  composer: CatalogComposer,
  facts: WorkFacts | undefined,
  options: CheckOptions,
): Promise<CheckResult> {
  const problems: string[] = [];
  const maxOverlap = { ja: 0, en: 0 };
  const ungatedLangs: Array<"ja" | "en"> = [];

  const lifespan = { birthYear: composer.birthYear, deathYear: composer.deathYear };
  const extraYears = facts?.extraYears ?? [];
  const allowedPhrases = facts?.allowedPhrases ?? [];

  const extracts: Record<"ja" | "en", string | undefined> = {
    ja: await fetchWorkWikipediaExtract("ja", work.title, composer.nameJa),
    en: await fetchWorkWikipediaExtract("en", work.title, composer.completeName),
  };

  const fields: Array<[string, LocalizedText | undefined]> = [
    ["structure", entry.structure],
    ["story", entry.story],
  ];

  for (const [fieldName, text] of fields) {
    if (!text) continue;
    for (const lang of ["ja", "en"] as const) {
      const badYears = ungroundedYears(text[lang], lang, lifespan, extraYears);
      if (badYears.length > 0) {
        problems.push(
          `${fieldName}.${lang}: year(s) not grounded in the composer's lifespan or work-facts.json: ${badYears.join(", ")}`,
        );
      }

      const reference = extracts[lang];
      if (!reference) {
        if (!ungatedLangs.includes(lang)) ungatedLangs.push(lang);
        continue;
      }
      const candidate = maskPhrases(text[lang], allowedPhrases);
      const { longestRun, exceeds } = checkSimilarity(candidate, reference, lang);
      maxOverlap[lang] = Math.max(maxOverlap[lang], longestRun);
      if (exceeds && !options.calibrate) {
        problems.push(
          `${fieldName}.${lang}: shares a run of ${longestRun} ${lang === "ja" ? "characters" : "words"} with Wikipedia`,
        );
      }
    }
  }

  const label = `${id} (${work.title})`;
  if (problems.length === 0) {
    console.log(`✓ ${label}`);
  } else {
    console.log(`✗ ${label}`);
    for (const problem of problems) console.log(`    - ${problem}`);
  }
  if (ungatedLangs.length > 0) {
    console.log(
      `    ⚠ no ${ungatedLangs.join("/")} reference article found — similarity gate did not run for ${ungatedLangs.length === 2 ? "either language" : ungatedLangs[0]}`,
    );
  }
  if (options.calibrate) {
    console.log(`    overlap: ja=${maxOverlap.ja} chars, en=${maxOverlap.en} words`);
  }

  return { ok: problems.length === 0, maxOverlap, ungatedLangs };
}

async function main() {
  const args = process.argv.slice(2);
  const calibrate = args.includes("--calibrate");
  const useAll = args.includes("--all");
  const composerFlagIndex = args.indexOf("--composer");
  const composerFilter =
    composerFlagIndex >= 0 ? args[composerFlagIndex + 1] : undefined;
  const ids = args.filter(
    (arg, i) =>
      !arg.startsWith("--") &&
      !(composerFlagIndex >= 0 && i === composerFlagIndex + 1),
  );

  const works = JSON.parse(await readFile(WORKS_PATH, "utf8")) as Record<
    string,
    WorkEditorial
  >;

  const coreWorks = JSON.parse(
    await readFile(CORE_WORKS_PATH, "utf8"),
  ) as CoreWork[];
  const worksById = new Map(coreWorks.map((work) => [work.id, work]));

  const composers = JSON.parse(
    await readFile(COMPOSERS_PATH, "utf8"),
  ) as CatalogComposer[];
  const composersById = new Map(composers.map((composer) => [composer.id, composer]));

  let targetIds: string[];
  if (useAll) {
    targetIds = Object.keys(works);
  } else if (composerFilter) {
    targetIds = Object.keys(works).filter(
      (id) => worksById.get(id)?.composerId === composerFilter,
    );
  } else {
    targetIds = ids;
  }

  if (targetIds.length === 0) {
    console.error(
      "Usage: check-work-editorial.ts <id...> | --composer <id> | --all [--calibrate]",
    );
    process.exit(1);
  }

  let allFacts: Record<string, WorkFacts> = {};
  try {
    allFacts = JSON.parse(await readFile(FACTS_PATH, "utf8")) as Record<
      string,
      WorkFacts
    >;
  } catch {
    console.warn(`No fact file at ${path.relative(ROOT, FACTS_PATH)} — continuing without it.`);
  }

  let failures = 0;
  let overallMax = { ja: 0, en: 0 };
  let ungatedCount = 0;

  for (const id of targetIds) {
    const entry = works[id];
    if (!entry) {
      console.log(`✗ ${id}: not in data/editorial/works.json`);
      failures++;
      continue;
    }
    const work = worksById.get(id);
    if (!work) {
      console.log(`✗ ${id}: not in data/catalog/core-works.json`);
      failures++;
      continue;
    }
    const composer = composersById.get(work.composerId);
    if (!composer) {
      console.log(`✗ ${id}: composer ${work.composerId} not in data/catalog/composers.json`);
      failures++;
      continue;
    }

    const result = await checkWork(id, entry, work, composer, allFacts[id], {
      calibrate,
    });
    if (!result.ok) failures++;
    if (result.ungatedLangs.length > 0) ungatedCount++;
    overallMax = {
      ja: Math.max(overallMax.ja, result.maxOverlap.ja),
      en: Math.max(overallMax.en, result.maxOverlap.en),
    };
  }

  if (calibrate) {
    console.log(
      `\nHighest incidental overlap across ${targetIds.length} work(s): ja=${overallMax.ja} chars, en=${overallMax.en} words`,
    );
  }

  if (ungatedCount > 0) {
    console.log(
      `\n⚠ ${ungatedCount}/${targetIds.length} work(s) had no Wikipedia reference for at least one language — the similarity gate did not run for those, only the year gate did.`,
    );
  }

  console.log(`\n${targetIds.length - failures}/${targetIds.length} passed`);
  if (failures > 0 && !calibrate) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
