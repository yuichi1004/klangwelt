/**
 * "Next thing to listen to" for the homepage, computed entirely client-side
 * from a visitor's favourites — no server, no precomputed artefact. Pure
 * logic only; I/O (favourites, localStorage, the visit seed) is the caller's
 * job, same split as `./popularity`.
 *
 * The weights below are not tuned by feel. `POPULARITY_WEIGHT` is the
 * midpoint of the interval that keeps four orderings correct at once — see
 * the design note on issue #86 for the derivation:
 *
 *   I   ★2 same-composer            beats ★5 same-epoch-only   → P < 4.0
 *   II  ★5 same-epoch-only          beats ★1 epoch+genre match → P > 1.0
 *   III ★1 epoch-only match         beats ★5 matching nothing  → P < 1.5
 *   IV  a genre match survives a 3-star gap but not a 4-star one → 1.0 < P < 1.333
 *
 * `score` (0-10,120, banded by curation tier) is deliberately not used as
 * the popularity term — the bands make it wildly non-uniform (the ★3 band
 * alone spans 860-6959, wider than the ★4-★5 gap). `stars` is what the card
 * actually shows, so it is what "break ties toward the more listenable
 * work" should mean.
 */
import type { SearchableWork } from "./catalog";
import type { Epoch, Genre } from "./epochs";
import { compareByStandard } from "./popularity";

/** How much a favourite's contribution fades per position further back in
 *  the newest-first list. Harmonic, not exponential, so an old favourite
 *  fades but never drops to zero. */
export const RECENCY_DECAY = 0.15;

export const COMPOSER_WEIGHT = 3.0;
export const EPOCH_WEIGHT = 1.5;
export const GENRE_WEIGHT = 1.0;
export const POPULARITY_WEIGHT = 1.2;
export const MAX_AFFINITY_SCORE =
  COMPOSER_WEIGHT + EPOCH_WEIGHT + GENRE_WEIGHT + POPULARITY_WEIGHT;

/**
 * A work is a candidate only if it clears this floor, unless its composer is
 * itself a favourite. No coefficient choice in the interval above stops an
 * unrelated ★1 from occasionally outranking a real match — this filter is
 * what actually keeps ★1s out, while still surfacing an favourite composer's
 * deep cuts.
 */
export const MIN_CANDIDATE_STARS = 2;

/**
 * `POOL_SIZE / POOL_PER_COMPOSER = 16 >= DEFAULT_COUNT`, so the pool always
 * spans enough composers to fill a selection — provable from the constants
 * alone, not just true on today's catalogue. Without the per-composer cap, a
 * favourite whose composer has many works (Mozart: 41) fills the pool almost
 * entirely with that composer, and the uniqueness rule then starves the
 * selection down to two or three works instead of six.
 */
export const POOL_SIZE = 48;
export const POOL_PER_COMPOSER = 3;

/** Keeps every sampling weight strictly positive. */
export const WEIGHT_FLOOR = 0.5;

/**
 * Applied to the *sampling weight*, after the pool is fixed — never to the
 * score used to build the pool. Penalising before the pool cut can drop the
 * top-ranked work out of the pool entirely, which turns "penalty" into a de
 * facto exclusion; applying it only to sampling keeps every pool member
 * reachable while still favouring what hasn't been shown.
 */
export const RECENT_PENALTY = 0.35;

/** Affinity floor for a dimension to be worth citing as the reason. */
export const REASON_MIN_AFFINITY = 0.5;

export const DEFAULT_COUNT = 6;

/** Per-dimension affinity, each normalised so its strongest entry is 1. */
export interface TasteProfile {
  composers: Readonly<Record<string, number>>;
  epochs: Readonly<Partial<Record<Epoch, number>>>;
  genres: Readonly<Partial<Record<Genre, number>>>;
  /** The ids this was built from. `recommend` always withholds these. */
  workIds: readonly string[];
}

