import { describe, expect, it } from "vitest";

import { GENRES, type Genre } from "./epochs";
import {
  COMPOSER_BONUS,
  CURATED_BASE,
  MAX_BONUS,
  workScore,
  workStars,
  type CuratedStars,
  type RatingInput,
  type Stars,
} from "./popularity";

const ALL_STARS: Stars[] = [1, 2, 3, 4, 5];
const CURATED: CuratedStars[] = [3, 4, 5];

function input(overrides: Partial<RatingInput> = {}): RatingInput {
  return {
    composerStars: 3,
    popular: false,
    recommended: false,
    hasNickname: false,
    genre: "Orchestral",
    ...overrides,
  };
}

/** Every combination the formula can be handed, for exhaustive assertions. */
function* everyInput(): Generator<RatingInput> {
  for (const composerStars of ALL_STARS) {
    for (const popular of [true, false]) {
      for (const recommended of [true, false]) {
        for (const hasNickname of [true, false]) {
          for (const genre of GENRES as readonly Genre[]) {
            yield { composerStars, popular, recommended, hasNickname, genre };
          }
        }
      }
    }
  }
}

describe("score bands", () => {
  it("keeps every band clear of the one above it", () => {
    // This is what makes "the formula is capped at ★3" structural rather than
    // a clamp: no amount of bonus can lift an uncurated work into a curated
    // band, and no ★4 can overtake a ★5.
    expect(MAX_BONUS).toBeLessThan(CURATED_BASE[3]);
    expect(CURATED_BASE[3] + MAX_BONUS).toBeLessThan(CURATED_BASE[4]);
    expect(CURATED_BASE[4] + MAX_BONUS).toBeLessThan(CURATED_BASE[5]);
  });

  it("bounds every reachable score at 0-1000", () => {
    for (const base of everyInput()) {
      for (const curatedStars of [undefined, ...CURATED]) {
        const score = workScore({ ...base, curatedStars });
        expect(score).toBeGreaterThan(0);
        expect(score).toBeLessThanOrEqual(1000);
      }
    }
  });

  it("scores a curated work above every uncurated one", () => {
    const worstCurated = workScore(
      input({ curatedStars: 3, composerStars: 1, genre: "Vocal" }),
    );
    for (const base of everyInput()) {
      expect(workScore(base)).toBeLessThan(worstCurated);
    }
  });
});

describe("workStars", () => {
  it("never reaches ★4 without curation", () => {
    for (const base of everyInput()) {
      expect(workStars(base)).toBeLessThanOrEqual(3);
    }
  });

  it("passes a curated rating through untouched", () => {
    for (const base of everyInput()) {
      for (const curatedStars of CURATED) {
        expect(workStars({ ...base, curatedStars })).toBe(curatedStars);
      }
    }
  });

  it("leaves an unflagged work at ★1 however famous its composer", () => {
    for (const composerStars of ALL_STARS) {
      expect(
        workStars(input({ composerStars, hasNickname: true, genre: "Orchestral" })),
      ).toBe(1);
    }
  });

  it("rates a well-flagged work by a famous composer ★3", () => {
    expect(
      workStars(input({ composerStars: 5, popular: true, recommended: true })),
    ).toBe(3);
  });

  it("rates the same work lower under an obscure composer", () => {
    const flags = { popular: true, recommended: true } as const;
    expect(workStars(input({ ...flags, composerStars: 1 }))).toBeLessThan(
      workStars(input({ ...flags, composerStars: 5 })),
    );
  });
});

describe("ordering the cases this replaces", () => {
  const beethoven = { composerStars: 5 as Stars, genre: "Orchestral" as Genre };

  it("puts the Fifth Symphony above Für Elise", () => {
    // Both are `popular` in Open Opus, which is why the old two-tier sort fell
    // through to an alphabetical compare and ranked Für Elise first.
    const fifth = workScore(
      input({ ...beethoven, curatedStars: 5, popular: true, recommended: true }),
    );
    const fuerElise = workScore(
      input({
        ...beethoven,
        curatedStars: 4,
        genre: "Keyboard",
        popular: true,
        hasNickname: true,
      }),
    );
    expect(fifth).toBeGreaterThan(fuerElise);
  });

  it("puts the Eroica above the Choral Fantasy", () => {
    // The Eroica carries only `recommended` and the Choral Fantasy carries
    // `popular`, so the old sort had them the wrong way round.
    const eroica = workScore(
      input({ ...beethoven, curatedStars: 4, recommended: true, hasNickname: true }),
    );
    const choralFantasy = workScore(input({ ...beethoven, popular: true }));
    expect(eroica).toBeGreaterThan(choralFantasy);
  });

  it("follows the curator's order within one star group", () => {
    // Both are ★5 Beethoven, and the proxies would invert them: Für Elise has
    // a nickname and the Fifth does not.
    const fifth = workScore(
      input({ ...beethoven, curatedStars: 5, curatedRank: 0, popular: true, recommended: true }),
    );
    const fuerElise = workScore(
      input({
        ...beethoven,
        curatedStars: 5,
        curatedRank: 2,
        genre: "Keyboard",
        popular: true,
        hasNickname: true,
      }),
    );
    expect(fifth).toBeGreaterThan(fuerElise);
  });

  it("ignores the Open Opus flags once a work is curated", () => {
    const base = { ...beethoven, curatedStars: 4 as const, curatedRank: 1 };
    expect(workScore(input({ ...base, popular: true, recommended: true }))).toBe(
      workScore(input({ ...base, popular: false, recommended: false })),
    );
  });

  it("puts a curated minor-composer work above an uncurated Beethoven work", () => {
    // Albinoni is a ★2 composer, but the Adagio is standard repertoire.
    const adagio = workScore(
      input({ composerStars: 2, curatedStars: 4, recommended: true, genre: "Chamber" }),
    );
    const lesserBeethoven = workScore(
      input({ ...beethoven, popular: true, recommended: true }),
    );
    expect(adagio).toBeGreaterThan(lesserBeethoven);
  });
});

describe("bonus tables", () => {
  it("orders the composer bonus monotonically", () => {
    for (const stars of [2, 3, 4, 5] as Stars[]) {
      expect(COMPOSER_BONUS[stars]).toBeGreaterThan(
        COMPOSER_BONUS[(stars - 1) as Stars],
      );
    }
  });

  it("ranks both flags above either one alone", () => {
    const both = workScore(input({ popular: true, recommended: true }));
    const onlyPopular = workScore(input({ popular: true }));
    const onlyRecommended = workScore(input({ recommended: true }));
    const neither = workScore(input());
    expect(both).toBeGreaterThan(onlyPopular);
    expect(onlyPopular).toBeGreaterThan(onlyRecommended);
    expect(onlyRecommended).toBeGreaterThan(neither);
  });
});
