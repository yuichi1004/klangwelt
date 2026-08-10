/**
 * Downloads a structured fact sheet per composer from Wikidata (CC0), so
 * `data/editorial/composers/*.json` can be written from — and machine-checked
 * against — verifiable facts instead of memory.
 *
 * This deliberately fetches no prose. Wikipedia's own article text is CC
 * BY-SA and is used only transiently, at check time, by
 * `check-composer-editorial.ts` — it is never written to disk here. Wikidata
 * claims (birthplace, teachers, students, notable works, ...) are structured
 * data, not creative expression, so redistributing them carries no licence
 * obligation; see `CONTRIBUTING.md`.
 *
 * Run manually: `npm run seed:composer-facts`. Takes several minutes for 220
 * composers because of the pacing below.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ComposerFactSheet } from "../../src/lib/editorial-guard";
import { getJson, sleep, type RawDataset } from "./openopus";

const RAW = path.join(process.cwd(), "data", "raw", "openopus.json");
const OUTPUT = path.join(process.cwd(), "data", "raw", "composer-facts.json");

/** Wikidata asks clients to go easy on the API; `getJson` already identifies
 *  this project via its own `User-Agent` header. */
const REQUEST_INTERVAL_MS = 350;

const api = (base: string, params: Record<string, string>) =>
  `${base}?${new URLSearchParams({ format: "json", ...params })}`;

interface SearchResponse {
  search?: Array<{ id: string }>;
}

interface EntityIdValue {
  "entity-type"?: string;
  id?: string;
}

interface ClaimsResponse {
  claims?: Record<
    string,
    Array<{ mainsnak?: { datavalue?: { value?: EntityIdValue } } }>
  >;
}

interface LabelsResponse {
  entities?: Record<string, { labels?: Record<string, { value?: string }> }>;
}

/**
 * Wikidata property IDs behind each fact-sheet field. `wbgetclaims` is
 * called once per composer with no `property` filter — cheaper than one
 * request per property — and this map picks the ones we want out of the
 * full response.
 */
const SINGLE_VALUE_PROPERTIES = {
  birthPlace: "P19",
  deathPlace: "P20",
} as const;

const LIST_PROPERTIES = {
  teachers: "P1066",
  students: "P802",
  notableWorks: "P800",
  movements: "P135",
  instruments: "P1303",
  occupations: "P106",
  awards: "P166",
  employers: "P108",
  genres: "P136",
} as const;

/** Caps how much of a single composer's article-length claim list is kept. */
const MAX_ITEMS_PER_CATEGORY = 6;

async function findEntity(name: string): Promise<string | undefined> {
  const data = await getJson<SearchResponse>(
    api("https://www.wikidata.org/w/api.php", {
      action: "wbsearchentities",
      language: "en",
      type: "item",
      limit: "1",
      search: name,
    }),
  );
  return data.search?.[0]?.id;
}

async function fetchClaims(
  entityId: string,
): Promise<NonNullable<ClaimsResponse["claims"]>> {
  const data = await getJson<ClaimsResponse>(
    api("https://www.wikidata.org/w/api.php", {
      action: "wbgetclaims",
      entity: entityId,
    }),
  );
  return data.claims ?? {};
}

function entityIdsOf(
  claims: NonNullable<ClaimsResponse["claims"]>,
  property: string,
  limit: number,
): string[] {
  const ids: string[] = [];
  for (const claim of claims[property] ?? []) {
    const id = claim.mainsnak?.datavalue?.value?.id;
    if (id) ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
}

/** Resolves QIDs to English labels, batched 50 at a time, cached across the
 *  whole run since the same movement or instrument recurs across composers. */
async function fetchLabels(
  ids: string[],
  cache: Map<string, string>,
): Promise<void> {
  const uncached = [...new Set(ids)].filter((id) => !cache.has(id));
  for (let i = 0; i < uncached.length; i += 50) {
    const chunk = uncached.slice(i, i + 50);
    const data = await getJson<LabelsResponse>(
      api("https://www.wikidata.org/w/api.php", {
        action: "wbgetentities",
        ids: chunk.join("|"),
        props: "labels",
        languages: "en",
      }),
    );
    for (const id of chunk) {
      cache.set(id, data.entities?.[id]?.labels?.en?.value ?? id);
    }
    await sleep(REQUEST_INTERVAL_MS);
  }
}

async function main() {
  const dataset = JSON.parse(await readFile(RAW, "utf8")) as RawDataset;
  await mkdir(path.dirname(OUTPUT), { recursive: true });

  const labelCache = new Map<string, string>();
  const sheets: ComposerFactSheet[] = [];
  const skipped: Array<{ composer: string; reason: string }> = [];

  for (const [index, composer] of dataset.composers.entries()) {
    const label = `[${index + 1}/${dataset.composers.length}] ${composer.complete_name}`;

    try {
      const entityId = await findEntity(composer.complete_name);
      await sleep(REQUEST_INTERVAL_MS);
      if (!entityId) {
        skipped.push({ composer: composer.complete_name, reason: "no Wikidata entity" });
        console.log(`${label}: no Wikidata entity`);
        continue;
      }

      const claims = await fetchClaims(entityId);
      await sleep(REQUEST_INTERVAL_MS);

      const singleIds = Object.fromEntries(
        Object.entries(SINGLE_VALUE_PROPERTIES).map(([key, property]) => [
          key,
          entityIdsOf(claims, property, 1),
        ]),
      ) as Record<keyof typeof SINGLE_VALUE_PROPERTIES, string[]>;
      const listIds = Object.fromEntries(
        Object.entries(LIST_PROPERTIES).map(([key, property]) => [
          key,
          entityIdsOf(claims, property, MAX_ITEMS_PER_CATEGORY),
        ]),
      ) as Record<keyof typeof LIST_PROPERTIES, string[]>;

      const allIds = [...Object.values(singleIds), ...Object.values(listIds)].flat();
      await fetchLabels(allIds, labelCache);
      // Two statements about the same claim (e.g. a Guggenheim Fellowship
      // awarded twice, with separate qualifiers for each year) resolve to
      // the same label; a fact sheet only needs the distinct set.
      const labelsOf = (ids: string[]) => [
        ...new Set(ids.map((id) => labelCache.get(id) ?? id)),
      ];

      sheets.push({
        composerId: composer.id,
        wikidataId: entityId,
        birthPlace: labelsOf(singleIds.birthPlace)[0],
        deathPlace: labelsOf(singleIds.deathPlace)[0],
        teachers: labelsOf(listIds.teachers),
        students: labelsOf(listIds.students),
        notableWorks: labelsOf(listIds.notableWorks),
        movements: labelsOf(listIds.movements),
        instruments: labelsOf(listIds.instruments),
        occupations: labelsOf(listIds.occupations),
        awards: labelsOf(listIds.awards),
        employers: labelsOf(listIds.employers),
        genres: labelsOf(listIds.genres),
        extraYears: [],
      });
      console.log(`${label}: ok`);
    } catch (error) {
      skipped.push({
        composer: composer.complete_name,
        reason: `error: ${(error as Error).message}`,
      });
      console.log(`${label}: ${(error as Error).message}`);
    }
  }

  sheets.sort((a, b) => Number(a.composerId) - Number(b.composerId));
  await writeFile(OUTPUT, `${JSON.stringify(sheets, null, 1)}\n`);

  console.log(`\n→ ${sheets.length} fact sheets written, ${skipped.length} skipped`);
  for (const entry of skipped) {
    console.log(`   - ${entry.composer}: ${entry.reason}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
