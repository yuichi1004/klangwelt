import { describe, expect, it } from "vitest";

import {
  EMPTY_FAVORITES,
  parseFavorites,
  toggleFavorite,
  type FavoritesState,
} from "./favorites";

describe("parseFavorites", () => {
  it("reads a well-formed payload", () => {
    expect(parseFavorites('{"version":1,"workIds":["a","b"]}')).toEqual({
      version: 1,
      workIds: ["a", "b"],
    });
  });

  it("falls back to empty for anything unusable", () => {
    for (const value of [null, "", "not json", "[]", '{"workIds":"nope"}', "null"]) {
      expect(parseFavorites(value), value ?? "null").toEqual(EMPTY_FAVORITES);
    }
  });

  it("drops non-string entries and duplicates", () => {
    expect(
      parseFavorites('{"version":1,"workIds":["a",1,"a",null,"b"]}'),
    ).toEqual({ version: 1, workIds: ["a", "b"] });
  });
});

describe("toggleFavorite", () => {
  it("adds to the front so the newest is first", () => {
    expect(toggleFavorite({ version: 1, workIds: ["a"] }, "b").workIds).toEqual([
      "b",
      "a",
    ]);
  });

  it("removes an existing entry", () => {
    expect(
      toggleFavorite({ version: 1, workIds: ["a", "b"] }, "a").workIds,
    ).toEqual(["b"]);
  });

  it("does not mutate the input", () => {
    const state: FavoritesState = { version: 1, workIds: ["a"] };
    toggleFavorite(state, "b");
    expect(state.workIds).toEqual(["a"]);
  });
});
