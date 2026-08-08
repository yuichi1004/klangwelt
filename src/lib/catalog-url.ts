import type { ReadonlyURLSearchParams } from "next/navigation";

import type { CatalogFilters, SortKey } from "./catalog";
import { isEpoch, isGenre } from "./epochs";

/**
 * Filters live in the query string so a result set can be shared. This module
 * is the single place that parses and serialises that query string, so the
 * same validation guards both the URL and the sessionStorage restore in
 * `CatalogBrowser` (see `sanitizeQueryString`).
 */
export function readFilters(params: URLSearchParams | ReadonlyURLSearchParams): {
  filters: CatalogFilters;
  sort: SortKey;
} {
  const list = (key: string) =>
    (params.get(key) ?? "").split(",").filter(Boolean);
  const popularity = params.get("pop");
  const sort = params.get("sort");

  return {
    filters: {
      query: params.get("q") ?? "",
      composerIds: list("c"),
      epochs: list("e").filter(isEpoch),
      genres: list("g").filter(isGenre),
      popularity:
        popularity === "popular" || popularity === "recommended"
          ? popularity
          : "all",
    },
    sort: sort === "title" || sort === "composer" ? sort : "popular",
  };
}

export function writeFilters(filters: CatalogFilters, sort: SortKey): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.composerIds.length) params.set("c", filters.composerIds.join(","));
  if (filters.epochs.length) params.set("e", filters.epochs.join(","));
  if (filters.genres.length) params.set("g", filters.genres.join(","));
  if (filters.popularity !== "all") params.set("pop", filters.popularity);
  if (sort !== "popular") params.set("sort", sort);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * Validates and re-serialises a stored query string, so a saved value never
 * reaches `router.replace()` unchecked. Unknown keys are dropped and enum
 * values are validated by `readFilters`; running the result back through
 * `writeFilters` means anything malformed — including something that is not
 * a query string at all, like `//evil.com` — collapses to `""`.
 */
export function sanitizeQueryString(raw: string | null): string {
  if (!raw) return "";
  const { filters, sort } = readFilters(
    new URLSearchParams(raw.replace(/^\?/, "")),
  );
  return writeFilters(filters, sort);
}
