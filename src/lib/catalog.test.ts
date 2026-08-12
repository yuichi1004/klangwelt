import { describe, expect, it } from "vitest";

import {
  buildComposerOptions,
  buildSearchIndex,
  catalogMeta,
  composers,
  filterWorks,
  getComposer,
  getWork,
  joinComposers,
  matchedMediaTitle,
  sortWorks,
  workIndex,
  type CatalogFilters,
  type SearchableWork,
} from "./catalog";
import { COUNTRY_LABELS } from "./countries";

const index = buildSearchIndex();

const filters = (overrides: Partial<CatalogFilters> = {}): CatalogFilters => ({
  query: "",
  composerIds: [],
  epochs: [],
  genres: [],
  minStars: 0,
  ...overrides,
});

describe("catalog integrity", () => {
  it("matches the numbers recorded at build time", () => {
    expect(composers).toHaveLength(catalogMeta.composerCount);
    expect(workIndex).toHaveLength(catalogMeta.coreWorkCount);
  });

  it("resolves every indexed work to an existing composer", () => {
    for (const row of workIndex) {
      expect(getComposer(row.composerId), row.id).toBeDefined();
      expect(getWork(row.id), row.id).toBeDefined();
    }
  });

  it("gives every work a non-empty title in both languages", () => {
    for (const row of workIndex) {
      expect(row.title.trim().length, row.id).toBeGreaterThan(0);
      expect(row.titleJa.trim().length, row.id).toBeGreaterThan(0);
    }
  });

  it("gives every composer a Japanese name", () => {
    for (const composer of composers) {
      expect(composer.nameJa.trim().length, composer.id).toBeGreaterThan(0);
      // A fallback to the English name would mean the entry is missing.
      expect(composer.nameJa, composer.completeName).not.toBe(
        composer.completeName,
      );
    }
  });

  it("gives every composer with a nationality a recognised country code", () => {
    // The country code and any note are already validated structurally by
    // `nationality.test.ts` against `data/nationalities.json`; this just
    // confirms the build actually carried that data through into the
    // shipped composers.json rather than dropping it.
    for (const composer of composers) {
      if (!composer.nationality) continue;
      expect(COUNTRY_LABELS[composer.nationality.country], composer.id).toBeDefined();
      if (composer.nationality.note) {
        expect(composer.nationality.note.ja.trim().length, composer.id).toBeGreaterThan(0);
        expect(composer.nationality.note.en.trim().length, composer.id).toBeGreaterThan(0);
      }
    }
  });

  it("gives every indexed work with media a recognised kind and both title languages", () => {
    // `media.test.ts` validates `data/media.json` itself; this confirms the
    // build actually carried it through into the shipped work-index.json
    // rather than dropping it, the same relationship the nationality check
    // above has to composers.json.
    for (const row of workIndex) {
      if (!row.media) continue;
      expect(row.media.length, row.id).toBeGreaterThan(0);
      for (const title of row.media) {
        expect(title.ja.trim().length, row.id).toBeGreaterThan(0);
        expect(title.en.trim().length, row.id).toBeGreaterThan(0);
      }
    }
  });
});

describe("filterWorks", () => {
  it("returns everything when nothing is selected", () => {
    expect(filterWorks(index, filters())).toHaveLength(index.length);
  });

  it("narrows by composer", () => {
    const beethoven = composers.find((c) => c.name === "Beethoven")!;
    const result = filterWorks(index, filters({ composerIds: [beethoven.id] }));
    expect(result.length).toBe(beethoven.coreWorkCount);
    expect(result.every((work) => work.composerId === beethoven.id)).toBe(true);
  });

  it("treats several composers as OR", () => {
    const [a, b] = composers.filter((c) => c.coreWorkCount > 0).slice(0, 2);
    const result = filterWorks(index, filters({ composerIds: [a.id, b.id] }));
    expect(result.length).toBe(a.coreWorkCount + b.coreWorkCount);
  });

  it("combines different axes as AND", () => {
    const baroque = filterWorks(index, filters({ epochs: ["Baroque"] }));
    const keyboard = filterWorks(index, filters({ genres: ["Keyboard"] }));
    const both = filterWorks(
      index,
      filters({ epochs: ["Baroque"], genres: ["Keyboard"] }),
    );
    expect(both.length).toBeLessThanOrEqual(
      Math.min(baroque.length, keyboard.length),
    );
    expect(both.every((w) => w.epoch === "Baroque" && w.genre === "Keyboard")).toBe(
      true,
    );
  });

  it("narrows by minimum stars", () => {
    const star5 = filterWorks(index, filters({ minStars: 5 }));
    const star4 = filterWorks(index, filters({ minStars: 4 }));
    const star3 = filterWorks(index, filters({ minStars: 3 }));
    expect(star5.every((work) => work.stars >= 5)).toBe(true);
    expect(star4.every((work) => work.stars >= 4)).toBe(true);
    expect(star3.every((work) => work.stars >= 3)).toBe(true);
    expect(star5.length).toBeGreaterThan(0);
    // Each stricter threshold is a subset of the looser one.
    expect(star5.length).toBeLessThanOrEqual(star4.length);
    expect(star4.length).toBeLessThanOrEqual(star3.length);
    expect(star3.length).toBeLessThan(index.length);
    const star5Ids = new Set(star5.map((w) => w.id));
    expect(star4.filter((w) => star5Ids.has(w.id)).length).toBe(star5.length);
  });

  it("searches titles and composer names in both languages", () => {
    expect(
      filterWorks(index, filters({ query: "Moonlight" })).length,
    ).toBeGreaterThan(0);
    expect(
      filterWorks(index, filters({ query: "ベートーヴェン" })).length,
    ).toBeGreaterThan(0);
    expect(
      filterWorks(index, filters({ query: "交響曲" })).length,
    ).toBeGreaterThan(0);
    // Case-insensitive.
    expect(filterWorks(index, filters({ query: "SYMPHONY" })).length).toBe(
      filterWorks(index, filters({ query: "symphony" })).length,
    );
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(filterWorks(index, filters({ query: "zzzz-no-such-work" }))).toEqual(
      [],
    );
  });

  it("searches film/anime/TV titles a work has appeared in", () => {
    // Beethoven's 9th (data/media.json) is used in A Clockwork Orange.
    const en = filterWorks(index, filters({ query: "Clockwork Orange" }));
    expect(en.length).toBeGreaterThan(0);
    expect(en.every((work) => work.id === "16238")).toBe(true);

    const ja = filterWorks(index, filters({ query: "時計じかけのオレンジ" }));
    expect(ja.map((w) => w.id)).toEqual(en.map((w) => w.id));
  });
});

