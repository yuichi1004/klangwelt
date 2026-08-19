/**
 * "Next thing to listen to", computed entirely client-side from a visitor's
 * favourites — no server, no precomputed artefact. Pure logic only; I/O
 * (favourites, localStorage, the visit seed) is the caller's job, same split
 * as `./popularity`.
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

/** Keeps every sampling weight strictly positive. */
export const WEIGHT_FLOOR = 0.5;

/**
 * Sampling-weight exponent, applied only in `rankByTaste`.
 *
 * `rankByTaste` orders the whole catalogue, so it has no `MIN_CANDIDATE_STARS`
 * floor to keep ★1 works out — every work has to appear somewhere in the
 * list. This is what replaces that filter: not an exclusion, a steeper odds
 * ratio between the best- and worst-scoring work (3.4x at the linear weight,
 * 39x at the cube), which is enough to bring the expected number of ★1 works
 * in the first `PAGE_SIZE` (40) cards under `EMPTY_PROFILE` from ~7.9 down to
 * ~1.6 (measured against the shipped index).
 */
export const TASTE_TILT = 3;

/** Affinity floor for a dimension to be worth citing as the reason. */
export const REASON_MIN_AFFINITY = 0.5;

/** Per-dimension affinity, each normalised so its strongest entry is 1. */
export interface TasteProfile {
  composers: Readonly<Record<string, number>>;
  epochs: Readonly<Partial<Record<Epoch, number>>>;
  genres: Readonly<Partial<Record<Genre, number>>>;
  /** The ids this was built from. */
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
 * FNV-1a over the work id, folded into the sampling draw in `rankByTaste`.
 *
 * `rankByTaste` re-runs on a differently-filtered slice of the catalogue on
 * every keystroke of a search. Drawing straight from a per-call `mulberry32`
 * stream — one `rng()` call per work, in array order — would make a work's
 * draw depend on *where it sits in that call's input array*, so narrowing
 * `cho` to `chop` would reshuffle every surviving work instead of just
 * dropping the ones that stopped matching. Hashing the id and mixing it into
 * the seed makes the draw a property of the work itself, independent of
 * input order or size — filtering is then a subsequence of one global
 * permutation, not a fresh shuffle every time.
 */
function hashId(id: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

interface Keyed {
  work: SearchableWork;
  reason: RecommendReason;
  key: number;
}

/** How many emitted slots back a composer must clear before it can repeat.
 *  See `spreadByComposer`. */
const MIN_COMPOSER_GAP = 8;

/**
 * Spreads repeats of the same composer at least `MIN_COMPOSER_GAP` slots
 * apart, disturbing `keyed`'s relative order as little as possible.
 *
 * The generalisation of `recommend()`'s "one work per composer" rule to a
 * full-length list: a hard one-per-list rule would mean a favourite
 * composer's second-best work is over a thousand slots away, which is a
 * worse reading experience than the occasional near-repeat a soft gap
 * allows.
 *
 * A single forward-looking buffer of size `gap + 1` is enough: at each
 * output slot, take the earliest buffered entry whose composer has not
 * appeared in the last `gap` emitted slots, then refill the buffer from
 * `keyed`. If every buffered entry is blocked, the buffer — being only
 * `gap + 1` entries — is entirely composers seen in the last `gap` slots,
 * which can only happen when fewer than `gap` distinct composers remain in
 * the rest of the list; no ordering could satisfy the gap there anyway, so
 * fall through to the earliest buffered entry. O(n · gap).
 */
function spreadByComposer(keyed: readonly Keyed[]): Keyed[] {
  const buffer: Keyed[] = [];
  const lastSeenAt = new Map<string, number>();
  const output: Keyed[] = [];
  let cursor = 0;

  const refill = () => {
    while (buffer.length < MIN_COMPOSER_GAP + 1 && cursor < keyed.length) {
      buffer.push(keyed[cursor]);
      cursor++;
    }
  };

  refill();
  while (buffer.length > 0) {
    let pick = 0;
    for (let index = 0; index < buffer.length; index++) {
      const lastSeen = lastSeenAt.get(buffer[index].work.composerId);
      if (lastSeen === undefined || output.length - lastSeen > MIN_COMPOSER_GAP) {
        pick = index;
        break;
      }
    }
    const [entry] = buffer.splice(pick, 1);
    lastSeenAt.set(entry.work.composerId, output.length);
    output.push(entry);
    refill();
  }

  return output;
}

export interface RankOptions {
  /** Any 32-bit integer. Same seed and inputs -> same array. */
  seed: number;
}

/**
 * The whole list, ordered by taste. Unlike a fixed-size recommendation strip
 * this withholds nothing — not a favourite, not a ★1 — every work in `works`
 * appears exactly once in the output, because this *is* the results list,
 * not a strip beside one.
 *
 * Generalises the same weighted race `recommend()` used to build a strip:
 * `key = -Math.log(1 - rng()) / weight` for every candidate, sorted
 * ascending, is a weighted random permutation (Efraimidis-Spirakis), so
 * taking a prefix of it is exactly what a fixed-size strip wants. Ordering
 * *all* of it is the natural generalisation — see `hashId` for why the
 * `rng()` draw is keyed by work id rather than consumed positionally, and
 * `spreadByComposer` for the composer-diversity pass this sort feeds into.
 */
export function rankByTaste(
  works: readonly SearchableWork[],
  profile: TasteProfile,
  options: RankOptions,
): Recommendation[] {
  const keyed: Keyed[] = works.map((work) => {
    const weight = Math.pow(scoreWork(work, profile) + WEIGHT_FLOOR, TASTE_TILT);
    const unit = mulberry32((options.seed ^ hashId(work.id)) >>> 0)();
    const key = -Math.log(1 - unit) / weight;
    return { work, reason: explain(work, profile), key };
  });

  // A total order: `Array.prototype.sort` is stable, so without the id
  // tie-break, exactly-equal keys (rare, but `weight` and `unit` are both
  // finite-precision) would fall back to input order and reintroduce the
  // position dependency `hashId` exists to remove.
  keyed.sort((a, b) => a.key - b.key || a.work.id.localeCompare(b.work.id));

  return spreadByComposer(keyed).map(({ work, reason }) => ({ work, reason }));
}
