/**
 * File I/O for the 定番度 curation sources, shared by `build-catalog.ts` and
 * `check-curation.ts` so both see exactly the same rules.
 *
 * The validation itself lives in `src/lib/curation.ts` as a pure function;
 * this module only reads bytes and turns the raw dump into the view that
 * validator wants.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { CurationCatalogView, CurationSource } from "../../src/lib/curation";
import type { RawDataset } from "./openopus";

export const CURATION_DIR = path.join(process.cwd(), "data", "curation");
export const COMPOSER_STARS_FILE = path.join(CURATION_DIR, "composer-stars.json");
export const CURATED_WORKS_DIR = path.join(CURATION_DIR, "works");

/**
 * Reads the curation sources. Unlike the optional Japanese overrides, a
 * missing or malformed file here throws rather than falling back to an empty
 * object: shipping a catalogue rated entirely by formula would look plausible
 * and be wrong, which is the failure mode hardest to notice.
 */
export async function readCurationSource(): Promise<CurationSource> {
  const composerStars = JSON.parse(
    await readFile(COMPOSER_STARS_FILE, "utf8"),
  ) as unknown;

  const files = (await readdir(CURATED_WORKS_DIR)).filter((file) =>
    file.endsWith(".json"),
  );
  const workFiles = await Promise.all(
    files.sort().map(async (file) => ({
      file,
      parsed: JSON.parse(
        await readFile(path.join(CURATED_WORKS_DIR, file), "utf8"),
      ) as unknown,
    })),
  );

  return { composerStars, workFiles };
}

export function toCurationView(dataset: RawDataset): CurationCatalogView {
  return {
    composers: dataset.composers.map((composer) => ({
      id: composer.id,
      name: composer.name,
    })),
    works: Object.entries(dataset.works).flatMap(([composerId, works]) =>
      works.map((work) => ({ id: work.id, composerId, title: work.title })),
    ),
  };
}
