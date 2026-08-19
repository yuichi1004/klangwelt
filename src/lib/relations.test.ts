import { describe, expect, it } from "vitest";

import {
  getRelatedComposers,
  indexRelations,
  loadRelations,
  MAX_NOTE_LENGTH,
  RELATION_TYPES,
  relationLabelKey,
  type RelationEntry,
  type RelationsCatalogView,
} from "./relations";

const view: RelationsCatalogView = {
  composers: [
    { id: "145", name: "Beethoven" },
    { id: "208", name: "Haydn" },
    { id: "80", name: "Brahms" },
  ],
};

/** A minimal, valid entry — spread and override per test. */
function edge(overrides: Partial<RelationEntry> = {}): RelationEntry {
  return {
    composers: ["208", "145"],
    type: "teacher",
    note: { ja: "説明", en: "An explanation" },
    ...overrides,
  };
}

function source(relations: unknown[]) {
  return { _comment: "doc", relations };
}

describe("loadRelations", () => {
  it("accepts a well-formed entry", () => {
    const result = loadRelations(
      source([
        {
          composers: ["208", "145"],
          names: ["Haydn", "Beethoven"],
          type: "teacher",
          note: { ja: "説明", en: "An explanation" },
        },
      ]),
      view,
    );
    expect(result.errors).toEqual([]);
    expect(result.relations).toEqual([edge()]);
  });

  it("accepts every declared relation type", () => {
    for (const type of RELATION_TYPES) {
      const result = loadRelations(
        source([
          {
            composers: ["208", "145"],
            names: ["Haydn", "Beethoven"],
            type,
            note: { ja: "説明", en: "An explanation" },
          },
        ]),
        view,
      );
      expect(result.errors, `type "${type}"`).toEqual([]);
    }
  });

  it("ignores an empty relations array", () => {
    const result = loadRelations(source([]), view);
    expect(result.errors).toEqual([]);
    expect(result.relations).toEqual([]);
  });

  it("rejects a top-level value that is not an object", () => {
    const result = loadRelations(["not", "an", "object"], view);
    expect(result.errors).toEqual([
      expect.stringContaining('must be an object with a "relations" array'),
    ]);
  });

  it("rejects a top-level object whose relations field is not an array", () => {
    const result = loadRelations({ relations: "nope" }, view);
    expect(result.errors).toEqual([
      expect.stringContaining('must be an object with a "relations" array'),
    ]);
  });

  it("rejects an entry that is not an object", () => {
    const result = loadRelations(source(["not an object"]), view);
    expect(result.errors).toEqual([
      expect.stringContaining('must be an object with "composers", "names", "type" and "note"'),
    ]);
  });

  it("rejects composers with the wrong number of ids", () => {
    const result = loadRelations(
      source([{ ...edge(), composers: ["208"], names: ["Haydn"] }]),
      view,
    );
    expect(result.errors).toEqual([
      expect.stringContaining("composers: must be an array of exactly two composer ids"),
    ]);
  });

  it("rejects names with the wrong number of entries", () => {
    const result = loadRelations(
      source([{ ...edge(), names: ["Haydn", "Beethoven", "extra"] }]),
      view,
    );
    expect(result.errors).toEqual([
      expect.stringContaining(
        'names: must be an array of exactly two names, in the same order as "composers"',
      ),
    ]);
  });

  it("rejects a self-relation", () => {
    const result = loadRelations(
      source([{ composers: ["145", "145"], names: ["Beethoven", "Beethoven"], type: "friend", note: edge().note }]),
      view,
    );
    expect(result.errors).toEqual([expect.stringContaining('"145" is related to itself')]);
  });

  it("rejects an unknown composer id in composers[0]", () => {
    const result = loadRelations(
      source([{ composers: ["999", "145"], names: ["Nobody", "Beethoven"], type: "friend", note: edge().note }]),
      view,
    );
    expect(result.errors).toEqual([
      expect.stringContaining("composers[0]: no composer with id 999"),
    ]);
  });

  it("rejects an unknown composer id in composers[1]", () => {
    const result = loadRelations(
      source([{ composers: ["208", "999"], names: ["Haydn", "Nobody"], type: "friend", note: edge().note }]),
      view,
    );
    expect(result.errors).toEqual([
      expect.stringContaining("composers[1]: no composer with id 999"),
    ]);
  });

  it("rejects a names[0] echo that does not match — the id-typo guard", () => {
    const result = loadRelations(
      source([{ composers: ["208", "145"], names: ["Hayden", "Beethoven"], type: "teacher", note: edge().note }]),
      view,
    );
    expect(result.errors).toEqual([
      expect.stringContaining('names[0]: "Hayden", expected "Haydn"'),
    ]);
  });

  it("rejects a names[1] echo that does not match", () => {
    const result = loadRelations(
      source([{ composers: ["208", "145"], names: ["Haydn", "Beethovn"], type: "teacher", note: edge().note }]),
      view,
    );
    expect(result.errors).toEqual([
      expect.stringContaining('names[1]: "Beethovn", expected "Beethoven"'),
    ]);
  });

  it("rejects an unknown type", () => {
    const result = loadRelations(
      source([{ composers: ["208", "145"], names: ["Haydn", "Beethoven"], type: "enemy", note: edge().note }]),
      view,
    );
    expect(result.errors).toEqual([
      expect.stringContaining('type: "enemy" is not one of'),
    ]);
  });

  it("rejects a note missing one language", () => {
    const result = loadRelations(
      source([{ composers: ["208", "145"], names: ["Haydn", "Beethoven"], type: "teacher", note: { ja: "説明" } }]),
      view,
    );
    expect(result.errors).toEqual([
      expect.stringContaining('non-empty "ja" and "en"'),
    ]);
  });

  it("rejects a note with an empty-string language", () => {
    const result = loadRelations(
      source([
        { composers: ["208", "145"], names: ["Haydn", "Beethoven"], type: "teacher", note: { ja: "説明", en: "  " } },
      ]),
      view,
    );
    expect(result.errors).toEqual([
      expect.stringContaining('non-empty "ja" and "en"'),
    ]);
  });

  it("rejects a note.ja over MAX_NOTE_LENGTH.ja", () => {
    const result = loadRelations(
      source([
        {
          composers: ["208", "145"],
          names: ["Haydn", "Beethoven"],
          type: "teacher",
          note: { ja: "あ".repeat(MAX_NOTE_LENGTH.ja + 1), en: "An explanation" },
        },
      ]),
      view,
    );
    expect(result.errors).toEqual([
      expect.stringContaining(`over the ${MAX_NOTE_LENGTH.ja}-character limit`),
    ]);
  });

  it("rejects a note.en over MAX_NOTE_LENGTH.en", () => {
    const result = loadRelations(
      source([
        {
          composers: ["208", "145"],
          names: ["Haydn", "Beethoven"],
          type: "teacher",
          note: { ja: "説明", en: "a".repeat(MAX_NOTE_LENGTH.en + 1) },
        },
      ]),
      view,
    );
    expect(result.errors).toEqual([
      expect.stringContaining(`over the ${MAX_NOTE_LENGTH.en}-character limit`),
    ]);
  });

  it("rejects the same pair registered twice in the same order", () => {
    const raw = { composers: ["208", "145"], names: ["Haydn", "Beethoven"], type: "teacher", note: edge().note };
    const result = loadRelations(source([raw, raw]), view);
    expect(result.errors).toEqual([
      expect.stringContaining(
        "relations.json.relations[1]: 208 and 145 are already related by relations.json.relations[0]",
      ),
    ]);
    expect(result.relations).toHaveLength(1);
  });

  it("rejects the same pair registered in reversed order", () => {
    const result = loadRelations(
      source([
        { composers: ["208", "145"], names: ["Haydn", "Beethoven"], type: "teacher", note: edge().note },
        { composers: ["145", "208"], names: ["Beethoven", "Haydn"], type: "friend", note: edge().note },
      ]),
      view,
    );
    expect(result.errors).toEqual([
      expect.stringContaining("145 and 208 are already related by relations.json.relations[0]"),
    ]);
    expect(result.relations).toHaveLength(1);
  });

  it("rejects the same pair registered under a different type", () => {
    const result = loadRelations(
      source([
        { composers: ["208", "145"], names: ["Haydn", "Beethoven"], type: "teacher", note: edge().note },
        { composers: ["208", "145"], names: ["Haydn", "Beethoven"], type: "rival", note: edge().note },
      ]),
      view,
    );
    expect(result.errors).toHaveLength(1);
    expect(result.relations).toHaveLength(1);
    expect(result.relations[0].type).toBe("teacher");
  });

  it("skips only the malformed entry, keeping the rest", () => {
    const result = loadRelations(
      source([
        { composers: ["999", "145"], names: ["Nobody", "Beethoven"], type: "friend", note: edge().note },
        { composers: ["208", "80"], names: ["Haydn", "Brahms"], type: "friend", note: edge().note },
      ]),
      view,
    );
    expect(result.errors).toHaveLength(1);
    expect(result.relations).toHaveLength(1);
    expect(result.relations[0].composers).toEqual(["208", "80"]);
  });
});

