/**
 * Maintains `data/editorial/work-ledger.json`, the progress tracker for
 * `data/editorial/works/<composerId>.json`. This is the only script allowed
 * to add rows to the ledger or change which ids it tracks — a batch only
 * ever flips a row's `status` by hand (or via `--sync`), never adds or
 * removes a row itself. See CONTRIBUTING.md.
 *
 * Usage:
 *   npx tsx scripts/seed/build-work-ledger.ts --stars 3   # open (or top up) a tier
 *   npx tsx scripts/seed/build-work-ledger.ts --sync      # todo -> done from written prose
 *   npx tsx scripts/seed/build-work-ledger.ts --report    # todo counts, by composer, descending
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { WorkEditorial } from "../../src/lib/editorial";

const ROOT = process.cwd();
const LEDGER_PATH = path.join(ROOT, "data", "editorial", "work-ledger.json");
const CORE_WORKS_PATH = path.join(ROOT, "data", "catalog", "core-works.json");
const CATALOG_COMPOSERS_PATH = path.join(ROOT, "data", "catalog", "composers.json");
const WORKS_PATH = path.join(ROOT, "data", "editorial", "works.json");

interface CoreWork {
  id: string;
  composerId: string;
  title: string;
  stars: number;
}

interface CatalogComposer {
  id: string;
  completeName: string;
}

interface LedgerEntry {
  title: string;
  composer: string;
  stars: number;
  status: "todo" | "done" | "skip";
  note?: string;
}

async function loadLedger(): Promise<Record<string, LedgerEntry>> {
  try {
    return JSON.parse(await readFile(LEDGER_PATH, "utf8")) as Record<
      string,
      LedgerEntry
    >;
  } catch {
    return {};
  }
}

async function writeLedger(ledger: Record<string, LedgerEntry>): Promise<void> {
  const sorted = Object.fromEntries(
    Object.entries(ledger).sort(([a], [b]) => Number(a) - Number(b)),
  );
  await writeFile(LEDGER_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
}

function printReport(ledger: Record<string, LedgerEntry>): void {
  const todosByComposer = new Map<string, number>();
  for (const entry of Object.values(ledger)) {
    if (entry.status !== "todo") continue;
    todosByComposer.set(entry.composer, (todosByComposer.get(entry.composer) ?? 0) + 1);
  }
  const sorted = [...todosByComposer.entries()].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((sum, [, n]) => sum + n, 0);

  console.log(`${total} todo across ${sorted.length} composer(s):\n`);
  for (const [composer, count] of sorted) {
    console.log(`  ${String(count).padStart(3)}  ${composer}`);
  }
}

async function syncFromWritten(ledger: Record<string, LedgerEntry>): Promise<number> {
  const written = JSON.parse(await readFile(WORKS_PATH, "utf8")) as Record<
    string,
    WorkEditorial
  >;
  let flips = 0;
  for (const [id, entry] of Object.entries(ledger)) {
    if (entry.status !== "todo") continue;
    const hasContent = Boolean(written[id]?.structure || written[id]?.story);
    if (hasContent) {
      entry.status = "done";
      flips++;
    }
  }
  return flips;
}

async function openTier(stars: number, ledger: Record<string, LedgerEntry>): Promise<void> {
  const coreWorks = JSON.parse(
    await readFile(CORE_WORKS_PATH, "utf8"),
  ) as CoreWork[];
  const composers = JSON.parse(
    await readFile(CATALOG_COMPOSERS_PATH, "utf8"),
  ) as CatalogComposer[];
  const composerById = new Map(composers.map((c) => [c.id, c]));
  const coreWorkById = new Map(coreWorks.map((w) => [w.id, w]));

  const inScope = coreWorks.filter((w) => w.stars >= stars);
  const inScopeIds = new Set(inScope.map((w) => w.id));

  const errors: string[] = [];
  let added = 0;
  let refreshed = 0;

  // Refresh existing rows against the current catalogue. Never delete a row
  // here — a done/skip row that fell out of scope means curation moved
  // under the ledger and needs a human decision, not a silent drop.
  for (const [id, entry] of Object.entries(ledger)) {
    const work = coreWorkById.get(id);
    if (!work) {
      errors.push(
        `${id}: no longer in data/catalog/core-works.json but the ledger has status=${entry.status}`,
      );
      continue;
    }
    if (!inScopeIds.has(id)) {
      if (entry.status === "done" || entry.status === "skip") {
        errors.push(
          `${id}: now ★${work.stars} (below floor ★${stars}) but status is ${entry.status} — resolve by hand`,
        );
      }
      continue;
    }
    const composer = composerById.get(work.composerId);
    const composerName = composer?.completeName ?? entry.composer;
    if (
      entry.title !== work.title ||
      entry.composer !== composerName ||
      entry.stars !== work.stars
    ) {
      entry.title = work.title;
      entry.composer = composerName;
      entry.stars = work.stars;
      refreshed++;
    }
  }

  // Add rows for anything newly in scope.
  for (const work of inScope) {
    if (ledger[work.id]) continue;
    const composer = composerById.get(work.composerId);
    if (!composer) {
      errors.push(`${work.id}: composer ${work.composerId} not in data/catalog/composers.json`);
      continue;
    }
    ledger[work.id] = {
      title: work.title,
      composer: composer.completeName,
      stars: work.stars,
      status: "todo",
    };
    added++;
  }

  if (errors.length > 0) {
    console.error(`${errors.length} problem(s) — resolve by hand before re-running:\n`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  console.log(
    `${added} row(s) added, ${refreshed} row(s) refreshed. Ledger now has ${Object.keys(ledger).length} entries (floor ★${stars}).`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const starsIndex = args.indexOf("--stars");
  const stars = starsIndex >= 0 ? Number(args[starsIndex + 1]) : undefined;
  const sync = args.includes("--sync");
  const report = args.includes("--report");

  const ledger = await loadLedger();

  if (report) {
    printReport(ledger);
    return;
  }

  if (sync) {
    const flips = await syncFromWritten(ledger);
    await writeLedger(ledger);
    console.log(`${flips} row(s) flipped todo → done`);
    return;
  }

  if (stars === undefined || Number.isNaN(stars)) {
    console.error("Usage: build-work-ledger.ts --stars <n> | --sync | --report");
    process.exit(1);
  }

  await openTier(stars, ledger);
  await writeLedger(ledger);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
