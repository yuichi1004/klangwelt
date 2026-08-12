import { describe, expect, it } from "vitest";

import {
  buildMatcher,
  createAnnotator,
  glossary,
  loadGlossary,
  MAX_SHORT_LENGTH,
  type GlossaryEntry,
} from "./glossary";

/** A minimal, valid entry — spread and override per test. */
function entry(overrides: Partial<GlossaryEntry> = {}): GlossaryEntry {
  return {
    term: { ja: "対位法", en: "Counterpoint" },
    short: { ja: "説明", en: "An explanation" },
    match: { ja: ["対位法"], en: ["counterpoint"] },
    ...overrides,
  };
}

function map(entries: Record<string, GlossaryEntry>): Map<string, GlossaryEntry> {
  return new Map(Object.entries(entries));
}

describe("loadGlossary", () => {
  it("accepts a well-formed entry", () => {
    const result = loadGlossary({
      counterpoint: {
        term: { ja: "対位法", en: "Counterpoint" },
        short: { ja: "説明", en: "An explanation" },
        match: { ja: ["対位法"], en: ["counterpoint", "contrapuntal"] },
      },
    });
    expect(result.errors).toEqual([]);
    expect(result.entries.get("counterpoint")).toEqual({
      term: { ja: "対位法", en: "Counterpoint" },
      short: { ja: "説明", en: "An explanation" },
      match: { ja: ["対位法"], en: ["counterpoint", "contrapuntal"] },
    });
  });

  it("defaults match to [term] per language when match is omitted", () => {
    const result = loadGlossary({
      counterpoint: {
        term: { ja: "対位法", en: "Counterpoint" },
        short: { ja: "説明", en: "An explanation" },
      },
    });
    expect(result.errors).toEqual([]);
    expect(result.entries.get("counterpoint")?.match).toEqual({
      ja: ["対位法"],
      en: ["Counterpoint"],
    });
  });

  it("ignores keys starting with an underscore", () => {
    const result = loadGlossary({
      _comment: "not an entry",
      counterpoint: {
        term: { ja: "対位法", en: "Counterpoint" },
        short: { ja: "説明", en: "An explanation" },
      },
    });
    expect(result.errors).toEqual([]);
    expect(result.entries.size).toBe(1);
  });

  it("rejects a top-level value that is not an object", () => {
    const result = loadGlossary(["not", "an", "object"]);
    expect(result.errors).toEqual([
      expect.stringContaining("must be an object keyed by term id"),
    ]);
  });

  it("rejects an entry that is not an object", () => {
    const result = loadGlossary({ counterpoint: "対位法" });
    expect(result.errors).toEqual([
      expect.stringContaining('must be an object with "term" and "short"'),
    ]);
  });

  it("rejects a term missing one language", () => {
    const result = loadGlossary({
      counterpoint: {
        term: { ja: "対位法" },
        short: { ja: "説明", en: "An explanation" },
      },
    });
    expect(result.errors).toEqual([
      expect.stringContaining('term: must be an object with non-empty "ja" and "en"'),
    ]);
  });

  it("rejects a short definition over the Japanese length limit", () => {
    const tooLong = "あ".repeat(MAX_SHORT_LENGTH.ja + 1);
    const result = loadGlossary({
      counterpoint: {
        term: { ja: "対位法", en: "Counterpoint" },
        short: { ja: tooLong, en: "An explanation" },
      },
    });
    expect(result.errors).toEqual([
      expect.stringContaining(`over the ${MAX_SHORT_LENGTH.ja}-character limit`),
    ]);
  });

  it("rejects a short definition over the English length limit", () => {
    const tooLong = "a".repeat(MAX_SHORT_LENGTH.en + 1);
    const result = loadGlossary({
      counterpoint: {
        term: { ja: "対位法", en: "Counterpoint" },
        short: { ja: "説明", en: tooLong },
      },
    });
    expect(result.errors).toEqual([
      expect.stringContaining(`over the ${MAX_SHORT_LENGTH.en}-character limit`),
    ]);
  });

  it("rejects match when it is present but not an object", () => {
    const result = loadGlossary({
      counterpoint: {
        term: { ja: "対位法", en: "Counterpoint" },
        short: { ja: "説明", en: "An explanation" },
        match: "対位法",
      },
    });
    expect(result.errors).toEqual([
      expect.stringContaining('match: must be an object with "ja" and/or "en" arrays'),
    ]);
  });

  it("rejects an empty match array", () => {
    const result = loadGlossary({
      counterpoint: {
        term: { ja: "対位法", en: "Counterpoint" },
        short: { ja: "説明", en: "An explanation" },
        match: { ja: [] },
      },
    });
    expect(result.errors).toEqual([
      expect.stringContaining("match.ja: must be a non-empty array of strings"),
    ]);
  });

  it("rejects two entries claiming the same match string", () => {
    const result = loadGlossary({
      counterpoint: {
        term: { ja: "対位法", en: "Counterpoint" },
        short: { ja: "説明1", en: "An explanation" },
        match: { ja: ["対位法"] },
      },
      "counterpoint-2": {
        term: { ja: "対位法2", en: "Counterpoint 2" },
        short: { ja: "説明2", en: "Another explanation" },
        match: { ja: ["対位法"] },
      },
    });
    expect(result.errors).toEqual([expect.stringContaining('"対位法" is already used by "counterpoint"')]);
    // The first claimant still wins; the colliding entry is dropped whole.
    expect(result.entries.size).toBe(1);
    expect(result.entries.has("counterpoint")).toBe(true);
  });

  it("treats English match collisions case-insensitively", () => {
    const result = loadGlossary({
      mode: {
        term: { ja: "旋法", en: "Mode" },
        short: { ja: "説明", en: "An explanation" },
        match: { en: ["mode"] },
      },
      modal: {
        term: { ja: "旋法2", en: "Modal" },
        short: { ja: "説明2", en: "Another explanation" },
        match: { en: ["MODE"] },
      },
    });
    expect(result.errors).toEqual([expect.stringContaining("already used by")]);
    expect(result.entries.size).toBe(1);
  });
});

