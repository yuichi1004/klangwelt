import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { COUNTRY_LABELS } from "./countries";
import { loadNationalities } from "./nationality";

const view = {
  composers: [
    { id: "145", name: "Beethoven" },
    { id: "196", name: "Mozart" },
  ],
};

describe("loadNationalities", () => {
  it("accepts a well-formed entry", () => {
    const result = loadNationalities(
      { 145: { name: "Beethoven", country: "DE" } },
      view,
    );
    expect(result.errors).toEqual([]);
    expect(result.nationalities.get("145")).toEqual({ country: "DE", note: undefined });
  });

  it("accepts an entry with a note in both languages", () => {
    const result = loadNationalities(
      {
        145: {
          name: "Beethoven",
          country: "DE",
          note: { ja: "補足", en: "A note" },
        },
      },
      view,
    );
    expect(result.errors).toEqual([]);
    expect(result.nationalities.get("145")?.note).toEqual({
      ja: "補足",
      en: "A note",
    });
  });

  it("does not require every composer to have an entry", () => {
    // Unlike composer-stars.json, coverage is optional — Mozart is simply
    // absent from the result, not an error.
    const result = loadNationalities(
      { 145: { name: "Beethoven", country: "DE" } },
      view,
    );
    expect(result.errors).toEqual([]);
    expect(result.nationalities.has("196")).toBe(false);
  });

  it("ignores an empty object", () => {
    const result = loadNationalities({}, view);
    expect(result.errors).toEqual([]);
    expect(result.nationalities.size).toBe(0);
  });

  it("ignores keys starting with an underscore", () => {
    const result = loadNationalities(
      { _comment: "not an id", 145: { name: "Beethoven", country: "DE" } },
      view,
    );
    expect(result.errors).toEqual([]);
    expect(result.nationalities.size).toBe(1);
  });

  it("rejects an unknown composer id", () => {
    const result = loadNationalities(
      { 999: { name: "Nobody", country: "DE" } },
      view,
    );
    expect(result.errors).toEqual([expect.stringContaining("no composer with id 999")]);
    expect(result.nationalities.size).toBe(0);
  });

  it("rejects a name that does not match — the id-typo guard", () => {
    const result = loadNationalities(
      { 145: { name: "Beethoven Typo", country: "DE" } },
      view,
    );
    expect(result.errors).toEqual([
      expect.stringContaining('name is "Beethoven Typo", expected "Beethoven"'),
    ]);
    expect(result.nationalities.size).toBe(0);
  });

  it("rejects a country code outside COUNTRY_LABELS", () => {
    const result = loadNationalities(
      { 145: { name: "Beethoven", country: "ZZ" } },
      view,
    );
    expect(result.errors).toEqual([expect.stringContaining("not in COUNTRY_LABELS")]);
    expect(result.nationalities.size).toBe(0);
  });

  it("rejects a note missing one language", () => {
    const result = loadNationalities(
      {
        145: { name: "Beethoven", country: "DE", note: { ja: "補足" } },
      },
      view,
    );
    expect(result.errors).toEqual([
      expect.stringContaining('non-empty "ja" and "en"'),
    ]);
    expect(result.nationalities.size).toBe(0);
  });

  it("rejects a note with an empty-string language", () => {
    const result = loadNationalities(
      {
        145: { name: "Beethoven", country: "DE", note: { ja: "補足", en: "  " } },
      },
      view,
    );
    expect(result.errors).toEqual([
      expect.stringContaining('non-empty "ja" and "en"'),
    ]);
  });

  it("rejects a top-level value that is not an object", () => {
    const result = loadNationalities(["not", "an", "object"], view);
    expect(result.errors).toEqual([
      expect.stringContaining("must be an object keyed by composer id"),
    ]);
  });

  it("rejects an entry that is not an object", () => {
    const result = loadNationalities({ 145: "DE" }, view);
    expect(result.errors).toEqual([
      expect.stringContaining('must be an object with "name" and "country"'),
    ]);
  });
});

describe("data/nationalities.json is internally valid", () => {
  it("has no validation errors against the real composer list", async () => {
    // Importing these lazily rather than at module scope keeps this file's
    // only Node-specific (non-pure) dependency scoped to this one test.
    const { readNationalitySource } = await import(
      "../../scripts/seed/nationality-files"
    );
    const { composers } = await import("./catalog");

    const result = loadNationalities(await readNationalitySource(), {
      composers: composers.map((composer) => ({
        id: composer.id,
        name: composer.name,
      })),
    });
    expect(result.errors).toEqual([]);
  });

  it("ships a flag SVG for every country COUNTRY_LABELS declares", () => {
    // Catches "added a country to countries.ts but forgot npm run
    // build:flags" — the same source-vs-generated-artifact check
    // `curation.test.ts` runs for data/curation/**.
    const flagsDir = path.join(process.cwd(), "public", "flags");
    for (const code of Object.keys(COUNTRY_LABELS)) {
      const file = path.join(flagsDir, `${code.toLowerCase()}.svg`);
      expect(existsSync(file), `missing ${file}`).toBe(true);
    }
  });
});
