/**
 * Reads and validates `data/media.json`, the hand-curated record of which
 * films, anime, and TV productions used a work (see `CONTRIBUTING.md`).
 *
 * One flat file, work id → appearances — the same shape as
 * `data/nationalities.json`, for the same reason: entries are sparse (a
 * few dozen of the catalogue's 1,321 core works) and there is no ordering
 * to preserve for review, so a plain object keyed by id is enough.
 *
 * The catalogue's unit is "work" (a symphony, a requiem, a suite), but the
 * cue a film uses is very often one movement or a short excerpt of it —
 * "Clair de lune" is the third movement of the *Suite bergamasque*, the
 * "Ride of the Valkyries" is a few minutes inside the whole opera *Die
 * Walküre*. Rather than inventing a movement-level id, an appearance is
 * attached to the parent work and `note` says which part is used and how —
 * see `CONTRIBUTING.md` for real examples. This is why `note` matters more
 * here than the optional free-text fields elsewhere in this codebase.
 *
 * Coverage is **not required**, matching `nationality.ts`: a work with no
 * entry here just shows no section. What *is* enforced is that every entry
 * which does exist is structurally sound, and that it points at a work
 * that actually has a detail page to show it on (see `build-catalog.ts`).
 *
 * This module is pure, mirroring `nationality.ts`/`curation.ts`: it takes
 * parsed JSON and a minimal view of the dataset and returns a lookup map
 * plus a list of problems. The file I/O lives in
 * `scripts/seed/media-files.ts`.
 */
import { tidy } from "./title/parse";

export const MEDIA_KINDS = ["film", "anime", "tv"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const MEDIA_KIND_LABELS: Record<MediaKind, { ja: string; en: string }> = {
  film: { ja: "映画", en: "Film" },
  anime: { ja: "アニメ", en: "Anime" },
  tv: { ja: "テレビ", en: "TV" },
};

export function isMediaKind(value: unknown): value is MediaKind {
  return (MEDIA_KINDS as readonly unknown[]).includes(value);
}

export interface MediaAppearance {
  title: { ja: string; en: string };
  /** Release year, used to disambiguate same-titled works and shown on the
   *  work detail page. */
  year: number;
  kind: MediaKind;
  /** Which part of the work is used, and how — see the module doc. Both
   *  languages required when present; half-translated data never ships. */
  note?: { ja: string; en: string };
}

/** The slice of the dataset the validator needs to check work ids against.
 *  `toCurationView(dataset).works` (`scripts/seed/curation-files.ts`)
 *  already has this shape and more, so callers can pass it directly. */
export interface MediaCatalogView {
  works: Array<{ id: string; title: string }>;
}

export interface MediaResult {
  media: Map<string, MediaAppearance[]>;
  errors: string[];
}

const CURRENT_YEAR = new Date().getFullYear();
/** Cinema's own start; nothing scored for the screen predates this. */
const EARLIEST_YEAR = 1890;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** `_comment` and friends are documentation, matching `composer-stars.json`
 *  and `nationalities.json`. */
function isDataKey(key: string): boolean {
  return !key.startsWith("_");
}

function readLocalizedText(
  raw: unknown,
  path: string,
  errors: string[],
): { ja: string; en: string } | undefined {
  if (!isRecord(raw) || !isNonEmptyString(raw.ja) || !isNonEmptyString(raw.en)) {
    errors.push(`${path}: must be an object with non-empty "ja" and "en"`);
    return undefined;
  }
  return { ja: raw.ja, en: raw.en };
}

/** Sentinel distinguishing "field present but malformed" (skip the whole
 *  entry, an error was already recorded) from "not given at all". */
const INVALID = Symbol("invalid");

function readNote(
  raw: unknown,
  path: string,
  errors: string[],
): { ja: string; en: string } | undefined | typeof INVALID {
  if (raw === undefined) return undefined;
  const note = readLocalizedText(raw, `${path}.note`, errors);
  return note ?? INVALID;
}

function readAppearance(
  raw: unknown,
  path: string,
  errors: string[],
): MediaAppearance | typeof INVALID {
  if (!isRecord(raw)) {
    errors.push(`${path}: must be an object with "title", "year", and "kind"`);
    return INVALID;
  }

  const title = readLocalizedText(raw.title, `${path}.title`, errors);
  if (!title) return INVALID;

  if (
    typeof raw.year !== "number" ||
    !Number.isInteger(raw.year) ||
    raw.year < EARLIEST_YEAR ||
    raw.year > CURRENT_YEAR + 1
  ) {
    errors.push(
      `${path}.year: "${String(raw.year)}" must be an integer between ${EARLIEST_YEAR} and ${CURRENT_YEAR + 1}`,
    );
    return INVALID;
  }

  if (!isMediaKind(raw.kind)) {
    errors.push(
      `${path}.kind: "${String(raw.kind)}" is not one of ${MEDIA_KINDS.join(", ")} (src/lib/media.ts)`,
    );
    return INVALID;
  }

  const note = readNote(raw.note, path, errors);
  if (note === INVALID) return INVALID;

  return { title, year: raw.year, kind: raw.kind, note };
}

export function loadMedia(source: unknown, view: MediaCatalogView): MediaResult {
  const media = new Map<string, MediaAppearance[]>();
  const errors: string[] = [];

  if (!isRecord(source)) {
    errors.push("media.json: must be an object keyed by work id");
    return { media, errors };
  }

  const titlesById = new Map(view.works.map((work) => [work.id, work.title]));

  for (const [id, raw] of Object.entries(source)) {
    if (!isDataKey(id)) continue;
    const path = `media.json.${id}`;

    const expectedTitle = titlesById.get(id);
    if (expectedTitle === undefined) {
      errors.push(`${path}: no work with id ${id}`);
      continue;
    }
    if (!isRecord(raw)) {
      errors.push(`${path}: must be an object with "work" and "media"`);
      continue;
    }

    // The title is an echo, not data — same reasoning as
    // `composer-stars.json` and `data/curation/works/*.json`: it turns a
    // mistyped id into a loud failure instead of a silently orphaned entry.
    // Both sides are tidied before comparing, exactly like
    // `curation.ts`'s `readWorkStars`: the raw Open Opus title can carry
    // stray whitespace that never reaches the UI, and authors write the
    // clean title they see there, not the raw one.
    if (tidy(String(raw.work ?? "")) !== tidy(expectedTitle)) {
      errors.push(`${path}: work is "${String(raw.work)}", expected "${tidy(expectedTitle)}"`);
      continue;
    }

    if (!Array.isArray(raw.media) || raw.media.length === 0) {
      errors.push(`${path}.media: must be a non-empty array`);
      continue;
    }

    const appearances: MediaAppearance[] = [];
    let invalid = false;
    raw.media.forEach((entry, index) => {
      const appearance = readAppearance(entry, `${path}.media[${index}]`, errors);
      if (appearance === INVALID) {
        invalid = true;
        return;
      }
      appearances.push(appearance);
    });
    if (invalid) continue;

    media.set(id, appearances);
  }

  return { media, errors };
}
