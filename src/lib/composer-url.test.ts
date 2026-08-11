import { describe, expect, it } from "vitest";

import { DEFAULT_COMPOSER_FILTERS, type ComposerFilters } from "./composer-filter";
import {
  readComposerFilters,
  sanitizeComposerQueryString,
  writeComposerFilters,
} from "./composer-url";

const filters = (overrides: Partial<ComposerFilters> = {}): ComposerFilters => ({
  ...DEFAULT_COMPOSER_FILTERS,
  ...overrides,
});

const parse = (query: string) => readComposerFilters(new URLSearchParams(query));

describe("writeComposerFilters / readComposerFilters round-trip", () => {
  it("produces an empty string for the default filters", () => {
    expect(writeComposerFilters(DEFAULT_COMPOSER_FILTERS)).toBe("");
  });

  it("does not write stars= for the default threshold (★3)", () => {
    expect(writeComposerFilters(filters({ minStars: 3 }))).toBe("");
  });

  it("round-trips every field", () => {
    const original = filters({
      query: "Beethoven",
      epochs: ["Baroque", "Romantic"],
      minStars: 5,
    });
    const query = writeComposerFilters(original);
    expect(readComposerFilters(new URLSearchParams(query.replace(/^\?/, "")))).toEqual(
      original,
    );
  });

  it("is idempotent: writing the output of a read reproduces the same query", () => {
    const query = "?q=Beethoven&e=Baroque&stars=5";
    const parsed = parse(query.replace(/^\?/, ""));
    expect(writeComposerFilters(parsed)).toBe(query);
  });
});

describe("readComposerFilters validation", () => {
  it("drops unknown epoch values", () => {
    expect(parse("e=Bogus,Baroque").epochs).toEqual(["Baroque"]);
  });

  it("falls back to the default threshold for an invalid or missing star count", () => {
    expect(parse("stars=lol").minStars).toBe(3);
    expect(parse("").minStars).toBe(3);
  });

  it("accepts 1 as the explicit 'no floor' value", () => {
    expect(parse("stars=1").minStars).toBe(1);
  });

  it("rejects a star value outside the filterable set", () => {
    // 2 is a real rating but was never offered as a filter chip.
    expect(parse("stars=2").minStars).toBe(3);
    expect(parse("stars=0").minStars).toBe(3);
    expect(parse("stars=6").minStars).toBe(3);
  });

  it("ignores keys it does not recognise", () => {
    expect(parse("x=1&y=2")).toEqual(DEFAULT_COMPOSER_FILTERS);
  });
});

describe("sanitizeComposerQueryString", () => {
  it("passes through a well-formed query", () => {
    expect(sanitizeComposerQueryString("?e=Baroque&q=Beethoven")).toBe(
      "?q=Beethoven&e=Baroque",
    );
  });

  it("returns an empty string for null, empty, or nonsense input", () => {
    for (const value of [null, "", "//evil.com", "not-a-query-string"]) {
      expect(sanitizeComposerQueryString(value)).toBe("");
    }
  });

  it("works whether or not the leading '?' is present", () => {
    expect(sanitizeComposerQueryString("q=Beethoven")).toBe(
      sanitizeComposerQueryString("?q=Beethoven"),
    );
  });
});
