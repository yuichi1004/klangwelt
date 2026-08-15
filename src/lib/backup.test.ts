import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BACKUP_APP_ID,
  BACKUP_EXPORT_VERSION,
  LOCALE_STORAGE_KEY,
  buildBackup,
  mergeFavorites,
  parseBackup,
  serializeBackup,
  writeStoredLocale,
} from "./backup";
import type { FavoritesState } from "./favorites";

/** See catalog-session.test.ts for why `window` is stubbed only where needed. */
function stubWorkingStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    },
  });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const FAVORITES: FavoritesState = { version: 1, workIds: ["a", "b"] };

describe("buildBackup", () => {
  it("assembles a backup from the given values", () => {
    expect(buildBackup(FAVORITES, "ja", "2026-08-15T00:00:00.000Z")).toEqual({
      app: BACKUP_APP_ID,
      exportVersion: BACKUP_EXPORT_VERSION,
      exportedAt: "2026-08-15T00:00:00.000Z",
      favorites: FAVORITES,
      locale: "ja",
    });
  });

  it("omits locale when there isn't one", () => {
    const data = buildBackup(FAVORITES, null, "2026-08-15T00:00:00.000Z");
    expect(data.locale).toBeUndefined();
    expect("locale" in data).toBe(false);
  });
});

describe("parseBackup", () => {
  it("round-trips a backup built and serialized by this module", () => {
    const built = buildBackup(FAVORITES, "en", "2026-08-15T00:00:00.000Z");
    const result = parseBackup(serializeBackup(built));
    expect(result).toEqual({ data: built });
  });

  it("rejects malformed JSON", () => {
    const result = parseBackup("{not json");
    expect("error" in result).toBe(true);
  });

  it("rejects anything that isn't an object", () => {
    for (const raw of ["null", "42", '"a string"', "[]"]) {
      const result = parseBackup(raw);
      expect("error" in result, raw).toBe(true);
    }
  });

  it("rejects a payload from a different app", () => {
    const result = parseBackup(
      JSON.stringify({ app: "other-app", exportVersion: 1, favorites: FAVORITES }),
    );
    expect("error" in result).toBe(true);
  });

  it("rejects an unsupported export version", () => {
    const result = parseBackup(
      JSON.stringify({ app: BACKUP_APP_ID, exportVersion: 2, favorites: FAVORITES }),
    );
    expect("error" in result).toBe(true);
  });

  it("rejects a payload whose favorites.workIds is not an array", () => {
    const result = parseBackup(
      JSON.stringify({
        app: BACKUP_APP_ID,
        exportVersion: BACKUP_EXPORT_VERSION,
        favorites: { version: 1, workIds: "nope" },
      }),
    );
    expect("error" in result).toBe(true);
  });

  it("drops non-string and duplicate work ids", () => {
    const result = parseBackup(
      JSON.stringify({
        app: BACKUP_APP_ID,
        exportVersion: BACKUP_EXPORT_VERSION,
        favorites: { version: 1, workIds: ["a", 1, "a", null, "b"] },
      }),
    );
    expect(result).toMatchObject({ data: { favorites: { workIds: ["a", "b"] } } });
  });

  it("accepts a backup with no locale at all", () => {
    const result = parseBackup(
      JSON.stringify({
        app: BACKUP_APP_ID,
        exportVersion: BACKUP_EXPORT_VERSION,
        favorites: FAVORITES,
      }),
    );
    expect("error" in result).toBe(false);
    if ("data" in result) expect(result.data.locale).toBeUndefined();
  });

  it("drops an invalid locale instead of erroring, keeping the favourites", () => {
    const result = parseBackup(
      JSON.stringify({
        app: BACKUP_APP_ID,
        exportVersion: BACKUP_EXPORT_VERSION,
        favorites: FAVORITES,
        locale: "fr",
      }),
    );
    expect("error" in result).toBe(false);
    if ("data" in result) {
      expect(result.data.locale).toBeUndefined();
      expect(result.data.favorites).toEqual(FAVORITES);
    }
  });

  it("accepts work ids that no longer exist in the current catalogue", () => {
    // FavoritesList already ignores unknown ids when rendering
    // (byId.get(id) filter) — parsing should be equally tolerant.
    const result = parseBackup(
      JSON.stringify({
        app: BACKUP_APP_ID,
        exportVersion: BACKUP_EXPORT_VERSION,
        favorites: { version: 1, workIds: ["retired-work-id"] },
      }),
    );
    expect(result).toMatchObject({
      data: { favorites: { workIds: ["retired-work-id"] } },
    });
  });
});

describe("mergeFavorites", () => {
  it("unions the two id lists", () => {
    const { merged } = mergeFavorites(
      { version: 1, workIds: ["a", "b"] },
      { version: 1, workIds: ["b", "c"] },
    );
    expect(merged.workIds).toEqual(["a", "b", "c"]);
  });

  it("reports how many were added vs already present", () => {
    const { added, alreadyPresent } = mergeFavorites(
      { version: 1, workIds: ["a", "b"] },
      { version: 1, workIds: ["b", "c", "d"] },
    );
    expect(added).toBe(2);
    expect(alreadyPresent).toBe(1);
  });

  it("keeps the current order in front, newest-first", () => {
    const { merged } = mergeFavorites(
      { version: 1, workIds: ["newest", "older"] },
      { version: 1, workIds: ["imported"] },
    );
    expect(merged.workIds).toEqual(["newest", "older", "imported"]);
  });

  it("does not mutate either input", () => {
    const current: FavoritesState = { version: 1, workIds: ["a"] };
    const incoming: FavoritesState = { version: 1, workIds: ["b"] };
    mergeFavorites(current, incoming);
    expect(current.workIds).toEqual(["a"]);
    expect(incoming.workIds).toEqual(["b"]);
  });
});

describe("writeStoredLocale", () => {
  it("writes the given locale", () => {
    const store = stubWorkingStorage();
    writeStoredLocale("en");
    expect(store.get(LOCALE_STORAGE_KEY)).toBe("en");
  });

  it("does not throw when storage access fails", () => {
    vi.stubGlobal("window", {
      localStorage: {
        setItem: () => {
          throw new Error("quota exceeded");
        },
      },
    });
    expect(() => writeStoredLocale("ja")).not.toThrow();
  });

  it("does not throw when there is no window at all", () => {
    expect(() => writeStoredLocale("ja")).not.toThrow();
  });
});
