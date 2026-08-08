/**
 * Favourite works, persisted in localStorage.
 *
 * Versioned from the start so a future account-backed sync can migrate the
 * existing data instead of discarding it. Every read is defensive: a user can
 * clear storage, block it, or leave malformed JSON behind, and none of that
 * should throw inside a render.
 */
export const FAVORITES_STORAGE_KEY = "klangwelt.favorites.v1";

export interface FavoritesState {
  version: 1;
  workIds: string[];
}

export const EMPTY_FAVORITES: FavoritesState = { version: 1, workIds: [] };

export function parseFavorites(rawValue: string | null): FavoritesState {
  if (!rawValue) return EMPTY_FAVORITES;

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as FavoritesState).workIds)
    ) {
      return EMPTY_FAVORITES;
    }
    const workIds = (parsed as FavoritesState).workIds.filter(
      (id): id is string => typeof id === "string",
    );
    return { version: 1, workIds: [...new Set(workIds)] };
  } catch {
    return EMPTY_FAVORITES;
  }
}

export function readFavorites(): FavoritesState {
  if (typeof window === "undefined") return EMPTY_FAVORITES;
  try {
    return parseFavorites(window.localStorage.getItem(FAVORITES_STORAGE_KEY));
  } catch {
    // Safari in private mode throws on localStorage access.
    return EMPTY_FAVORITES;
  }
}

export function writeFavorites(state: FavoritesState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked: the in-memory state still works for this visit.
  }
}

export function toggleFavorite(
  state: FavoritesState,
  workId: string,
): FavoritesState {
  const workIds = state.workIds.includes(workId)
    ? state.workIds.filter((id) => id !== workId)
    : [workId, ...state.workIds];
  return { version: 1, workIds };
}

/**
 * An external store, so components can read favourites through
 * `useSyncExternalStore` rather than copying localStorage into React state
 * inside an effect.
 *
 * `getSnapshot` must return a referentially stable value or React will loop,
 * so the parsed state is cached against the raw string it came from.
 */
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedState: FavoritesState = EMPTY_FAVORITES;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(FAVORITES_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function subscribeToFavorites(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    // `key === null` means the whole store was cleared.
    if (event.key === null || event.key === FAVORITES_STORAGE_KEY) {
      notifyFavoritesChanged();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function notifyFavoritesChanged(): void {
  for (const listener of listeners) listener();
}

export function getFavoritesSnapshot(): FavoritesState {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedState = parseFavorites(raw);
  }
  return cachedState;
}

/**
 * Null on the server and during hydration. Components use that to tell
 * "not read yet" apart from "genuinely empty", which matters because the
 * statically exported HTML cannot know what the visitor has saved.
 */
export function getFavoritesServerSnapshot(): null {
  return null;
}

export function persistFavorites(state: FavoritesState): void {
  writeFavorites(state);
  cachedRaw = JSON.stringify(state);
  cachedState = state;
  notifyFavoritesChanged();
}
