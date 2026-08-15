/**
 * Turns the raw Open Opus dump into the JSON the app actually ships.
 *
 * Three outputs:
 *  - `data/catalog/composers.json`, `data/catalog/core-works.json` and
 *    `data/catalog/media-index.json` (the film/anime/TV reverse index, see
 *    `src/lib/media-index.ts`) are imported directly by server components,
 *    so they end up in the static HTML at build time.
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
import { loadMedia, type MediaAppearance } from "../../src/lib/media";
import { buildMediaIndex } from "../../src/lib/media-index";
import { loadNationalities, type NationalityEntry } from "../../src/lib/nationality";
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
import { readMediaSource } from "./media-files";
import { readNationalitySource } from "./nationality-files";
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
  rankedIndex?: number;
  curatedStars?: CuratedStars;
  curatedRank?: number;
}

function buildWork(
  raw: RawWork,
  composerId: string,
  overrides: Record<string, string>,
  rating: WorkRating,
  media: MediaAppearance[] | undefined,
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
    media,
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
  nationality: NationalityEntry | undefined,
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
    nationality,
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

  const curationView = toCurationView(dataset);

  // Unlike the optional Japanese overrides above, the curated ratings are not
  // allowed to be missing: a catalogue rated entirely by formula would look
  // plausible and be wrong, which is the failure hardest to spot in review.
  const curation = loadCuration(await readCurationSource(), curationView);
  for (const warning of curation.warnings) console.warn(`  ! ${warning}`);
  if (curation.errors.length > 0) {
    console.error(`\n${curation.errors.length} problem(s) in data/curation:\n`);
    for (const error of curation.errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  // Unlike `curation`, coverage is not required here — most composers will
  // have no entry, and that is fine (see `nationality.ts`). What still fails
  // the build is a malformed entry among the ones that do exist.
  const nationalities = loadNationalities(await readNationalitySource(), {
    composers: dataset.composers.map((composer) => ({
      id: composer.id,
      name: composer.name,
    })),
  });
  if (nationalities.errors.length > 0) {
    console.error(
      `\n${nationalities.errors.length} problem(s) in data/nationalities.json:\n`,
    );
    for (const error of nationalities.errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  // Same optional-coverage story as nationalities — most works have no
  // entry. Structural validity is checked here against the full Open Opus
  // dataset; whether the id actually reaches a work with a detail page
  // (the core index) can only be known after the build loop below, so that
  // check happens separately, further down.
  const media = loadMedia(await readMediaSource(), curationView);
  if (media.errors.length > 0) {
    console.error(`\n${media.errors.length} problem(s) in data/media.json:\n`);
    for (const error of media.errors) console.error(`  - ${error}`);
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
      return buildWork(
        raw,
        rawComposer.id,
        overrides,
        {
          composerStars,
          rankedIndex: curation.ranking.get(raw.id),
          curatedStars: curated?.stars,
          curatedRank: curated?.rank,
        },
        media.media.get(raw.id),
      );
    });
    totalWorkCount += works.length;

    composers.push(
      buildComposer(
        rawComposer,
        works,
        namesJa,
        portraitById.get(rawComposer.id),
        composerStars,
        nationalities.nationalities.get(rawComposer.id),
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

  // A media entry on a work with no detail page would be invisible and
  // unsearchable — the appearance would silently vanish rather than fail
  // loudly, exactly the failure mode `nationality.ts`'s module doc warns
  // against. Curating the work (which `isCore` above already promotes into
  // the core index) is a one-line fix, so this points there rather than
  // auto-promoting on media's behalf.
  const coreIds = new Set(coreWorks.map((work) => work.id));
  const orphanedMedia = [...media.media.keys()].filter((id) => !coreIds.has(id));
  if (orphanedMedia.length > 0) {
    console.error(
      `\n${orphanedMedia.length} entry(ies) in data/media.json point at works outside the core index:\n`,
    );
    for (const id of orphanedMedia) {
      console.error(
        `  - ${id}: has no detail page — add it to data/curation/works/<composerId>.json to promote it into the core index`,
      );
    }
    process.exit(1);
  }

  // Built from the same `media.media` the orphan check above just verified
  // points only at works with a detail page, so every id in `mediaIndex`
  // resolves via `getWork()` on the media detail page (issue #91).
  const mediaIndex = buildMediaIndex(media.media);
  if (mediaIndex.errors.length > 0) {
    console.error(`\n${mediaIndex.errors.length} problem(s) building the media index:\n`);
    for (const error of mediaIndex.errors) console.error(`  - ${error}`);
    process.exit(1);
  }

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
    // Titles only — `year`/`kind`/`note` are detail-page-only, so they stay
    // out of the index every visitor's browser downloads.
    media: work.media?.map((appearance) => appearance.title),
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
  // Unlike `work-index.json`, not also copied to `public/data/`: both
  // `/media` and `/media/[mediaId]` read this at build time on the server
  // (see `src/lib/catalog.ts`'s `mediaIndex` export), and at ~180 entries it
  // is small enough to just be part of the page payload — no client-side
  // fetch to serve.
  await writeFile(
    path.join(CATALOG_DIR, "media-index.json"),
    JSON.stringify(mediaIndex.entries),
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
      `nationalities:    ${nationalities.nationalities.size}/${meta.composerCount}`,
      `media:            ${media.media.size} work(s) / ${[...media.media.values()].reduce((sum, list) => sum + list.length, 0)} appearance(s)`,
      "",
      // The order this prints is the order the catalogue's default sort and
      // every composer page use, in both locales, so it is the fastest way to
      // see a curation batch land — or to notice that it did not.
      "top of the catalogue:",
      ...coreWorks
        .slice(0, 20)
        .map((work, rank) => `  ${String(rank + 1).padStart(2)}. ★${work.stars} ${work.title}`),
    ].join("\n"),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
