/**
 * 定番度 — how standard a work is in the classical repertoire, 1-5 stars.
 *
 * Open Opus gives us two booleans, `popular` and `recommended`. Ordering by
 * them alone collapses to two tiers and then an alphabetical title compare,
 * which put Beethoven's Choral Fantasy above his Fifth Symphony and the
 * Eroica below Für Elise. The rating therefore has three layers, each taking
 * over where the one below it stops being able to tell works apart:
 *
 *  1. **The hand-ordered head** — `data/curation/ranking.json` lists the ★5
 *     works in explicit global order. Position *is* the score, so nothing
 *     computed can reorder them.
 *  2. **The curated bands** — `data/curation/works/<composerId>.json` assigns
 *     ★4 and ★3, ordered within each group by the curator.
 *  3. **The formula below** — everything else, capped at ★3.
 *
 * Every cap is structural rather than a clamp, and the test suite proves each
 * one from these constants alone:
 *
 *  - The formula cannot reach a curated band (`MAX_BONUS < CURATED_BASE[3]`),
 *    so a well-flagged work by a famous composer can never outrank a curated
 *    one however the weights are tuned.
 *  - No curated band can reach the one above it, or the ranked head.
 *  - Inside the ranked head the composer counts for nothing. That is the whole
 *    point: `COMPOSER_BONUS` used to be wider than the rank term, which
 *    stratified the ★5 band by composer and left Pachelbel's Canon at #50,
 *    behind Haydn's London Symphony.
 *
 * Every weight except `MAX_TIEBREAK` is a multiple of 10, and the tiebreak is
 * single-digit. So the nickname/genre tiebreak can only separate works that
 * were otherwise *exactly* equal — it can never cross a curator's ordering,
 * a composer star, or a band. `"only splits works that already tied"` in the
 * tests asserts that property directly.
 *
 * The scale is absolute and cross-composer: Adès' `Asyla` is ★1 even though it
 * is his best-known piece. A minor composer's page showing only ★1-2 is the
 * intended outcome, not a gap in the data.
 */
import type { Genre } from "./epochs";

export type Stars = 1 | 2 | 3 | 4 | 5;

/** ★1 and ★2 are never curated — the formula already produces those. */
export type CuratedStars = 3 | 4 | 5;

/**
 * Seats in `data/curation/ranking.json`. A fixed count rather than the list's
 * actual length so that `workScore` stays a function of one work: threading
 * the total through would mean a stale value could silently reorder the whole
 * head while every score stayed unique and monotonic — invisible to tests.
 * Adding a work now shifts only the entries below it.
 *
 * Kept above `SCALE_LIMITS.workStar5` (100) so the soft drift warning still
 * has room to fire before this hard cap fails the build.
 */
export const RANKED_SLOTS = 120;

/** The floor of the hand-ordered head; every ranked work scores above it. */
export const RANKED_BASE = 10_000;

/** The top of the scale — the first entry in `ranking.json`. */
export const MAX_SCORE = RANKED_BASE + RANKED_SLOTS;

/**
 * Base score per curated star. The 1,500-point gaps are wider than the largest
 * possible bonus total, so the bands can never overlap.
 *
 * `CURATED_BASE[5]` is unreachable in practice: `ranking.json` is the ★5 list,
 * so every ★5 work is scored by the ranked head instead. It stays here to keep
 * the ladder legible, and `curation.test.ts` asserts no shipped ★5 falls back
 * into this band.
 */
export const CURATED_BASE: Record<CuratedStars, number> = {
  5: 9000,
  4: 7500,
  3: 6000,
};

/**
 * How standard the composer is, from `data/curation/composer-stars.json`.
 * The dominant term for the ~1,000 works nobody has curated individually.
 */
export const COMPOSER_BONUS: Record<Stars, number> = {
  5: 550,
  4: 420,
  3: 300,
  2: 180,
  1: 80,
};

/**
 * A nickname ("Emperor", "Jupiter", "Moonlight") is a reliable proxy for
 * familiarity: a piece only acquires one by being played often enough to
 * need a handle.
 */
export const NICKNAME_BONUS = 60;

/**
 * An editorial nudge, not a derived signal: orchestral works are what a
 * newcomer meets first, so they break ties ahead of chamber and vocal music.
 * Zero this record out if that judgement ever stops holding.
 */
export const GENRE_BONUS: Record<Genre, number> = {
  Orchestral: 40,
  Stage: 30,
  Keyboard: 30,
  Chamber: 10,
  Vocal: 10,
};

/**
 * The third term of the score, after the curated base and the composer. Two
 * different signals fill the same 0-400 slot depending on whether a human has
 * looked at the work:
 *
 *  - curated: the position the curator gave it inside its star group,
 *  - otherwise: Open Opus' flags, the nickname and the genre.
 *
 * The two are deliberately not combined. The proxies are stand-ins for exactly
 * what curation measures directly, so letting them *outrank* a hand-assigned
 * position puts the noise back: the Fifth Symphony has no nickname and Für
 * Elise does, which is enough to invert them. They are still allowed to act
 * as a sub-rank tiebreak — see `MAX_TIEBREAK`.
 */
export const MAX_DETAIL_BONUS = 400;

/** The gap between adjacent positions inside one curated star group. */
const RANK_STEP = 20;

