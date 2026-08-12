import composersJson from "@/data/catalog/composers.json";
import coreWorksJson from "@/data/catalog/core-works.json";
import metaJson from "@/data/catalog/meta.json";
import workIndexJson from "@/data/catalog/work-index.json";
import portraitsJson from "@/data/portraits.json";

import type {
  CatalogMeta,
  Composer,
  Work,
  WorkIndexRow,
} from "./catalog-types";
import type { Epoch, Genre } from "./epochs";
import type { PortraitCredit } from "./licenses";
import { compareByStandard } from "./popularity";

export const composers = composersJson as Composer[];
export const coreWorks = coreWorksJson as Work[];
export const workIndex = workIndexJson as WorkIndexRow[];
export const catalogMeta = metaJson as CatalogMeta;
export const portraitCredits = portraitsJson as PortraitCredit[];

const composersById = new Map(composers.map((composer) => [composer.id, composer]));
const worksById = new Map(coreWorks.map((work) => [work.id, work]));
const portraitsByComposerId = new Map(
  portraitCredits.map((credit) => [credit.composerId, credit]),
);

export function getComposer(id: string): Composer | undefined {
  return composersById.get(id);
}

/** Only core works have a detail page, so only those resolve here. */
export function getWork(id: string): Work | undefined {
  return worksById.get(id);
}

export function getPortraitCredit(
  composerId: string,
): PortraitCredit | undefined {
  return portraitsByComposerId.get(composerId);
}

/** `coreWorks` is already in canonical 定番度 order (`compareByStandard`, applied
 *  by `build-catalog.ts`), so the result is highest-score first, identical in
 *  both locales, with no extra work here. */
export function getCoreWorksByComposer(composerId: string): Work[] {
  return coreWorks.filter((work) => work.composerId === composerId);
}

/**
 * Full work list for a composer, fetched on demand from
 * `/data/works/<id>.json`. Only ~1,286 of 25,195 works are bundled; the rest
 * are loaded when someone actually opens a composer's complete catalogue.
 */
export async function fetchAllWorksByComposer(
  composerId: string,
): Promise<Work[]> {
  const response = await fetch(`/data/works/${composerId}.json`);
  if (!response.ok) throw new Error(`Failed to load works for ${composerId}`);
  return (await response.json()) as Work[];
}

export interface CatalogFilters {
  query: string;
  composerIds: string[];
  epochs: Epoch[];
  genres: Genre[];
  /** Minimum 定番度; 0 means no filter. */
  minStars: 0 | 3 | 4 | 5;
}

export const EMPTY_FILTERS: CatalogFilters = {
  query: "",
  composerIds: [],
  epochs: [],
  genres: [],
  minStars: 0,
};

export type SortKey = "standard" | "title" | "composer";

/**
 * The composer fields the catalogue UI needs. Kept minimal because the list
 * of all 220 is serialised into the catalogue page.
 */
export interface ComposerOption {
  id: string;
  name: string;
  nameJa: string;
  completeName: string;
  epoch: Epoch;
  coreWorkCount: number;
}

export function buildComposerOptions(): ComposerOption[] {
  return composers.map((composer) => ({
    id: composer.id,
    name: composer.name,
    nameJa: composer.nameJa,
    completeName: composer.completeName,
    epoch: composer.epoch,
    coreWorkCount: composer.coreWorkCount,
  }));
}

/**
 * The composer fields the `/composers` list needs to filter and render a
 * card, plus just enough of the portrait credit for its `title` tooltip.
 *
 * Kept minimal like `ComposerOption` above, for the same reason: this is
 * serialised into the composer list page for all 220 composers, and the full
 * `Composer`/`PortraitCredit` records (with every licence field) would only
 * bloat that payload.
 */
export interface ComposerCard {
  id: string;
  name: string;
  nameJa: string;
  completeName: string;
  epoch: Epoch;
  birthYear: number;
  deathYear: number | null;
  stars: Composer["stars"];
  coreWorkCount: number;
  portrait?: string;
  credit?: { author: string; license: string };
  nationality?: Composer["nationality"];
}

export function buildComposerCards(): ComposerCard[] {
  return composers.map((composer) => {
    const credit = getPortraitCredit(composer.id);
    return {
      id: composer.id,
      name: composer.name,
      nameJa: composer.nameJa,
      completeName: composer.completeName,
      epoch: composer.epoch,
      birthYear: composer.birthYear,
      deathYear: composer.deathYear,
      stars: composer.stars,
      coreWorkCount: composer.coreWorkCount,
      portrait: composer.portrait,
      credit: credit
        ? { author: credit.author, license: credit.license }
        : undefined,
      nationality: composer.nationality,
    };
  });
}

