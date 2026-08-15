import type { ReadonlyURLSearchParams } from "next/navigation";

import { isMediaKind } from "./media";
import { type MediaFilters } from "./media-filter";

/**
 * Filters live in the query string so a result set can be shared — same
 * reasoning as `catalog-url.ts` / `composer-url.ts`. Kept as its own module
 * rather than sharing either: the media list has only two axes (kind, text)
 * and no default floor to omit, so reusing `readFilters`/`writeFilters`
 * would leave most of each function dead for this caller.
 *
 * No `sanitize*QueryString` counterpart: unlike the catalogue and composer
 * lists, `/media` does not restore a filter from sessionStorage across an
 * in-page trip (issue #91 — the axis count didn't justify it), so there is
 * no stored string that ever reaches `router.replace()` unchecked.
 */
export function readMediaFilters(
  params: URLSearchParams | ReadonlyURLSearchParams,
): MediaFilters {
  const kinds = (params.get("k") ?? "").split(",").filter(Boolean).filter(isMediaKind);
  return { query: params.get("q") ?? "", kinds };
}

export function writeMediaFilters(filters: MediaFilters): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.kinds.length) params.set("k", filters.kinds.join(","));
  const query = params.toString();
  return query ? `?${query}` : "";
}