describe("matchedMediaTitle", () => {
  const work = (id: string) => index.find((w) => w.id === id)!;

  it("returns the media title, in the given locale, when it is what matched", () => {
    const clockworkOrange = work("16238");
    expect(matchedMediaTitle(clockworkOrange, "Clockwork Orange", "en")).toBe(
      "A Clockwork Orange",
    );
    expect(matchedMediaTitle(clockworkOrange, "Clockwork Orange", "ja")).toBe(
      "時計じかけのオレンジ",
    );
    expect(matchedMediaTitle(clockworkOrange, "時計じかけ", "ja")).toBe(
      "時計じかけのオレンジ",
    );
  });

  it("returns undefined when the query matched the work's own title instead", () => {
    const clockworkOrange = work("16238");
    expect(matchedMediaTitle(clockworkOrange, "Symphony no. 9", "en")).toBeUndefined();
  });

  it("returns undefined for a work with no media", () => {
    const beethovenFifth = work("16406");
    expect(matchedMediaTitle(beethovenFifth, "Symphony", "en")).toBeUndefined();
  });

  it("returns undefined for an empty query", () => {
    const clockworkOrange = work("16238");
    expect(matchedMediaTitle(clockworkOrange, "", "en")).toBeUndefined();
    expect(matchedMediaTitle(clockworkOrange, "   ", "en")).toBeUndefined();
  });

  it("is case-insensitive", () => {
    const clockworkOrange = work("16238");
    expect(matchedMediaTitle(clockworkOrange, "clockwork orange", "en")).toBe(
      "A Clockwork Orange",
    );
  });
});

describe("joinComposers — media titles reach the search haystack", () => {
  it("includes both languages of a work's media titles in the haystack", () => {
    const rows = workIndex.filter((row) => row.media);
    expect(rows.length).toBeGreaterThan(0);

    const joined: SearchableWork[] = joinComposers(rows, buildComposerOptions());
    for (const work of joined) {
      for (const title of work.media ?? []) {
        expect(work.haystack, work.id).toContain(title.ja.toLowerCase());
        expect(work.haystack, work.id).toContain(title.en.toLowerCase());
      }
    }
  });
});

describe("sortWorks", () => {
  it("orders by descending score by default", () => {
    const sorted = sortWorks(index, "standard", "ja");
    const scores = sorted.map((work) => work.score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });

  it("matches the order the catalogue is already shipped in, in both locales", () => {
    // The build script bakes `core-works.json` with the same comparator, and
    // the composer pages read that file order directly. If this drifts, the
    // catalogue page disagrees with every composer page — which is exactly
    // what happened when the tie-break used the displayed title.
    const shipped = workIndex.map((row) => row.id);
    for (const locale of ["ja", "en"] as const) {
      const sorted = sortWorks(index, "standard", locale).map((work) => work.id);
      expect(sorted, locale).toEqual(shipped);
    }
  });

  it("produces one order for both languages", () => {
    // Scores tie constantly, so the tie-break decides most of the list. Using
    // the displayed title made `ja` and `en` diverge from the very first row,
    // because `ja` collation puts Latin script ahead of kana and kanji and the
    // untranslated titles bubbled to the top of every tie group.
    const ja = sortWorks(index, "standard", "ja").map((work) => work.id);
    const en = sortWorks(index, "standard", "en").map((work) => work.id);
    expect(ja).toEqual(en);
  });

  it("sorts by the title of the active language", () => {
    const ja = sortWorks(index, "title", "ja").map((work) => work.titleJa);
    const en = sortWorks(index, "title", "en").map((work) => work.title);
    expect([...ja]).toEqual([...ja].sort((a, b) => a.localeCompare(b, "ja")));
    expect([...en]).toEqual([...en].sort((a, b) => a.localeCompare(b, "en")));
  });

  it("does not mutate its input", () => {
    const before = index.map((work) => work.id);
    sortWorks(index, "title", "en");
    expect(index.map((work) => work.id)).toEqual(before);
  });
});

describe("buildComposerOptions", () => {
  it("carries what the filter list renders and nothing more", () => {
    const options = buildComposerOptions();
    expect(options).toHaveLength(composers.length);
    expect(Object.keys(options[0]).sort()).toEqual([
      "completeName",
      "coreWorkCount",
      "epoch",
      "id",
      "name",
      "nameJa",
    ]);
  });

  it("reports counts that agree with the index", () => {
    for (const option of buildComposerOptions()) {
      const actual = workIndex.filter(
        (row) => row.composerId === option.id,
      ).length;
      expect(actual, option.completeName).toBe(option.coreWorkCount);
    }
  });
});
