import { describe, expect, it } from "vitest";

import { loadMedia, MEDIA_KIND_LABELS, type MediaCatalogView } from "./media";

const view: MediaCatalogView = {
  works: [
    { id: "16238", title: "Symphony no. 9 in D minor, op. 125, \"Choral\"" },
    { id: "13297", title: "Suite Bergamasque, L.75" },
  ],
};

const validEntry = {
  work: "Symphony no. 9 in D minor, op. 125, \"Choral\"",
  media: [
    {
      title: { ja: "時計じかけのオレンジ", en: "A Clockwork Orange" },
      year: 1971,
      kind: "film",
    },
  ],
};

describe("loadMedia", () => {
  it("accepts a well-formed entry", () => {
    const result = loadMedia({ "16238": validEntry }, view);
    expect(result.errors).toEqual([]);
    expect(result.media.get("16238")).toEqual([
      {
        title: { ja: "時計じかけのオレンジ", en: "A Clockwork Orange" },
        year: 1971,
        kind: "film",
        note: undefined,
      },
    ]);
  });

  it("accepts an entry with a note in both languages", () => {
    const result = loadMedia(
      {
        "16238": {
          ...validEntry,
          media: [
            {
              ...validEntry.media[0],
              note: { ja: "第4楽章が使われる。", en: "The fourth movement is used." },
            },
          ],
        },
      },
      view,
    );
    expect(result.errors).toEqual([]);
    expect(result.media.get("16238")?.[0].note).toEqual({
      ja: "第4楽章が使われる。",
      en: "The fourth movement is used.",
    });
  });

  it("accepts multiple appearances for one work", () => {
    const result = loadMedia(
      {
        "16238": {
          ...validEntry,
          media: [
            validEntry.media[0],
            {
              title: { ja: "別の作品", en: "Another Work" },
              year: 1999,
              kind: "tv",
            },
          ],
        },
      },
      view,
    );
    expect(result.errors).toEqual([]);
    expect(result.media.get("16238")).toHaveLength(2);
  });

  it("does not require every work to have an entry", () => {
    // Unlike composer-stars.json, coverage is optional — the second work in
    // `view` is simply absent from the result, not an error.
    const result = loadMedia({ "16238": validEntry }, view);
    expect(result.errors).toEqual([]);
    expect(result.media.has("13297")).toBe(false);
  });

  it("ignores an empty object", () => {
    const result = loadMedia({}, view);
    expect(result.errors).toEqual([]);
    expect(result.media.size).toBe(0);
  });

  it("ignores keys starting with an underscore", () => {
    const result = loadMedia({ _comment: "not an entry", "16238": validEntry }, view);
    expect(result.errors).toEqual([]);
    expect(result.media.size).toBe(1);
  });

  it("rejects an unknown work id", () => {
    const result = loadMedia({ "99999": validEntry }, view);
    expect(result.errors).toEqual([expect.stringContaining("no work with id 99999")]);
    expect(result.media.size).toBe(0);
  });

  it("rejects a work title that does not match — the id-typo guard", () => {
    const result = loadMedia(
      { "16238": { ...validEntry, work: "Symphony no. 9 (wrong)" } },
      view,
    );
    expect(result.errors).toEqual([
      expect.stringContaining('work is "Symphony no. 9 (wrong)"'),
    ]);
    expect(result.media.size).toBe(0);
  });

  it("tidies both sides of the work-title comparison, like curation.ts", () => {
    // Real Open Opus titles can carry stray whitespace the UI never shows
    // (see build-catalog.ts's fix for this exact case) — the echo check
    // should not punish an author for writing the clean title.
    const untidyView: MediaCatalogView = {
      works: [{ id: "16238", title: "  Symphony no. 9 in D minor, op. 125, \"Choral\"  " }],
    };
    const result = loadMedia({ "16238": validEntry }, untidyView);
    expect(result.errors).toEqual([]);
  });

  it("rejects an entry that is not an object", () => {
    const result = loadMedia({ "16238": "not an object" }, view);
    expect(result.errors).toEqual([
      expect.stringContaining('must be an object with "work" and "media"'),
    ]);
  });

  it("rejects a missing or empty media array", () => {
    for (const media of [undefined, []]) {
      const result = loadMedia({ "16238": { ...validEntry, media } }, view);
      expect(result.errors).toEqual([
        expect.stringContaining("media: must be a non-empty array"),
      ]);
    }
  });

  it("rejects a title missing one language", () => {
    const result = loadMedia(
      {
        "16238": {
          ...validEntry,
          media: [{ ...validEntry.media[0], title: { ja: "タイトルのみ" } }],
        },
      },
      view,
    );
    expect(result.errors).toEqual([
      expect.stringContaining('title: must be an object with non-empty "ja" and "en"'),
    ]);
  });

  it.each([
    ["not a number", "1971"],
    ["not an integer", 1971.5],
    ["before cinema existed", 1800],
    ["implausibly far in the future", 3000],
  ])("rejects an invalid year (%s)", (_label, year) => {
    const result = loadMedia(
      { "16238": { ...validEntry, media: [{ ...validEntry.media[0], year }] } },
      view,
    );
    expect(result.errors).toEqual([expect.stringContaining(".year:")]);
  });

  it("rejects an unknown kind", () => {
    const result = loadMedia(
      { "16238": { ...validEntry, media: [{ ...validEntry.media[0], kind: "musical" }] } },
      view,
    );
    expect(result.errors).toEqual([
      expect.stringContaining('kind: "musical" is not one of film, anime, tv'),
    ]);
  });

  it("accepts every declared kind", () => {
    for (const kind of Object.keys(MEDIA_KIND_LABELS)) {
      const result = loadMedia(
        { "16238": { ...validEntry, media: [{ ...validEntry.media[0], kind }] } },
        view,
      );
      expect(result.errors, kind).toEqual([]);
    }
  });

  it("rejects a note missing one language", () => {
    const result = loadMedia(
      {
        "16238": {
          ...validEntry,
          media: [{ ...validEntry.media[0], note: { ja: "日本語のみ" } }],
        },
      },
      view,
    );
    expect(result.errors).toEqual([
      expect.stringContaining('note: must be an object with non-empty "ja" and "en"'),
    ]);
  });

  it("rejects a top-level value that is not an object", () => {
    const result = loadMedia(["not", "an", "object"], view);
    expect(result.errors).toEqual([
      expect.stringContaining("must be an object keyed by work id"),
    ]);
  });
});

