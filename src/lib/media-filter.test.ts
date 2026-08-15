import { describe, expect, it } from "vitest";

import { buildMediaCards } from "./catalog";
import type { MediaKind } from "./media";
import { DEFAULT_MEDIA_FILTERS, filterMediaCards, type MediaFilters } from "./media-filter";

const cards = buildMediaCards();

const filters = (overrides: Partial<MediaFilters> = {}): MediaFilters => ({
  ...DEFAULT_MEDIA_FILTERS,
  ...overrides,
});

describe("filterMediaCards", () => {
  it("returns every card for the default (empty) filters", () => {
    expect(filterMediaCards(cards, DEFAULT_MEDIA_FILTERS)).toEqual(cards);
  });

  it("filters by kind", () => {
    const result = filterMediaCards(cards, filters({ kinds: ["anime"] }));
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThan(cards.length);
    for (const card of result) expect(card.kind).toBe("anime");
  });

  it("matches multiple kinds as OR, not AND", () => {
    const film = filterMediaCards(cards, filters({ kinds: ["film"] })).length;
    const anime = filterMediaCards(cards, filters({ kinds: ["anime"] })).length;
    const both = filterMediaCards(cards, filters({ kinds: ["film", "anime"] })).length;
    expect(both).toBe(film + anime);
  });

  it("searches both the Japanese and English title", () => {
    const target = cards.find((card) => card.title.en.includes("2001"));
    expect(target).toBeDefined();

    for (const needle of [target!.title.ja, target!.title.en]) {
      const result = filterMediaCards(cards, filters({ query: needle }));
      expect(result.map((card) => card.id)).toContain(target!.id);
    }
  });

  it("search is case-insensitive", () => {
    const target = cards.find((card) => /[a-z]/i.test(card.title.en));
    expect(target).toBeDefined();
    const result = filterMediaCards(
      cards,
      filters({ query: target!.title.en.toUpperCase() }),
    );
    expect(result.map((card) => card.id)).toContain(target!.id);
  });

  it("combines kind and search as AND", () => {
    const target = cards[0];
    const result = filterMediaCards(
      cards,
      filters({ kinds: [target.kind], query: target.title.en }),
    );
    expect(result.map((card) => card.id)).toContain(target.id);

    const wrongKind: MediaKind = target.kind === "film" ? "anime" : "film";
    expect(
      filterMediaCards(cards, filters({ kinds: [wrongKind], query: target.title.en })),
    ).toHaveLength(0);
  });

  it("an unmatched search returns nothing", () => {
    expect(
      filterMediaCards(cards, filters({ query: "zzzznosuchmovie" })),
    ).toHaveLength(0);
  });
});
