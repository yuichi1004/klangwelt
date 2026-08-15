import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DISCOVER_SEEN_KEY,
  DISCOVER_SEEN_LIMIT,
  parseSeen,
  pushSeen,
  readSeen,
} from "./discover-seen";

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

describe("parseSeen", () => {
  it("reads a well-formed payload", () => {
    expect(parseSeen('["a","b"]')).toEqual(["a", "b"]);
  });

  it("falls back to empty for anything unusable", () => {
    for (const value of [null, "", "not json", "null", '{"a":1}', "42"]) {
      expect(parseSeen(value), value ?? "null").toEqual([]);
    }
  });

  it("drops non-string entries", () => {
    expect(parseSeen('["a",1,null,"b"]')).toEqual(["a", "b"]);
  });

  it("truncates to the ring limit", () => {
    const ids = Array.from({ length: DISCOVER_SEEN_LIMIT + 10 }, (_, i) => `w${i}`);
    expect(parseSeen(JSON.stringify(ids))).toHaveLength(DISCOVER_SEEN_LIMIT);
  });
});

describe("readSeen", () => {
  it("returns an empty array when nothing is saved", () => {
    stubWorkingStorage();
    expect(readSeen()).toEqual([]);
  });

  it("returns a previously saved list", () => {
    const store = stubWorkingStorage();
    store.set(DISCOVER_SEEN_KEY, '["a","b"]');
    expect(readSeen()).toEqual(["a", "b"]);
  });

  it("returns an empty array when storage access throws", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(readSeen()).toEqual([]);
  });

  it("returns an empty array when there is no window at all", () => {
    expect(readSeen()).toEqual([]);
  });
});

describe("pushSeen", () => {
  it("writes the given ids newest-first", () => {
    const store = stubWorkingStorage();
    pushSeen(["a", "b"]);
    expect(JSON.parse(store.get(DISCOVER_SEEN_KEY)!)).toEqual(["a", "b"]);
  });

  it("prepends to what was already there and de-duplicates", () => {
    const store = stubWorkingStorage();
    store.set(DISCOVER_SEEN_KEY, '["b","c"]');
    pushSeen(["a", "b"]);
    expect(JSON.parse(store.get(DISCOVER_SEEN_KEY)!)).toEqual(["a", "b", "c"]);
  });

  it("trims to the ring limit", () => {
    const store = stubWorkingStorage();
    const existing = Array.from({ length: DISCOVER_SEEN_LIMIT }, (_, i) => `old${i}`);
    store.set(DISCOVER_SEEN_KEY, JSON.stringify(existing));
    pushSeen(["new1", "new2"]);
    const written = JSON.parse(store.get(DISCOVER_SEEN_KEY)!) as string[];
    expect(written).toHaveLength(DISCOVER_SEEN_LIMIT);
    expect(written[0]).toBe("new1");
    expect(written[1]).toBe("new2");
  });

  it("does not throw when storage access fails", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("quota exceeded");
        },
      },
    });
    expect(() => pushSeen(["a"])).not.toThrow();
  });

  it("does not throw when there is no window at all", () => {
    expect(() => pushSeen(["a"])).not.toThrow();
  });
});
