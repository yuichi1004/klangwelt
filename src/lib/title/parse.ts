import { CATALOGUE_PREFIXES } from "./dictionary";

export interface ParsedKey {
  /** `C`–`G`, `A`, `B`. */
  pitch: string;
  accidental?: "sharp" | "flat";
  /** Absent when the title writes a bare `in D`, which means D major. */
  mode?: "major" | "minor";
}

export interface ParsedTitle {
  /** Leading form phrase, e.g. `Piano Sonata`. Empty for proper-noun titles. */
  form: string;
  /** The `no. N` that belongs to the form, not to an opus. */
  number?: number;
  key?: ParsedKey;
  /** Catalogue references in source order, e.g. `["op. 27 no. 2"]`. */
  catalogue: string[];
  /** Quoted nickname without the quotes. */
  nickname?: string;
  /** Scoring clause without the leading `for`. */
  instrumentation?: string;
  /**
   * Trailing qualifiers that are neither key, number nor catalogue, such as
   * the `Series 2` of `Slavonic Dances, Series 2, op. 72`. Kept apart from
   * the form so an unknown qualifier cannot block translation of a form we
   * do know.
   */
  qualifiers: string[];
}

const NICKNAME_PATTERN = /["“]([^"”]+)["”]/g;

/**
 * A key must be followed by the end of the title, a comma, or a scoring
 * clause. Without that anchor, an ordinary phrase such as `A Jazz Symphony`
 * would be misread as the key of A.
 */
const KEY_PATTERN =
  /\bin ([A-G])(?:\s+(sharp|flat))?(?:\s+(major|minor))?(?=\s*$|\s*,|\s+for\b)/;

const NUMBER_PATTERN = /\bno\.\s*(\d+)/i;

const STANDALONE_NUMBER_PATTERN = /^no\.\s*(\d+)([a-z]?)$/i;

/**
 * A catalogue segment: a known prefix, then a number that may carry roman
 * numerals, letters or ranges (`Hob.I:45`, `S.160-163`, `op. 27 no. 2`).
 */
const CATALOGUE_PATTERN = new RegExp(
  `^(?:${CATALOGUE_PREFIXES.join("|")})\\.?\\s*[IVXLC]*[:.\\s]?\\d[\\w:./\\-–]*(?:\\s+no\\.\\s*\\d+[a-z]?)?$`,
);

/**
 * Collapses the stray double and trailing spaces present throughout the
 * Open Opus titles, and strips punctuation left behind once a fragment has
 * been cut out.
 */
export function tidy(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:–-]+/, "")
    .replace(/[\s,;:]+$/, "")
    .trim();
}

/**
 * Splits an Open Opus title into its structural parts.
 *
 * Order matters. The nickname goes first because it can contain commas; the
 * key goes next because a scoring clause may follow it (`in D minor for 3
 * Harpsichords`) and would otherwise swallow it; only then is the rest split
 * on commas. Catalogue numbers are claimed before `no. N`, so `op. 27 no. 2`
 * is not misread as "number 2" of the form.
 */
export function parseTitle(title: string): ParsedTitle {
  let working = title.trim();

  let nickname: string | undefined;
  const nicknameMatches = [...working.matchAll(NICKNAME_PATTERN)];
  if (nicknameMatches.length > 0) {
    nickname = nicknameMatches[0][1].trim();
    for (const match of nicknameMatches) {
      working = working.replace(match[0], "");
    }
  }

  let key: ParsedKey | undefined;
  const keyMatch = working.match(KEY_PATTERN);
  if (keyMatch) {
    key = {
      pitch: keyMatch[1],
      accidental: keyMatch[2] as ParsedKey["accidental"],
      mode: keyMatch[3] as ParsedKey["mode"],
    };
    working = working.replace(keyMatch[0], " ");
  }

  const segments = working
    .split(",")
    .map(tidy)
    .filter((segment) => segment.length > 0);

  const catalogue: string[] = [];
  const remainder: string[] = [];
  let numberValue: number | undefined;

  for (const segment of segments) {
    if (CATALOGUE_PATTERN.test(segment)) {
      catalogue.push(segment);
      continue;
    }

    const standaloneNumber = segment.match(STANDALONE_NUMBER_PATTERN);
    if (standaloneNumber) {
      const [, digits, suffix] = standaloneNumber;
      if (catalogue.length > 0) {
        // `op. 6, no. 1` — the number qualifies the opus, not the work.
        catalogue[catalogue.length - 1] += ` no. ${digits}${suffix}`;
      } else {
        numberValue ??= Number(digits);
      }
      continue;
    }

    remainder.push(segment);
  }

  // The scoring clause can span several comma-delimited segments
  // (`Quartet for flute, viola da gamba, bassoon and continuo`), so rejoin
  // what is left before separating it out.
  let rest = remainder.join(", ");
  let instrumentation: string | undefined;
  const scoring = rest.match(/\bfor\s+(.+)$/i);
  if (scoring) {
    instrumentation = tidy(scoring[1]);
    rest = tidy(rest.slice(0, scoring.index));
  }

  const [headSegment = "", ...qualifiers] = rest
    .split(",")
    .map(tidy)
    .filter((segment) => segment.length > 0);

  let head = headSegment;
  const numberInHead = head.match(NUMBER_PATTERN);
  if (numberInHead) {
    numberValue ??= Number(numberInHead[1]);
    head = tidy(head.replace(numberInHead[0], " "));
  }

  return {
    form: tidy(head),
    number: numberValue,
    key,
    catalogue,
    nickname,
    instrumentation,
    qualifiers,
  };
}
