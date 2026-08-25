/**
 * Machine checks that stand between a generated composer note and the
 * repository, so a hallucinated fact or a too-close paraphrase of Wikipedia
 * gets caught before it is committed rather than trusted because it "sounds
 * right". See `CONTRIBUTING.md` for how these are used when writing entries.
 *
 * Everything here is pure and network-free by design: the actual Wikipedia
 * text used for the similarity check must never be committed (that text is
 * CC BY-SA and this project ships none of it), so it can only ever be fetched
 * at check time by `scripts/seed/check-composer-editorial.ts`, never cached
 * as fixture data for a test. What *is* safe to commit and test against is
 * `data/raw/composer-facts.json` (Wikidata, CC0) — see `editorial-guard.test.ts`.
 */

/** Structured, CC0-sourced facts a note's claims can be checked against. */
export interface ComposerFactSheet {
  composerId: string;
  wikidataId?: string;
  birthPlace?: string;
  deathPlace?: string;
  teachers: string[];
  students: string[];
  notableWorks: string[];
  movements: string[];
  instruments: string[];
  occupations: string[];
  awards: string[];
  employers: string[];
  genres: string[];
  /** Years grounded in the source data beyond birth/death, e.g. a notable
   *  work's own inception year if Wikidata has one. Usually empty. */
  extraYears: number[];
}

const FACT_CATEGORIES = [
  "birthPlace",
  "deathPlace",
  "teachers",
  "students",
  "notableWorks",
  "movements",
  "instruments",
  "occupations",
  "awards",
  "employers",
  "genres",
] as const satisfies ReadonlyArray<keyof ComposerFactSheet>;

/**
 * A note needs enough source material to be worth writing at all. Below this,
 * `check-composer-editorial.ts` refuses to proceed rather than let prose fill
 * the gap with invention — the page just shows the existing placeholder.
 */
export const MIN_FACT_CATEGORIES = 3;

export function filledFactCategoryCount(sheet: ComposerFactSheet): number {
  return FACT_CATEGORIES.reduce((count, key) => {
    const value = sheet[key];
    const filled = Array.isArray(value) ? value.length > 0 : Boolean(value);
    return filled ? count + 1 : count;
  }, 0);
}

export function hasEnoughFacts(sheet: ComposerFactSheet): boolean {
  return filledFactCategoryCount(sheet) >= MIN_FACT_CATEGORIES;
}

// ---------------------------------------------------------------------------
// Year gate: every year mentioned in the prose must be traceable to the fact
// sheet or fall inside the composer's own lifespan. Catches invented dates —
// a wrong teacher, a wrong premiere — without needing a fact for every single
// sentence.
// ---------------------------------------------------------------------------

/**
 * Catalogue numbers (BWV 1046, Op. 1067, K. 1080) are frequently
 * four-digit and must not be mistaken for a year. There is no such
 * ambiguity in Japanese prose, where a claimed year is always written
 * with a trailing 年.
 */
const CATALOGUE_PREFIXES = [
  "op",
  "op.",
  "no",
  "no.",
  "k",
  "k.",
  "kv",
  "bwv",
  "hob",
  "hob.",
  "woo",
  "d",
  "d.",
  "rv",
  "s",
  "s.",
  "hwv",
  "tvwv",
];

function isCatalogueContext(text: string, matchStart: number): boolean {
  const before = text.slice(Math.max(0, matchStart - 8), matchStart).toLowerCase();
  return CATALOGUE_PREFIXES.some(
    (prefix) => before.endsWith(prefix) || before.endsWith(`${prefix} `),
  );
}

/** Extracts every 4-digit year the text asserts, in either language. */
export function extractYearClaims(text: string, lang: "ja" | "en"): number[] {
  const years = new Set<number>();

  if (lang === "ja") {
    for (const match of text.matchAll(/(\d{3,4})年/g)) {
      const year = Number(match[1]);
      if (year >= 500 && year <= 2100) years.add(year);
    }
    return [...years];
  }

  for (const match of text.matchAll(/\b(1[0-9]{3}|20[0-2][0-9])s?\b/g)) {
    if (isCatalogueContext(text, match.index)) continue;
    years.add(Number(match[1]));
  }
  return [...years];
}

/**
 * Years the prose claims that the fact sheet cannot vouch for: not the birth
 * or death year, not inside the composer's lifespan, and not one of the
 * sheet's `extraYears`.
 */
