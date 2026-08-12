/**
 * 専門用語 Tips — reads and validates `data/glossary.json`, and turns the
 * result into an annotator that finds those terms inside a block of prose.
 *
 * Unlike `nationality.ts`/`curation.ts`, this data does not need to be
 * cross-referenced against the Open Opus dataset, so there is no
 * `scripts/seed/*.ts` counterpart: the whole module runs at build time
 * (every page here is statically exported), and a malformed
 * `data/glossary.json` throws at module load, failing `next build` the same
 * way a bad `data/curation/**` file fails `npm run seed:catalog`.
 *
 * `loadGlossary`, `buildMatcher` and `createAnnotator` are exported
 * separately and kept pure (no I/O, no module-scope state) so tests can feed
 * them synthetic fixtures without needing real prose to reproduce an edge
 * case like a false-positive substring match.
 */
import glossaryJson from "@/data/glossary.json";
import type { Locale } from "@/i18n/config";

export interface LocalizedText {
  ja: string;
  en: string;
}

export interface GlossaryEntry {
  /** The popup's heading. */
  term: LocalizedText;
  /**
   * The popup's body — one or two sentences, no detailed explanation (see
   * `MAX_SHORT_LENGTH`, and `CONTRIBUTING.md`).
   */
  short: LocalizedText;
  /**
   * The literal strings to look for in prose, per language. Defaults to
   * `[term.ja]` / `[term.en]` when omitted; listing more than one lets an
   * entry cover an inflection ("contrapuntal"), a plural, or a paraphrase
   * ("夜想曲" / "ノクターン") without duplicating the whole entry.
   */
  match: { ja: string[]; en: string[] };
}

export interface GlossaryResult {
  entries: Map<string, GlossaryEntry>;
  errors: string[];
}

/**
 * A hard cap on `short`, not just a style guideline: issue #31 asks for
 * something a newcomer can read at a glance, not a footnote. Measured in
 * `.length` (UTF-16 code units), which slightly overcounts rare astral-plane
 * characters but is exact for both kana/kanji and Latin prose here.
 */
export const MAX_SHORT_LENGTH = { ja: 80, en: 200 } as const;

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

/** Sentinel distinguishing "field present but malformed" (skip the whole
 *  entry, an error was already recorded) from a valid parsed value. */
const INVALID = Symbol("invalid");

function readLocalizedText(
  raw: unknown,
  path: string,
  errors: string[],
): LocalizedText | undefined {
  if (!isRecord(raw) || !isNonEmptyString(raw.ja) || !isNonEmptyString(raw.en)) {
    errors.push(`${path}: must be an object with non-empty "ja" and "en"`);
    return undefined;
  }
  return { ja: raw.ja, en: raw.en };
}

function readMatchList(
  raw: unknown,
  fallback: string,
  path: string,
  errors: string[],
): string[] | typeof INVALID {
  if (raw === undefined) return [fallback];
  if (!Array.isArray(raw) || raw.length === 0 || !raw.every(isNonEmptyString)) {
    errors.push(`${path}: must be a non-empty array of strings`);
    return INVALID;
  }
  return raw;
}

