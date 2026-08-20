import { describe, expect, it } from "vitest";

import { canonicalUrl, SITE_URL } from "./site";

describe("canonicalUrl", () => {
  it("prefixes a site-relative path with SITE_URL", () => {
    expect(canonicalUrl("/ja/works/16406")).toBe(
      "https://klangwelt-dun.vercel.app/ja/works/16406",
    );
  });

  it("normalises a path missing its leading slash", () => {
    expect(canonicalUrl("ja/composers/145")).toBe(
      "https://klangwelt-dun.vercel.app/ja/composers/145",
    );
  });

  it("never produces a double slash", () => {
    expect(canonicalUrl("/ja")).not.toContain("//ja");
  });

  it("produces a URL that parses", () => {
    expect(() => new URL(canonicalUrl("/ja/works/16406"))).not.toThrow();
  });

  it("SITE_URL itself carries no trailing slash", () => {
    // canonicalUrl's naive concatenation relies on this — a trailing slash
    // on SITE_URL plus a leading slash on path would double up.
    expect(SITE_URL.endsWith("/")).toBe(false);
  });
});
