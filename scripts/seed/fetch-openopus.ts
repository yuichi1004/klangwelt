/**
 * Fetches the Open Opus catalogue into `data/raw/openopus.json`.
 *
 * Run manually (`npm run seed:openopus`) — never at build time. Committing the
 * raw response keeps `next build` free of external dependencies, so a build
 * cannot fail because of an upstream outage or rate limit.
 *
 * We cannot use `/work/dump.json`: it omits the `id` field on both composers
 * and works, so the per-epoch and per-composer endpoints are the only source
 * of stable identifiers.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  EPOCHS,
  getJson,
  sleep,
  type RawComposer,
  type RawDataset,
  type RawWork,
} from "./openopus";

const RAW_DIR = path.join(process.cwd(), "data", "raw");
const OUTPUT = path.join(RAW_DIR, "openopus.json");

/** Pause between API calls. Open Opus starts refusing requests below this. */
const REQUEST_INTERVAL_MS = 250;

interface ComposerListResponse {
  composers?: RawComposer[];
}

interface WorkListResponse {
  works?: RawWork[];
}

async function fetchComposers(): Promise<RawComposer[]> {
  const byId = new Map<string, RawComposer>();

  for (const epoch of EPOCHS) {
    const url = `https://api.openopus.org/composer/list/epoch/${encodeURIComponent(epoch)}.json`;
    const data = await getJson<ComposerListResponse>(url);
    const composers = data.composers ?? [];

    for (const composer of composers) {
      // The epoch endpoint is authoritative for `epoch`; keep it explicitly so
      // a composer listed under several endpoints cannot end up inconsistent.
      byId.set(composer.id, { ...composer, epoch });
    }

    console.log(`  ${epoch}: ${composers.length} composers`);
    await sleep(REQUEST_INTERVAL_MS);
  }

  // The epoch endpoints omit `popular`, so take that flag from the dedicated
  // popular list. Without it every composer would look equally prominent.
  const popular = await getJson<ComposerListResponse>(
    "https://api.openopus.org/composer/list/pop.json",
  );
  for (const composer of popular.composers ?? []) {
    const existing = byId.get(composer.id);
    if (existing) existing.popular = "1";
  }
  console.log(`  popular list: ${popular.composers?.length ?? 0} composers`);

  return [...byId.values()].sort((a, b) =>
    a.complete_name.localeCompare(b.complete_name),
  );
}

async function fetchWorks(
  composers: RawComposer[],
): Promise<Record<string, RawWork[]>> {
  const works: Record<string, RawWork[]> = {};

  for (const [index, composer] of composers.entries()) {
    const url = `https://api.openopus.org/work/list/composer/${composer.id}/genre/all.json`;
    const data = await getJson<WorkListResponse>(url);
    works[composer.id] = data.works ?? [];

    const position = `${index + 1}/${composers.length}`;
    console.log(
      `  [${position}] ${composer.complete_name}: ${works[composer.id].length} works`,
    );
    await sleep(REQUEST_INTERVAL_MS);
  }

  return works;
}

async function main() {
  console.log("Fetching composers by epoch…");
  const composers = await fetchComposers();
  console.log(`→ ${composers.length} composers\n`);

  console.log("Fetching works per composer…");
  const works = await fetchWorks(composers);

  const total = Object.values(works).reduce((sum, list) => sum + list.length, 0);
  const core = Object.values(works)
    .flat()
    .filter((work) => work.popular === "1" || work.recommended === "1").length;

  const dataset: RawDataset = {
    fetchedAt: new Date().toISOString(),
    composers,
    works,
  };

  await mkdir(RAW_DIR, { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(dataset, null, 1)}\n`);

  console.log(
    `\n→ ${total} works (${core} popular/recommended) written to ${path.relative(process.cwd(), OUTPUT)}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
