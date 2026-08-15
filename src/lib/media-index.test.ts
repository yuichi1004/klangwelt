import { describe, expect, it } from "vitest";

import type { MediaAppearance } from "./media";
import { buildMediaIndex, mediaId } from "./media-index";

function toMedia(
  entries: Record<string, MediaAppearance[]>,
): Map<string, MediaAppearance[]> {
  return new Map(Object.entries(entries));
}

const strauss2001: MediaAppearance = {
  title: { ja: "2001年宇宙の旅", en: "2001: A Space Odyssey" },
  year: 1968,
  kind: "film",
  note: { ja: "冒頭で使われる", en: "Used in the opening" },
};

const jStrauss2001: MediaAppearance = {
  title: { ja: "2001年宇宙の旅", en: "2001: A Space Odyssey" },
  year: 1968,
  kind: "film",
  note: { ja: "舞踏会の場面で使われる", en: "Used in the ballroom scene" },
};

describe("mediaId", () => {
  it("slugifies the English title and appends the year", () => {
    expect(mediaId("2001: A Space Odyssey", 1968)).toBe(
      "2001-a-space-odyssey-1968",
    );
  });

  it("strips diacritics", () => {
    expect(mediaId("Amélie", 2001)).toBe("amelie-2001");
  });

  it("collapses runs of punctuation and trims leading/trailing dashes", () => {
    expect(mediaId("--Amélie!!--", 2001)).toBe("amelie-2001");
  });

  it("leaves a leading dash when nothing survives slugging", () => {
    // buildMediaIndex treats this as a rejected id, not a shippable one.
    expect(mediaId("宇宙戦争", 1953)).toBe("-1953");
  });
});

describe("buildMediaIndex", () => {
  it("merges the same production referenced by multiple works into one entry", () => {
    const result = buildMediaIndex(
      toMedia({ "19622": [strauss2001], "18889": [jStrauss2001] }),
    );
    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].id).toBe("2001-a-space-odyssey-1968");
    // Numeric key order (18889 < 19622), not insertion order — see the
    // module comment on why `data/media.json`'s written order doesn't
    // survive `Object.entries` for numeric-string keys.
    expect(result.entries[0].works.map((work) => work.workId)).toEqual([
      "18889",
      "19622",
    ]);
    // Each work's own note travels with it, distinct per appearance.
    expect(result.entries[0].works[0].note).toEqual(jStrauss2001.note);
    expect(result.entries[0].works[1].note).toEqual(strauss2001.note);
  });

  it("keeps the same title in different years as separate entries", () => {
    const remake: MediaAppearance = { ...strauss2001, year: 2001 };
    const result = buildMediaIndex(toMedia({ "1": [strauss2001], "2": [remake] }));
    expect(result.errors).toEqual([]);
    expect(result.entries.map((entry) => entry.id)).toEqual([
      "2001-a-space-odyssey-2001",
      "2001-a-space-odyssey-1968",
    ]);
  });

  it("errors when the same production has conflicting kinds", () => {
    const asAnime: MediaAppearance = { ...jStrauss2001, kind: "anime" };
    const result = buildMediaIndex(
      toMedia({ "19622": [strauss2001], "18889": [asAnime] }),
    );
    expect(result.errors).toEqual([expect.stringContaining("conflicting kind")]);
  });

  it("errors instead of numbering when two different titles slug to the same id", () => {
    const amelie: MediaAppearance = {
      title: { ja: "アメリ", en: "Amélie" },
      year: 2001,
      kind: "film",
    };
    const amelieAscii: MediaAppearance = {
      title: { ja: "アメリ（別表記）", en: "Amelie" },
      year: 2001,
      kind: "film",
    };
    const result = buildMediaIndex(toMedia({ "1": [amelie], "2": [amelieAscii] }));
    expect(result.errors).toEqual([expect.stringContaining("ambiguous")]);
    // The second entry is dropped rather than silently renumbered to
    // "amelie-2001-2" — see the module comment on why that would be unsafe.
    expect(result.entries.filter((entry) => entry.id === "amelie-2001")).toHaveLength(
      1,
    );
  });

  it("errors when the English title has nothing to slug", () => {
    const onlyNonAscii: MediaAppearance = {
      title: { ja: "宇宙戦争", en: "宇宙戦争" },
      year: 1953,
      kind: "film",
    };
    const result = buildMediaIndex(toMedia({ "1": [onlyNonAscii] }));
    expect(result.errors).toEqual([
      expect.stringContaining("no ASCII letters or digits"),
    ]);
    expect(result.entries).toEqual([]);
  });

  it("orders entries by year descending, then English title ascending", () => {
    const beta: MediaAppearance = {
      title: { ja: "b", en: "Beta" },
      year: 2000,
      kind: "film",
    };
    const alpha: MediaAppearance = {
      title: { ja: "a", en: "Alpha" },
      year: 2000,
      kind: "film",
    };
    const newer: MediaAppearance = {
      title: { ja: "c", en: "Gamma" },
      year: 2010,
      kind: "film",
    };
    const result = buildMediaIndex(toMedia({ "1": [beta, alpha, newer] }));
    expect(result.entries.map((entry) => entry.title.en)).toEqual([
      "Gamma",
      "Alpha",
      "Beta",
    ]);
  });

  it("orders works by numeric id, not by input order", () => {
    // Both `JSON.parse` and `Object.entries` visit numeric-string keys in
    // ascending numeric order regardless of how they were written, so "3"
    // before "1" in the input still comes out as "1" then "3" — pinning
    // that behaviour here rather than leaving it as an implicit assumption.
    const result = buildMediaIndex(toMedia({ "3": [strauss2001], "1": [jStrauss2001] }));
    expect(result.entries[0].works.map((work) => work.workId)).toEqual(["1", "3"]);
  });

  it("returns no entries and no errors for an empty index", () => {
    const result = buildMediaIndex(toMedia({}));
    expect(result).toEqual({ entries: [], errors: [] });
  });
});
