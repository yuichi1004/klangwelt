import { describe, expect, it } from "vitest";

import { buildSearchIndex, type SearchableWork } from "./catalog";
import {
  COMPOSER_WEIGHT,
  DEFAULT_COUNT,
  EMPTY_PROFILE,
  EPOCH_WEIGHT,
  GENRE_WEIGHT,
  MAX_AFFINITY_SCORE,
  MIN_CANDIDATE_STARS,
  POOL_PER_COMPOSER,
  POOL_SIZE,
  POPULARITY_WEIGHT,
  RECENCY_DECAY,
  REASON_MIN_AFFINITY,
  buildTasteProfile,
  explain,
  recommend,
  scoreWork,
  type TasteProfile,
} from "./recommend";

const index = buildSearchIndex();
const byId = new Map(index.map((w) => [w.id, w]));

/** Resolves ids against the real index, dropping any that no longer exist —
 *  the same contract `buildTasteProfile` places on its caller. */
const favorites = (...ids: string[]): SearchableWork[] =>
  ids.map((id) => byId.get(id)).filter((w): w is SearchableWork => !!w);

function work(overrides: Partial<SearchableWork> = {}): SearchableWork {
  return {
    id: "w1",
    composerId: "c1",
    title: "Work",
    titleJa: "作品",
    genre: "Orchestral",
    stars: 3,
    score: 6000,
    composerName: "Composer",
    composerNameJa: "作曲家",
    epoch: "Romantic",
    haystack: "work",
    ...overrides,
  };
}

// A Chopin favourite, real enough to exercise the whole shipped catalogue:
// 22 core works, several stars bands.
const CHOPIN_ID = "152";
const chopinFavorites = favorites("17109", "17217", "17179");

describe("weight relationships (issue #86 design constants)", () => {
  // See the derivation in the module doc comment. These hold for the whole
  // interval P ∈ (1.0, 1.333); if a future retune moves POPULARITY_WEIGHT
  // outside that band, one of the scoreWork() tests below will also fail.
  it("keeps every popularity gap below one epoch match", () => {
    expect(POPULARITY_WEIGHT).toBeLessThan(EPOCH_WEIGHT);
  });

  it("keeps every popularity gap below a composer match", () => {
    expect(POPULARITY_WEIGHT).toBeLessThan(COMPOSER_WEIGHT * (4 / 3));
  });

  it("lets a genre match survive a three-star gap but not a four-star one", () => {
    const threeStarGap = 3 * (POPULARITY_WEIGHT / 4);
    const fourStarGap = POPULARITY_WEIGHT;
    expect(GENRE_WEIGHT).toBeGreaterThan(threeStarGap);
    expect(GENRE_WEIGHT).toBeLessThan(fourStarGap);
  });

  it("bounds MAX_AFFINITY_SCORE as the sum of every weight", () => {
    expect(MAX_AFFINITY_SCORE).toBeCloseTo(
      COMPOSER_WEIGHT + EPOCH_WEIGHT + GENRE_WEIGHT + POPULARITY_WEIGHT,
    );
  });

  it("guarantees the pool spans at least DEFAULT_COUNT composers", () => {
    expect(POOL_SIZE / POOL_PER_COMPOSER).toBeGreaterThanOrEqual(DEFAULT_COUNT);
  });
});

