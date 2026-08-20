import { describe, expect, it } from "vitest";

import { buildShareLinks } from "./share";

describe("buildShareLinks", () => {
  it("produces all four fields from one {url, text}", () => {
    const links = buildShareLinks({
      url: "https://klangwelt-dun.vercel.app/ja/works/16406",
      text: "Symphony no. 5 — Beethoven",
    });
    expect(links.url).toBe("https://klangwelt-dun.vercel.app/ja/works/16406");
    expect(links.x).toContain("https://x.com/intent/post?");
    expect(links.linkedin).toContain("https://www.linkedin.com/sharing/share-offsite/?");
    expect(links.facebook).toContain("https://www.facebook.com/sharer/sharer.php?");
  });

  it("builds the exact X intent URL", () => {
    const links = buildShareLinks({
      url: "https://klangwelt-dun.vercel.app/ja/works/16406",
      text: "Symphony no. 5",
    });
    expect(links.x).toBe(
      "https://x.com/intent/post?text=Symphony%20no.%205&url=https%3A%2F%2Fklangwelt-dun.vercel.app%2Fja%2Fworks%2F16406",
    );
  });

  it("encodes spaces in the X text as %20, not +", () => {
    const links = buildShareLinks({ url: "https://example.com", text: "a b c" });
    expect(links.x).toContain("a%20b%20c");
    expect(links.x).not.toContain("a+b+c");
  });

  it("builds the exact LinkedIn share URL, url fully percent-encoded", () => {
    const links = buildShareLinks({
      url: "https://klangwelt-dun.vercel.app/ja/works/16406",
      text: "ignored",
    });
    expect(links.linkedin).toBe(
      "https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fklangwelt-dun.vercel.app%2Fja%2Fworks%2F16406",
    );
  });

  it("builds the exact Facebook sharer URL", () => {
    const links = buildShareLinks({
      url: "https://klangwelt-dun.vercel.app/ja/works/16406",
      text: "ignored",
    });
    expect(links.facebook).toBe(
      "https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fklangwelt-dun.vercel.app%2Fja%2Fworks%2F16406",
    );
  });

  it("percent-encodes a Japanese title as UTF-8", () => {
    const links = buildShareLinks({
      url: "https://klangwelt-dun.vercel.app/ja/works/16406",
      text: "交響曲第5番 — ベートーヴェン",
    });
    const roundTripped = new URL(links.x).searchParams.get("text");
    expect(roundTripped).toBe("交響曲第5番 — ベートーヴェン");
  });

  it("round-trips characters that would otherwise break the query", () => {
    const text = 'Symphony no. 3, "Eroica" & more?';
    const links = buildShareLinks({
      url: "https://klangwelt-dun.vercel.app/ja/works/16406",
      text,
    });
    expect(new URL(links.x).searchParams.get("text")).toBe(text);
    expect(new URL(links.x).searchParams.get("url")).toBe(
      "https://klangwelt-dun.vercel.app/ja/works/16406",
    );
  });

  it("keeps links.url as the plain, unencoded URL", () => {
    const url = "https://klangwelt-dun.vercel.app/ja/works/16406";
    const links = buildShareLinks({ url, text: "anything" });
    expect(links.url).toBe(url);
  });

  it("produces three parseable URLs even with empty text", () => {
    const links = buildShareLinks({
      url: "https://klangwelt-dun.vercel.app/ja",
      text: "",
    });
    for (const link of [links.x, links.linkedin, links.facebook]) {
      expect(() => new URL(link)).not.toThrow();
    }
  });
});
