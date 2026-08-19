import { describe, expect, it } from "vitest";

import { EMPTY_FILTERS, type CatalogFilters } from "./catalog";
import { readFilters, sanitizeQueryString, writeFilters } from "./catalog-url";

const filters = (overrides: Partial<CatalogFilters> = {}): CatalogFilters => ({
  ...EMPTY_FILTERS,
  ...overrides,
});

const parse = (query: string) => readFilters(new URLSearchParams(query));

describe("writeFilters / readFilters round-trip", () => {
  it("produces an empty string for the default filters at the default sort", () => {
    expect(writeFilters(EMPTY_FILTERS, "recommended")).toBe("");
  });

  it("writes 'standard' explicitly, since it is no longer the default", () => {
    expect(writeFilters(EMPTY_FILTERS, "standard")).toBe("?sort=standard");
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

  it("round-trips every sort value, including the default", () => {
    for (const sort of ["recommended", "standard", "title", "composer"] as const) {
      const query = writeFilters(EMPTY_FILTERS, sort);
      expect(parse(query.replace(/^\?/, "")).sort).toBe(sort);
    }
  });
});

describe("legacy ?view=all", () => {
  // The catalogue used to have a separate discovery feed, with `?view=all`
  // as the way into the full list. Now there is only one view, so `view` is
  // just another unrecognised key — dropped like any other, the same way
  // `sanitizeQueryString` already drops `//evil.com`.
  it("is dropped by sanitizeQueryString", () => {
    expect(sanitizeQueryString("?view=all")).toBe("");
  });

  it("is dropped alongside real filters, which survive", () => {
    expect(sanitizeQueryString("?e=Baroque&view=all")).toBe("?e=Baroque");
  });
});

describe("readFilters validation", () => {
  it("drops unknown epoch and genre values", () => {
    const { filters: parsed } = parse("e=Bogus,Baroque&g=Nope");
    expect(parsed.epochs).toEqual(["Baroque"]);
    expect(parsed.genres).toEqual([]);
  });

  it("defaults to 'recommended' for an empty query", () => {
    expect(parse("").sort).toBe("recommended");
  });

  it("falls back to safe defaults for an invalid star count or sort", () => {
    const { filters: parsed, sort } = parse("stars=lol&sort=xyz");
    expect(parsed.minStars).toBe(0);
    expect(sort).toBe("recommended");
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

describe("legacy ?sort=popular links", () => {
  it("maps to 'standard', its pre-★ meaning, rather than the new default", () => {
    expect(parse("sort=popular").sort).toBe("standard");
  });

  it("never writes sort=popular again, even when it read one", () => {
    const { filters: parsed, sort } = parse("sort=popular");
    expect(writeFilters(parsed, sort)).toBe("?sort=standard");
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
