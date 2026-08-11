import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import type { Composer, Work } from "./catalog-types";
import { loadCuration, SCALE_LIMITS } from "./curation";
import { RANKED_BASE, workScore, workStars } from "./popularity";

const ROOT = process.cwd();

// These live under scripts/, outside vitest's usual `src/**` scope, but they
// are plain TypeScript with no build step, so importing them directly keeps
// this test using the exact same file-reading code as `npm run seed:catalog`
// and `npm run check:curation` rather than a re-implementation that could
// drift from either.
import { readCurationSource, toCurationView } from "../../scripts/seed/curation-files";
import type { RawDataset } from "../../scripts/seed/openopus";

let curation: Awaited<ReturnType<typeof loadCuration>>;
let composers: Composer[];
let coreWorks: Work[];

beforeAll(async () => {
  const dataset = JSON.parse(
    await readFile(path.join(ROOT, "data", "raw", "openopus.json"), "utf8"),
  ) as RawDataset;
  curation = loadCuration(await readCurationSource(), toCurationView(dataset));
  composers = JSON.parse(
    await readFile(path.join(ROOT, "data", "catalog", "composers.json"), "utf8"),
  ) as Composer[];
  coreWorks = JSON.parse(
    await readFile(path.join(ROOT, "data", "catalog", "core-works.json"), "utf8"),
  ) as Work[];
});

describe("data/curation/** is internally valid", () => {
  it("has no validation errors", () => {
    expect(curation.errors).toEqual([]);
  });

  it("rates every composer exactly once", () => {
    expect(curation.composerStars.size).toBe(composers.length);
  });

  it("stays within the drift alarm on the absolute scale", () => {
    const composerFives = [...curation.composerStars.values()].filter(
      (star) => star === 5,
    ).length;
    const workFives = [...curation.workStars.values()].filter(
      (rating) => rating.stars === 5,
    ).length;
    expect(composerFives).toBeLessThanOrEqual(SCALE_LIMITS.composerStar5);
    expect(workFives).toBeLessThanOrEqual(SCALE_LIMITS.workStar5);
  });

  it("uses every composer star bucket", () => {
    // A blank ★1 bucket (as `ledger.json`-only seeding produces) means the
    // scale collapsed into "priority to write about" instead of "how famous".
    const buckets = new Set(curation.composerStars.values());
    expect([...buckets].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

/**
 * The catalogue in `data/catalog/` is a build artifact of `data/curation/**`
 * plus the formula in `popularity.ts`. These checks catch the failure mode
 * hardest to notice in review: someone edits a curation file and forgets to
 * re-run `npm run seed:catalog`, so the source of truth and what actually
 * ships silently disagree.
 */
describe("the shipped catalogue agrees with data/curation/**", () => {
  it("gives every ★4+ work a curated rating", () => {
    // The formula is structurally capped at ★3 (see popularity.ts), so any
    // ★4 or ★5 in the shipped data must trace back to a curated entry.
    const uncuratedHighStars = coreWorks.filter(
      (work) => work.stars >= 4 && !work.curated,
    );
    expect(uncuratedHighStars.map((w) => `${w.id} ${w.title}`)).toEqual([]);
  });

  it("assigns exactly the curated star to every curated work", () => {
    const worksById = new Map(coreWorks.map((work) => [work.id, work]));
    for (const [id, rating] of curation.workStars) {
      const shipped = worksById.get(id);
      expect(shipped, `curated work ${id} is missing from core-works.json`).toBeDefined();
      expect(shipped?.stars, id).toBe(rating.stars);
      expect(shipped?.curated, id).toBe(true);
    }
  });

  it("assigns exactly the curated star to every composer", () => {
    const composersById = new Map(composers.map((composer) => [composer.id, composer]));
    for (const [id, stars] of curation.composerStars) {
      expect(composersById.get(id)?.stars, id).toBe(stars);
    }
  });

  it("recomputes the same score the build wrote, for a sample of works", () => {
    // A full recompute of all ~25k works belongs to `popularity.test.ts`;
    // this only proves the wiring between `curation.ts` and `build-catalog.ts`
    // has not drifted, using the composer-star join a formula-scored work
    // actually needs.
    const composerStarsById = curation.composerStars;
    for (const work of coreWorks.slice(0, 200)) {
      const composerStars = composerStarsById.get(work.composerId);
      expect(composerStars, work.composerId).toBeDefined();
      const curated = curation.workStars.get(work.id);
      const input = {
        composerStars: composerStars!,
        rankedIndex: curation.ranking.get(work.id),
        curatedStars: curated?.stars,
        curatedRank: curated?.rank,
        popular: work.popular,
        recommended: work.recommended,
        hasNickname: Boolean(work.facts.nickname),
        genre: work.genre,
      };
      expect(work.stars, work.id).toBe(workStars(input));
      expect(work.score, work.id).toBe(workScore(input));
    }
  });
});

describe("the hand-ordered ★5 head", () => {
  it("indexes the ranking contiguously from 0", () => {
    const indexes = [...curation.ranking.values()].sort((a, b) => a - b);
    expect(indexes).toEqual(indexes.map((_, i) => i));
  });

  it("is exactly the set of ★5 works", () => {
    const shippedFives = coreWorks.filter((work) => work.stars === 5).map((w) => w.id);
    expect(new Set(shippedFives)).toEqual(new Set(curation.ranking.keys()));
  });

  it("scores every ★5 in the ranked tier, none in the fallback band", () => {
    // `ranking.json` is the ★5 list, so `CURATED_BASE[5]` should be
    // unreachable. A ★5 landing below RANKED_BASE means one slipped past the
    // ranking and is being ordered by composer again.
    for (const work of coreWorks.filter((w) => w.stars === 5)) {
      expect(work.score, `${work.id} ${work.title}`).toBeGreaterThan(RANKED_BASE);
    }
  });

  it("leads the shipped catalogue in exactly the hand-written order", () => {
    // The end-to-end check: what is in ranking.json is what the first screen
    // of the catalogue shows, in that order.
    const wanted = [...curation.ranking.keys()];
    expect(coreWorks.slice(0, wanted.length).map((work) => work.id)).toEqual(wanted);
  });
});