describe("buildMatcher / createAnnotator — longest match wins", () => {
  it("matches 管弦楽法 whole, not as 管弦楽 with 法 left over", () => {
    // The false-positive this codebase already hit once with unsorted
    // alternation (see popularity.ts's own commentary on ordering pitfalls):
    // a shorter registered term is a strict prefix of a longer one.
    const entries = map({
      orchestral: entry({
        term: { ja: "管弦楽", en: "Orchestral" },
        match: { ja: ["管弦楽"], en: ["orchestral"] },
      }),
      orchestration: entry({
        term: { ja: "管弦楽法", en: "Orchestration" },
        match: { ja: ["管弦楽法"], en: ["orchestration"] },
      }),
    });
    const annotate = createAnnotator(entries, "ja");
    const segments = annotate("彼は管弦楽法の達人だった。");
    const terms = segments.filter((segment) => segment.termId);
    expect(terms).toEqual([{ text: "管弦楽法", termId: "orchestration" }]);
  });

  it("matches ソナタ形式 whole, not as ソナタ with 形式 left over", () => {
    const entries = map({
      sonata: entry({
        term: { ja: "ソナタ", en: "Sonata" },
        match: { ja: ["ソナタ"], en: ["sonata"] },
      }),
      "sonata-form": entry({
        term: { ja: "ソナタ形式", en: "Sonata form" },
        match: { ja: ["ソナタ形式"], en: ["sonata form"] },
      }),
    });
    const annotate = createAnnotator(entries, "ja");
    const segments = annotate("この曲はソナタ形式で書かれている。");
    const terms = segments.filter((segment) => segment.termId);
    expect(terms).toEqual([{ text: "ソナタ形式", termId: "sonata-form" }]);
  });

  it("still matches the shorter term on its own when the longer phrase doesn't appear in this text", () => {
    const entries = map({
      sonata: entry({
        term: { ja: "ソナタ", en: "Sonata" },
        match: { ja: ["ソナタ"], en: ["sonata"] },
      }),
      "sonata-form": entry({
        term: { ja: "ソナタ形式", en: "Sonata form" },
        match: { ja: ["ソナタ形式"], en: ["sonata form"] },
      }),
    });
    const annotate = createAnnotator(entries, "ja");
    const segments = annotate("彼は3曲のソナタを残した。");
    const terms = segments.filter((segment) => segment.termId);
    expect(terms).toEqual([{ text: "ソナタ", termId: "sonata" }]);
  });
});

