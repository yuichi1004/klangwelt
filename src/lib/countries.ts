/**
 * The allow-list of countries a composer's nationality can point at, with
 * Japanese/English labels — same shape as `EPOCH_LABELS`/`GENRE_LABELS` in
 * `epochs.ts`.
 *
 * This is the single source of truth for "which nationalities the site can
 * display": `data/nationalities.json` is validated against these keys
 * (`src/lib/nationality.ts`), and `scripts/build-flags.ts` copies exactly one
 * flag SVG per key into `public/flags/`. Adding a composer whose nationality
 * is not here means adding a line here first, then running
 * `npm run build:flags`.
 */
export const COUNTRY_LABELS = {
  DE: { ja: "ドイツ", en: "Germany" },
  AT: { ja: "オーストリア", en: "Austria" },
  IT: { ja: "イタリア", en: "Italy" },
  FR: { ja: "フランス", en: "France" },
  RU: { ja: "ロシア", en: "Russia" },
  GB: { ja: "イギリス", en: "United Kingdom" },
  PL: { ja: "ポーランド", en: "Poland" },
  CZ: { ja: "チェコ", en: "Czech Republic" },
  HU: { ja: "ハンガリー", en: "Hungary" },
  FI: { ja: "フィンランド", en: "Finland" },
  NO: { ja: "ノルウェー", en: "Norway" },
  US: { ja: "アメリカ合衆国", en: "United States" },
  SE: { ja: "スウェーデン", en: "Sweden" },
  DK: { ja: "デンマーク", en: "Denmark" },
  EE: { ja: "エストニア", en: "Estonia" },
  GR: { ja: "ギリシャ", en: "Greece" },
  BE: { ja: "ベルギー", en: "Belgium" },
  NL: { ja: "オランダ", en: "Netherlands" },
  CH: { ja: "スイス", en: "Switzerland" },
  AU: { ja: "オーストラリア", en: "Australia" },
  IE: { ja: "アイルランド", en: "Ireland" },
  AM: { ja: "アルメニア", en: "Armenia" },
  JP: { ja: "日本", en: "Japan" },
  ES: { ja: "スペイン", en: "Spain" },
  PT: { ja: "ポルトガル", en: "Portugal" },
  BR: { ja: "ブラジル", en: "Brazil" },
  AR: { ja: "アルゼンチン", en: "Argentina" },
  MX: { ja: "メキシコ", en: "Mexico" },
  RO: { ja: "ルーマニア", en: "Romania" },
} satisfies Record<string, { ja: string; en: string }>;

/** A key of `COUNTRY_LABELS` — kept as a narrow union, not `string`, so a
 *  typo'd or unsupported code is a type error wherever this is used. */
export type CountryCode = keyof typeof COUNTRY_LABELS;

export function isCountryCode(value: string): value is CountryCode {
  return Object.hasOwn(COUNTRY_LABELS, value);
}
