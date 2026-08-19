import { describe, expect, it } from "vitest";

import { buildSearchIndex, type SearchableWork } from "./catalog";
import {
  COMPOSER_WEIGHT,
  EMPTY_PROFILE,
  EPOCH_WEIGHT,
  GENRE_WEIGHT,
  MAX_AFFINITY_SCORE,
  POPULARITY_WEIGHT,
  RECENCY_DECAY,
  REASON_MIN_AFFINITY,
  buildTasteProfile,
  explain,
  rankByTaste,
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

// Matches `CatalogBrowser`'s `PAGE_SIZE` — the first page is what a visitor
// actually sees, so it is what the ★-tilt guard below cares about.
const PAGE_SIZE = 40;

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

describe("rankByTaste", () => {
  it("returns every input work exactly once — no pool truncation", () => {
    const profile = buildTasteProfile(chopinFavorites);
    const result = rankByTaste(index, profile, { seed: 1 });
    expect(result).toHaveLength(index.length);
    expect(new Set(result.map((r) => r.work.id))).toEqual(new Set(index.map((w) => w.id)));
  });

  it("still surfaces ★1 works, unlike a pool-filtered strip", () => {
    const result = rankByTaste(index, EMPTY_PROFILE, { seed: 1 });
    expect(result.some((r) => r.work.stars === 1)).toBe(true);
  });

  it("includes favourited works rather than withholding them", () => {
    const profile = buildTasteProfile(chopinFavorites);
    const result = rankByTaste(index, profile, { seed: 1 });
    const ids = new Set(result.map((r) => r.work.id));
    for (const favoriteId of profile.workIds) {
      expect(ids.has(favoriteId)).toBe(true);
    }
  });

  it("returns the same order for the same seed", () => {
    const profile = buildTasteProfile(chopinFavorites);
    const a = rankByTaste(index, profile, { seed: 42 });
    const b = rankByTaste(index, profile, { seed: 42 });
    expect(a.map((r) => r.work.id)).toEqual(b.map((r) => r.work.id));
  });

  it("returns a different order for a different seed", () => {
    const profile = buildTasteProfile(chopinFavorites);
    const a = rankByTaste(index, profile, { seed: 1 });
    const b = rankByTaste(index, profile, { seed: 2 });
    expect(a.map((r) => r.work.id)).not.toEqual(b.map((r) => r.work.id));
  });

  it("does not depend on the input array's order", () => {
    const profile = buildTasteProfile(chopinFavorites);
    const shuffled = [...index].sort((a, b) => (a.id < b.id ? 1 : -1));
    const a = rankByTaste(index, profile, { seed: 7 });
    const b = rankByTaste(shuffled, profile, { seed: 7 });
    expect(b.map((r) => r.work.id)).toEqual(a.map((r) => r.work.id));
  });

  it("filtering to one composer yields exactly that composer's subsequence of the full ranking", () => {
    const profile = buildTasteProfile(chopinFavorites);
    const full = rankByTaste(index, profile, { seed: 3 });
    const chopinOnlyFromFull = full
      .filter((r) => r.work.composerId === CHOPIN_ID)
      .map((r) => r.work.id);

    const chopinWorks = index.filter((w) => w.composerId === CHOPIN_ID);
    const chopinAlone = rankByTaste(chopinWorks, profile, { seed: 3 }).map((r) => r.work.id);

    expect(chopinAlone).toEqual(chopinOnlyFromFull);
  });

  it("spreads repeats of the same composer across the list", () => {
    const result = rankByTaste(index, EMPTY_PROFILE, { seed: 5 });
    // The degenerate tail — where too few distinct composers remain to keep
    // the gap — is real (see `spreadByComposer`'s doc comment), so this
    // checks a prefix comfortably clear of it, not the whole list.
    const prefix = result.slice(0, 300);
    for (let i = 0; i < prefix.length; i++) {
      for (let j = i + 1; j < Math.min(i + 9, prefix.length); j++) {
        expect(prefix[j].work.composerId).not.toBe(prefix[i].work.composerId);
      }
    }
  });

  it("returns the composer's reason for each entry, matching explain()", () => {
    const profile = buildTasteProfile(chopinFavorites);
    const result = rankByTaste(index, profile, { seed: 1 });
    for (const { work: candidate, reason } of result) {
      expect(reason).toEqual(explain(candidate, profile));
    }
  });

  it("handles an empty list", () => {
    expect(rankByTaste([], EMPTY_PROFILE, { seed: 1 })).toEqual([]);
  });

  it("does not reorder a single-composer catalogue beyond the keyed order", () => {
    const singleComposerCatalogue = Array.from({ length: 5 }, (_, i) =>
      work({ id: `w${i}`, composerId: "only", stars: 3 }),
    );
    const result = rankByTaste(singleComposerCatalogue, EMPTY_PROFILE, { seed: 1 });
    expect(result).toHaveLength(5);
    expect(new Set(result.map((r) => r.work.id))).toEqual(new Set(["w0", "w1", "w2", "w3", "w4"]));
  });

  it("biases favoured composers toward the front, averaged across seeds", () => {
    const profile = buildTasteProfile(chopinFavorites);
    const chopinPosition = (p: TasteProfile, seed: number) => {
      const ranked = rankByTaste(index, p, { seed }).map((r) => r.work.id);
      const positions = index
        .filter((w) => w.composerId === CHOPIN_ID)
        .map((w) => ranked.indexOf(w.id));
      return positions.reduce((sum, p) => sum + p, 0) / positions.length;
    };

    const seeds = Array.from({ length: 20 }, (_, i) => i);
    const meanWithTaste =
      seeds.reduce((sum, seed) => sum + chopinPosition(profile, seed), 0) / seeds.length;
    const meanWithoutTaste =
      seeds.reduce((sum, seed) => sum + chopinPosition(EMPTY_PROFILE, seed), 0) / seeds.length;

    expect(meanWithTaste).toBeLessThan(meanWithoutTaste);
  });

  it("keeps the average ★1 count in the first page well under a linear-weight baseline", () => {
    // Executable form of the TASTE_TILT derivation in the module doc
    // comment: under EMPTY_PROFILE, most of the catalogue's ★1 works should
    // not cluster into the very first page a visitor sees.
    const seeds = Array.from({ length: 20 }, (_, i) => i);
    const oneStarCounts = seeds.map((seed) => {
      const page = rankByTaste(index, EMPTY_PROFILE, { seed }).slice(0, PAGE_SIZE);
      return page.filter((r) => r.work.stars === 1).length;
    });
    const mean = oneStarCounts.reduce((sum, count) => sum + count, 0) / oneStarCounts.length;
    expect(mean).toBeLessThan(4);
  });
});
