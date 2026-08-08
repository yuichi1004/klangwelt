import { describe, expect, it } from "vitest";

import { parseTitle } from "./parse";

describe("parseTitle", () => {
  it("splits a fully specified title", () => {
    expect(
      parseTitle('Piano Sonata no. 14 in C sharp minor, op. 27 no. 2, "Moonlight"'),
    ).toEqual({
      form: "Piano Sonata",
      number: 14,
      key: { pitch: "C", accidental: "sharp", mode: "minor" },
      catalogue: ["op. 27 no. 2"],
      nickname: "Moonlight",
      instrumentation: undefined,
      qualifiers: [],
    });
  });

  it("does not mistake an opus sub-number for the work number", () => {
    const parsed = parseTitle("Prelude in C, op. 28 no. 1");
    expect(parsed.number).toBeUndefined();
    expect(parsed.catalogue).toEqual(["op. 28 no. 1"]);
  });

  it("reads a bare key without a mode", () => {
    expect(parseTitle("Symphony no. 4 in A, op. 90").key).toEqual({
      pitch: "A",
      accidental: undefined,
      mode: undefined,
    });
  });

  it("separates a scoring clause inside the head", () => {
    expect(parseTitle("Concerto in D minor for 3 Harpsichords, BWV.1063")).toMatchObject({
      form: "Concerto",
      instrumentation: "3 Harpsichords",
      catalogue: ["BWV.1063"],
    });
  });

  it("separates a scoring clause in its own segment", () => {
    expect(parseTitle("Poème, for violin and orchestra, op. 25")).toMatchObject({
      form: "Poème",
      instrumentation: "violin and orchestra",
      catalogue: ["op. 25"],
    });
  });

  it("keeps multiple catalogue references in order", () => {
    expect(parseTitle("Années de pèlerinage, S.160-163, R.10a-e")).toMatchObject({
      form: "Années de pèlerinage",
      catalogue: ["S.160-163", "R.10a-e"],
    });
  });

  it("handles catalogues with roman numerals and colons", () => {
    expect(
      parseTitle('Symphony no. 45 in F sharp minor, Hob.I:45, "Farewell"'),
    ).toMatchObject({
      form: "Symphony",
      number: 45,
      catalogue: ["Hob.I:45"],
      nickname: "Farewell",
    });
  });

  it("keeps an unrecognised trailing segment as a qualifier", () => {
    expect(parseTitle("Rodeo").qualifiers).toEqual([]);
    expect(parseTitle("Slavonic Dances, Series 2, op. 72, B.145")).toMatchObject({
      form: "Slavonic Dances",
      qualifiers: ["Series 2"],
      catalogue: ["op. 72", "B.145"],
    });
  });

  it("attaches a standalone number to the preceding catalogue entry", () => {
    expect(parseTitle("Concerto Grosso in D major, op. 6, no. 1")).toMatchObject({
      form: "Concerto Grosso",
      number: undefined,
      catalogue: ["op. 6 no. 1"],
    });
  });

  it("keeps a scoring clause that spans several commas", () => {
    expect(
      parseTitle("Quartet for flute, viola da gamba, bassoon and continuo in B minor, TWV. 43:h3"),
    ).toMatchObject({
      form: "Quartet",
      key: { pitch: "B", mode: "minor" },
      instrumentation: "flute, viola da gamba, bassoon and continuo",
    });
  });

  it("does not read an ordinary phrase as a key", () => {
    expect(parseTitle("A Jazz Symphony").key).toBeUndefined();
    expect(parseTitle("Music in Fifths").key).toBeUndefined();
  });

  it("leaves proper-noun titles as the form", () => {
    expect(parseTitle("El sombrero de tres picos").form).toBe(
      "El sombrero de tres picos",
    );
  });

  it("tolerates the stray double spaces present in the source data", () => {
    expect(parseTitle("Lyric Suite ").form).toBe("Lyric Suite");
  });
});