export function ungroundedYears(
  text: string,
  lang: "ja" | "en",
  lifespan: { birthYear: number; deathYear: number | null },
  extraYears: number[] = [],
): number[] {
  const lifespanEnd = lifespan.deathYear ?? new Date().getFullYear();
  const known = new Set(extraYears);
  return extractYearClaims(text, lang).filter((year) => {
    if (known.has(year)) return false;
    return year < lifespan.birthYear || year > lifespanEnd;
  });
}

// ---------------------------------------------------------------------------
// Similarity gate: flags prose that shares an implausibly long run with a
// reference text (a Wikipedia extract, fetched by the caller — never stored
// here). A shared proper noun or work title is expected and short; a shared
// sentence fragment is not.
// ---------------------------------------------------------------------------

/** Longest consecutive run of shared tokens; `unit` splits into tokens. */
function longestSharedRun<T>(a: readonly T[], b: readonly T[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  let best = 0;
  let previousRow = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const currentRow = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        currentRow[j] = previousRow[j - 1] + 1;
        if (currentRow[j] > best) best = currentRow[j];
      }
    }
    previousRow = currentRow;
  }
  return best;
}

const tokenizeWords = (text: string): string[] =>
  text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

const tokenizeChars = (text: string): string[] =>
  text.replace(/\s+/g, "").split("");

/** Longest run of shared consecutive words — for English text. */
export function longestSharedWordRun(candidate: string, reference: string): number {
  return longestSharedRun(tokenizeWords(candidate), tokenizeWords(reference));
}

/** Longest run of shared consecutive characters — Japanese has no word
 *  boundaries to tokenize on. */
export function longestSharedCharRun(candidate: string, reference: string): number {
  return longestSharedRun(tokenizeChars(candidate), tokenizeChars(reference));
}

/**
 * Calibrated against the site's own 12 hand-written composer entries via
 * `npm run check:composer-editorial -- --all --calibrate`. The worst
 * incidental overlap found was entirely expected — a cited work title, not a
 * paraphrase:
 *   - ja: 20 chars, Dvořák — 交響曲第9番「新世界より」、弦楽四重奏曲
 *   - en: 6 words, Shostakovich — "lady macbeth of the mtsensk district"
 *     (also 6 words for Takemitsu, on an ordinary descriptive phrase rather
 *     than a title, which is the more realistic ceiling for coincidence)
 * The limits below sit a margin above both, enough to pass another quoted
 * title without passing a paraphrased sentence, which reliably runs longer.
 */
export const SIMILARITY_LIMITS = { en: 9, ja: 24 } as const;

export function checkSimilarity(
  candidate: string,
  reference: string,
  lang: "ja" | "en",
): { longestRun: number; exceeds: boolean } {
  const longestRun =
    lang === "ja"
      ? longestSharedCharRun(candidate, reference)
      : longestSharedWordRun(candidate, reference);
  return { longestRun, exceeds: longestRun > SIMILARITY_LIMITS[lang] };
}

/**
 * Replaces every occurrence of each phrase in `text` with a separator so it
 * cannot contribute to a shared run in `checkSimilarity`. This is the escape
 * hatch for a legitimate, unavoidable overlap — most often a work's own
 * title, which is not copyrightable but can be long enough in Japanese (with
 * no word boundaries) to trip the char-run limit against a composer's own
 * biography article when no dedicated work article exists.
 *
 * Deliberately narrow: callers must enumerate the exact literal string
 * (`data/editorial/work-facts.json`'s `allowedPhrases`), which can whitelist
 * a proper noun but cannot rubber-stamp a paraphrased sentence around it —
 * there is no numeric threshold override anywhere in this module.
 */
export function maskPhrases(text: string, phrases: readonly string[]): string {
  // A non-whitespace placeholder: the char tokenizer only strips whitespace
  // (`\s+`), so a space would vanish and let the characters on either side
  // of the masked phrase become adjacent -- possibly forming a new,
  // unintended shared run right at the seam. U+FFFF ("not a character") is
  // never legitimate prose and is dropped by neither tokenizer, so it always
  // breaks the run without ever matching a reference text.
  const PLACEHOLDER = "\uFFFF";
  let masked = text;
  for (const phrase of phrases) {
    if (!phrase) continue;
    masked = masked.split(phrase).join(PLACEHOLDER.repeat(phrase.length));
  }
  return masked;
}
