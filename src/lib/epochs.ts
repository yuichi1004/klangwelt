/**
 * Open Opus' epoch and genre vocabularies, with their Japanese labels and
 * the approximate year ranges shown next to each period.
 */

export const EPOCHS = [
  "Medieval",
  "Renaissance",
  "Baroque",
  "Classical",
  "Early Romantic",
  "Romantic",
  "Late Romantic",
  "20th Century",
  "Post-War",
  "21st Century",
] as const;

export type Epoch = (typeof EPOCHS)[number];

export const GENRES = [
  "Orchestral",
  "Keyboard",
  "Chamber",
  "Stage",
  "Vocal",
] as const;

export type Genre = (typeof GENRES)[number];

export const EPOCH_LABELS: Record<Epoch, { ja: string; en: string }> = {
  Medieval: { ja: "中世", en: "Medieval" },
  Renaissance: { ja: "ルネサンス", en: "Renaissance" },
  Baroque: { ja: "バロック", en: "Baroque" },
  Classical: { ja: "古典派", en: "Classical" },
  "Early Romantic": { ja: "初期ロマン派", en: "Early Romantic" },
  Romantic: { ja: "ロマン派", en: "Romantic" },
  "Late Romantic": { ja: "後期ロマン派", en: "Late Romantic" },
  "20th Century": { ja: "20世紀", en: "20th Century" },
  "Post-War": { ja: "戦後", en: "Post-War" },
  "21st Century": { ja: "21世紀", en: "21st Century" },
};

/** Rough boundaries, used only for the caption under each period name. */
export const EPOCH_YEARS: Record<Epoch, string> = {
  Medieval: "-1400",
  Renaissance: "1400-1600",
  Baroque: "1600-1750",
  Classical: "1750-1820",
  "Early Romantic": "1800-1850",
  Romantic: "1815-1900",
  "Late Romantic": "1850-1920",
  "20th Century": "1900-1945",
  "Post-War": "1945-2000",
  "21st Century": "2000-",
};

export const GENRE_LABELS: Record<Genre, { ja: string; en: string }> = {
  Orchestral: { ja: "管弦楽", en: "Orchestral" },
  Keyboard: { ja: "鍵盤楽器", en: "Keyboard" },
  Chamber: { ja: "室内楽", en: "Chamber" },
  Stage: { ja: "劇音楽", en: "Stage" },
  Vocal: { ja: "声楽", en: "Vocal" },
};

export function isEpoch(value: string): value is Epoch {
  return (EPOCHS as readonly string[]).includes(value);
}

export function isGenre(value: string): value is Genre {
  return (GENRES as readonly string[]).includes(value);
}