export function loadGlossary(source: unknown): GlossaryResult {
  const entries = new Map<string, GlossaryEntry>();
  const errors: string[] = [];

  if (!isRecord(source)) {
    errors.push("glossary.json: must be an object keyed by term id");
    return { entries, errors };
  }

  // Every (locale, matched string) claimed by more than one id would leave
  // it ambiguous which popup a match should open — checked as entries are
  // parsed, so a later entry can name the earlier one it collides with.
  const claimedBy = new Map<string, string>();

  for (const [id, raw] of Object.entries(source)) {
    if (!isDataKey(id)) continue;
    const path = `glossary.json.${id}`;

    if (!isRecord(raw)) {
      errors.push(`${path}: must be an object with "term" and "short"`);
      continue;
    }

    const term = readLocalizedText(raw.term, `${path}.term`, errors);
    if (!term) continue;

    const short = readLocalizedText(raw.short, `${path}.short`, errors);
    if (!short) continue;
    if (short.ja.length > MAX_SHORT_LENGTH.ja) {
      errors.push(
        `${path}.short.ja: ${short.ja.length} characters, over the ${MAX_SHORT_LENGTH.ja}-character limit — keep it to one or two sentences`,
      );
      continue;
    }
    if (short.en.length > MAX_SHORT_LENGTH.en) {
      errors.push(
        `${path}.short.en: ${short.en.length} characters, over the ${MAX_SHORT_LENGTH.en}-character limit — keep it to one or two sentences`,
      );
      continue;
    }

    if (raw.match !== undefined && !isRecord(raw.match)) {
      errors.push(`${path}.match: must be an object with "ja" and/or "en" arrays`);
      continue;
    }
    const matchRaw = isRecord(raw.match) ? raw.match : {};

    const ja = readMatchList(matchRaw.ja, term.ja, `${path}.match.ja`, errors);
    if (ja === INVALID) continue;
    const en = readMatchList(matchRaw.en, term.en, `${path}.match.en`, errors);
    if (en === INVALID) continue;

    const claims: Array<[Locale, string]> = [
      ...ja.map((text): [Locale, string] => ["ja", text]),
      ...en.map((text): [Locale, string] => ["en", text]),
    ];
    let collided = false;
    for (const [locale, text] of claims) {
      const key = `${locale}:${locale === "en" ? text.toLowerCase() : text}`;
      const owner = claimedBy.get(key);
      if (owner && owner !== id) {
        errors.push(`${path}.match.${locale}: "${text}" is already used by "${owner}"`);
        collided = true;
      }
    }
    if (collided) continue;
    for (const [locale, text] of claims) {
      const key = `${locale}:${locale === "en" ? text.toLowerCase() : text}`;
      claimedBy.set(key, id);
    }

    entries.set(id, { term, short, match: { ja, en } });
  }

  return { entries, errors };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface GlossaryMatcher {
  regex: RegExp;
  /** Maps a matched substring back to the entry id it came from. */
  lookup: (matchedText: string) => string | undefined;
}

/**
 * One regular expression covering every entry's `match` strings for one
 * locale, longest string first.
 *
 * Order is the only lever here: JS regex alternation tries branches
 * left-to-right and stops at the first one that matches at the current
 * position — it does not, unlike POSIX EREs, prefer the longest overall
 * match. Without sorting, `(?:ソナタ|ソナタ形式)` matches "ソナタ形式" as
 * plain "ソナタ" and truncates it. `null` when there is nothing to match, so
 * callers don't build a regex that can never match.
 */
export function buildMatcher(
  entries: Map<string, GlossaryEntry>,
  locale: Locale,
): GlossaryMatcher | null {
  const pairs: Array<{ text: string; id: string }> = [];
  for (const [id, entry] of entries) {
    for (const text of entry.match[locale]) pairs.push({ text, id });
  }
  if (pairs.length === 0) return null;

  pairs.sort((a, b) => b.text.length - a.text.length);

  const lookup = new Map<string, string>();
  for (const { text, id } of pairs) {
    lookup.set(locale === "en" ? text.toLowerCase() : text, id);
  }

  // English needs word boundaries so "mode" cannot match inside "model"; the
  // boundary check is meaningless for Japanese, whose script carries no
  // `\w` characters for `\b` to anchor on (see `src/lib/curation.ts`-style
  // comments elsewhere in this codebase for the same distinction).
  const alternatives = pairs.map(({ text }) =>
    locale === "en" ? `\\b${escapeRegExp(text)}\\b` : escapeRegExp(text),
  );
  const regex = new RegExp(alternatives.join("|"), locale === "en" ? "gi" : "g");

  return {
    regex,
    lookup: (matched) => lookup.get(locale === "en" ? matched.toLowerCase() : matched),
  };
}

export interface GlossarySegment {
  text: string;
  /** Set only on the segment that should render as a Tips trigger. */
  termId?: string;
}

/**
 * Builds a per-page `annotate(text)` function. Call it once per page and
 * feed it every prose block **in reading order** — it remembers which term
 * ids it has already surfaced, across calls, so a word appearing 122 times
 * in one composer's biography still gets underlined only the first time.
 */
export function createAnnotator(
  entries: Map<string, GlossaryEntry>,
  locale: Locale,
): (text: string) => GlossarySegment[] {
  const matcher = buildMatcher(entries, locale);
  const seen = new Set<string>();

  return function annotate(text: string): GlossarySegment[] {
    if (!matcher) return [{ text }];
    matcher.regex.lastIndex = 0;

    const segments: GlossarySegment[] = [];
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = matcher.regex.exec(text))) {
      const matched = match[0];
      const start = match.index;
      const id = matcher.lookup(matched);
      // Every pattern is a non-empty literal, so `lastIndex` always moves
      // forward and this loop terminates regardless of which branch below
      // runs.
      if (id && !seen.has(id)) {
        if (start > cursor) segments.push({ text: text.slice(cursor, start) });
        segments.push({ text: matched, termId: id });
        seen.add(id);
        cursor = start + matched.length;
      }
      // Already shown this page: leave the matched text where it is: it
      // gets folded into the next plain-text slice instead of its own
      // segment, so it renders as ordinary prose.
    }
    if (cursor < text.length) segments.push({ text: text.slice(cursor) });
    return segments.length > 0 ? segments : [{ text }];
  };
}

const loaded = loadGlossary(glossaryJson);
if (loaded.errors.length > 0) {
  throw new Error(
    `data/glossary.json has ${loaded.errors.length} problem(s):\n${loaded.errors
      .map((error) => `  - ${error}`)
      .join("\n")}`,
  );
}

/** The validated, ready-to-use glossary — everything else in this file
 *  exists to make this one thing safely. */
export const glossary = loaded.entries;
