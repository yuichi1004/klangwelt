/**
 * Downloads composer portraits from Wikimedia Commons and records the
 * provenance of every single one in `data/portraits.json`.
 *
 * Deliberately does NOT use the `portrait` URLs Open Opus returns: that
 * project publishes no per-image licence, and a third of its composers died
 * after 1955, so redistributing those files would be a copyright gamble.
 * Here each candidate is resolved through Wikidata's P18 ("image") property
 * and only kept when Commons reports a licence on the allow-list.
 *
 * Run manually: `npm run seed:portraits`.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import {
  isAllowedImageLicence,
  normalizeAuthor,
  type PortraitCredit,
} from "../../src/lib/licenses";
import { getJson, sleep, type RawComposer, type RawDataset } from "./openopus";

const RAW = path.join(process.cwd(), "data", "raw", "openopus.json");
const OUTPUT = path.join(process.cwd(), "data", "portraits.json");
const IMAGE_DIR = path.join(process.cwd(), "public", "portraits");

/** Wikimedia asks clients to identify themselves and to go easy on the API. */
const USER_AGENT =
  "klangwelt/0.1 (https://github.com/yuichi1004/klangwelt; yuichi1004@gmail.com)";
const REQUEST_INTERVAL_MS = 350;

/**
 * Commons rounds thumbnails up to standard buckets (asking for 600px yields
 * a 960px file) and keeps the source format, so a PNG stays a multi-megabyte
 * PNG. We therefore request a bucket comfortably above what we need and
 * re-encode locally to a fixed width.
 */
const COMMONS_THUMB_WIDTH = 600;

/**
 * Stored width. Only ever rendered at ~160-320 CSS px, so 400 covers retina.
 * Scaling is the only transform applied: cropping or recolouring a CC BY-SA
 * portrait would create an adaptation and trigger the share-alike term.
 */
const STORED_WIDTH = 400;

interface SearchResponse {
  search?: Array<{ id: string; label?: string; description?: string }>;
}

interface ClaimsResponse {
  claims?: {
    P18?: Array<{ mainsnak?: { datavalue?: { value?: string } } }>;
  };
}

interface ImageInfoResponse {
  query?: {
    pages?: Record<
      string,
      {
        title?: string;
        missing?: string;
        imageinfo?: Array<{
          thumburl?: string;
          descriptionurl?: string;
          extmetadata?: Record<string, { value?: string }>;
        }>;
      }
    >;
  };
}

const api = (base: string, params: Record<string, string>) =>
  `${base}?${new URLSearchParams({ format: "json", ...params })}`;

const stripHtml = (value: string | undefined) =>
  (value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Resolves a composer to their Wikidata entity id. */
async function findEntity(composer: RawComposer): Promise<string | undefined> {
  const url = api("https://www.wikidata.org/w/api.php", {
    action: "wbsearchentities",
    language: "en",
    type: "item",
    limit: "1",
    search: composer.complete_name,
  });
  const data = await getJson<SearchResponse>(url);
  return data.search?.[0]?.id;
}

/** Reads the canonical portrait (P18) off a Wikidata entity. */
async function findPortraitFile(entityId: string): Promise<string | undefined> {
  const url = api("https://www.wikidata.org/w/api.php", {
    action: "wbgetclaims",
    entity: entityId,
    property: "P18",
  });
  const data = await getJson<ClaimsResponse>(url);
  return data.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
}

interface CommonsFile {
  thumbUrl: string;
  descriptionUrl: string;
  author: string;
  license: string;
  licenseUrl: string;
}

/** Fetches licence metadata for a Commons file, or undefined if unusable. */
async function describeCommonsFile(
  fileName: string,
): Promise<CommonsFile | undefined> {
  const url = api("https://commons.wikimedia.org/w/api.php", {
    action: "query",
    titles: `File:${fileName}`,
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: String(COMMONS_THUMB_WIDTH),
  });
  const data = await getJson<ImageInfoResponse>(url);
  const page = Object.values(data.query?.pages ?? {})[0];
  // `missing` means the file lives on a local wiki, not Commons — which for
  // modern composers usually signals a non-free fair-use upload.
  if (!page || page.missing !== undefined) return undefined;

  const info = page.imageinfo?.[0];
  const meta = info?.extmetadata ?? {};
  if (!info?.thumburl) return undefined;

  return {
    thumbUrl: info.thumburl,
    descriptionUrl: info.descriptionurl ?? "",
    author: normalizeAuthor(stripHtml(meta.Artist?.value)),
    license: (meta.LicenseShortName?.value ?? "").trim(),
    licenseUrl: (meta.LicenseUrl?.value ?? "").trim(),
  };
}

/** Downloads and re-encodes to a uniform, web-sized JPEG. */
async function downloadPortrait(
  url: string,
  destination: string,
): Promise<void> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);

  const source = Buffer.from(await response.arrayBuffer());
  await sharp(source)
    .resize({ width: STORED_WIDTH, withoutEnlargement: true })
    // Commons serves PNGs with alpha; flatten onto white before encoding.
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 82, progressive: true })
    .toFile(destination);
}

