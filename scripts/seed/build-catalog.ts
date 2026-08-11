/**
 * Turns the raw Open Opus dump into the JSON the app actually ships.
 *
 * Three outputs:
 *  - `data/catalog/composers.json` and `data/catalog/core-works.json` are
 *    imported directly by server components, so they end up in the static
 *    HTML at build time.
 *  - `public/data/works/<composerId>.json` holds every work by a composer and
 *    is fetched lazily from the composer page, keeping the ~25k long tail out
 *    of the initial payload.
 *
 * Run manually after `npm run seed:openopus`: `npm run seed:catalog`.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  CatalogMeta,
  Composer,
  Work,
  WorkFacts,
  WorkIndexRow,
} from "../../src/lib/catalog-types";
import { loadCuration } from "../../src/lib/curation";
import { isEpoch, isGenre } from "../../src/lib/epochs";
import type { PortraitCredit } from "../../src/lib/licenses";
import {
  compareByStandard,
  workScore,
  workStars,
  type CuratedStars,
  type Stars,
} from "../../src/lib/popularity";
import { parseTitle, tidy } from "../../src/lib/title/parse";
import {
  composeJapaneseTitle,
  translateCatalogue,
  translateForm,
  translateKey,
  translateNickname,
} from "../../src/lib/title/translate";
import { readCurationSource, toCurationView } from "./curation-files";
import type { RawComposer, RawDataset, RawWork } from "./openopus";

const ROOT = process.cwd();
const RAW = path.join(ROOT, "data", "raw", "openopus.json");
const CATALOG_DIR = path.join(ROOT, "data", "catalog");
const PUBLIC_WORKS_DIR = path.join(ROOT, "public", "data", "works");

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function buildFacts(raw: RawWork): WorkFacts {
  const parsed = parseTitle(raw.title);
  const key = parsed.key
    ? [parsed.key.pitch, parsed.key.accidental, parsed.key.mode]
        .filter(Boolean)
        .join(" ")
    : undefined;

  return {
    form: parsed.form || undefined,
    formJa: translateForm(parsed.form),
    number: parsed.number,
    key,
    keyJa: parsed.key ? translateKey(parsed.key) : undefined,
    catalogue: parsed.catalogue,
    catalogueJa: parsed.catalogue.map(translateCatalogue),
    nickname: parsed.nickname,
    nicknameJa: parsed.nickname ? translateNickname(parsed.nickname) : undefined,
    instrumentation: parsed.instrumentation,
    subtitle: tidy(raw.subtitle) || undefined,
  };
}

interface WorkRating {
  composerStars: Stars;
  curatedStars?: CuratedStars;
  curatedRank?: number;
}

function buildWork(
  raw: RawWork,
  composerId: string,
  overrides: Record<string, string>,
  rating: WorkRating,
): Work {
  const title = tidy(raw.title);
  const override = overrides[raw.id];
  const japanese = override
    ? { text: override, translated: true }
    : composeJapaneseTitle(parseTitle(raw.title), title);

  const facts = buildFacts(raw);
  const input = {
    ...rating,
    popular: raw.popular === "1",
    recommended: raw.recommended === "1",
    hasNickname: Boolean(facts.nickname),
    genre: isGenre(raw.genre) ? raw.genre : ("Orchestral" as const),
  };

  return {
    id: raw.id,
    composerId,
    title,
    titleJa: japanese.text,
    genre: input.genre,
    popular: input.popular,
    recommended: input.recommended,
    stars: workStars(input),
    score: workScore(input),
    curated: rating.curatedStars !== undefined,
    searchTerms: tidy(raw.searchterms),
    facts,
  };
}

/**
 * A work reaches the core index either because Open Opus flagged it or
 * because someone curated it — several cornerstones of the repertoire (the
 * Goldberg Variations, Brahms' First) carry neither flag upstream.
 */
function isCore(work: Work): boolean {
  return work.popular || work.recommended || work.curated;
}


function buildComposer(
  raw: RawComposer,
  works: Work[],
  namesJa: Record<string, string>,
  portrait: PortraitCredit | undefined,
  stars: Stars,
): Composer {
  const deathYear = raw.death ? Number(raw.death.slice(0, 4)) : null;

  return {
    id: raw.id,
    name: raw.name,
    completeName: raw.complete_name,
    nameJa: namesJa[raw.id] ?? raw.complete_name,
    epoch: isEpoch(raw.epoch) ? raw.epoch : "Romantic",
    birthYear: Number(raw.birth.slice(0, 4)),
    deathYear: Number.isNaN(deathYear as number) ? null : deathYear,
    popular: raw.popular === "1",
    stars,
    workCount: works.length,
    coreWorkCount: works.filter(isCore).length,
    portrait: portrait?.file,
  };
}

