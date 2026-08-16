/**
 * Pure decision logic for `scripts/trim-portrait-margins.ts` (issue #122).
 *
 * Kept separate from the script (which does the actual image I/O via
 * `sharp`) so the thresholds are unit-testable without touching the
 * filesystem — same split as `portrait-thumb.ts` holding the pure mapping
 * and `build-portrait-thumbs.ts` doing the I/O. This module has no `sharp`
 * import and no side effects, so importing it anywhere (including
 * client-bundled code, though nothing does) is always safe.
 *
 * The whole mechanism only ever applies to public-domain-equivalent files —
 * see `requiresAttribution()` in `licenses.ts` and `CONTRIBUTING.md`'s
 * 肖像画 section — because those carry no share-alike term to violate by
 * trimming a plain margin.
 */

/**
 * Mean greyscale luminance (0-255) of a portrait's outermost edge pixels,
 * above which the file is a margin-trim candidate. Chosen from a
 * measurement of the 18 composers issue #122 lists (183.9-255.0) against a
 * known-fine control — a full-bleed dark oil painting at 57.2 — leaving
 * well over a 100-point margin on either side of the threshold.
 *
 * Deliberately samples only the outermost 2px, not a line further inward:
 * an earlier version sampled a ring 6% in from the edge, which for an oval
 * vignette (Purcell, Couperin) already clips into the portrait's darker
 * content in places and pulls the average down enough to fall below
 * threshold — silently skipping exactly the composers issue #111 named.
 * The outermost few pixels are reliably background regardless of the
 * vignette's shape.
 */
export const BORDER_BRIGHTNESS_THRESHOLD = 150;

export function isMarginCandidate(borderBrightness: number): boolean {
  return borderBrightness > BORDER_BRIGHTNESS_THRESHOLD;
}

export type TrimVerdict = "skip" | "needs-review" | "adopt";

/**
 * Below this, a trim didn't remove enough to have found a real margin —
 * `sharp.trim()` ran but the composition doesn't actually have one, so
 * keep the file untouched rather than re-encoding for no visible change.
 */
const MIN_REDUCTION_RATIO = 0.03;

/**
 * Below this fraction of the original size (on either axis), or below this
 * absolute pixel floor, a trim is treated as having gone too far — most
 * likely the border wasn't as uniform as it looked and `sharp.trim()`
 * ate into the actual portrait. Flagged for manual review instead of
 * auto-adopted.
 */
const MAX_REDUCTION_RATIO = 0.6; // i.e. trimmed must be >= 40% of original
const MIN_ABSOLUTE_PX = 80;

/**
 * Decides what to do with a candidate's `sharp.trim()` result, given the
 * dimensions before and after.
 */
export function classifyTrimResult({
  originalWidth,
  originalHeight,
  trimmedWidth,
  trimmedHeight,
}: {
  originalWidth: number;
  originalHeight: number;
  trimmedWidth: number;
  trimmedHeight: number;
}): TrimVerdict {
  const widthReduction = 1 - trimmedWidth / originalWidth;
  const heightReduction = 1 - trimmedHeight / originalHeight;

  if (widthReduction < MIN_REDUCTION_RATIO && heightReduction < MIN_REDUCTION_RATIO) {
    return "skip";
  }

  const tooSmallAbsolute = trimmedWidth < MIN_ABSOLUTE_PX || trimmedHeight < MIN_ABSOLUTE_PX;
  const tooSmallRelative =
    widthReduction > MAX_REDUCTION_RATIO || heightReduction > MAX_REDUCTION_RATIO;
  if (tooSmallAbsolute || tooSmallRelative) {
    return "needs-review";
  }

  return "adopt";
}
