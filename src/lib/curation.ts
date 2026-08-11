/**
 * Reads and validates the hand-curated 定番度 files under `data/curation/`.
 *
 * Three sources, all hand-written (see `CONTRIBUTING.md`):
 *  - `composer-stars.json` — all 220 composers, grouped by star. One file,
 *    not one per composer, because a composer's rating is only judgeable
 *    against the others in the same bucket.
 *  - `ranking.json` — the ★5 works in explicit global order. This file both
 *    *assigns* ★5 and orders it; position becomes the score. Global for the
 *    same reason `composer-stars.json` is: "how standard is this piece in the
 *    whole repertoire" can only be calibrated against the other candidates,
 *    never inside one composer's folder.
 *  - `works/<composerId>.json` — ★4 and ★3 only, grouped by star. Split per
 *    composer, mirroring `data/editorial/composers/`, so revising one composer
 *    never touches the rest.
 *
 * This module is pure: it takes already-parsed JSON and a minimal view of the
 * Open Opus dataset, and returns lookup maps plus a list of problems. The file
 * I/O lives in `scripts/seed/check-curation.ts` and `build-catalog.ts`, the
 * same split as `editorial-guard.ts` and its checker.
 *
 * Nothing in `src/` imports the result at runtime — the ratings are baked into
 * `data/catalog/*` by `npm run seed:catalog`, exactly as `ledger.json` is
 * build-time only.
 */
import {
  isStars,
  RANKED_SLOTS,
  RANK_REACH,
  type CuratedStars,
  type Stars,
} from "./popularity";
import { tidy } from "./title/parse";

/** The slice of the Open Opus dump the validator needs to check ids against. */
export interface CurationCatalogView {
  composers: Array<{ id: string; name: string }>;
  works: Array<{ id: string; composerId: string; title: string }>;
}

export interface CurationSource {
  /** Parsed `data/curation/composer-stars.json`. */
  composerStars: unknown;
  /** Parsed `data/curation/ranking.json`. */
  ranking: unknown;
  /** Parsed `data/curation/works/*.json`, keyed by file name. */
  workFiles: Array<{ file: string; parsed: unknown }>;
}

export interface CuratedRating {
  stars: CuratedStars;
  /** Position within its star group; the order of the file is the ranking. */
  rank: number;
}

export interface CurationResult {
  composerStars: Map<string, Stars>;
  workStars: Map<string, CuratedRating>;
  /** Work id → position in `ranking.json`. These are exactly the ★5 works. */
  ranking: Map<string, number>;
  errors: string[];
  /** Drift alarms on the absolute scale — reported, but not fatal. */
  warnings: string[];
}

/**
 * Guard rails on the absolute scale. The ratings mean nothing if ★5 slowly
 * becomes "works I like", so the counts are watched rather than trusted.
 */
export const SCALE_LIMITS = { composerStar5: 25, workStar5: 100 } as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `_comment` and friends are documentation, matching `title-overrides.json`. */
function isDataKey(key: string): boolean {
  return !key.startsWith("_");
}

/**
 * Groups are keyed `star5`, `star4`, … rather than `"5"`, `"4"`: JavaScript
 * reorders integer-like keys into ascending order no matter how the file is
 * written, which would put ★1 at the top of every file and bury `_comment` at
 * the bottom. Reviewing a batch means reading the ★5 group as a group, so the
 * file has to keep the order it was authored in.
 */
function parseStarKey(key: string): number {
  const match = /^star([1-5])$/.exec(key);
  return match ? Number(match[1]) : Number.NaN;
}