/** Everything the filter needs about a work, joined and precomputed once. */
export interface SearchableWork extends WorkIndexRow {
  composerName: string;
  composerNameJa: string;
  epoch: Epoch;
  /** Lower-cased haystack covering both languages. */
  haystack: string;
}

/** Joins index rows to their composer. Used on both the server and client. */
export function joinComposers(
  rows: WorkIndexRow[],
  options: ComposerOption[],
): SearchableWork[] {
  const byId = new Map(options.map((option) => [option.id, option]));
  return rows.map((row) => {
    const composer = byId.get(row.composerId);
    const composerName = composer?.completeName ?? "";
    const composerNameJa = composer?.nameJa ?? composerName;
    // Both languages of every film/anime/TV title this work has been used
    // in, so "search by the name of the movie" (issue #33) is just more
    // haystack — no separate search path needed.
    const mediaTitles = (row.media ?? [])
      .flatMap((title) => [title.ja, title.en])
      .join(" ");
    return {
      ...row,
      composerName,
      composerNameJa,
      epoch: composer?.epoch ?? "Romantic",
      haystack:
        `${row.title} ${row.titleJa} ${composerName} ${composerNameJa} ${composer?.name ?? ""} ${mediaTitles}`.toLowerCase(),
    };
  });
}

/**
 * The media title (in the given locale) that the current search query
 * matched, so a result card can show *why* it matched — but only when the
 * match actually came from a media title. Matching on the work's own name
 * or its composer returns `undefined`, so the catalogue doesn't stick an
 * unrelated "featured in ..." badge on every result.
 */
export function matchedMediaTitle(
  work: SearchableWork,
  query: string,
  locale: "ja" | "en",
): string | undefined {
  const needle = query.trim().toLowerCase();
  if (!needle || !work.media) return undefined;
  const match = work.media.find(
    (title) =>
      title.ja.toLowerCase().includes(needle) ||
      title.en.toLowerCase().includes(needle),
  );
  return match ? match[locale] : undefined;
}

/**
 * The full index, fetched as a static asset. Inlining all 1,286 rows into
 * every page's HTML made the landing page ~800 KB; as a separate file it is
 * fetched once and cached across navigations.
 */
export async function fetchWorkIndex(): Promise<WorkIndexRow[]> {
  const response = await fetch("/data/work-index.json");
  if (!response.ok) throw new Error("Failed to load the work index");
  return (await response.json()) as WorkIndexRow[];
}

/** Server-side index, for the statically rendered part of the catalogue. */
export function buildSearchIndex(): SearchableWork[] {
  return joinComposers(workIndex, buildComposerOptions());
}

export function filterWorks(
  works: SearchableWork[],
  filters: CatalogFilters,
): SearchableWork[] {
  const query = filters.query.trim().toLowerCase();
  const composerIds = new Set(filters.composerIds);
  const epochs = new Set<string>(filters.epochs);
  const genres = new Set<string>(filters.genres);

  return works.filter((work) => {
    if (composerIds.size > 0 && !composerIds.has(work.composerId)) return false;
    if (epochs.size > 0 && !epochs.has(work.epoch)) return false;
    if (genres.size > 0 && !genres.has(work.genre)) return false;
    if (filters.minStars > 0 && work.stars < filters.minStars) return false;
    if (query && !work.haystack.includes(query)) return false;
    return true;
  });
}

export function sortWorks(
  works: SearchableWork[],
  sort: SortKey,
  locale: "ja" | "en",
): SearchableWork[] {
  const title = (work: SearchableWork) =>
    locale === "ja" ? work.titleJa : work.title;
  const composer = (work: SearchableWork) =>
    locale === "ja" ? work.composerNameJa : work.composerName;

  const sorted = [...works];
  switch (sort) {
    case "title":
      return sorted.sort((a, b) => title(a).localeCompare(title(b), locale));
    case "composer":
      return sorted.sort(
        (a, b) =>
          composer(a).localeCompare(composer(b), locale) ||
          title(a).localeCompare(title(b), locale),
      );
    default:
      // Deliberately locale-independent, unlike the two branches above: this
      // reproduces the baked order of `data/catalog/*` so the catalogue page
      // agrees with the composer pages and with the other language. See
      // `compareByStandard`.
      return sorted.sort(compareByStandard);
  }
}
