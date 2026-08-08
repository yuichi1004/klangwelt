import { describe, expect, it } from "vitest";

import {
  buildComposerOptions,
  buildSearchIndex,
  catalogMeta,
  composers,
  filterWorks,
  getComposer,
  getWork,
  sortWorks,
  workIndex,
  type CatalogFilters,
} from "./catalog";

const index = buildSearchIndex();

const filters = (overrides: Partial<CatalogFilters> = {}): CatalogFilters => ({
  query: "",
  composerIds: [],
  epochs: [],
  genres: [],
  popularity: "all",
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

  it("narrows by popularity", () => {
    const popular = filterWorks(index, filters({ popularity: "popular" }));
    const recommended = filterWorks(index, filters({ popularity: "recommended" }));
    expect(popular.every((work) => work.popular)).toBe(true);
    expect(recommended.every((work) => work.recommended)).toBe(true);
    expect(popular.length).toBeGreaterThan(0);
    expect(popular.length).toBeLessThan(index.length);
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
});

describe("sortWorks", () => {
  it("puts popular works first by default", () => {
    const sorted = sortWorks(index, "popular", "ja");
    const lastPopular = sorted.findLastIndex((work) => work.popular);
    const firstUnpopular = sorted.findIndex((work) => !work.popular);
    expect(lastPopular).toBeLessThan(firstUnpopular);
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