async function main() {
  const dataset = JSON.parse(await readFile(RAW, "utf8")) as RawDataset;

  await mkdir(IMAGE_DIR, { recursive: true });

  const credits: PortraitCredit[] = [];
  const skipped: Array<{ composer: string; reason: string }> = [];

  for (const [index, composer] of dataset.composers.entries()) {
    const position = `${index + 1}/${dataset.composers.length}`;
    const label = `[${position}] ${composer.complete_name}`;

    try {
      const entityId = await findEntity(composer);
      await sleep(REQUEST_INTERVAL_MS);
      if (!entityId) {
        skipped.push({ composer: composer.complete_name, reason: "no Wikidata entity" });
        console.log(`${label}: no Wikidata entity`);
        continue;
      }

      const fileName = await findPortraitFile(entityId);
      await sleep(REQUEST_INTERVAL_MS);
      if (!fileName) {
        skipped.push({ composer: composer.complete_name, reason: "no P18 image" });
        console.log(`${label}: no portrait on Wikidata`);
        continue;
      }

      const file = await describeCommonsFile(fileName);
      await sleep(REQUEST_INTERVAL_MS);
      if (!file) {
        skipped.push({ composer: composer.complete_name, reason: "not hosted on Commons" });
        console.log(`${label}: not on Commons`);
        continue;
      }

      if (!isAllowedImageLicence(file.license)) {
        skipped.push({
          composer: composer.complete_name,
          reason: `licence not allowed: ${file.license || "unknown"}`,
        });
        console.log(`${label}: REJECTED licence "${file.license || "unknown"}"`);
        continue;
      }

      const relative = `/portraits/${composer.id}.jpg`;
      await downloadPortrait(
        file.thumbUrl,
        path.join(IMAGE_DIR, `${composer.id}.jpg`),
      );
      await sleep(REQUEST_INTERVAL_MS);

      credits.push({
        composerId: composer.id,
        file: relative,
        commonsFile: fileName,
        author: file.author,
        license: file.license,
        licenseUrl: file.licenseUrl,
        sourceUrl:
          file.descriptionUrl ||
          `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName)}`,
      });
      console.log(`${label}: ${file.license}`);
    } catch (error) {
      skipped.push({
        composer: composer.complete_name,
        reason: `error: ${(error as Error).message}`,
      });
      console.log(`${label}: ${(error as Error).message}`);
    }
  }

  credits.sort((a, b) => Number(a.composerId) - Number(b.composerId));
  await writeFile(OUTPUT, `${JSON.stringify(credits, null, 1)}\n`);

  console.log(`\n→ ${credits.length} portraits kept, ${skipped.length} skipped`);
  for (const entry of skipped) {
    console.log(`   - ${entry.composer}: ${entry.reason}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
