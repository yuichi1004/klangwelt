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
import { isEpoch, isGenre } from "../../src/lib/epochs";
import type { PortraitCredit } from "../../src/lib/licenses";
import { parseTitle, tidy } from "../../src/lib/title/parse";
import {
  composeJapaneseTitle,
  translateCatalogue,
  translateForm,
  translateKey,
  translateNickname,
} from "../../src/lib/title/translate";
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

function buildWork(
  raw: RawWork,
  composerId: string,
  overrides: Record<string, string>,
): Work {
  const title = tidy(raw.title);
  const override = overrides[raw.id];
  const japanese = override
    ? { text: override, translated: true }
    : composeJapaneseTitle(parseTitle(raw.title), title);

  return {
    id: raw.id,
    composerId,
    title,
    titleJa: japanese.text,
    genre: isGenre(raw.genre) ? raw.genre : "Orchestral",
    popular: raw.popular === "1",
    recommended: raw.recommended === "1",
    searchTerms: tidy(raw.searchterms),
    facts: buildFacts(raw),
  };
}

function buildComposer(
  raw: RawComposer,
  works: Work[],
  namesJa: Record<string, string>,
  portrait: PortraitCredit | undefined,
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
    workCount: works.length,
    coreWorkCount: works.filter((work) => work.popular || work.recommended)
      .length,
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

  await rm(PUBLIC_WORKS_DIR, { recursive: true, force: true });
  await mkdir(PUBLIC_WORKS_DIR, { recursive: true });
  await mkdir(CATALOG_DIR, { recursive: true });

  const composers: Composer[] = [];
  const coreWorks: Work[] = [];
  let totalWorkCount = 0;

  for (const rawComposer of dataset.composers) {
    const works = (dataset.works[rawComposer.id] ?? []).map((raw) =>
      buildWork(raw, rawComposer.id, overrides),
    );
    totalWorkCount += works.length;

    composers.push(
      buildComposer(
        rawComposer,
        works,
        namesJa,
        portraitById.get(rawComposer.id),
      ),
    );
    coreWorks.push(...works.filter((work) => work.popular || work.recommended));

    await writeFile(
      path.join(PUBLIC_WORKS_DIR, `${rawComposer.id}.json`),
      JSON.stringify(works),
    );
  }

  // Popular first, then recommended, then alphabetically — this is the
  // default order of the catalogue page.
  coreWorks.sort((a, b) => {
    const rank = (work: Work) => (work.popular ? 0 : 1);
    return rank(a) - rank(b) || a.title.localeCompare(b.title);
  });

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
    popular: work.popular,
    recommended: work.recommended,
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

  console.log(
    [
      `composers:        ${meta.composerCount}`,
      `core works:       ${meta.coreWorkCount}`,
      `total works:      ${meta.totalWorkCount}`,
      `Japanese titles:  ${(meta.translatedRatio * 100).toFixed(1)}%`,
      `portraits:        ${portraits.length}`,
    ].join("\n"),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