describe("buildTasteProfile", () => {
  it("weighs the newest favourite most heavily", () => {
    const profile = buildTasteProfile([
      work({ id: "a", composerId: "recent" }),
      work({ id: "b", composerId: "older" }),
    ]);
    expect(profile.composers.recent).toBe(1);
    expect(profile.composers.older).toBeCloseTo(1 / (1 + RECENCY_DECAY));
  });

  it("never decays an old favourite to zero", () => {
    const tenFavorites = Array.from({ length: 10 }, (_, i) =>
      work({ id: `w${i}`, composerId: `c${i}` }),
    );
    const profile = buildTasteProfile(tenFavorites);
    expect(profile.composers.c9).toBeCloseTo(1 / (1 + RECENCY_DECAY * 9));
    expect(profile.composers.c9).toBeGreaterThan(0);
  });

  it("normalises each dimension to its own maximum, not the total", () => {
    // Ten favourites across ten distinct composers: sum-normalisation would
    // sink the top composer's affinity to ~0.156, well under a genre match.
    // Max-normalisation keeps it at 1 regardless of favourite count.
    const tenFavorites = Array.from({ length: 10 }, (_, i) =>
      work({ id: `w${i}`, composerId: `c${i}`, genre: "Orchestral" }),
    );
    const profile = buildTasteProfile(tenFavorites);
    expect(profile.composers.c0).toBe(1);
    expect(profile.genres.Orchestral).toBe(1);
  });

  it("gives a composer's epoch the same affinity as the composer", () => {
    const profile = buildTasteProfile([work({ composerId: "c1", epoch: "Baroque" })]);
    expect(profile.composers.c1).toBe(1);
    expect(profile.epochs.Baroque).toBe(1);
  });

  it("returns EMPTY_PROFILE for no favourites", () => {
    expect(buildTasteProfile([])).toEqual(EMPTY_PROFILE);
  });

  it("records the ids it was built from", () => {
    const profile = buildTasteProfile([work({ id: "a" }), work({ id: "b" })]);
    expect(profile.workIds).toEqual(["a", "b"]);
  });
});

describe("scoreWork", () => {
  // Each fixture profile isolates one dimension so the affinity of a work
  // under test is exactly 0 or 1 per dimension — the table in the module
  // doc comment, reproduced as executable comparisons.
  const composerProfile: TasteProfile = {
    composers: { fav: 1 },
    epochs: { Romantic: 1 },
    genres: { Orchestral: 1 },
    workIds: [],
  };

  it("I: ranks a ★2 same-composer work above a ★5 same-epoch-only work", () => {
    const sameComposer = work({
      composerId: "fav",
      epoch: "Romantic",
      genre: "Chamber",
      stars: 2,
    });
    const sameEpochOnly = work({
      composerId: "other",
      epoch: "Romantic",
      genre: "Chamber",
      stars: 5,
    });
    expect(scoreWork(sameComposer, composerProfile)).toBeGreaterThan(
      scoreWork(sameEpochOnly, composerProfile),
    );
  });

  it("II: ranks a ★5 same-epoch-only work above a ★1 epoch+genre match", () => {
    const sameEpochOnly = work({
      composerId: "other",
      epoch: "Romantic",
      genre: "Chamber",
      stars: 5,
    });
    const epochAndGenre = work({
      composerId: "other2",
      epoch: "Romantic",
      genre: "Orchestral",
      stars: 1,
    });
    expect(scoreWork(sameEpochOnly, composerProfile)).toBeGreaterThan(
      scoreWork(epochAndGenre, composerProfile),
    );
  });

  it("III: ranks a ★1 epoch-only match above a ★5 that matches nothing", () => {
    const epochOnly = work({
      composerId: "other",
      epoch: "Romantic",
      genre: "Stage",
      stars: 1,
    });
    const matchesNothing = work({
      composerId: "other2",
      epoch: "Baroque",
      genre: "Stage",
      stars: 5,
    });
    expect(scoreWork(epochOnly, composerProfile)).toBeGreaterThan(
      scoreWork(matchesNothing, composerProfile),
    );
  });

  it("IV: lets a genre match survive a 3-star gap but not a 4-star one", () => {
    const genreOnly = work({
      composerId: "other",
      epoch: "Baroque",
      genre: "Orchestral",
      stars: 1,
    });
    const noMatchFourStars = work({
      composerId: "other2",
      epoch: "Baroque",
      genre: "Stage",
      stars: 4,
    });
    const noMatchFiveStars = work({
      composerId: "other3",
      epoch: "Baroque",
      genre: "Stage",
      stars: 5,
    });
    expect(scoreWork(genreOnly, composerProfile)).toBeGreaterThan(
      scoreWork(noMatchFourStars, composerProfile),
    );
    expect(scoreWork(genreOnly, composerProfile)).toBeLessThan(
      scoreWork(noMatchFiveStars, composerProfile),
    );
  });

  it("reduces to the popularity term alone under EMPTY_PROFILE", () => {
    expect(scoreWork(work({ stars: 5 }), EMPTY_PROFILE)).toBeCloseTo(POPULARITY_WEIGHT);
    expect(scoreWork(work({ stars: 1 }), EMPTY_PROFILE)).toBe(0);
  });

  it("never exceeds MAX_AFFINITY_SCORE for any real catalogue row", () => {
    const profile = buildTasteProfile(chopinFavorites);
    for (const candidate of index) {
      expect(scoreWork(candidate, profile)).toBeLessThanOrEqual(MAX_AFFINITY_SCORE);
    }
  });
});