function readComposerStars(
  parsed: unknown,
  view: CurationCatalogView,
  errors: string[],
  warnings: string[],
): Map<string, Stars> {
  const stars = new Map<string, Stars>();
  if (!isRecord(parsed)) {
    errors.push('composer-stars.json: must be an object keyed by star, e.g. {"star5": {...}}');
    return stars;
  }

  const namesById = new Map(view.composers.map((c) => [c.id, c.name]));

  for (const [key, group] of Object.entries(parsed)) {
    if (!isDataKey(key)) continue;
    const star = parseStarKey(key);
    if (!isStars(star)) {
      errors.push(`composer-stars.json: "${key}" is not a star group — use "star1" … "star5"`);
      continue;
    }
    if (!isRecord(group)) {
      errors.push(`composer-stars.json.${key}: must be an object of id → name`);
      continue;
    }

    for (const [id, name] of Object.entries(group)) {
      const expected = namesById.get(id);
      if (expected === undefined) {
        errors.push(`composer-stars.json.${key}: no composer with id ${id}`);
        continue;
      }
      // The name is an echo, not data: it makes a mistyped id — the one
      // mistake a human actually makes here — fail loudly instead of
      // silently rating the wrong composer.
      if (name !== expected) {
        errors.push(
          `composer-stars.json.${key}.${id}: name is "${String(name)}", expected "${expected}"`,
        );
      }
      if (stars.has(id)) {
        errors.push(`composer-stars.json: composer ${id} (${expected}) is rated twice`);
        continue;
      }
      stars.set(id, star);
    }
  }

  const missing = view.composers.filter((composer) => !stars.has(composer.id));
  if (missing.length > 0) {
    // Every composer must be rated: the composer star is the dominant term
    // for the ~1,000 works nobody curates individually, so a gap would
    // silently sink a whole catalogue.
    const sample = missing.slice(0, 8).map((c) => `${c.id} (${c.name})`).join(", ");
    errors.push(
      `composer-stars.json: ${missing.length} composer(s) unrated — ${sample}${
        missing.length > 8 ? ", …" : ""
      }`,
    );
  }

  const fives = [...stars.values()].filter((star) => star === 5).length;
  if (fives > SCALE_LIMITS.composerStar5) {
    warnings.push(
      `${fives} composers are ★5 (soft limit ${SCALE_LIMITS.composerStar5}) — the scale is drifting`,
    );
  }

  return stars;
}

function readWorkStars(
  files: CurationSource["workFiles"],
  view: CurationCatalogView,
  errors: string[],
  warnings: string[],
): Map<string, CuratedRating> {
  const stars = new Map<string, CuratedRating>();
  const worksById = new Map(view.works.map((work) => [work.id, work]));
  const composerIds = new Set(view.composers.map((composer) => composer.id));
  const source = new Map<string, string>();

  for (const { file, parsed } of files) {
    const composerId = file.replace(/\.json$/, "");
    if (!/^\d+$/.test(composerId)) {
      errors.push(`${file}: filename must be a bare composer id, e.g. "145.json"`);
      continue;
    }
    if (!composerIds.has(composerId)) {
      errors.push(`${file}: no composer with id ${composerId}`);
      continue;
    }
    if (!isRecord(parsed)) {
      errors.push(`${file}: must be an object keyed by star, e.g. {"star4": [...]}`);
      continue;
    }

    for (const [key, group] of Object.entries(parsed)) {
      if (!isDataKey(key)) continue;
      const star = parseStarKey(key);
      if (star === 5) {
        errors.push(
          `${file}: "star5" is not allowed here — ★5 is assigned and globally ordered in data/curation/ranking.json`,
        );
        continue;
      }
      if (star !== 3 && star !== 4) {
        errors.push(
          `${file}: "${key}" is not a curated star group — only "star3" and "star4" belong in a composer file`,
        );
        continue;
      }
      if (!Array.isArray(group)) {
        errors.push(`${file}.${key}: must be an array of {id, title}`);
        continue;
      }
      if (group.length > RANK_REACH) {
        warnings.push(
          `${file}.${key}: ${group.length} entries — only the first ${RANK_REACH} are ordered by your ranking`,
        );
      }

      // The array order is data, not presentation: it is the curator's own
      // ranking within the star, and the only signal fine-grained enough to
      // separate two works the star alone cannot.
      let rank = 0;
      for (const entry of group) {
        if (!isRecord(entry) || typeof entry.id !== "string") {
          errors.push(`${file}.${key}: every entry needs a string "id"`);
          continue;
        }
        const work = worksById.get(entry.id);
        if (!work) {
          errors.push(`${file}.${key}: no work with id ${entry.id}`);
          continue;
        }
        if (work.composerId !== composerId) {
          errors.push(
            `${file}.${key}: work ${entry.id} ("${work.title}") belongs to composer ${work.composerId}`,
          );
          continue;
        }
        // Same reasoning as the composer name echo above.
        if (tidy(String(entry.title ?? "")) !== tidy(work.title)) {
          errors.push(
            `${file}.${key}.${entry.id}: title is "${String(entry.title)}", expected "${tidy(work.title)}"`,
          );
          continue;
        }
        const seen = source.get(entry.id);
        if (seen) {
          errors.push(`${file}.${key}: work ${entry.id} is already rated in ${seen}`);
          continue;
        }
        source.set(entry.id, file);
        stars.set(entry.id, { stars: star, rank: rank++ });
      }
    }
  }

  return stars;
}

