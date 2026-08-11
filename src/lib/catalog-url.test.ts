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
    expect(writeFilters(EMPTY_FILTERS, "standard")).toBe("");
  });

  it("round-trips every field", () => {
    const original = filters({
      query: "Moonlight",
      composerIds: ["1", "2"],
      epochs: ["Baroque", "Romantic"],
      genres: ["Keyboard"],
      minStars: 4,
    });
    const query = writeFilters(original, "title");
    expect(readFilters(new URLSearchParams(query.replace(/^\?/, "")))).toEqual({
      filters: original,
      sort: "title",
    });
  });

  it("is idempotent: writing the output of a read reproduces the same query", () => {
    const query = "?q=Beethoven&e=Baroque&g=Keyboard&stars=4&sort=composer";
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

  it("falls back to safe defaults for an invalid star count or sort", () => {
    const { filters: parsed, sort } = parse("stars=lol&sort=xyz");
    expect(parsed.minStars).toBe(0);
    expect(sort).toBe("standard");
  });

  it("rejects a star value outside the filterable set", () => {
    // 1 and 2 are real ratings but were never offered as filter chips.
    expect(parse("stars=2").filters.minStars).toBe(0);
    expect(parse("stars=1").filters.minStars).toBe(0);
    expect(parse("stars=6").filters.minStars).toBe(0);
  });

  it("ignores keys it does not recognise", () => {
    const { filters: parsed } = parse("x=1&y=2");
    expect(parsed).toEqual(EMPTY_FILTERS);
  });
});

describe("legacy ?pop= links", () => {
  it("maps the old popular/recommended values onto a star threshold", () => {
    expect(parse("pop=popular").filters.minStars).toBe(4);
    expect(parse("pop=recommended").filters.minStars).toBe(3);
  });

  it("never writes pop= again, even when it read one", () => {
    const { filters: parsed, sort } = parse("pop=popular");
    const query = writeFilters(parsed, sort);
    expect(query).toBe("?stars=4");
    expect(query).not.toContain("pop=");
  });

  it("prefers the new stars= param when both are present", () => {
    expect(parse("stars=5&pop=recommended").filters.minStars).toBe(5);
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