describe("explain", () => {
  const profile: TasteProfile = {
    composers: { fav: 1 },
    epochs: { Baroque: 1 },
    genres: { Chamber: 1 },
    workIds: [],
  };

  it("names the composer whenever the composer is saved, regardless of other affinities", () => {
    const candidate = work({ composerId: "fav", epoch: "Classical", genre: "Stage" });
    expect(explain(candidate, profile)).toEqual({ kind: "composer", composerId: "fav" });
  });

  it("prefers the genre to the epoch when both clear the threshold", () => {
    const candidate = work({ composerId: "other", epoch: "Baroque", genre: "Chamber" });
    expect(explain(candidate, profile)).toEqual({ kind: "genre", genre: "Chamber" });
  });

  it("falls back to the epoch when the genre does not match", () => {
    const candidate = work({ composerId: "other", epoch: "Baroque", genre: "Stage" });
    expect(explain(candidate, profile)).toEqual({ kind: "epoch", epoch: "Baroque" });
  });

  it("falls back to popular when nothing clears the threshold", () => {
    const candidate = work({ composerId: "other", epoch: "Classical", genre: "Stage" });
    expect(explain(candidate, profile)).toEqual({ kind: "popular" });
  });

  it("ignores a dimension the profile barely likes", () => {
    const faint: TasteProfile = {
      composers: {},
      epochs: { Baroque: REASON_MIN_AFFINITY / 2 },
      genres: {},
      workIds: [],
    };
    expect(explain(work({ epoch: "Baroque" }), faint)).toEqual({ kind: "popular" });
  });
});