describe("relationLabelKey", () => {
  it("flips teacher/student across direction", () => {
    expect(relationLabelKey("teacher", "forward")).toBe("student");
    expect(relationLabelKey("teacher", "reverse")).toBe("teacher");
  });

  it("flips influenced/influencedBy across direction", () => {
    expect(relationLabelKey("influence", "forward")).toBe("influenced");
    expect(relationLabelKey("influence", "reverse")).toBe("influencedBy");
  });

  it("keeps symmetric types the same regardless of direction", () => {
    for (const type of ["friend", "rival", "family", "collaborator"] as const) {
      expect(relationLabelKey(type, "forward")).toBe(type);
      expect(relationLabelKey(type, "reverse")).toBe(type);
    }
  });
});

describe("indexRelations", () => {
  it("normalises direction from each side of a directional edge", () => {
    const byComposer = indexRelations([edge({ composers: ["208", "145"], type: "teacher" })]);
    expect(byComposer.get("208")).toEqual([
      { composerId: "145", type: "teacher", direction: "forward", note: edge().note },
    ]);
    expect(byComposer.get("145")).toEqual([
      { composerId: "208", type: "teacher", direction: "reverse", note: edge().note },
    ]);
  });

  it("both sides see the same note", () => {
    const note = { ja: "共通の説明", en: "Shared note" };
    const byComposer = indexRelations([edge({ composers: ["208", "145"], note })]);
    expect(byComposer.get("208")?.[0].note).toEqual(note);
    expect(byComposer.get("145")?.[0].note).toEqual(note);
  });

  it("returns nothing for a composer with no relations", () => {
    const byComposer = indexRelations([edge()]);
    expect(byComposer.get("999")).toBeUndefined();
  });

  it("groups a composer's relations in RELATION_TYPES order", () => {
    const byComposer = indexRelations([
      edge({ composers: ["145", "80"], type: "rival" }),
      edge({ composers: ["208", "145"], type: "teacher" }),
    ]);
    expect(byComposer.get("145")?.map((r) => r.type)).toEqual(["teacher", "rival"]);
  });
});

