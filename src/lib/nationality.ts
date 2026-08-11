/**
 * Reads and validates `data/nationalities.json`, the hand-curated composer
 * nationality data (see `CONTRIBUTING.md`).
 *
 * One flat file, id → entry — unlike `composer-stars.json` this needs no
 * star-style grouping (there is no ordering to preserve for review), so a
 * plain object keyed by composer id is enough, the same shape as
 * `data/ja/composer-names.json`.
 *
 * Unlike 定番度, coverage is **not required**: a composer with no entry here
 * simply shows no flag, the same graceful-degradation the site already
 * applies to missing portraits (`ComposerPortrait`) and missing editorial
 * (`getComposerEditorial`). What *is* enforced is that every entry which does
 * exist is structurally sound — a wrong flag next to a composer's name would
 * be a more visible, more embarrassing mistake than no flag at all.
 *
 * This module is pure, mirroring `curation.ts`: it takes parsed JSON and a
 * minimal view of the dataset and returns a lookup map plus a list of
 * problems. The file I/O lives in `scripts/seed/nationality-files.ts`.
 */
import { isCountryCode, type CountryCode } from "./countries";

export interface NationalityEntry {
  country: CountryCode;
  /** Free-text explanation for dual/multiple nationality, shown on the
   *  composer's profile page underneath the flag. Both languages required
   *  when present — half-translated data never ships (see `editorial.ts`). */
  note?: { ja: string; en: string };
}

/** The slice of the dataset the validator needs to check ids against. */
export interface NationalityCatalogView {
  composers: Array<{ id: string; name: string }>;
}

export interface NationalityResult {
  nationalities: Map<string, NationalityEntry>;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** `_comment` and friends are documentation, matching `title-overrides.json`
 *  and `composer-stars.json`. */
function isDataKey(key: string): boolean {
  return !key.startsWith("_");
}

/** `undefined` return with no error pushed means "no note given"; a `null`
 *  sentinel return means "given but invalid" so the caller can skip the
 *  entry instead of silently dropping just the bad note. */
const INVALID_NOTE = null;

function readNote(
  raw: unknown,
  path: string,
  errors: string[],
): { ja: string; en: string } | undefined | typeof INVALID_NOTE {
  if (raw === undefined) return undefined;
  if (!isRecord(raw) || !isNonEmptyString(raw.ja) || !isNonEmptyString(raw.en)) {
    errors.push(`${path}.note: must be an object with non-empty "ja" and "en"`);
    return INVALID_NOTE;
  }
  return { ja: raw.ja, en: raw.en };
}

export function loadNationalities(
  source: unknown,
  view: NationalityCatalogView,
): NationalityResult {
  const nationalities = new Map<string, NationalityEntry>();
  const errors: string[] = [];

  if (!isRecord(source)) {
    errors.push("nationalities.json: must be an object keyed by composer id");
    return { nationalities, errors };
  }

  const namesById = new Map(view.composers.map((composer) => [composer.id, composer.name]));

  for (const [id, raw] of Object.entries(source)) {
    if (!isDataKey(id)) continue;
    const path = `nationalities.json.${id}`;
    const expectedName = namesById.get(id);
    if (expectedName === undefined) {
      errors.push(`${path}: no composer with id ${id}`);
      continue;
    }
    if (!isRecord(raw)) {
      errors.push(`${path}: must be an object with "name" and "country"`);
      continue;
    }

    // The name is an echo, not data — same reasoning as
    // `composer-stars.json`: it turns a mistyped id into a loud failure
    // instead of a silently wrong flag.
    if (raw.name !== expectedName) {
      errors.push(`${path}: name is "${String(raw.name)}", expected "${expectedName}"`);
      continue;
    }

    if (typeof raw.country !== "string" || !isCountryCode(raw.country)) {
      errors.push(
        `${path}: country "${String(raw.country)}" is not in COUNTRY_LABELS (src/lib/countries.ts)`,
      );
      continue;
    }

    const note = readNote(raw.note, path, errors);
    if (note === INVALID_NOTE) continue;
    nationalities.set(id, { country: raw.country, note });
  }

  return { nationalities, errors };
}
