import type { ReadonlyURLSearchParams } from "next/navigation";

import { DEFAULT_COMPOSER_FILTERS, type ComposerFilters } from "./composer-filter";
import { isEpoch } from "./epochs";

/**
 * Filters live in the query string so a result set can be shared, mirroring
 * `catalog-url.ts`. Kept as a separate module rather than sharing that one:
 * the composer list has no `c`/`g`/`sort` params and its default `minStars`
 * is `3`, not `0`, so reusing `readFilters`/`writeFilters` directly would
 * leave half of each function dead for this caller.
 */
function readMinStars(
  params: URLSearchParams | ReadonlyURLSearchParams,
): ComposerFilters["minStars"] {
  const stars = params.get("stars");
  if (stars === "1" || stars === "3" || stars === "4" || stars === "5") {
    return Number(stars) as 1 | 3 | 4 | 5;
  }
  return DEFAULT_COMPOSER_FILTERS.minStars;
}

export function readComposerFilters(
  params: URLSearchParams | ReadonlyURLSearchParams,
): ComposerFilters {
  const epochs = (params.get("e") ?? "").split(",").filter(Boolean).filter(isEpoch);

  return {
    query: params.get("q") ?? "",
    epochs,
    minStars: readMinStars(params),
  };
}

export function writeComposerFilters(filters: ComposerFilters): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.epochs.length) params.set("e", filters.epochs.join(","));
  // The default (★3+) is not written, so the plain `/composers` URL stays
  // shareable and matches what the statically exported fallback shows.
  if (filters.minStars !== DEFAULT_COMPOSER_FILTERS.minStars) {
    params.set("stars", String(filters.minStars));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * Validates and re-serialises a stored query string, so a saved value never
 * reaches `router.replace()` unchecked — same role as
 * `sanitizeQueryString` in `catalog-url.ts`.
 */
export function sanitizeComposerQueryString(raw: string | null): string {
  if (!raw) return "";
  return writeComposerFilters(
    readComposerFilters(new URLSearchParams(raw.replace(/^\?/, ""))),
  );
}
