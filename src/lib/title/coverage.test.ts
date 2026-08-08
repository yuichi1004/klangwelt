import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { toJapaneseTitle } from "./translate";

interface RawWork {
  title: string;
  popular: string;
  recommended: string;
}

const raw = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/raw/openopus.json"), "utf8"),
) as { works: Record<string, RawWork[]> };

const coreWorks = Object.values(raw.works)
  .flat()
  .filter((work) => work.popular === "1" || work.recommended === "1");

/**
 * Guards the dictionaries against silent regressions. The untranslated
 * remainder is mostly operas, ballets and foreign-language titles, which are
 * meant to fall back to the original rather than be guessed at.
 */
describe("Japanese title coverage over the real catalogue", () => {
  it("translates at least half of the core repertoire", () => {
    const translated = coreWorks.filter(
      (work) => toJapaneseTitle(work.title).translated,
    ).length;
    const ratio = translated / coreWorks.length;
    expect(coreWorks.length).toBeGreaterThan(1000);
    expect(ratio).toBeGreaterThan(0.49);
  });

  it("always produces non-empty, well-formed output", () => {
    for (const work of coreWorks) {
      const { text } = toJapaneseTitle(work.title);
      expect(text.length, work.title).toBeGreaterThan(0);
      expect(text, work.title).not.toMatch(/\s{2,}|「」|^\s|\s$/);
    }
  });
});
