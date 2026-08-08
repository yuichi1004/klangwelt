import { describe, expect, it } from "vitest";

import { EMPTY_FILTERS, type CatalogFilters } from "./catalog";
import { readFilters, sanitizeQueryString, writeFilters } from "./catalog-url";

const filters = (overrides: Partial<CatalogFilters> = {}): CatalogFilters => ({
  ...EMPTY_FILTERS,
  ...overrides,
});

const parse = (query: string) => readFilters(new URLSearchParams(query));

describe("writeFilters / readFilters round-trip", () => {
  it("produces an empty string for the default filters", () => {
    expect(writeFilters(EMPTY_FILTERS, "popular")).toBe("");
  });

  it("round-trips every field", () => {
    const original = filters({
      query: "Moonlight",
      composerIds: ["1", "2"],
      epochs: ["Baroque", "Romantic"],
      genres: ["Keyboard"],
      popularity: "popular",
    });
    const query = writeFilters(original, "title");
    expect(readFilters(new URLSearchParams(query.replace(/^\?/, "")))).toEqual({
      filters: original,
      sort: "title",
    });
  });

  it("is idempotent: writing the output of a read reproduces the same query", () => {
    const query = "?q=Beethoven&e=Baroque&g=Keyboard&pop=popular&sort=composer";
    const { filters: parsed, sort } = parse(query.replace(/^\?/, ""));
    expect(writeFilters(parsed, sort)).toBe(query);
  });
});

describe("readFilters validation", () => {
  it("drops unknown epoch and genre values", () => {
    const { filters: parsed } = parse("e=Bogus,Baroque&g=Nope");
    expect(parsed.epochs).toEqual(["Baroque"]);
    expect(parsed.genres).toEqual([]);
  });

  it("falls back to safe defaults for an invalid popularity or sort", () => {
    const { filters: parsed, sort } = parse("pop=lol&sort=xyz");
    expect(parsed.popularity).toBe("all");
    expect(sort).toBe("popular");
  });

  it("ignores keys it does not recognise", () => {
    const { filters: parsed } = parse("x=1&y=2");
    expect(parsed).toEqual(EMPTY_FILTERS);
  });
});

describe("sanitizeQueryString", () => {
  it("passes through a well-formed query", () => {
    expect(sanitizeQueryString("?e=Baroque&q=Moonlight")).toBe(
      "?q=Moonlight&e=Baroque",
    );
  });

  it("returns an empty string for null, empty, or nonsense input", () => {
    for (const value of [null, "", "//evil.com", "not-a-query-string"]) {
      expect(sanitizeQueryString(value)).toBe("");
    }
  });

  it("works whether or not the leading '?' is present", () => {
    expect(sanitizeQueryString("q=Moonlight")).toBe(
      sanitizeQueryString("?q=Moonlight"),
    );
  });
});
