/**
 * The only image licences this project will redistribute.
 *
 * Open Opus ships composer portraits but documents no per-image provenance,
 * and 72 of its 220 composers died after 1955 or are still living — their
 * photographs are very likely still in copyright. So portraits are sourced
 * from Wikimedia Commons instead, where every file carries a machine-readable
 * licence, and anything outside this list is rejected rather than guessed at.
 */
export const ALLOWED_IMAGE_LICENCES = [
  "Public domain",
  "PD",
  "CC0",
  "CC BY",
  "CC BY-SA",
  // Library of Congress files released with no known copyright restrictions.
  "No restrictions",
] as const;

/**
 * Commons reports licences as short names such as `CC BY-SA 3.0 de`, so the
 * check is prefix-based on the family rather than an exact string match.
 */
export function isAllowedImageLicence(shortName: string | undefined): boolean {
  if (!shortName) return false;
  const normalised = shortName.trim();
  return ALLOWED_IMAGE_LICENCES.some(
    (allowed) =>
      normalised === allowed || normalised.startsWith(`${allowed} `),
  );
}

/**
 * Cleans up the `Artist` field Commons reports.
 *
 * It is free-form and frequently holds the file name rather than a person,
 * sometimes as a 100-character underscore-joined token that has no line-break
 * opportunity and drags the page layout wider than the viewport. Where the
 * value is `<filename>.jpg : <name>`, the name after the colon is the real
 * credit.
 */
export function normalizeAuthor(raw: string): string {
  let value = raw.replace(/\s+/g, " ").trim();

  const afterFilename = value.match(
    /^\S+\.(?:jpe?g|png|gif|tiff?|svg|webp)\s*:\s*(.*)$/i,
  );
  if (afterFilename) value = afterFilename[1].trim();

  // A bare file name with no person attached tells the reader nothing.
  if (/^(?:File:)?\S+\.(?:jpe?g|png|gif|tiff?|svg|webp)$/i.test(value)) {
    return "Unknown";
  }

  // Commons sometimes repeats "Unknown" in several languages.
  if (!value || /^(unknown\s*)+$/i.test(value)) return "Unknown";

  return value.length > 120 ? `${value.slice(0, 117)}…` : value;
}

/** CC BY / CC BY-SA require attribution; PD, CC0 and "No restrictions" don't. */
export function requiresAttribution(license: string): boolean {
  return license.startsWith("CC BY");
}

/** Provenance recorded for every portrait we ship. */
export interface PortraitCredit {
  /** Composer id from Open Opus. */
  composerId: string;
  /** Path under /public. */
  file: string;
  /** Commons file name, e.g. `Beethoven.jpg`. */
  commonsFile: string;
  /** Photographer or painter, plain text. */
  author: string;
  /** Licence short name exactly as Commons reports it. */
  license: string;
  /** Canonical licence deed, empty for public domain files. */
  licenseUrl: string;
  /** Commons file description page. */
  sourceUrl: string;
}
