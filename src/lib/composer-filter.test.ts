import { describe, expect, it } from "vitest";

import { buildComposerCards, composers, type ComposerCard } from "./catalog";
import {
  DEFAULT_COMPOSER_FILTERS,
  filterComposers,
  groupComposersByEpoch,
  type ComposerFilters,
} from "./composer-filter";

const cards = buildComposerCards();

const filters = (overrides: Partial<ComposerFilters> = {}): ComposerFilters => ({
  ...DEFAULT_COMPOSER_FILTERS,
  ...overrides,
});

describe("filterComposers", () => {
  it("returns every composer for minStars 1, the 'no floor' value", () => {
    expect(filterComposers(cards, filters({ minStars: 1 }))).toHaveLength(
      cards.length,
    );
  });

  it("keeps only composers at or above the star threshold", () => {
    for (const minStars of [3, 4, 5] as const) {
      const result = filterComposers(cards, filters({ minStars }));
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThan(cards.length);
      for (const card of result) {
        expect(card.stars).toBeGreaterThanOrEqual(minStars);
      }
    }
  });

  it("narrows further as the threshold rises", () => {
    const ge3 = filterComposers(cards, filters({ minStars: 3 })).length;
    const ge4 = filterComposers(cards, filters({ minStars: 4 })).length;
    const ge5 = filterComposers(cards, filters({ minStars: 5 })).length;
    expect(ge3).toBeGreaterThanOrEqual(ge4);
    expect(ge4).toBeGreaterThanOrEqual(ge5);
  });

  it("filters by period", () => {
    const result = filterComposers(
      cards,
      filters({ minStars: 1, epochs: ["Baroque"] }),
    );
    expect(result.length).toBeGreaterThan(0);
    for (const card of result) {
      expect(card.epoch).toBe("Baroque");
    }
  });

  it("matches multiple periods as OR, not AND", () => {
    const baroque = filterComposers(
      cards,
      filters({ minStars: 1, epochs: ["Baroque"] }),
    ).length;
    const romantic = filterComposers(
      cards,
      filters({ minStars: 1, epochs: ["Romantic"] }),
    ).length;
    const both = filterComposers(
      cards,
      filters({ minStars: 1, epochs: ["Baroque", "Romantic"] }),
    ).length;
    expect(both).toBe(baroque + romantic);
  });

  it("searches the Japanese name, the complete name, and the short name", () => {
    const target = cards.find((card) => card.completeName.includes("Beethoven"));
    expect(target).toBeDefined();

    for (const needle of [
      target!.nameJa,
      target!.completeName.slice(0, 6),
      target!.name,
    ]) {
      const result = filterComposers(cards, filters({ minStars: 1, query: needle }));
      expect(result.map((card) => card.id)).toContain(target!.id);
    }
  });

  it("search is case-insensitive", () => {
    const result = filterComposers(
      cards,
      filters({ minStars: 1, query: "BEETHOVEN" }),
    );
    expect(result.length).toBeGreaterThan(0);
  });

  it("combines star, period and search as AND", () => {
    const target = cards.find((card) => card.completeName.includes("Beethoven"));
    expect(target).toBeDefined();

    const result = filterComposers(
      cards,
      filters({
        minStars: 1,
        epochs: [target!.epoch],
        query: "Beethoven",
      }),
    );
    expect(result.map((card) => card.id)).toEqual([target!.id]);
  });

  it("an unmatched search returns nothing", () => {
    expect(
      filterComposers(cards, filters({ minStars: 1, query: "zzzznosuchcomposer" })),
    ).toHaveLength(0);
  });
});

describe("groupComposersByEpoch", () => {
  it("drops periods with nobody in them", () => {
    const groups = groupComposersByEpoch(
      filterComposers(cards, filters({ minStars: 5 })),
    );
    for (const group of groups) {
      expect(group.members.length).toBeGreaterThan(0);
    }
  });

  it("the default filter (★3 and up) is a strict subset of all composers", () => {
    const groups = groupComposersByEpoch(
      filterComposers(cards, DEFAULT_COMPOSER_FILTERS),
    );
    const total = groups.reduce((sum, group) => sum + group.members.length, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(cards.length);
  });

  it("orders each group's members by birth year", () => {
    const groups = groupComposersByEpoch(cards);
    for (const group of groups) {
      const years = group.members.map((card) => card.birthYear);
      expect(years).toEqual([...years].sort((a, b) => a - b));
    }
  });

  it("every composer appears in exactly one group", () => {
    const groups = groupComposersByEpoch(cards);
    const seen = groups.flatMap((group) => group.members.map((card) => card.id));
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBe(cards.length);
  });
});

describe("buildComposerCards", () => {
  it("carries the same composer count as the raw catalogue", () => {
    expect(cards).toHaveLength(composers.length);
  });

  it("only attaches a credit when the composer has a portrait", () => {
    for (const card of cards as ComposerCard[]) {
      if (!card.portrait) expect(card.credit).toBeUndefined();
    }
  });
});
