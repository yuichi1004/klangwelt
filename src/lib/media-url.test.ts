import { describe, expect, it } from "vitest";

import { DEFAULT_MEDIA_FILTERS, type MediaFilters } from "./media-filter";
import { readMediaFilters, writeMediaFilters } from "./media-url";

const filters = (overrides: Partial<MediaFilters> = {}): MediaFilters => ({
  ...DEFAULT_MEDIA_FILTERS,
  ...overrides,
});

const parse = (query: string) => readMediaFilters(new URLSearchParams(query));

describe("writeMediaFilters / readMediaFilters round-trip", () => {
  it("produces an empty string for the default filters", () => {
    expect(writeMediaFilters(DEFAULT_MEDIA_FILTERS)).toBe("");
  });

  it("round-trips every field", () => {
    const original = filters({ query: "Kubrick", kinds: ["film", "anime"] });
    const query = writeMediaFilters(original);
    expect(readMediaFilters(new URLSearchParams(query.replace(/^\?/, "")))).toEqual(
      original,
    );
  });

  it("is idempotent: writing the output of a read reproduces the same query", () => {
    // URLSearchParams percent-encodes the comma on the way back out
    // (`,` → `%2C`); both forms parse identically, so this pins the actual
    // round-tripped string rather than the literal one typed in a URL bar.
    const query = "?q=Kubrick&k=film%2Ctv";
    const parsed = parse("q=Kubrick&k=film,tv");
    expect(writeMediaFilters(parsed)).toBe(query);
  });
});

describe("readMediaFilters validation", () => {
  it("drops unknown kind values", () => {
    expect(parse("k=musical,film").kinds).toEqual(["film"]);
  });

  it("defaults to no filters for an empty query", () => {
    expect(parse("")).toEqual(DEFAULT_MEDIA_FILTERS);
  });

  it("ignores keys it does not recognise", () => {
    expect(parse("x=1&y=2")).toEqual(DEFAULT_MEDIA_FILTERS);
  });
});
