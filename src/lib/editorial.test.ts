import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { ComposerEditorial, WorkEditorial } from "./editorial";

const ROOT = process.cwd();
const SOURCE_DIR = path.join(ROOT, "data", "editorial", "composers");
const BUILT_PATH = path.join(ROOT, "data", "editorial", "composers.json");

/**
 * `data/editorial/composers.json` is a generated artifact (see
 * `scripts/seed/build-editorial.ts`) assembled from the one-file-per-composer
 * source under `data/editorial/composers/`. Nothing re-runs that build as
 * part of `next build`, so this guards against the easy mistake of editing a
 * source file and forgetting `npm run build:editorial` before committing —
 * the same role `licenses.test.ts` plays for `data/portraits.json`.
 */
describe("built composer editorial matches its source files", () => {
  const sourceFiles = readdirSync(SOURCE_DIR).filter((file) =>
    file.endsWith(".json"),
  );
  const built = JSON.parse(readFileSync(BUILT_PATH, "utf8")) as Record<
    string,
    ComposerEditorial
  >;

  it("has a built entry for every source file, and no extras", () => {
    const sourceIds = sourceFiles.map((file) => path.basename(file, ".json"));
    expect(new Set(Object.keys(built))).toEqual(new Set(sourceIds));
  });

  it("matches each source file's content exactly", () => {
    for (const file of sourceFiles) {
      const id = path.basename(file, ".json");
      const source = JSON.parse(
        readFileSync(path.join(SOURCE_DIR, file), "utf8"),
      ) as ComposerEditorial;
      expect(built[id], `${file} is stale — run npm run build:editorial`).toEqual(
        source,
      );
    }
  });
});

describe("editorial progress ledger", () => {
  const LEDGER_PATH = path.join(ROOT, "data", "editorial", "ledger.json");
  const CATALOG_PATH = path.join(ROOT, "data", "catalog", "composers.json");

  it("tracks exactly the 220 composers in the shipped catalogue", () => {
    const ledger = JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as Record<
      string,
      unknown
    >;
    const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as Array<{
      id: string;
    }>;
    expect(new Set(Object.keys(ledger))).toEqual(
      new Set(catalog.map((composer) => composer.id)),
    );
  });
});

/**
 * `data/editorial/works.json` is a generated artifact (see
 * `scripts/seed/build-editorial.ts`) assembled from the one-composer-per-file
 * source under `data/editorial/works/`. Nothing re-runs that build as part
 * of `next build`, so this guards against the easy mistake of editing a
 * source file and forgetting `npm run build:editorial` before committing —
 * the same role the composer block above plays for `composers.json`.
 */
describe("built work editorial matches its source files", () => {
  const WORK_SOURCE_DIR = path.join(ROOT, "data", "editorial", "works");
  const WORKS_PATH = path.join(ROOT, "data", "editorial", "works.json");

  const sourceFiles = readdirSync(WORK_SOURCE_DIR).filter((file) =>
    file.endsWith(".json"),
  );
  const built = JSON.parse(readFileSync(WORKS_PATH, "utf8")) as Record<
    string,
    WorkEditorial
  >;

  it("has a built entry for every source entry, and no extras", () => {
    const sourceIds = new Set<string>();
    for (const file of sourceFiles) {
      const part = JSON.parse(
        readFileSync(path.join(WORK_SOURCE_DIR, file), "utf8"),
      ) as Record<string, WorkEditorial>;
      for (const id of Object.keys(part)) sourceIds.add(id);
    }
    expect(new Set(Object.keys(built))).toEqual(sourceIds);
  });

  it("matches each source file's content exactly", () => {
    for (const file of sourceFiles) {
      const part = JSON.parse(
        readFileSync(path.join(WORK_SOURCE_DIR, file), "utf8"),
      ) as Record<string, WorkEditorial>;
      for (const [id, entry] of Object.entries(part)) {
        expect(
          built[id],
          `${file}#${id} is stale — run npm run build:editorial`,
        ).toEqual(entry);
      }
    }
  });

  it("is sorted numerically by work id, not append order", () => {
    const keys = Object.keys(built);
    const sorted = [...keys].sort((a, b) => Number(a) - Number(b));
    expect(
      keys,
      "run npm run build:editorial — a hand-append would break this",
    ).toEqual(sorted);
  });
});

/**
 * `data/editorial/works.json` has no build-time schema check of its own
 * beyond what `build-editorial.ts` already enforces (both languages present
 * per field, at least one field set) — this is the equivalent of
 * `checkLocalizedText`, run as a test instead of a build gate, as a backstop
 * in case someone edits the built artifact directly instead of the source.
 */
