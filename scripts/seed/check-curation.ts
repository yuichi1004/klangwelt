/**
 * Validates `data/curation/**` on its own, without rebuilding the catalogue.
 *
 * Run this while authoring a curation batch — it is fast and writes nothing.
 * `npm run seed:catalog` applies the same checks and refuses to build on an
 * error, so this is a convenience, not the only gate.
 *
 * Usage: `npm run check:curation`
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { loadCuration } from "../../src/lib/curation";
import { readCurationSource, toCurationView } from "./curation-files";
import type { RawDataset } from "./openopus";

const ROOT = process.cwd();
const RAW = path.join(ROOT, "data", "raw", "openopus.json");

async function main() {
  const dataset = JSON.parse(await readFile(RAW, "utf8")) as RawDataset;
  const view = toCurationView(dataset);
  const { composerStars, workStars, errors, warnings } = loadCuration(
    await readCurationSource(),
    view,
  );

  for (const warning of warnings) console.warn(`  ! ${warning}`);

  if (errors.length > 0) {
    console.error(`${errors.length} problem(s) found:\n`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  const histogram = (values: Iterable<number>) => {
    const counts = new Map<number, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [5, 4, 3, 2, 1]
      .filter((star) => counts.has(star))
      .map((star) => `★${star} ${counts.get(star)}`)
      .join("  ");
  };

  // Works Open Opus flagged neither way only enter the catalogue because they
  // were curated, so this count is the size of the core index's growth.
  const flagged = new Set(
    Object.values(dataset.works)
      .flat()
      .filter((work) => work.popular === "1" || work.recommended === "1")
      .map((work) => work.id),
  );
  const promoted = [...workStars.keys()].filter((id) => !flagged.has(id)).length;

  console.log(
    [
      `composers:        ${composerStars.size}   ${histogram(composerStars.values())}`,
      `curated works:    ${workStars.size}   ${histogram(
        [...workStars.values()].map((rating) => rating.stars),
      )}`,
      `promoted to core: ${promoted}`,
    ].join("\n"),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
