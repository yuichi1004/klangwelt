/**
 * Export/import of user data as a JSON file or clipboard payload, so a
 * visitor can carry favourites and their language choice to another browser
 * or device. The site is a static export with no account and no server —
 * this is a manual, local-only substitute for sync.
 *
 * `klangwelt.discover.seen.v1` is deliberately excluded: it is a recency
 * ring for "don't recommend the same thing twice in a row", not data a user
 * intentionally created. Starting fresh on a new device is fine there.
 */
import type { FavoritesState } from "./favorites";
import { isLocale, type Locale } from "@/i18n/config";

export const BACKUP_APP_ID = "klangwelt";
export const BACKUP_EXPORT_VERSION = 1;

/**
 * Read by the pre-hydration splash script in `public/index.html`, which
 * cannot import from `src/` — that file hardcodes this same string literal
 * and must be kept in sync by hand if it ever changes.
 */
export const LOCALE_STORAGE_KEY = "klangwelt.locale";

export interface BackupData {
  app: typeof BACKUP_APP_ID;
  exportVersion: typeof BACKUP_EXPORT_VERSION;
  exportedAt: string;
  favorites: FavoritesState;
  locale?: Locale;
}

/** Pure: assembles a backup from values the caller already has in hand. */
export function buildBackup(
  favorites: FavoritesState,
  locale: Locale | null,
  exportedAt: string,
): BackupData {
  return {
    app: BACKUP_APP_ID,
    exportVersion: BACKUP_EXPORT_VERSION,
    exportedAt,
    favorites,
    ...(locale ? { locale } : {}),
  };
}

export function serializeBackup(data: BackupData): string {
  return JSON.stringify(data, null, 2);
}

export function parseBackup(raw: string): { data: BackupData } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "invalid-json" };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { error: "invalid-shape" };
  }
  const candidate = parsed as Record<string, unknown>;

  if (candidate.app !== BACKUP_APP_ID) return { error: "wrong-app" };
  if (candidate.exportVersion !== BACKUP_EXPORT_VERSION) {
    return { error: "unsupported-version" };
  }

  const favoritesRaw = candidate.favorites as Record<string, unknown> | undefined;
  if (
    typeof favoritesRaw !== "object" ||
    favoritesRaw === null ||
    !Array.isArray(favoritesRaw.workIds)
  ) {
    return { error: "invalid-favorites" };
  }
  const workIds = favoritesRaw.workIds.filter(
    (id): id is string => typeof id === "string",
  );
  const favorites: FavoritesState = { version: 1, workIds: [...new Set(workIds)] };

  const localeRaw = candidate.locale;
  const locale =
    typeof localeRaw === "string" && isLocale(localeRaw) ? localeRaw : undefined;

  const exportedAt =
    typeof candidate.exportedAt === "string" ? candidate.exportedAt : "";

  return {
    data: {
      app: BACKUP_APP_ID,
      exportVersion: BACKUP_EXPORT_VERSION,
      exportedAt,
      favorites,
      ...(locale ? { locale } : {}),
    },
  };
}

/**
 * Non-destructive by design: the union of both id lists, with `current`'s
 * order (newest-first) kept in front and newly-imported ids appended after.
 * A caller who wants a full replace clears their favourites first.
 */
export function mergeFavorites(
  current: FavoritesState,
  incoming: FavoritesState,
): { merged: FavoritesState; added: number; alreadyPresent: number } {
  const currentIds = new Set(current.workIds);
  const newIds = incoming.workIds.filter((id) => !currentIds.has(id));
  return {
    merged: { version: 1, workIds: [...current.workIds, ...newIds] },
    added: newIds.length,
    alreadyPresent: incoming.workIds.length - newIds.length,
  };
}

export function writeStoredLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage full or blocked: the in-memory choice still works for this visit.
  }
}
