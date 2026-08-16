import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  isAllowedImageLicence,
  normalizeAuthor,
  requiresAttribution,
  type PortraitCredit,
} from "./licenses";
import { portraitThumb } from "./portrait-thumb";

const credits = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/portraits.json"), "utf8"),
) as PortraitCredit[];

describe("isAllowedImageLicence", () => {
  it("accepts the free licence families, including versioned variants", () => {
    for (const licence of [
      "Public domain",
      "CC0",
      "CC BY 4.0",
      "CC BY-SA 3.0 de",
      "No restrictions",
    ]) {
      expect(isAllowedImageLicence(licence), licence).toBe(true);
    }
  });

  it("rejects anything not on the list", () => {
    for (const licence of [
      undefined,
      "",
      "Fair use",
      "All rights reserved",
      "CC BY-NC 4.0",
      "CC BY-ND 4.0",
      "Copyrighted free use",
    ]) {
      expect(isAllowedImageLicence(licence), String(licence)).toBe(false);
    }
  });
});

describe("requiresAttribution", () => {
  it("requires attribution for the CC BY family", () => {
    for (const licence of [
      "CC BY 4.0",
      "CC BY 2.0",
      "CC BY-SA 4.0",
      "CC BY-SA 3.0 de",
    ]) {
      expect(requiresAttribution(licence), licence).toBe(true);
    }
  });

  it("does not require attribution for public-domain-equivalent licences", () => {
    for (const licence of ["Public domain", "PD", "CC0", "No restrictions"]) {
      expect(requiresAttribution(licence), licence).toBe(false);
    }
  });
});

describe("normalizeAuthor", () => {
  it("keeps a real name untouched", () => {
    expect(normalizeAuthor("Joseph Karl Stieler")).toBe("Joseph Karl Stieler");
  });

  it("takes the name after a file-name prefix", () => {
    expect(
      normalizeAuthor("Bundesarchiv_Bild_183-47198-0003,_Prag.jpg : Kohls, Ulrich"),
    ).toBe("Kohls, Ulrich");
  });

  it("reports a bare file name as unknown", () => {
    expect(normalizeAuthor("Fotothek_df_roe-neg_0002792_002_Portrait.jpg :")).toBe(
      "Unknown",
    );
    expect(normalizeAuthor("File:Arnold_Bax,_Kinsale,_Cork_1937.jpg")).toBe(
      "Unknown",
    );
  });

  it("collapses empty and repeated unknowns", () => {
    expect(normalizeAuthor("")).toBe("Unknown");
    expect(normalizeAuthor("  ")).toBe("Unknown");
    expect(normalizeAuthor("Unknown Unknown")).toBe("Unknown");
  });

  it("truncates values long enough to break the layout", () => {
    const result = normalizeAuthor("x".repeat(300));
    expect(result.length).toBeLessThanOrEqual(120);
    expect(result.endsWith("…")).toBe(true);
  });
});

/**
 * The rights gate for everything the site redistributes. Open Opus ships
 * portraits with no per-image provenance and 72 of its composers died after
 * 1955, so a portrait may only ship if Commons reports a free licence and we
 * recorded where it came from.
 */
describe("every shipped portrait is cleared for redistribution", () => {
  it("carries an allowed licence", () => {
    const violations = credits.filter(
      (credit) => !isAllowedImageLicence(credit.license),
    );
    expect(
      violations.map((credit) => `${credit.commonsFile}: ${credit.license}`),
    ).toEqual([]);
  });

  it("records a source page and a Commons file for attribution", () => {
    for (const credit of credits) {
      expect(credit.sourceUrl, credit.commonsFile).toMatch(
        /^https:\/\/commons\.wikimedia\.org\//,
      );
      expect(credit.commonsFile.length, credit.composerId).toBeGreaterThan(0);
      expect(credit.file, credit.composerId).toBe(
        `/portraits/${credit.composerId}.jpg`,
      );
    }
  });

  it("names an author for every licence that requires attribution", () => {
    const attributionRequired = credits.filter((credit) =>
      requiresAttribution(credit.license),
    );
    expect(attributionRequired.length).toBeGreaterThan(0);
    for (const credit of attributionRequired) {
      // Commons occasionally reports "Unknown"; that is the author as
      // designated, and the source link carries the rest of the attribution.
      expect(credit.author.length, credit.commonsFile).toBeGreaterThan(0);
    }
  });

  it("has no author string long enough to force horizontal overflow", () => {
    // A single unbroken 100-character token widened the credits page past the
    // viewport on mobile, which zooms the whole page out.
    for (const credit of credits) {
      const longestToken = Math.max(
        ...credit.author.split(/\s+/).map((token) => token.length),
      );
      expect(longestToken, `${credit.commonsFile}: ${credit.author}`).toBeLessThan(
        40,
      );
    }
  });

  it("has no duplicate composers", () => {
    const ids = credits.map((credit) => credit.composerId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * Work cards render the thumbnail, not the stored portrait. Running
   * `seed:portraits` without `build:portrait-thumbs` would otherwise ship a
   * broken image with nothing failing — the static export cannot fall back to
   * the original at runtime.
   */
  it("ships a card thumbnail for every portrait", () => {
    for (const credit of credits) {
      const thumb = path.join(
        process.cwd(),
        "public",
        portraitThumb(credit.file),
      );
      expect(existsSync(thumb), `${credit.composerId}: run npm run build:portrait-thumbs`).toBe(
        true,
      );
    }
  });
});
