import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  checkSimilarity,
  extractYearClaims,
  filledFactCategoryCount,
  hasEnoughFacts,
  longestSharedCharRun,
  longestSharedWordRun,
  MIN_FACT_CATEGORIES,
  ungroundedYears,
  type ComposerFactSheet,
} from "./editorial-guard";

const emptySheet: ComposerFactSheet = {
  composerId: "0",
  teachers: [],
  students: [],
  notableWorks: [],
  movements: [],
  instruments: [],
  occupations: [],
  awards: [],
  employers: [],
  genres: [],
  extraYears: [],
};

describe("extractYearClaims", () => {
  it("reads Japanese years by their 年 suffix", () => {
    expect(extractYearClaims("1770年に生まれ、1827年に没した。", "ja")).toEqual([
      1770, 1827,
    ]);
  });

  it("does not mistake a catalogue number for a Japanese year", () => {
    expect(extractYearClaims("作品1067を作曲した。", "ja")).toEqual([]);
  });

  it("reads standalone English years", () => {
    expect(extractYearClaims("Born in 1770, he died in 1827.", "en")).toEqual([
      1770, 1827,
    ]);
  });

  it("ignores English catalogue numbers", () => {
    for (const text of ["BWV 1046", "Op. 1067", "K. 1080", "No. 1046"]) {
      expect(extractYearClaims(text, "en"), text).toEqual([]);
    }
  });

  it("reads a decade written with a trailing s", () => {
    expect(extractYearClaims("Popular throughout the 1820s.", "en")).toEqual([
      1820,
    ]);
  });

  it("deduplicates repeated years", () => {
    expect(extractYearClaims("1827年、1827年。", "ja")).toEqual([1827]);
  });
});

describe("ungroundedYears", () => {
  const lifespan = { birthYear: 1770, deathYear: 1827 };

  it("accepts any year inside the composer's lifespan", () => {
    expect(ungroundedYears("1803年に作曲した。", "ja", lifespan)).toEqual([]);
  });

  it("accepts the exact birth and death years", () => {
    expect(ungroundedYears("1770年に生まれ1827年に没した。", "ja", lifespan)).toEqual(
      [],
    );
  });

  it("flags a year before birth or after death", () => {
    expect(ungroundedYears("1650年に初演された。", "ja", lifespan)).toEqual([1650]);
    expect(ungroundedYears("1900年に初演された。", "ja", lifespan)).toEqual([1900]);
  });

  it("accepts an out-of-lifespan year when it is in extraYears", () => {
    expect(
      ungroundedYears("1900年に初演された。", "ja", lifespan, [1900]),
    ).toEqual([]);
  });

  it("treats a living composer's lifespan as open-ended to the present", () => {
    const living = { birthYear: 1935, deathYear: null };
    const nextYear = new Date().getFullYear() + 1;
    expect(ungroundedYears(`${nextYear}年に作曲した。`, "ja", living)).toEqual([
      nextYear,
    ]);
  });
});

describe("longestSharedWordRun / longestSharedCharRun", () => {
  it("is zero for unrelated text", () => {
    expect(longestSharedWordRun("the quick brown fox", "a slow green turtle")).toBe(
      0,
    );
  });

  it("finds a short shared phrase like a title", () => {
    expect(
      longestSharedWordRun(
        "He composed the Ninth Symphony in his final years.",
        "The Ninth Symphony premiered in Vienna in 1824.",
      ),
    ).toBe(3); // "the ninth symphony"
  });

  it("finds a long shared run when a sentence is paraphrased too closely", () => {
    const reference = "He first made his name as a virtuoso improviser in Vienna";
    const candidate = "As a young man he first made his name as a virtuoso improviser before turning to composition";
    expect(longestSharedWordRun(candidate, reference)).toBeGreaterThanOrEqual(7);
  });

  it("counts shared Japanese characters, not words", () => {
    expect(longestSharedCharRun("彼は生涯をウィーンで過ごした", "彼はウィーンで過ごした晩年")).toBeGreaterThan(0);
  });
});

describe("checkSimilarity", () => {
  it("passes short incidental overlap", () => {
    const result = checkSimilarity(
      "He composed the Ninth Symphony.",
      "The Ninth Symphony was his last.",
      "en",
    );
    expect(result.exceeds).toBe(false);
  });

  it("fails a near-verbatim paraphrase", () => {
    const reference =
      "He first made his name as a virtuoso improviser in the salons of Vienna";
    const candidate =
      "He first made his name as a virtuoso improviser in the salons of Vienna society";
    const result = checkSimilarity(candidate, reference, "en");
    expect(result.exceeds).toBe(true);
  });
});

describe("fact density gate", () => {
  it("rejects an empty fact sheet", () => {
    expect(hasEnoughFacts(emptySheet)).toBe(false);
    expect(filledFactCategoryCount(emptySheet)).toBe(0);
  });

  it("accepts a sheet with enough filled categories", () => {
    const sheet: ComposerFactSheet = {
      ...emptySheet,
      birthPlace: "Bonn",
      teachers: ["Joseph Haydn"],
      notableWorks: ["Symphony No. 9"],
    };
    expect(filledFactCategoryCount(sheet)).toBe(MIN_FACT_CATEGORIES);
    expect(hasEnoughFacts(sheet)).toBe(true);
  });

  it("rejects a sheet one category short of the minimum", () => {
    const sheet: ComposerFactSheet = {
      ...emptySheet,
      birthPlace: "Bonn",
      teachers: ["Joseph Haydn"],
    };
    expect(hasEnoughFacts(sheet)).toBe(false);
  });
});

describe("fact sheets fetched for the real catalogue", () => {
  // Only runs meaningfully once `npm run seed:composer-facts` has produced
  // this file; skipped gracefully before then so Phase 0 doesn't require it.
  const factsPath = path.join(process.cwd(), "data", "raw", "composer-facts.json");
  let facts: ComposerFactSheet[] = [];
  try {
    facts = JSON.parse(readFileSync(factsPath, "utf8")) as ComposerFactSheet[];
  } catch {
    facts = [];
  }

  it.skipIf(facts.length === 0)(
    "gives most composers enough material to write from",
    () => {
      const withEnough = facts.filter(hasEnoughFacts).length;
      expect(withEnough / facts.length).toBeGreaterThan(0.7);
    },
  );
});
