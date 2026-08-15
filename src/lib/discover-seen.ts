/**
 * Which work ids the "next thing to listen to" section has already shown a
 * visitor, so `recommend()`'s `recentlyShown` penalty (see `./recommend`)
 * can favour picks that have not appeared in the last few visits.
 *
 * A ring rather than a full history: only recent exposure should count
 * against a work, and an unbounded list would grow forever for a frequent
 * visitor. Read access is defensive in the same way as `./favorites` — a
 * user can clear storage, block it, or leave malformed JSON behind, and none
 * of that should throw inside a render.
 */
export const DISCOVER_SEEN_KEY = "klangwelt.discover.seen.v1";

/** How many recently-shown ids to remember, newest first. */
export const DISCOVER_SEEN_LIMIT = 30;

export function parseSeen(rawValue: string | null): string[] {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((id): id is string => typeof id === "string")
      .slice(0, DISCOVER_SEEN_LIMIT);
  } catch {
    return [];
  }
}

export function readSeen(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return parseSeen(window.localStorage.getItem(DISCOVER_SEEN_KEY));
  } catch {
    // Safari in private mode throws on localStorage access.
    return [];
  }
}

/** Records `ids` as freshly shown, newest first, trimmed to the ring limit
 *  and de-duplicated against what was already there. */
export function pushSeen(ids: readonly string[]): void {
  if (typeof window === "undefined") return;
  try {
    const next = [...new Set([...ids, ...readSeen()])].slice(
      0,
      DISCOVER_SEEN_LIMIT,
    );
    window.localStorage.setItem(DISCOVER_SEEN_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: seen-tracking just won't persist this visit.
  }
}