async function main() {
  const dataset = JSON.parse(await readFile(RAW, "utf8")) as RawDataset;

  const namesJa = await readJson<Record<string, string>>(
    path.join(ROOT, "data", "ja", "composer-names.json"),
    {},
  );
  const overrides = await readJson<Record<string, string>>(
    path.join(ROOT, "data", "ja", "title-overrides.json"),
    {},
  );
  const portraits = await readJson<PortraitCredit[]>(
    path.join(ROOT, "data", "portraits.json"),
    [],
  );
  const portraitById = new Map(portraits.map((p) => [p.composerId, p]));

  // Unlike the optional Japanese overrides above, the curated ratings are not
  // allowed to be missing: a catalogue rated entirely by formula would look
  // plausible and be wrong, which is the failure hardest to spot in review.
  const curation = loadCuration(
    await readCurationSource(),
    toCurationView(dataset),
  );
  for (const warning of curation.warnings) console.warn(`  ! ${warning}`);
  if (curation.errors.length > 0) {
    console.error(`\n${curation.errors.length} problem(s) in data/curation:\n`);
    for (const error of curation.errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  await rm(PUBLIC_WORKS_DIR, { recursive: true, force: true });
  await mkdir(PUBLIC_WORKS_DIR, { recursive: true });
  await mkdir(CATALOG_DIR, { recursive: true });

  const composers: Composer[] = [];
  const coreWorks: Work[] = [];
  let totalWorkCount = 0;

  for (const rawComposer of dataset.composers) {
    const composerStars = curation.composerStars.get(rawComposer.id) ?? 1;
    const works = (dataset.works[rawComposer.id] ?? []).map((raw) => {
      const curated = curation.workStars.get(raw.id);
      return buildWork(raw, rawComposer.id, overrides, {
        composerStars,
        curatedStars: curated?.stars,
        curatedRank: curated?.rank,
      });
    });
    totalWorkCount += works.length;

    composers.push(
      buildComposer(
        rawComposer,
        works,
        namesJa,
        portraitById.get(rawComposer.id),
        composerStars,
      ),
    );
    coreWorks.push(...works.filter(isCore));

    // Sorted here too, so the composer's complete catalogue opens with the
    // works someone is most likely to be looking for.
    works.sort(compareByStandard);
    await writeFile(
      path.join(PUBLIC_WORKS_DIR, `${rawComposer.id}.json`),
      JSON.stringify(works),
    );
  }

  // 定番度 first. This is the order of the catalogue page in both locales, of
  // every composer's work list, and of the "start here" picks — the pages read
  // this file's order directly, and `sortWorks` reproduces it from the same
  // comparator, so all of them agree.
  coreWorks.sort(compareByStandard);

  const translated = coreWorks.filter(
    (work) => work.titleJa !== work.title,
  ).length;

  const meta: CatalogMeta = {
    builtAt: new Date().toISOString(),
    composerCount: composers.length,
    coreWorkCount: coreWorks.length,
    totalWorkCount,
    translatedRatio: Number((translated / coreWorks.length).toFixed(3)),
  };

  await writeFile(
    path.join(CATALOG_DIR, "composers.json"),
    JSON.stringify(composers),
  );
  await writeFile(
    path.join(CATALOG_DIR, "core-works.json"),
    JSON.stringify(coreWorks),
  );

  const index: WorkIndexRow[] = coreWorks.map((work) => ({
    id: work.id,
    composerId: work.composerId,
    title: work.title,
    titleJa: work.titleJa,
    genre: work.genre,
    stars: work.stars,
    score: work.score,
  }));
  await writeFile(
    path.join(CATALOG_DIR, "work-index.json"),
    JSON.stringify(index),
  );
  // Also served as a static asset: the catalogue and favourites pages fetch
  // it on mount instead of having it inlined into every page's HTML, which
  // keeps the landing page small and lets the browser cache it once.
  await writeFile(
    path.join(ROOT, "public", "data", "work-index.json"),
    JSON.stringify(index),
  );
  await writeFile(
    path.join(CATALOG_DIR, "meta.json"),
    `${JSON.stringify(meta, null, 2)}\n`,
  );

  const histogram = (values: Iterable<number>) => {
    const counts = new Map<number, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [5, 4, 3, 2, 1]
      .map((star) => `★${star} ${counts.get(star) ?? 0}`)
      .join("  ");
  };
  const promoted = coreWorks.filter(
    (work) => work.curated && !work.popular && !work.recommended,
  ).length;

  console.log(
    [
      `composers:        ${meta.composerCount}   ${histogram(composers.map((c) => c.stars))}`,
      `core works:       ${meta.coreWorkCount}   ${histogram(coreWorks.map((w) => w.stars))}`,
      `curated:          ${coreWorks.filter((work) => work.curated).length} (${promoted} promoted into the core index)`,
      `total works:      ${meta.totalWorkCount}`,
      `Japanese titles:  ${(meta.translatedRatio * 100).toFixed(1)}%`,
      `portraits:        ${portraits.length}`,
      "",
      // The order this prints is the order the catalogue's default sort and
      // every composer page use, in both locales, so it is the fastest way to
      // see a curation batch land — or to notice that it did not.
      "top of the catalogue:",
      ...coreWorks
        .slice(0, 15)
        .map((work, rank) => `  ${String(rank + 1).padStart(2)}. ★${work.stars} ${work.title}`),
    ].join("\n"),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
