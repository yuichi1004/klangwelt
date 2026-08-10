import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { ComposerEditorial } from "./editorial";

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
