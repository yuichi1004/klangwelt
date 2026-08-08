import { describe, expect, it } from "vitest";

import { PITCH_CLASSES } from "./dictionary";
import { parseTitle } from "./parse";
import {
  toJapaneseTitle,
  translateCatalogue,
  translateForm,
  translateKey,
} from "./translate";

const ja = (title: string) => toJapaneseTitle(title).text;

describe("translateKey", () => {
  it("puts the accidental in front of the pitch", () => {
    expect(translateKey({ pitch: "C", accidental: "sharp", mode: "minor" })).toBe(
      "嬰ハ短調",
    );
    expect(translateKey({ pitch: "E", accidental: "flat", mode: "major" })).toBe(
      "変ホ長調",
    );
  });

  it("assumes major when the title omits the mode", () => {
    expect(translateKey({ pitch: "D" })).toBe("ニ長調");
  });

  it("covers every pitch class in both modes and both accidentals", () => {
    const modes = ["major", "minor"] as const;
    const accidentals = [undefined, "sharp", "flat"] as const;
    for (const pitch of Object.keys(PITCH_CLASSES)) {
      for (const mode of modes) {
        for (const accidental of accidentals) {
          const rendered = translateKey({ pitch, accidental, mode });
          expect(rendered).toMatch(/^[嬰変]?[ハニホヘトイロ][長短]調$/);
        }
      }
    }
  });
});

describe("translateCatalogue", () => {
  it("renders opus numbers the Japanese way", () => {
    expect(translateCatalogue("op. 67")).toBe("作品67");
    expect(translateCatalogue("op. 27 no. 2")).toBe("作品27-2");
  });

  it("keeps other sigla and normalises the separator", () => {
    expect(translateCatalogue("BWV.1063")).toBe("BWV 1063");
    expect(translateCatalogue("Hob.I:45")).toBe("Hob I:45");
    expect(translateCatalogue("K.477")).toBe("K 477");
  });
});

describe("translateForm", () => {
  it("composes instrument plus form without a dedicated entry", () => {
    expect(translateForm("Piano Concerto")).toBe("ピアノ協奏曲");
    expect(translateForm("Oboe Concerto")).toBe("オーボエ協奏曲");
    expect(translateForm("Viola Concerto")).toBe("ヴィオラ協奏曲");
    expect(translateForm("String Quartet")).toBe("弦楽四重奏曲");
    expect(translateForm("Piano Quintet")).toBe("ピアノ五重奏曲");
  });

  it("prefers an irregular compound over the compositional path", () => {
    expect(translateForm("Concerto Grosso")).toBe("合奏協奏曲");
    expect(translateForm("Concerto grosso")).toBe("合奏協奏曲");
    expect(translateForm("Well-tempered Clavier")).toBe("平均律クラヴィーア曲集");
  });

  it("renders a leading count with the right Japanese counter", () => {
    expect(translateForm("5 Pieces")).toBe("5つの小品");
    expect(translateForm("3 Pieces")).toBe("3つの小品");
    // The `つ` counter stops at nine.
    expect(translateForm("12 Spanish Dances")).toBe("12のスペイン舞曲");
    expect(translateForm("24 Preludes")).toBe("24の前奏曲");
  });

  it("renders nationalities that qualify a form", () => {
    expect(translateForm("Hungarian Rhapsody")).toBe("ハンガリー狂詩曲");
    expect(translateForm("English Suite")).toBe("イギリス組曲");
  });

  it("returns undefined for proper nouns so they are not half-translated", () => {
    expect(translateForm("El sombrero de tres picos")).toBeUndefined();
    expect(translateForm("Années de pèlerinage")).toBeUndefined();
    expect(translateForm("Chôros")).toBeUndefined();
  });
});

describe("toJapaneseTitle", () => {
  it("assembles form, number, key, catalogue and nickname", () => {
    expect(ja('Symphony no. 5 in C minor, op. 67, "Fate"')).toBe(
      "交響曲第5番 ハ短調 作品67「運命」",
    );
    expect(ja('Piano Sonata no. 14 in C sharp minor, op. 27 no. 2, "Moonlight"')).toBe(
      "ピアノソナタ第14番 嬰ハ短調 作品27-2「月光」",
    );
    expect(ja('Piano Concerto no. 5 in E flat major, op. 73, "Emperor"')).toBe(
      "ピアノ協奏曲第5番 変ホ長調 作品73「皇帝」",
    );
  });

  it("keeps an unlisted nickname verbatim instead of guessing", () => {
    expect(ja('Symphony no. 4, H.191, "Deliciae Basiliensis"')).toBe(
      "交響曲第4番 H 191「バーゼルの喜び」",
    );
    expect(ja('Symphony no. 3, "Zzz Unknown Nickname"')).toBe(
      "交響曲第3番「Zzz Unknown Nickname」",
    );
  });

  it("prefixes a translatable scoring clause", () => {
    expect(ja("Poème, for violin and orchestra, op. 25")).toBe(
      "ヴァイオリンと管弦楽のための詩曲 作品25",
    );
    expect(ja("Concerto in D minor for 3 Harpsichords, BWV.1063")).toBe(
      "3台のチェンバロのための協奏曲 ニ短調 BWV 1063",
    );
  });

  it("drops an untranslatable scoring clause but keeps the rest", () => {
    expect(ja("Concerto grosso no. 1, for string orchestra and piano")).toBe(
      "弦楽合奏とピアノのための合奏協奏曲第1番",
    );
  });

  it("falls back to the original title for proper nouns", () => {
    const result = toJapaneseTitle("El sombrero de tres picos");
    expect(result.text).toBe("El sombrero de tres picos");
    expect(result.translated).toBe(false);
  });

  it("lets a hand-written override win", () => {
    const result = toJapaneseTitle("Carmen", "カルメン");
    expect(result).toEqual({ text: "カルメン", translated: true });
  });

  it("handles a bare key as major", () => {
    expect(ja('Symphony no. 4 in A, op. 90, "Italian"')).toBe(
      "交響曲第4番 イ長調 作品90「イタリア」",
    );
  });

  it("round-trips a representative sample of the real catalogue", () => {
    const samples: Array<[string, string]> = [
      ["Symphony no. 9 in D minor, WAB 109", "交響曲第9番 ニ短調 WAB 109"],
      ["Cello Concerto no. 1 in E flat major, op. 107", "チェロ協奏曲第1番 変ホ長調 作品107"],
      ["Violin Concerto no. 8 in A minor, op. 47", "ヴァイオリン協奏曲第8番 イ短調 作品47"],
      ["String Quartet in G minor, L.85, op. 10", "弦楽四重奏曲 ト短調 L 85 作品10"],
      ["Masonic Funeral Music, K.477", "Masonic Funeral Music, K.477"],
      ["Gloria in D major, RV.589", "グロリア ニ長調 RV 589"],
      ["Octet for Wind Instruments", "管楽器のための八重奏曲"],
      ["Piano Trio no. 1", "ピアノ三重奏曲第1番"],
      ["Requiem", "レクイエム"],
    ];
    for (const [english, expected] of samples) {
      expect(ja(english), english).toBe(expected);
    }
  });

  it("never emits a stray separator or empty segment", () => {
    for (const title of [
      "Symphony no. 5 in C minor, op. 67",
      "Lyric Suite ",
      "Piano Concerto, op. 38",
      "Serenade",
    ]) {
      const { text } = toJapaneseTitle(title);
      expect(text).not.toMatch(/\s{2,}|^\s|\s$|「」/);
      expect(parseTitle(title).form.length).toBeGreaterThan(0);
    }
  });
});
