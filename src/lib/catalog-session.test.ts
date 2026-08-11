import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CATALOG_STORAGE_KEY,
  COMPOSERS_STORAGE_KEY,
  readSavedQuery,
  saveQuery,
} from "./catalog-session";

/**
 * There is no DOM in this test environment (see vitest.config.mts), so
 * `window` is undefined by default — which conveniently doubles as the
 * "storage access throws" case every real browser can hit (Safari private
 * mode, storage quota, a locked-down embed). A fake `window` is stubbed in
 * only for the tests that need working storage.
 */
function stubWorkingStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    sessionStorage: {
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

describe("readSavedQuery", () => {
  it("returns an empty string when nothing is saved", () => {
    stubWorkingStorage();
    expect(readSavedQuery(CATALOG_STORAGE_KEY)).toBe("");
  });

  it("returns a previously saved query", () => {
    const store = stubWorkingStorage();
    store.set(CATALOG_STORAGE_KEY, "?e=Baroque");
    expect(readSavedQuery(CATALOG_STORAGE_KEY)).toBe("?e=Baroque");
  });

  it("keeps the catalogue's and the composer list's saved queries apart", () => {
    const store = stubWorkingStorage();
    store.set(CATALOG_STORAGE_KEY, "?e=Baroque");
    store.set(COMPOSERS_STORAGE_KEY, "?stars=5");
    expect(readSavedQuery(CATALOG_STORAGE_KEY)).toBe("?e=Baroque");
    expect(readSavedQuery(COMPOSERS_STORAGE_KEY)).toBe("?stars=5");
  });

  it("returns an empty string when storage access throws", () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(readSavedQuery(CATALOG_STORAGE_KEY)).toBe("");
  });

  it("returns an empty string when there is no window at all", () => {
    // No stub applied: `window` is undefined, as it is during the server
    // render of a statically exported page.
    expect(readSavedQuery(CATALOG_STORAGE_KEY)).toBe("");
  });
});

describe("saveQuery", () => {
  it("writes under the given key", () => {
    const store = stubWorkingStorage();
    saveQuery(CATALOG_STORAGE_KEY, "?q=Moonlight");
    expect(store.get(CATALOG_STORAGE_KEY)).toBe("?q=Moonlight");
  });

  it("does not throw when storage access fails", () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        setItem: () => {
          throw new Error("quota exceeded");
        },
      },
    });
    expect(() => saveQuery(CATALOG_STORAGE_KEY, "?q=Moonlight")).not.toThrow();
  });

  it("does not throw when there is no window at all", () => {
    expect(() => saveQuery(CATALOG_STORAGE_KEY, "?q=Moonlight")).not.toThrow();
  });
});