describe("data/relations.json is internally valid", () => {
  it("has no validation errors against the real composer list", async () => {
    // Importing these lazily rather than at module scope keeps this file's
    // only Node-specific (non-pure) dependency scoped to this one test —
    // same reasoning as `nationality.test.ts`. `relations.ts` already
    // throws at import time if this fails; reaching this line at all is
    // half the assertion (see `glossary.test.ts`).
    const relationsJson = (await import("@/data/relations.json")).default;
    const { composers } = await import("./catalog");

    const result = loadRelations(relationsJson, {
      composers: composers.map((composer) => ({ id: composer.id, name: composer.name })),
    });
    expect(result.errors).toEqual([]);
    expect(result.relations.length).toBeGreaterThanOrEqual(10);
  });

  it("uses every declared relation type at least once", async () => {
    // Catches a chip/label variant nobody has actually exercised — the same
    // "declared but never used" gap `nationality.test.ts` guards against for
    // country flags.
    const relationsJson = (await import("@/data/relations.json")).default;
    const usedTypes = new Set(relationsJson.relations.map((entry) => entry.type));
    for (const type of RELATION_TYPES) {
      expect(usedTypes.has(type), `no relation uses type "${type}"`).toBe(true);
    }
  });

  it("resolves a real pair from both sides with flipped direction labels", async () => {
    // #145 (Beethoven) / #208 (Haydn) are seeded as a teacher relation in
    // data/relations.json — this is an end-to-end sanity check that
    // `getRelatedComposers` (backed by the real data) actually flips.
    const haydnSide = getRelatedComposers("208").find((r) => r.composerId === "145");
    const beethovenSide = getRelatedComposers("145").find((r) => r.composerId === "208");
    expect(haydnSide && relationLabelKey(haydnSide.type, haydnSide.direction)).toBe("student");
    expect(beethovenSide && relationLabelKey(beethovenSide.type, beethovenSide.direction)).toBe(
      "teacher",
    );
  });
});