/** How many positions a curated star group can order before it flattens. */
export const RANK_REACH = MAX_DETAIL_BONUS / RANK_STEP;

/**
 * Separates curated works that the curator left equal — same star, same
 * position, same composer. Strictly single-digit while every other weight is
 * a multiple of 10, so it can only break an exact tie and can never reorder
 * across a position (gap 20), a composer star (smallest gap 100), or a band.
 */
const TIEBREAK_NICKNAME = 5;
const TIEBREAK_GENRE: Record<Genre, number> = {
  Orchestral: 4,
  Stage: 3,
  Keyboard: 3,
  Chamber: 1,
  Vocal: 1,
};
export const MAX_TIEBREAK = TIEBREAK_NICKNAME + Math.max(...Object.values(TIEBREAK_GENRE));

/** The largest total the bonuses can reach, used to prove the bands separate. */
export const MAX_BONUS = COMPOSER_BONUS[5] + MAX_DETAIL_BONUS + MAX_TIEBREAK;

export interface RatingInput {
  /** Set only for works in `data/curation/ranking.json`; 0 is the top. */
  rankedIndex?: number;
  /** Set only when the work appears in `data/curation/works/`. */
  curatedStars?: CuratedStars;
  /** Position within its star group in the curation file; 0 is the top. */
  curatedRank?: number;
  composerStars: Stars;
  popular: boolean;
  recommended: boolean;
  hasNickname: boolean;
  genre: Genre;
}

/** Open Opus' own two flags, demoted to a mid-weight signal among several. */
function flagBonus(popular: boolean, recommended: boolean): number {
  if (popular && recommended) return 300;
  if (popular) return 260;
  if (recommended) return 140;
  return 0;
}

function detailBonus(input: RatingInput): number {
  if (input.curatedStars !== undefined) {
    return (
      Math.max(0, MAX_DETAIL_BONUS - RANK_STEP * (input.curatedRank ?? 0)) +
      (input.hasNickname ? TIEBREAK_NICKNAME : 0) +
      TIEBREAK_GENRE[input.genre]
    );
  }
  return (
    flagBonus(input.popular, input.recommended) +
    (input.hasNickname ? NICKNAME_BONUS : 0) +
    GENRE_BONUS[input.genre]
  );
}

/**
 * The canonical sort key, up to `MAX_SCORE`. Finer-grained than `stars` on
 * purpose: within one star band it orders by composer and then by the detail
 * bonus, so a band never degenerates into an alphabetical list the way the old
 * popular/recommended pair did.
 */
export function workScore(input: RatingInput): number {
  // The hand-ordered head answers for itself — no computed term may disturb
  // the order a human put these works in.
  if (input.rankedIndex !== undefined) {
    return RANKED_BASE + (RANKED_SLOTS - input.rankedIndex);
  }
  const base = input.curatedStars ? CURATED_BASE[input.curatedStars] : 0;
  return base + COMPOSER_BONUS[input.composerStars] + detailBonus(input);
}

export function workStars(input: RatingInput): Stars {
  // `ranking.json` is the ★5 list, so being in the head *is* the star.
  if (input.rankedIndex !== undefined) return 5;
  if (input.curatedStars) return input.curatedStars;
  // Neither flag means Open Opus considers this part of the long tail. Being
  // by a famous composer does not make an obscure work standard repertoire,
  // so it stays at ★1 regardless of the composer's own rating.
  if (!input.popular && !input.recommended) return 1;

  const score = workScore(input);
  if (score >= 850) return 3;
  if (score >= 550) return 2;
  return 1;
}

/** The fields the canonical order needs — the overlap of `Work` and `WorkIndexRow`. */
export interface Rankable {
  score: number;
  title: string;
  id: string;
}

/**
 * The canonical catalogue order. Used by the seed script to bake the order of
 * `data/catalog/*` and by `sortWorks` at runtime, from one definition so the
 * two cannot drift apart.
 *
 * **The tie-break is the English title in every locale, deliberately.** Scores
 * repeat heavily — 1,223 of the 1,321 adjacent pairs in the shipped index are
 * ties — so the tie-break, not the score, decides most of the list. Comparing
 * the *displayed* title instead made `/ja` and `/en` diverge from the very
 * first row: `ja` collation sorts Latin script ahead of kana and kanji, so
 * every tie group filled up with the ~45% of works whose Japanese title is
 * still an English fallback, pushing ボレロ and 交響曲第5番 beneath them. It also
 * put the catalogue page out of step with the composer pages, which read the
 * baked file order and therefore always used the English tie-break.
 *
 * `id` settles what is left: 17 English titles are shared by 50 works
 * ("Violin Concerto" alone spans seven composers), and without it their
 * relative order would be whatever the input happened to be.
 *
 * `localeCompare` is given an explicit `"en"` because the bare call resolves
 * against the build machine's locale.
 */
export function compareByStandard(a: Rankable, b: Rankable): number {
  return (
    b.score - a.score ||
    a.title.localeCompare(b.title, "en") ||
    a.id.localeCompare(b.id)
  );
}

const STARS = [1, 2, 3, 4, 5] as const;

export function isStars(value: unknown): value is Stars {
  return (STARS as readonly unknown[]).includes(value);
}

export function isCuratedStars(value: unknown): value is CuratedStars {
  return value === 3 || value === 4 || value === 5;
}
