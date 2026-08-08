import {
  ACCIDENTALS,
  COMPOUND_FORMS,
  FORMS,
  INSTRUMENTS,
  MODES,
  MODIFIERS,
  NICKNAMES,
  PITCH_CLASSES,
} from "./dictionary";
import { parseTitle, tidy, type ParsedKey, type ParsedTitle } from "./parse";

export interface TranslatedTitle {
  text: string;
  /**
   * False when the form could not be rendered in Japanese and `text` is the
   * untouched original. Callers use this to decide whether to also show the
   * English title, and the seed script uses it to report coverage.
   */
  translated: boolean;
}

/** Words that can appear inside a scoring clause, e.g. `violin and orchestra`. */
const ENSEMBLE_WORDS: Record<string, string> = {
  orchestra: "管弦楽",
  "string orchestra": "弦楽合奏",
  "chamber orchestra": "室内管弦楽",
  strings: "弦楽",
  "wind band": "吹奏楽",
  band: "吹奏楽",
  choir: "合唱",
  chorus: "合唱",
  voice: "声楽",
  soprano: "ソプラノ",
  alto: "アルト",
  tenor: "テノール",
  bass: "バス",
  baritone: "バリトン",
  "solo violin": "無伴奏ヴァイオリン",
  "solo cello": "無伴奏チェロ",
  "wind instruments": "管楽器",
  "wind quintet": "木管五重奏",
  ensemble: "アンサンブル",
};

const lower = (value: string) => value.toLowerCase();

/** Lookup that ignores case, since the data mixes `grosso` and `Grosso`. */
function lookup(
  table: Record<string, string>,
  term: string,
): string | undefined {
  if (table[term]) return table[term];
  const needle = lower(term);
  for (const [key, value] of Object.entries(table)) {
    if (lower(key) === needle) return value;
  }
  return undefined;
}

export function translateKey(key: ParsedKey): string {
  const pitch = PITCH_CLASSES[key.pitch];
  if (!pitch) return "";
  const accidental = key.accidental ? ACCIDENTALS[key.accidental] : "";
  // A bare `in D` means D major by long-standing convention.
  const mode = MODES[key.mode ?? "major"];
  return `${accidental}${pitch}${mode}`;
}

/**
 * `op. 27 no. 2` → `作品27-2`; other catalogues keep their Latin sigla but
 * get a normalised space (`BWV.1063` → `BWV 1063`).
 */
export function translateCatalogue(entry: string): string {
  const opus = entry.match(/^op\.?\s*(\d+)(?:\s*no\.\s*(\d+)([a-z]?))?$/i);
  if (opus) {
    const [, number, sub, suffix] = opus;
    return sub ? `作品${number}-${sub}${suffix ?? ""}` : `作品${number}`;
  }
  return entry.replace(/^([A-Za-z]+)\.\s*/, "$1 ");
}

function translateInstrumentation(clause: string): string | undefined {
  const parts = clause
    .split(/\s*(?:,|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;

  const translated: string[] = [];
  for (const part of parts) {
    // Strip an article or a count: `3 Harpsichords` → `Harpsichords`.
    const counted = part.match(/^(\d+)\s+(.*)$/);
    const bare = (counted ? counted[2] : part).replace(/^(the|a|an)\s+/i, "");
    const singular = bare.replace(/s$/i, "");

    const word =
      lookup(ENSEMBLE_WORDS, bare) ??
      lookup(ENSEMBLE_WORDS, singular) ??
      lookup(INSTRUMENTS, bare) ??
      lookup(INSTRUMENTS, singular);
    if (!word) return undefined;

    translated.push(counted ? `${counted[1]}台の${word}` : word);
  }
  return translated.join("と");
}

/**
 * Renders the leading form phrase. Returns undefined when any word is
 * unknown, which keeps proper-noun titles (operas, tone poems, foreign
 * originals) from being mangled into a half-translation.
 */
export function translateForm(form: string): string | undefined {
  const phrase = form.trim();
  if (!phrase) return undefined;

  const compound = lookup(COMPOUND_FORMS, phrase);
  if (compound) return compound;

  // A leading count, e.g. `5 Pieces` → `5つの小品`.
  const counted = phrase.match(/^(\d+)\s+(.+)$/);
  if (counted) {
    const inner = translateForm(counted[2].replace(/s$/i, ""));
    if (!inner) return undefined;
    // The `つ` counter only exists up to nine; beyond that Japanese drops it
    // (`12の練習曲`, not `12つの練習曲`).
    const count = Number(counted[1]);
    return `${counted[1]}${count <= 9 ? "つの" : "の"}${inner}`;
  }

  const words = phrase.split(/\s+/);
  const base = lookup(FORMS, words[words.length - 1]);
  if (!base) return undefined;

  const prefixes: string[] = [];
  for (const word of words.slice(0, -1)) {
    const rendered = lookup(INSTRUMENTS, word) ?? lookup(MODIFIERS, word);
    if (!rendered) return undefined;
    prefixes.push(rendered);
  }

  return `${prefixes.join("")}${base}`;
}

export function translateNickname(nickname: string): string {
  return lookup(NICKNAMES, nickname) ?? nickname;
}

/**
 * Assembles a Japanese title in the usual Japanese order:
 * `交響曲第5番 ハ短調 作品67「運命」`.
 */
export function composeJapaneseTitle(
  parsed: ParsedTitle,
  original: string,
): TranslatedTitle {
  let form = translateForm(parsed.form);
  if (!form) return { text: tidy(original), translated: false };

  if (parsed.instrumentation) {
    const scoring = translateInstrumentation(parsed.instrumentation);
    if (scoring) form = `${scoring}のための${form}`;
  }

  const segments: string[] = [
    parsed.number === undefined ? form : `${form}第${parsed.number}番`,
  ];

  if (parsed.key) {
    const key = translateKey(parsed.key);
    if (key) segments.push(key);
  }

  // Qualifiers we have no rule for are carried over verbatim rather than
  // dropped, so no information is lost from the original title.
  segments.push(...parsed.qualifiers);

  for (const entry of parsed.catalogue) {
    segments.push(translateCatalogue(entry));
  }

  let text = segments.join(" ");
  if (parsed.nickname) text += `「${translateNickname(parsed.nickname)}」`;

  return { text, translated: true };
}

/**
 * Japanese title for a work, or the original English when the title is a
 * proper noun we have no rule for. `override` comes from the hand-written
 * `data/ja/title-overrides.json` and always wins.
 */
export function toJapaneseTitle(
  title: string,
  override?: string,
): TranslatedTitle {
  if (override) return { text: override, translated: true };
  return composeJapaneseTitle(parseTitle(title), title);
}
