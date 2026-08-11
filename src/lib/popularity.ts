/**
 * 定番度 — how standard a work is in the classical repertoire, 1-5 stars.
 *
 * Open Opus gives us two booleans, `popular` and `recommended`. Ordering by
 * them alone collapses to two tiers and then an alphabetical title compare,
 * which put Beethoven's Choral Fantasy above his Fifth Symphony and the
 * Eroica below Für Elise. So the rating has two layers:
 *
 *  - A hand-curated list under `data/curation/` names the standard repertoire
 *    and assigns it ★3-5 directly.
 *  - Everything else is scored by the formula below, which tops out at ★3.
 *
 * The cap is structural rather than a clamp: the curated bands start at 600
 * and are spaced 150 apart, while the formula's bonuses can only reach 95.
 * A well-flagged work by a famous composer therefore cannot outrank a curated
 * one no matter how the weights are tuned. `popularityBands` in the test suite
 * asserts that invariant from these constants.
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
 * Base score per curated star. The 150-point gaps are wider than the largest
 * possible bonus total (95), so the bands can never overlap.
 */
export const CURATED_BASE: Record<CuratedStars, number> = {
  5: 900,
  4: 750,
  3: 600,
};

/**
 * How standard the composer is, from `data/curation/composer-stars.json`.
 * The dominant term for the ~1,000 works nobody has curated individually.
 */
export const COMPOSER_BONUS: Record<Stars, number> = {
  5: 55,
  4: 42,
  3: 30,
  2: 18,
  1: 8,
};

/**
 * A nickname ("Emperor", "Jupiter", "Moonlight") is a reliable proxy for
 * familiarity: a piece only acquires one by being played often enough to
 * need a handle.
 */
export const NICKNAME_BONUS = 6;

/**
 * An editorial nudge, not a derived signal: orchestral works are what a
 * newcomer meets first, so they break ties ahead of chamber and vocal music.
 * Zero this record out if that judgement ever stops holding.
 */
export const GENRE_BONUS: Record<Genre, number> = {
  Orchestral: 4,
  Stage: 3,
  Keyboard: 3,
  Chamber: 1,
  Vocal: 1,
};

/**
 * The third term of the score, after the curated base and the composer. Two
 * different signals fill the same 0-40 slot depending on whether a human has
 * looked at the work:
 *
 *  - curated: the position the curator gave it inside its star group,
 *  - otherwise: Open Opus' flags, the nickname and the genre.
 *
 * They are deliberately not combined. The proxies are stand-ins for exactly
 * what curation measures directly, so applying them on top of a hand-assigned
 * star puts the noise back: the Fifth Symphony has no nickname and Für Elise
 * does, which is enough to invert them.
 */
export const MAX_DETAIL_BONUS = 40;

/** How far the ranking within one star group reaches before it flattens. */
const RANK_STEP = 2;

/** The largest total the bonuses can reach, used to prove the bands separate. */
export const MAX_BONUS = COMPOSER_BONUS[5] + MAX_DETAIL_BONUS;

export interface RatingInput {
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
  if (popular && recommended) return 30;
  if (popular) return 26;
  if (recommended) return 14;
  return 0;
}

function detailBonus(input: RatingInput): number {
  if (input.curatedStars !== undefined) {
    return Math.max(0, MAX_DETAIL_BONUS - RANK_STEP * (input.curatedRank ?? 0));
  }
  return (
    flagBonus(input.popular, input.recommended) +
    (input.hasNickname ? NICKNAME_BONUS : 0) +
    GENRE_BONUS[input.genre]
  );
}

/**
 * The canonical sort key, 0-1000. Finer-grained than `stars` on purpose:
 * within one star band it orders by composer and then by the detail bonus, so
 * a band never degenerates into an alphabetical list the way the old
 * popular/recommended pair did.
 */
export function workScore(input: RatingInput): number {
  const base = input.curatedStars ? CURATED_BASE[input.curatedStars] : 0;
  return base + COMPOSER_BONUS[input.composerStars] + detailBonus(input);
}

export function workStars(input: RatingInput): Stars {
  if (input.curatedStars) return input.curatedStars;
  // Neither flag means Open Opus considers this part of the long tail. Being
  // by a famous composer does not make an obscure work standard repertoire,
  // so it stays at ★1 regardless of the composer's own rating.
  if (!input.popular && !input.recommended) return 1;

  const score = workScore(input);
  if (score >= 85) return 3;
  if (score >= 55) return 2;
  return 1;
}

const STARS = [1, 2, 3, 4, 5] as const;

export function isStars(value: unknown): value is Stars {
  return (STARS as readonly unknown[]).includes(value);
}

export function isCuratedStars(value: unknown): value is CuratedStars {
  return value === 3 || value === 4 || value === 5;
}
