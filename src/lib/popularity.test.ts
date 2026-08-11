import { describe, expect, it } from "vitest";

import { GENRES, type Genre } from "./epochs";
import {
  COMPOSER_BONUS,
  CURATED_BASE,
  GENRE_BONUS,
  MAX_BONUS,
  MAX_DETAIL_BONUS,
  MAX_SCORE,
  MAX_TIEBREAK,
  NICKNAME_BONUS,
  RANKED_BASE,
  RANKED_SLOTS,
  RANK_REACH,
  compareByStandard,
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
    // band, no ★4 can overtake a ★5, and nothing computed can reach the
    // hand-ordered head.
    expect(MAX_BONUS).toBeLessThan(CURATED_BASE[3]);
    expect(CURATED_BASE[3] + MAX_BONUS).toBeLessThan(CURATED_BASE[4]);
    expect(CURATED_BASE[4] + MAX_BONUS).toBeLessThan(CURATED_BASE[5]);
    expect(CURATED_BASE[5] + MAX_BONUS).toBeLessThan(RANKED_BASE);
    expect(RANKED_BASE + RANKED_SLOTS).toBe(MAX_SCORE);
  });

  it("bounds every reachable score at 0-MAX_SCORE", () => {
    for (const base of everyInput()) {
      for (const curatedStars of [undefined, ...CURATED]) {
        const score = workScore({ ...base, curatedStars });
        expect(score).toBeGreaterThan(0);
        expect(score).toBeLessThanOrEqual(MAX_SCORE);
      }
      for (const rankedIndex of [0, 1, RANKED_SLOTS - 1]) {
        const score = workScore({ ...base, rankedIndex });
        expect(score).toBeGreaterThan(0);
        expect(score).toBeLessThanOrEqual(MAX_SCORE);
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

  it("scores every ranked work above every unranked one", () => {
    const worstRanked = workScore(input({ rankedIndex: RANKED_SLOTS - 1 }));
    for (const base of everyInput()) {
      for (const curatedStars of [undefined, ...CURATED]) {
        expect(
          workScore({ ...base, curatedStars, curatedRank: 0 }),
        ).toBeLessThan(worstRanked);
      }
    }
  });
});

describe("the hand-ordered head", () => {
  it("lets position beat the composer, which is the whole point", () => {
    // The defect this replaced: COMPOSER_BONUS was wider than the rank term,
    // so the ★5 band sorted by composer and Pachelbel's Canon sat at #50.
    for (let i = 0; i < RANKED_SLOTS - 1; i++) {
      expect(
        workScore(input({ rankedIndex: i, composerStars: 1, genre: "Vocal" })),
      ).toBeGreaterThan(
        workScore(
          input({ rankedIndex: i + 1, composerStars: 5, genre: "Orchestral" }),
        ),
      );
    }
  });

  it("ignores every computed signal", () => {
    const at = (overrides: Partial<RatingInput>) =>
      workScore(input({ rankedIndex: 7, ...overrides }));
    const baseline = at({});
    expect(at({ composerStars: 1 })).toBe(baseline);
    expect(at({ popular: true, recommended: true })).toBe(baseline);
    expect(at({ hasNickname: true })).toBe(baseline);
    expect(at({ genre: "Vocal" })).toBe(baseline);
    expect(at({ curatedStars: 3, curatedRank: 9 })).toBe(baseline);
  });

  it("rates anything in the head ★5", () => {
    for (const base of everyInput()) {
      expect(workStars({ ...base, rankedIndex: 0 })).toBe(5);
      expect(workStars({ ...base, rankedIndex: RANKED_SLOTS - 1 })).toBe(5);
    }
  });
});

describe("the sub-rank tiebreak", () => {
  it("only splits works that already tied", () => {
    // Every other weight is a multiple of 10 and the tiebreak is single-digit,
    // so it cannot reorder across a position, a composer star, or a band.
    const coarse = [
      ...Object.values(CURATED_BASE),
      ...Object.values(COMPOSER_BONUS),
      ...Object.values(GENRE_BONUS),
      NICKNAME_BONUS,
      MAX_DETAIL_BONUS,
      RANKED_BASE,
    ];
    for (const value of coarse) expect(value % 10, String(value)).toBe(0);
    expect(MAX_TIEBREAK).toBeLessThan(10);
  });

  it("never overtakes a curator's position", () => {
    for (let rank = 1; rank < RANK_REACH; rank++) {
      for (const genre of GENRES as readonly Genre[]) {
        expect(
          workScore(
            input({ curatedStars: 4, curatedRank: rank, genre, hasNickname: true }),
          ),
        ).toBeLessThan(
          workScore(
            input({ curatedStars: 4, curatedRank: rank - 1, genre: "Vocal" }),
          ),
        );
      }
    }
  });

  it("does separate two works the curator left equal", () => {
    const same = { curatedStars: 4 as const, curatedRank: 3, composerStars: 5 as Stars };
    expect(
      workScore(input({ ...same, genre: "Orchestral", hasNickname: true })),
    ).toBeGreaterThan(workScore(input({ ...same, genre: "Vocal" })));
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

describe("compareByStandard", () => {
  const row = (score: number, title: string, id = "1") => ({ score, title, id });

  it("puts the higher score first regardless of title", () => {
    expect(compareByStandard(row(900, "Zzz"), row(100, "Aaa"))).toBeLessThan(0);
    expect(compareByStandard(row(100, "Aaa"), row(900, "Zzz"))).toBeGreaterThan(0);
  });

  it("breaks ties on the English title", () => {
    expect(compareByStandard(row(995, "Boléro"), row(995, "Nocturnes"))).toBeLessThan(0);
  });

  it("ignores the Japanese title when breaking ties", () => {
    // The regression this guards: `ja` collation sorts Latin ahead of kana, so
    // ordering on `titleJa` pulled every untranslated work to the top of its
    // tie group and made the two languages disagree from the first row.
    const bolero = { ...row(995, "Boléro", "5044"), titleJa: "ボレロ" };
    const bohème = { ...row(995, "La bohème", "16525"), titleJa: "La bohème" };
    expect(compareByStandard(bolero, bohème)).toBeLessThan(0);
  });

  it("settles identical titles by id so the order is stable", () => {
    // 17 English titles are shared by 50 works; "Violin Concerto" spans seven
    // composers. Without the id tie-break their order is whatever the input was.
    const a = row(89, "Violin Concerto", "2108");
    const b = row(89, "Violin Concerto", "22509");
    expect(compareByStandard(a, b)).toBeLessThan(0);
    expect(compareByStandard(b, a)).toBeGreaterThan(0);
    expect(compareByStandard(a, a)).toBe(0);
  });

  it("sorts a shuffled list back into one deterministic order", () => {
    const rows = [
      row(995, "Boléro", "5044"),
      row(995, "Nocturnes, op. 9", "17109"),
      row(89, "Violin Concerto", "2108"),
      row(89, "Violin Concerto", "22509"),
      row(300, "Requiem", "23646"),
    ];
    const expected = [...rows].sort(compareByStandard).map((r) => r.id);
    const shuffled = [...rows].reverse().sort(compareByStandard).map((r) => r.id);
    expect(shuffled).toEqual(expected);
    expect(expected).toEqual(["5044", "17109", "23646", "2108", "22509"]);
  });
});
