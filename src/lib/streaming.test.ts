import { describe, expect, it } from "vitest";

import type { Work } from "./catalog-types";
import { buildSearchQuery, buildStreamingLinks } from "./streaming";

const work = (overrides: Partial<Work>): Work =>
  ({
    id: "1",
    composerId: "1",
    title: "Symphony no. 5 in C minor, op. 67",
    titleJa: "交響曲第5番 ハ短調 作品67",
    genre: "Orchestral",
    popular: true,
    recommended: true,
    searchTerms: "",
    facts: { catalogue: [], catalogueJa: [] },
    ...overrides,
  }) as Work;

describe("buildSearchQuery", () => {
  it("combines the composer with the work title", () => {
    expect(buildSearchQuery(work({}), "Ludwig van Beethoven")).toBe(
      "Ludwig van Beethoven Symphony no. 5 in C minor, op. 67",
    );
  });

  it("prefers the first search term when Open Opus supplies one", () => {
    const stageWork = work({
      title: "El sombrero de tres picos",
      searchTerms: "El sombrero de tres picos, The three-cornered hat",
    });
    expect(buildSearchQuery(stageWork, "Manuel de Falla")).toBe(
      "Manuel de Falla El sombrero de tres picos",
    );
  });
});

describe("buildStreamingLinks", () => {
  it("percent-encodes non-ASCII titles for both services", () => {
    const links = buildStreamingLinks(
      work({ title: "Années de pèlerinage" }),
      "Franz Liszt",
    );
    expect(links.spotify).toBe(
      "https://open.spotify.com/search/Franz%20Liszt%20Ann%C3%A9es%20de%20p%C3%A8lerinage",
    );
    expect(links.youtubeMusic).toBe(
      "https://music.youtube.com/search?q=Franz%20Liszt%20Ann%C3%A9es%20de%20p%C3%A8lerinage",
    );
  });

  it("escapes characters that would otherwise break the URL", () => {
    const links = buildStreamingLinks(
      work({ title: 'Symphony no. 3, "Eroica" & more?' }),
      "Beethoven",
    );
    for (const url of [links.spotify, links.youtubeMusic]) {
      expect(url).not.toMatch(/[ "&?]/g.source ? /["\s]/ : /\s/);
      expect(() => new URL(url)).not.toThrow();
    }
    expect(links.youtubeMusic).toContain("%26");
    expect(links.youtubeMusic).toContain("%3F");
  });

  it("produces a usable link even with no search terms at all", () => {
    const links = buildStreamingLinks(work({ searchTerms: "" }), "");
    expect(links.query).toBe("Symphony no. 5 in C minor, op. 67");
    expect(() => new URL(links.spotify)).not.toThrow();
  });
});