export const EMPTY_PROFILE: TasteProfile = {
  composers: {},
  epochs: {},
  genres: {},
  workIds: [],
};

/**
 * Chosen by specificity, not by which dimension scored highest: `EPOCH_WEIGHT
 * > GENRE_WEIGHT`, so an unranked argmax names the epoch on almost every
 * card. `WorkCard` shows the composer, the genre and the star rating, but
 * never the epoch, so an epoch-only reason cites something the card cannot
 * back up.
 */
export type RecommendReason =
  | { kind: "composer"; composerId: string }
  | { kind: "genre"; genre: Genre }
  | { kind: "epoch"; epoch: Epoch }
  | { kind: "popular" };

export interface Recommendation {
  work: SearchableWork;
  reason: RecommendReason;
}

export interface RecommendOptions {
  /** Any 32-bit integer. Same seed and inputs -> same array. */
  seed: number;
  count?: number;
  /** Extra ids to withhold; `profile.workIds` is always withheld too. */
  exclude?: Iterable<string>;
  /** Demoted, never excluded — see `RECENT_PENALTY`. */
  recentlyShown?: Iterable<string>;
}

function normalizeRecord<K extends string>(
  totals: Record<K, number>,
): Record<K, number> {
  const values = Object.values(totals) as number[];
  const max = values.length > 0 ? Math.max(...values) : 0;
  if (max <= 0) return {} as Record<K, number>;
  const result = {} as Record<K, number>;
  for (const key of Object.keys(totals) as K[]) {
    result[key] = totals[key] / max;
  }
  return result;
}

/**
 * `favorites` newest-first (as `useFavorites().workIds` order resolves to).
 * Ids that no longer resolve to a work must be filtered out by the caller
 * before this is called.
 */
export function buildTasteProfile(
  favorites: readonly SearchableWork[],
): TasteProfile {
  if (favorites.length === 0) return EMPTY_PROFILE;

  const composers: Record<string, number> = {};
  const epochs: Partial<Record<Epoch, number>> = {};
  const genres: Partial<Record<Genre, number>> = {};
  const workIds: string[] = [];

  favorites.forEach((work, index) => {
    const weight = 1 / (1 + index * RECENCY_DECAY);
    composers[work.composerId] = (composers[work.composerId] ?? 0) + weight;
    epochs[work.epoch] = (epochs[work.epoch] ?? 0) + weight;
    genres[work.genre] = (genres[work.genre] ?? 0) + weight;
    workIds.push(work.id);
  });

  return {
    composers: normalizeRecord(composers),
    epochs: normalizeRecord(epochs as Record<Epoch, number>),
    genres: normalizeRecord(genres as Record<Genre, number>),
    workIds,
  };
}

/** 0 .. `MAX_AFFINITY_SCORE`. Pure — knows nothing about seeds or exclusion. */
export function scoreWork(work: SearchableWork, profile: TasteProfile): number {
  const composerAffinity = profile.composers[work.composerId] ?? 0;
  const epochAffinity = profile.epochs[work.epoch] ?? 0;
  const genreAffinity = profile.genres[work.genre] ?? 0;
  const popularity = POPULARITY_WEIGHT * ((work.stars - 1) / 4);
  return (
    COMPOSER_WEIGHT * composerAffinity +
    EPOCH_WEIGHT * epochAffinity +
    GENRE_WEIGHT * genreAffinity +
    popularity
  );
}

/** The label to show. See the `RecommendReason` doc comment for why this is
 *  a specificity ladder rather than the argmax of `scoreWork`'s terms. */
export function explain(
  work: SearchableWork,
  profile: TasteProfile,
): RecommendReason {
  if ((profile.composers[work.composerId] ?? 0) > 0) {
    return { kind: "composer", composerId: work.composerId };
  }
  if ((profile.genres[work.genre] ?? 0) >= REASON_MIN_AFFINITY) {
    return { kind: "genre", genre: work.genre };
  }
  if ((profile.epochs[work.epoch] ?? 0) >= REASON_MIN_AFFINITY) {
    return { kind: "epoch", epoch: work.epoch };
  }
  return { kind: "popular" };
}

