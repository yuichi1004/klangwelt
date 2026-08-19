/**
 * Reads and validates `data/relations.json`, the hand-curated composer
 * relationship data (see `CONTRIBUTING.md`) — who taught whom, who
 * influenced whom, and who was a friend, rival, family member or
 * collaborator.
 *
 * Unlike `nationality.ts` (which lands its result on the `Composer` object
 * built by `scripts/seed/build-catalog.ts`) this data feeds nothing else in
 * the catalogue, so it follows `glossary.ts`'s shape instead: a pure
 * validator plus a module-scope import that throws at load time, failing
 * `next build` the same way a bad `data/glossary.json` does. There is no
 * `scripts/seed/relations-files.ts` and no `npm run check:relations` for the
 * same reason `glossary.ts` has neither.
 *
 * Coverage is **not required**: a composer with no entry here simply gets no
 * "関連する作曲家" section, the same graceful degradation the site already
 * applies to missing nationalities and missing editorial. What *is*
 * enforced is that every entry which does exist is structurally sound — a
 * relation naming the wrong composer, or reading the wrong direction, would
 * be a more visible, more embarrassing mistake than no relation at all.
 *
 * This module must never be imported from `./catalog` or anything `catalog`
 * imports — `catalog.ts` builds `composers`, which this module needs as its
 * cross-reference view, so the dependency only runs one way.
 */
import { composers } from "./catalog";
import relationsJson from "@/data/relations.json";

/**
 * The two directional kinds share one rule: `composers[0]` is always the
 * giving/originating side. `teacher`: `composers[0]` taught `composers[1]`.
 * `influence`: `composers[0]` influenced `composers[1]`. The other four are
 * symmetric — order carries no meaning for them.
 */