describe("buildMatcher / createAnnotator — English word boundaries", () => {
  it("does not match 'mode' inside 'model'", () => {
    const entries = map({ mode: entry({ match: { ja: ["旋法"], en: ["mode"] } }) });
    const annotate = createAnnotator(entries, "en");
    const segments = annotate("The new model is great.");
    expect(segments.some((segment) => segment.termId)).toBe(false);
  });

  it("does not match 'aria' inside 'Maria'", () => {
    const entries = map({ aria: entry({ match: { ja: ["アリア"], en: ["aria"] } }) });
    const annotate = createAnnotator(entries, "en");
    const segments = annotate("The dedicatee's name was Maria.");
    expect(segments.some((segment) => segment.termId)).toBe(false);
  });

  it("matches 'aria' as its own word", () => {
    const entries = map({ aria: entry({ match: { ja: ["アリア"], en: ["aria"] } }) });
    const annotate = createAnnotator(entries, "en");
    const segments = annotate("The soprano's aria was the highlight.");
    const terms = segments.filter((segment) => segment.termId);
    expect(terms).toEqual([{ text: "aria", termId: "aria" }]);
  });

  it("matching is case-insensitive", () => {
    const entries = map({ aria: entry({ match: { ja: ["アリア"], en: ["aria"] } }) });
    const annotate = createAnnotator(entries, "en");
    const segments = annotate("Aria da capo form.");
    const terms = segments.filter((segment) => segment.termId);
    expect(terms).toEqual([{ text: "Aria", termId: "aria" }]);
  });
});

describe("createAnnotator — first occurrence only, across calls", () => {
  it("marks a paraphrase's second spelling as already shown", () => {
    const entries = map({
      nocturne: entry({
        term: { ja: "夜想曲", en: "Nocturne" },
        match: { ja: ["夜想曲", "ノクターン"], en: ["nocturne"] },
      }),
    });
    const annotate = createAnnotator(entries, "ja");
    const segments = annotate("彼のノクターンは有名だ。晩年は夜想曲に回帰した。");
    const terms = segments.filter((segment) => segment.termId);
    expect(terms).toEqual([{ text: "ノクターン", termId: "nocturne" }]);
  });

  it("remembers what it has shown across separate annotate() calls on the same page", () => {
    const entries = map({ counterpoint: entry() });
    const annotate = createAnnotator(entries, "ja");

    const first = annotate("対位法を多用した初期の作品。");
    const second = annotate("後年になっても対位法に回帰している。");

    expect(first.filter((s) => s.termId)).toEqual([
      { text: "対位法", termId: "counterpoint" },
    ]);
    expect(second.filter((s) => s.termId)).toEqual([]);
    // The un-annotated second block still renders the term as plain text.
    expect(second.map((s) => s.text).join("")).toBe("後年になっても対位法に回帰している。");
  });

  it("a fresh annotator starts with no memory of another page", () => {
    const entries = map({ counterpoint: entry() });
    createAnnotator(entries, "ja")("対位法。");
    const secondPage = createAnnotator(entries, "ja");
    const segments = secondPage("対位法。");
    expect(segments.filter((s) => s.termId)).toEqual([
      { text: "対位法", termId: "counterpoint" },
    ]);
  });
});

describe("buildMatcher", () => {
  it("returns null for an empty glossary rather than a regex that matches everything", () => {
    expect(buildMatcher(new Map(), "ja")).toBeNull();
  });
});

describe("annotate reassembles the original text exactly", () => {
  it("concatenating every segment's text reproduces the input", () => {
    const entries = map({
      counterpoint: entry({ match: { ja: ["対位法"], en: [] } }),
      sonata: entry({
        term: { ja: "ソナタ", en: "Sonata" },
        match: { ja: ["ソナタ"], en: [] },
      }),
    });
    const annotate = createAnnotator(entries, "ja");
    const text = "対位法とソナタ形式を併用し、後年また対位法に回帰した。";
    const segments = annotate(text);
    expect(segments.map((s) => s.text).join("")).toBe(text);
  });
});

describe("data/glossary.json is internally valid", () => {
  it("loads with no validation errors", () => {
    // `glossary.ts` already throws at import time if this fails — reaching
    // this line at all is half the assertion. This also pins the count to a
    // sane range without hard-coding the exact figure, which #37 will grow.
    expect(glossary.size).toBeGreaterThanOrEqual(10);
  });

  it("gives every entry at least one match string per language", () => {
    for (const [id, e] of glossary) {
      expect(e.match.ja.length, id).toBeGreaterThan(0);
      expect(e.match.en.length, id).toBeGreaterThan(0);
    }
  });

  it("builds a matcher for both languages without throwing", () => {
    expect(buildMatcher(glossary, "ja")).not.toBeNull();
    expect(buildMatcher(glossary, "en")).not.toBeNull();
  });
});