describe("data/media.json is internally valid", () => {
  it("loads with no validation errors against the real catalogue", async () => {
    // Importing these lazily rather than at module scope keeps this file's
    // only Node-specific (non-pure) dependencies scoped to this one test.
    const { readMediaSource } = await import("../../scripts/seed/media-files");
    const { toCurationView } = await import("../../scripts/seed/curation-files");
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");

    const dataset = JSON.parse(
      await readFile(path.join(process.cwd(), "data", "raw", "openopus.json"), "utf8"),
    );
    const result = loadMedia(await readMediaSource(), toCurationView(dataset));
    expect(result.errors).toEqual([]);
  });

  it("every entry points at a work with a detail page (the core index)", async () => {
    // `build-catalog.ts` enforces this at build time and fails loudly; this
    // pins the same invariant at the source-data level so it's caught by
    // `npm test` too, without needing a full `npm run seed:catalog`.
    const { readMediaSource } = await import("../../scripts/seed/media-files");
    const { toCurationView } = await import("../../scripts/seed/curation-files");
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const { coreWorks } = await import("./catalog");

    const dataset = JSON.parse(
      await readFile(path.join(process.cwd(), "data", "raw", "openopus.json"), "utf8"),
    );
    const result = loadMedia(await readMediaSource(), toCurationView(dataset));
    const coreIds = new Set(coreWorks.map((work) => work.id));
    for (const id of result.media.keys()) {
      expect(coreIds.has(id), id).toBe(true);
    }
  });
});