interface ScoredWork {
  work: SearchableWork;
  score: number;
}

function byScoreDesc(a: ScoredWork, b: ScoredWork): number {
  return compareByStandard(
    { score: a.score, title: a.work.title, id: a.work.id },
    { score: b.score, title: b.work.title, id: b.work.id },
  );
}

/**
 * The score-sorted candidate pool, capped per composer so the pool cannot
 * collapse into one favourite composer's back catalogue. Unpenalised by
 * `recentlyShown` — that only ever adjusts sampling weight, below.
 */
function buildPool(
  works: readonly SearchableWork[],
  profile: TasteProfile,
  withheld: ReadonlySet<string>,
): ScoredWork[] {
  const scored = works
    .filter((work) => !withheld.has(work.id))
    .filter(
      (work) =>
        work.stars >= MIN_CANDIDATE_STARS ||
        (profile.composers[work.composerId] ?? 0) > 0,
    )
    .map((work) => ({ work, score: scoreWork(work, profile) }))
    .sort(byScoreDesc);

  const pool: ScoredWork[] = [];
  const perComposer = new Map<string, number>();
  for (const entry of scored) {
    const used = perComposer.get(entry.work.composerId) ?? 0;
    if (used >= POOL_PER_COMPOSER) continue;
    perComposer.set(entry.work.composerId, used + 1);
    pool.push(entry);
    if (pool.length >= POOL_SIZE) break;
  }
  return pool;
}

/** mulberry32 — small, seedable, dependency-free. The only reason it exists
 *  is so "same seed -> same result" is testable; `Math.random()` cannot be. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Length is exactly `min(count, poolSize)`; at most one work per composer
 * unless the pool cannot supply `count` distinct composers.
 */
export function recommend(
  works: readonly SearchableWork[],
  profile: TasteProfile,
  options: RecommendOptions,
): Recommendation[] {
  const count = options.count ?? DEFAULT_COUNT;
  const withheld = new Set(profile.workIds);
  if (options.exclude) for (const id of options.exclude) withheld.add(id);
  const recentlyShown = new Set(options.recentlyShown ?? []);

  const pool = buildPool(works, profile, withheld);
  if (pool.length === 0) return [];

  const rng = mulberry32(options.seed);
  // Weighted, non-uniform sampling (Efraimidis-Spirakis via an exponential
  // race): a plain shuffle would ignore the quality gradient inside the
  // pool and give a favourite composer's best-matching work no better odds
  // than the pool's weakest entry.
  const keyed = pool
    .map((entry) => {
      const penalty = recentlyShown.has(entry.work.id) ? RECENT_PENALTY : 1;
      const weight = (entry.score + WEIGHT_FLOOR) * penalty;
      return { entry, key: -Math.log(1 - rng()) / weight };
    })
    .sort((a, b) => a.key - b.key);

  const picked: Recommendation[] = [];
  const usedComposers = new Set<string>();
  for (const { entry } of keyed) {
    if (picked.length >= count) break;
    if (usedComposers.has(entry.work.composerId)) continue;
    usedComposers.add(entry.work.composerId);
    picked.push({ work: entry.work, reason: explain(entry.work, profile) });
  }

  // Degenerate case only (pool smaller than count / too few composers):
  // relax uniqueness rather than returning fewer than the pool can supply.
  if (picked.length < count) {
    const pickedIds = new Set(picked.map((r) => r.work.id));
    for (const { entry } of keyed) {
      if (picked.length >= count) break;
      if (pickedIds.has(entry.work.id)) continue;
      pickedIds.add(entry.work.id);
      picked.push({ work: entry.work, reason: explain(entry.work, profile) });
    }
  }

  return picked;
}