export const RELATION_TYPES = [
  "teacher",
  "influence",
  "friend",
  "rival",
  "family",
  "collaborator",
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

function isRelationType(value: unknown): value is RelationType {
  return (RELATION_TYPES as readonly unknown[]).includes(value);
}

/**
 * A hard cap on `note`, mirroring `glossary.ts`'s `MAX_SHORT_LENGTH` — same
 * reasoning (a card-sized aside, not a footnote), same numbers, but its own
 * constant: importing `glossary.ts` here would pull its 140+-entry dataset
 * and its own module-load throw into every consumer of this module.
 */
export const MAX_NOTE_LENGTH = { ja: 80, en: 200 } as const;

export interface RelationEntry {
  composers: [string, string];
  type: RelationType;
  note: { ja: string; en: string };
}

/** The slice of the dataset the validator needs to check ids against. */
export interface RelationsCatalogView {
  composers: Array<{ id: string; name: string }>;
}

export interface RelationsResult {
  relations: RelationEntry[];
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Sentinel distinguishing "field present but malformed" (skip the whole
 *  entry, an error was already recorded) from a valid parsed value. */
const INVALID = Symbol("invalid");

function readNote(
  raw: unknown,
  path: string,
  errors: string[],
): { ja: string; en: string } | typeof INVALID {
  if (!isRecord(raw) || !isNonEmptyString(raw.ja) || !isNonEmptyString(raw.en)) {
    errors.push(`${path}.note: must be an object with non-empty "ja" and "en"`);
    return INVALID;
  }
  if (raw.ja.length > MAX_NOTE_LENGTH.ja) {
    errors.push(
      `${path}.note.ja: ${raw.ja.length} characters, over the ${MAX_NOTE_LENGTH.ja}-character limit — keep it to one or two sentences`,
    );
    return INVALID;
  }
  if (raw.en.length > MAX_NOTE_LENGTH.en) {
    errors.push(
      `${path}.note.en: ${raw.en.length} characters, over the ${MAX_NOTE_LENGTH.en}-character limit — keep it to one or two sentences`,
    );
    return INVALID;
  }
  return { ja: raw.ja, en: raw.en };
}

/** A pair of ids, order-independent, used to catch a relation registered
 *  twice — including the same pair in reversed order, or under a different
 *  `type`. See `CONTRIBUTING.md`: a pair may carry only one relation. */
function pairKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

export function loadRelations(source: unknown, view: RelationsCatalogView): RelationsResult {
  const relations: RelationEntry[] = [];
  const errors: string[] = [];

  if (!isRecord(source) || !Array.isArray(source.relations)) {
    errors.push('relations.json: must be an object with a "relations" array');
    return { relations, errors };
  }

  const namesById = new Map(view.composers.map((composer) => [composer.id, composer.name]));
  // Records which earlier array index first claimed a pair, so a later
  // duplicate's error can name it — same idea as `glossary.ts`'s
  // `claimedBy`, keyed by the unordered pair instead of a matched string.
  const claimedBy = new Map<string, number>();

  source.relations.forEach((raw, index) => {
    const path = `relations.json.relations[${index}]`;

    if (!isRecord(raw)) {
      errors.push(`${path}: must be an object with "composers", "names", "type" and "note"`);
      return;
    }

    if (
      !Array.isArray(raw.composers) ||
      raw.composers.length !== 2 ||
      !raw.composers.every(isNonEmptyString)
    ) {
      errors.push(`${path}.composers: must be an array of exactly two composer ids`);
      return;
    }
    const [idA, idB] = raw.composers as [string, string];

    if (
      !Array.isArray(raw.names) ||
      raw.names.length !== 2 ||
      !raw.names.every(isNonEmptyString)
    ) {
      errors.push(
        `${path}.names: must be an array of exactly two names, in the same order as "composers"`,
      );
      return;
    }
    const [nameA, nameB] = raw.names as [string, string];

    if (idA === idB) {
      errors.push(`${path}.composers: "${idA}" is related to itself`);
      return;
    }

    let unknown = false;
    for (const [i, id] of [idA, idB].entries()) {
      if (!namesById.has(id)) {
        errors.push(`${path}.composers[${i}]: no composer with id ${id}`);
        unknown = true;
      }
    }
    if (unknown) return;

    let mismatched = false;
    for (const [i, [id, name]] of [[idA, nameA] as const, [idB, nameB] as const].entries()) {
      const expected = namesById.get(id);
      if (name !== expected) {
        errors.push(`${path}.names[${i}]: "${name}", expected "${expected}"`);
        mismatched = true;
      }
    }
    if (mismatched) return;

    if (!isRelationType(raw.type)) {
      errors.push(
        `${path}.type: "${String(raw.type)}" is not one of ${RELATION_TYPES.join(", ")} (RELATION_TYPES in src/lib/relations.ts)`,
      );
      return;
    }

    const note = readNote(raw.note, path, errors);
    if (note === INVALID) return;

    const key = pairKey(idA, idB);
    const owner = claimedBy.get(key);
    if (owner !== undefined) {
      errors.push(
        `${path}: ${idA} and ${idB} are already related by relations.json.relations[${owner}] — a pair may appear only once, in either order`,
      );
      return;
    }
    claimedBy.set(key, index);

    relations.push({ composers: [idA, idB], type: raw.type, note });
  });

  return { relations, errors };
}

export type RelationDirection = "forward" | "reverse";

export interface RelatedComposer {
  /** The other composer's id — the one to render the card for. */
  composerId: string;
  type: RelationType;
  /** "forward" when the composer being viewed is `composers[0]` (the
   *  giving/originating side for a directional type); "reverse" otherwise.
   *  Meaningless for the four symmetric types, but reported accurately
   *  regardless — callers that need the display label go through
   *  `relationLabelKey`, which is where the symmetric collapse happens. */
  direction: RelationDirection;
  note: { ja: string; en: string };
}

/**
 * Pure: turns the flat edge list into a per-composer adjacency map, each
 * side's relations ordered by `RELATION_TYPES` so same-kind cards group
 * together on the page. Exported so the direction-flipping logic can be
 * tested against synthetic edges, independent of `data/relations.json`.
 */
export function indexRelations(entries: RelationEntry[]): Map<string, RelatedComposer[]> {
  const byComposer = new Map<string, RelatedComposer[]>();

  function push(composerId: string, related: RelatedComposer) {
    const list = byComposer.get(composerId);
    if (list) list.push(related);
    else byComposer.set(composerId, [related]);
  }

  for (const entry of entries) {
    const [a, b] = entry.composers;
    push(a, { composerId: b, type: entry.type, direction: "forward", note: entry.note });
    push(b, { composerId: a, type: entry.type, direction: "reverse", note: entry.note });
  }

  const typeOrder = new Map(RELATION_TYPES.map((type, i) => [type, i]));
  for (const list of byComposer.values()) {
    list.sort((x, y) => typeOrder.get(x.type)! - typeOrder.get(y.type)!);
  }

  return byComposer;
}

/**
 * `messages.composer.relation.*` key for how the *other* composer in a card
 * should be labelled from the viewed composer's side. Symmetric types
 * collapse `forward`/`reverse` to the same key; the two directional types
 * flip: "teacher" viewed from the taught side reads "student" from the
 * teaching side, and vice versa.
 */
export type RelationLabelKey =
  | "teacher"
  | "student"
  | "influencedBy"
  | "influenced"
  | "friend"
  | "rival"
  | "family"
  | "collaborator";

export function relationLabelKey(type: RelationType, direction: RelationDirection): RelationLabelKey {
  if (type === "teacher") return direction === "forward" ? "student" : "teacher";
  if (type === "influence") return direction === "forward" ? "influenced" : "influencedBy";
  return type;
}

const loaded = loadRelations(relationsJson, {
  composers: composers.map((composer) => ({ id: composer.id, name: composer.name })),
});
if (loaded.errors.length > 0) {
  throw new Error(
    `data/relations.json has ${loaded.errors.length} problem(s):\n${loaded.errors
      .map((error) => `  - ${error}`)
      .join("\n")}`,
  );
}

const relationsByComposer = indexRelations(loaded.relations);

/** The validated relations for one composer, already ordered and direction-
 *  normalised — empty for the composers most of the catalogue has no
 *  entries for. */
export function getRelatedComposers(composerId: string): RelatedComposer[] {
  return relationsByComposer.get(composerId) ?? [];
}