describe("recommend", () => {
  it("returns the same works for the same seed", () => {
    const profile = buildTasteProfile(chopinFavorites);
    const a = recommend(index, profile, { seed: 42 });
    const b = recommend(index, profile, { seed: 42 });
    expect(a.map((r) => r.work.id)).toEqual(b.map((r) => r.work.id));
  });

  it("returns different works for a different seed", () => {
    const profile = buildTasteProfile(chopinFavorites);
    const a = recommend(index, profile, { seed: 1 });
    const b = recommend(index, profile, { seed: 2 });
    expect(a.map((r) => r.work.id)).not.toEqual(b.map((r) => r.work.id));
  });

  it("is not a fixed top-6: the union across many seeds is larger than one draw", () => {
    const profile = buildTasteProfile(chopinFavorites);
    const seen = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      for (const { work: recommended } of recommend(index, profile, { seed })) {
        seen.add(recommended.id);
      }
    }
    expect(seen.size).toBeGreaterThan(DEFAULT_COUNT);
  });

  it("never recommends a favourite", () => {
    const profile = buildTasteProfile(chopinFavorites);
    const favoriteIds = new Set(chopinFavorites.map((w) => w.id));
    for (let seed = 0; seed < 10; seed++) {
      const result = recommend(index, profile, { seed });
      for (const { work: recommended } of result) {
        expect(favoriteIds.has(recommended.id)).toBe(false);
      }
    }
  });

  it("never recommends an excluded id", () => {
    const profile = buildTasteProfile(chopinFavorites);
    const excludeId = index.find((w) => !chopinFavorites.some((f) => f.id === w.id))!.id;
    const result = recommend(index, profile, { seed: 1, exclude: [excludeId] });
    expect(result.some((r) => r.work.id === excludeId)).toBe(false);
  });

  it("never recommends the same composer twice when the pool has enough variety", () => {
    const profile = buildTasteProfile(chopinFavorites);
    for (let seed = 0; seed < 10; seed++) {
      const result = recommend(index, profile, { seed });
      const composerIds = result.map((r) => r.work.composerId);
      expect(new Set(composerIds).size).toBe(composerIds.length);
    }
  });

  it("keeps ★1 works out unless their composer is saved", () => {
    const profile = buildTasteProfile(chopinFavorites);
    for (let seed = 0; seed < 10; seed++) {
      const result = recommend(index, profile, { seed });
      for (const { work: recommended } of result) {
        if (recommended.stars < MIN_CANDIDATE_STARS) {
          expect(recommended.composerId).toBe(CHOPIN_ID);
        }
      }
    }
  });

  it("still returns count works when every favourite is by the same composer", () => {
    // Regression test for the pool-collapse bug: without the per-composer
    // pool cap, three Mozart favourites push the top-40 pool to ~95% Mozart,
    // and composer-uniqueness then starves the selection to 2 works.
    const mozartFavorites = index
      .filter((w) => w.composerId === "196")
      .slice(0, 3);
    const profile = buildTasteProfile(mozartFavorites);
    const result = recommend(index, profile, { seed: 1 });
    expect(result).toHaveLength(DEFAULT_COUNT);
  });

  it("returns count works for a single favourite", () => {
    const profile = buildTasteProfile(favorites("17109"));
    const result = recommend(index, profile, { seed: 1 });
    expect(result).toHaveLength(DEFAULT_COUNT);
  });

  it("returns count works for zero favourites", () => {
    const result = recommend(index, EMPTY_PROFILE, { seed: 1 });
    expect(result).toHaveLength(DEFAULT_COUNT);
  });

  it("returns count works when every candidate has already been shown", () => {
    const profile = buildTasteProfile(chopinFavorites);
    const result = recommend(index, profile, {
      seed: 1,
      recentlyShown: index.map((w) => w.id),
    });
    expect(result).toHaveLength(DEFAULT_COUNT);
  });

  it("is a demotion, not an exclusion: penalising the whole pool uniformly reproduces the unpenalised result exactly", () => {
    // Every pool entry gets the same RECENT_PENALTY factor, which scales
    // every sampling key by the same constant — a monotonic transform that
    // cannot change the sort order. This is a stronger guarantee than "still
    // returns count items": the two runs must be bit-for-bit identical.
    const profile = buildTasteProfile(chopinFavorites);
    for (const seed of [1, 2, 3]) {
      const baseline = recommend(index, profile, { seed });
      const penalized = recommend(index, profile, {
        seed,
        recentlyShown: index.map((w) => w.id),
      });
      expect(penalized.map((r) => r.work.id)).toEqual(baseline.map((r) => r.work.id));
    }
  });

  it("shows a recently-shown work less often than an unpenalised run, across seeds", () => {
    const profile = buildTasteProfile(chopinFavorites);
    const seeds = Array.from({ length: 40 }, (_, i) => i);

    const baselineRuns = seeds.map((seed) => recommend(index, profile, { seed }));
    const frequency = new Map<string, number>();
    for (const run of baselineRuns) {
      for (const { work: recommended } of run) {
        frequency.set(recommended.id, (frequency.get(recommended.id) ?? 0) + 1);
      }
    }
    const [targetId] = [...frequency.entries()].sort((a, b) => b[1] - a[1])[0];
    const baselineCount = baselineRuns.filter((run) =>
      run.some((r) => r.work.id === targetId),
    ).length;

    const penalizedRuns = seeds.map((seed) =>
      recommend(index, profile, { seed, recentlyShown: [targetId] }),
    );
    const penalizedCount = penalizedRuns.filter((run) =>
      run.some((r) => r.work.id === targetId),
    ).length;

    expect(penalizedCount).toBeLessThan(baselineCount);
  });

  it("still surfaces the saved composer after one of their works was just shown", () => {
    const profile = buildTasteProfile(chopinFavorites);
    let sawChopin = false;
    for (let seed = 0; seed < 20; seed++) {
      const result = recommend(index, profile, {
        seed,
        recentlyShown: ["17109"],
      });
      if (result.some((r) => r.work.composerId === CHOPIN_ID)) sawChopin = true;
    }
    expect(sawChopin).toBe(true);
  });

  it("returns min(count, pool) for a catalogue smaller than count", () => {
    const tinyCatalogue = [
      work({ id: "a", composerId: "c1", stars: 3 }),
      work({ id: "b", composerId: "c2", stars: 3 }),
      work({ id: "c", composerId: "c3", stars: 3 }),
      work({ id: "d", composerId: "c4", stars: 3 }),
    ];
    const result = recommend(tinyCatalogue, EMPTY_PROFILE, { seed: 1 });
    expect(result).toHaveLength(4);
  });

  it("repeats a composer rather than returning short, for a single-composer catalogue", () => {
    const singleComposerCatalogue = Array.from({ length: 5 }, (_, i) =>
      work({ id: `w${i}`, composerId: "only", stars: 3 }),
    );
    const result = recommend(singleComposerCatalogue, EMPTY_PROFILE, { seed: 1 });
    expect(result).toHaveLength(POOL_PER_COMPOSER);
  });

  it("keeps a ★1 by an unrelated composer out, unless stars >= 2 or the composer is favourited", () => {
    const profile: TasteProfile = {
      composers: { fav: 1 },
      epochs: {},
      genres: {},
      workIds: [],
    };
    const works = [
      work({ id: "s1-other", composerId: "other", stars: 1 }),
      work({ id: "s1-fav", composerId: "fav", stars: 1 }),
      work({ id: "s3-a", composerId: "a", stars: 3 }),
      work({ id: "s3-b", composerId: "b", stars: 3 }),
    ];
    const result = recommend(works, profile, { seed: 1, count: 4 });
    const ids = result.map((r) => r.work.id);
    expect(ids).not.toContain("s1-other");
    expect(ids).toContain("s1-fav");
  });

  it("labels each recommendation by the most specific matching dimension", () => {
    const profile: TasteProfile = {
      composers: { c1: 1 },
      epochs: { Baroque: 1 },
      genres: { Chamber: 1 },
      workIds: [],
    };
    const works = [
      work({ id: "w-composer", composerId: "c1", epoch: "Baroque", genre: "Vocal", stars: 3 }),
      work({ id: "w-genre", composerId: "c2", epoch: "Classical", genre: "Chamber", stars: 3 }),
      work({ id: "w-epoch", composerId: "c3", epoch: "Baroque", genre: "Stage", stars: 3 }),
      work({ id: "w-popular", composerId: "c4", epoch: "Classical", genre: "Stage", stars: 5 }),
    ];
    const result = recommend(works, profile, { seed: 1, count: 4 });
    const reasonById = new Map(result.map((r) => [r.work.id, r.reason]));
    expect(reasonById.get("w-composer")).toEqual({ kind: "composer", composerId: "c1" });
    expect(reasonById.get("w-genre")).toEqual({ kind: "genre", genre: "Chamber" });
    expect(reasonById.get("w-epoch")).toEqual({ kind: "epoch", epoch: "Baroque" });
    expect(reasonById.get("w-popular")).toEqual({ kind: "popular" });
  });

  it("does not let popularity alone fill the strip with only ★5 works", () => {
    const profile = buildTasteProfile(chopinFavorites);
    const result = recommend(index, profile, { seed: 1 });
    expect(result.some((r) => r.work.stars < 5)).toBe(true);
  });

  it("drops a favourite id that no longer resolves against the index, via the caller-side filter", () => {
    // A dead id (e.g. a work later removed from the catalogue) cannot
    // resolve through `favorites()`, so the caller's `.filter(Boolean)` drops
    // it before `buildTasteProfile` ever sees it — this is a contract on the
    // caller, not a special code path inside the function.
    const withoutGhost = buildTasteProfile(favorites("17109", "17217", "17179", "nonexistent-id"));
    expect(withoutGhost).toEqual(buildTasteProfile(chopinFavorites));
  });

  it("respects a custom count", () => {
    const profile = buildTasteProfile(chopinFavorites);
    const result = recommend(index, profile, { seed: 1, count: 3 });
    expect(result).toHaveLength(3);
  });
});
