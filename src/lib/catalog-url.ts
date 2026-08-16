import type { ReadonlyURLSearchParams } from "next/navigation";

import type { CatalogFilters, SortKey } from "./catalog";
import { isEpoch, isGenre } from "./epochs";

/**
 * Filters live in the query string so a result set can be shared. This module
 * is the single place that parses and serialises that query string, so the
 * same validation guards both the URL and the sessionStorage restore in
 * `CatalogBrowser` (see `sanitizeQueryString`).
 */
/**
 * `stars=3|4|5` is the current filter param. `pop=popular|recommended` is the
 * pre-★ form: still read here so old links and saved sessions keep working,
 * but never written again — the first `writeFilters` call after a page loads
 * silently upgrades the URL to `stars=`.
 */
function readMinStars(params: URLSearchParams | ReadonlyURLSearchParams): CatalogFilters["minStars"] {
  const stars = params.get("stars");
  if (stars === "3" || stars === "4" || stars === "5") return Number(stars) as 3 | 4 | 5;

  const legacy = params.get("pop");
  if (legacy === "popular") return 4;
  if (legacy === "recommended") return 3;
  return 0;
}

export function readFilters(params: URLSearchParams | ReadonlyURLSearchParams): {
  filters: CatalogFilters;
  sort: SortKey;
  /** `?view=all` — an explicit request for the full, unfiltered catalogue
   *  instead of the discovery feed. Orthogonal to `filters`: it is just
   *  another way `CatalogBrowser` decides to show the results list. */
  view: boolean;
} {
  const list = (key: string) =>
    (params.get(key) ?? "").split(",").filter(Boolean);
  const sort = params.get("sort");

  return {
    filters: {
      query: params.get("q") ?? "",
      composerIds: list("c"),
      epochs: list("e").filter(isEpoch),
      genres: list("g").filter(isGenre),
      minStars: readMinStars(params),
    },
    // An unrecognised value — including the old "popular" — falls back to
    // "standard", which is what it meant anyway.
    sort: sort === "title" || sort === "composer" ? sort : "standard",
    view: params.get("view") === "all",
  };
}

export function writeFilters(
  filters: CatalogFilters,
  sort: SortKey,
  view = false,
): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.composerIds.length) params.set("c", filters.composerIds.join(","));
  if (filters.epochs.length) params.set("e", filters.epochs.join(","));
  if (filters.genres.length) params.set("g", filters.genres.join(","));
  if (filters.minStars > 0) params.set("stars", String(filters.minStars));
  if (sort !== "standard") params.set("sort", sort);
  if (view) params.set("view", "all");
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
  const { filters, sort, view } = readFilters(
    new URLSearchParams(raw.replace(/^\?/, "")),
  );
  return writeFilters(filters, sort, view);
}