describe("楽曲解説 (data/editorial/works.json) is internally well-formed", () => {
  const WORKS_PATH = path.join(ROOT, "data", "editorial", "works.json");
  const CORE_WORKS_PATH = path.join(ROOT, "data", "catalog", "core-works.json");
  const works = JSON.parse(readFileSync(WORKS_PATH, "utf8")) as Record<
    string,
    WorkEditorial
  >;

  const isNonEmptyString = (value: unknown): value is string =>
    typeof value === "string" && value.trim().length > 0;

  it("gives every structure/story both languages", () => {
    for (const [id, entry] of Object.entries(works)) {
      for (const field of ["structure", "story"] as const) {
        const text = entry[field];
        if (text === undefined) continue;
        expect(isNonEmptyString(text.ja), `${id}.${field}.ja`).toBe(true);
        expect(isNonEmptyString(text.en), `${id}.${field}.en`).toBe(true);
      }
    }
  });

  it("has no entry with neither field filled", () => {
    for (const [id, entry] of Object.entries(works)) {
      expect(Boolean(entry.structure || entry.story), id).toBe(true);
    }
  });

  it("every entry id has a detail page in the core catalogue", () => {
    const coreWorks = JSON.parse(
      readFileSync(CORE_WORKS_PATH, "utf8"),
    ) as Array<{ id: string }>;
    const coreIds = new Set(coreWorks.map((work) => work.id));
    const dangling = Object.keys(works).filter((id) => !coreIds.has(id));
    expect(
      dangling,
      "these ids have written prose but no detail page — a curation change dropped them from core-works.json",
    ).toEqual([]);
  });
});

describe("work editorial progress ledger", () => {
  const LEDGER_PATH = path.join(ROOT, "data", "editorial", "work-ledger.json");
  const CORE_WORKS_PATH = path.join(ROOT, "data", "catalog", "core-works.json");

  interface LedgerEntry {
    title: string;
    composer: string;
    stars: number;
    status: "todo" | "done" | "skip";
    note?: string;
  }

  const isNonEmptyString = (value: unknown): value is string =>
    typeof value === "string" && value.trim().length > 0;

  /**
   * The star floor is read from the ledger itself rather than hard-coded, so
   * this file never needs editing again when the project's scope widens
   * (★4/★5 → ★3 → ★2, …): adding the next tier's rows lowers `floor`, and
   * the set-equality check below follows automatically. See
   * `scripts/seed/build-work-ledger.ts`, the only script allowed to change
   * which ids are in the ledger.
   */
  it("tracks exactly the works at or above the ledger's own star floor", () => {
    const ledger = JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as Record<
      string,
      LedgerEntry
    >;
    const coreWorks = JSON.parse(
      readFileSync(CORE_WORKS_PATH, "utf8"),
    ) as Array<{ id: string; title: string; stars: number }>;

    const floor = Math.min(...Object.values(ledger).map((e) => e.stars));
    expect(floor, "ledger star floor").toBeGreaterThanOrEqual(2);

    const inScope = coreWorks.filter((work) => work.stars >= floor);
    const ledgerIds = new Set(Object.keys(ledger));
    const inScopeIds = new Set(inScope.map((work) => work.id));

    const missing = inScope
      .filter((work) => !ledgerIds.has(work.id))
      .map((work) => `${work.id} ${work.title}`);
    const extra = [...ledgerIds].filter((id) => !inScopeIds.has(id));

    expect(missing, "run: npm run seed:work-ledger").toEqual([]);
    expect(
      extra,
      "these ledger ids are no longer in scope — curation changed under the ledger",
    ).toEqual([]);

    for (const [id, entry] of Object.entries(ledger)) {
      const work = coreWorks.find((w) => w.id === id)!;
      expect(entry.stars, id).toBe(work.stars);
    }
  });

  it("marks every ledger entry that has written prose as done, skips are noted, and no others are done", () => {
    const ledger = JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as Record<
      string,
      LedgerEntry
    >;
    const written = JSON.parse(
      readFileSync(path.join(ROOT, "data", "editorial", "works.json"), "utf8"),
    ) as Record<string, WorkEditorial>;

    for (const [id, entry] of Object.entries(ledger)) {
      const hasContent = Boolean(written[id]?.structure || written[id]?.story);

      if (entry.status === "skip") {
        expect(hasContent, `${id}: a skipped work must not have written prose`).toBe(
          false,
        );
        expect(isNonEmptyString(entry.note), `${id}: skip needs a note`).toBe(true);
        continue;
      }

      expect(entry.status, id).toBe(hasContent ? "done" : "todo");
      expect(entry.note, `${id}: note is only meaningful on a skip`).toBeUndefined();
    }
  });

  /**
   * Freezes the completed ★4/★5 project (PR #46–#64): a future curation
   * change that drops a work's stars, or a ledger edit that reverts a done
   * row, must fail loudly rather than silently un-complete a finished tier.
   */
  it("keeps every ★4/★5 row done", () => {
    const ledger = JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as Record<
      string,
      LedgerEntry
    >;
    for (const [id, entry] of Object.entries(ledger)) {
      if (entry.stars >= 4) {
        expect(entry.status, id).toBe("done");
      }
    }
  });
});