/**
 * Reads `ranking.json`, the globally ordered ★5 list. Runs after
 * `readWorkStars` so it can reject a work rated in both places, and writes
 * its entries into `workStars` too — downstream, a ranked work is simply a
 * curated ★5 that also carries a position.
 */
function readRanking(
  parsed: unknown,
  workStars: Map<string, CuratedRating>,
  view: CurationCatalogView,
  errors: string[],
  warnings: string[],
): Map<string, number> {
  const ranking = new Map<string, number>();
  if (!isRecord(parsed) || !Array.isArray(parsed.ranking)) {
    errors.push('ranking.json: must be an object with a "ranking" array');
    return ranking;
  }

  const worksById = new Map(view.works.map((work) => [work.id, work]));
  const composerNames = new Map(view.composers.map((c) => [c.id, c.name]));

  for (const entry of parsed.ranking) {
    if (!isRecord(entry) || typeof entry.id !== "string") {
      errors.push('ranking.json: every entry needs a string "id"');
      continue;
    }
    const work = worksById.get(entry.id);
    if (!work) {
      errors.push(`ranking.json: no work with id ${entry.id}`);
      continue;
    }
    // Both echoes exist to catch a mistyped id; the composer name also makes a
    // 58-line global list readable without a lookup table.
    if (tidy(String(entry.title ?? "")) !== tidy(work.title)) {
      errors.push(
        `ranking.json.${entry.id}: title is "${String(entry.title)}", expected "${tidy(work.title)}"`,
      );
      continue;
    }
    const composer = composerNames.get(work.composerId);
    if (entry.composer !== composer) {
      errors.push(
        `ranking.json.${entry.id}: composer is "${String(entry.composer)}", expected "${composer}"`,
      );
      continue;
    }
    if (ranking.has(entry.id)) {
      errors.push(`ranking.json: work ${entry.id} appears twice`);
      continue;
    }
    if (workStars.has(entry.id)) {
      errors.push(
        `ranking.json: work ${entry.id} is also rated in data/curation/works/${work.composerId}.json`,
      );
      continue;
    }
    ranking.set(entry.id, ranking.size);
    workStars.set(entry.id, { stars: 5, rank: ranking.size - 1 });
  }

  // Past the last slot the scores would collide with the ★4 band, so this is
  // structural rather than a matter of taste.
  if (ranking.size > RANKED_SLOTS) {
    errors.push(
      `ranking.json: ${ranking.size} entries exceed the ${RANKED_SLOTS} ranked slots — raise RANKED_SLOTS in src/lib/popularity.ts`,
    );
  }
  if (ranking.size > SCALE_LIMITS.workStar5) {
    warnings.push(
      `${ranking.size} works are ★5 (soft limit ${SCALE_LIMITS.workStar5}) — the scale is drifting`,
    );
  }

  return ranking;
}

export function loadCuration(
  source: CurationSource,
  view: CurationCatalogView,
): CurationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Sequenced explicitly rather than built in an object literal: `readRanking`
  // mutates `workStars` and has to see the composer files first.
  const composerStars = readComposerStars(source.composerStars, view, errors, warnings);
  const workStars = readWorkStars(source.workFiles, view, errors, warnings);
  const ranking = readRanking(source.ranking, workStars, view, errors, warnings);

  return { composerStars, workStars, ranking, errors, warnings };
}
