import { describe, expect, it } from "vitest";

import composers from "@/data/catalog/composers.json";
import type { Composer } from "./catalog-types";
import { portraitThumb } from "./portrait-thumb";

describe("portraitThumb", () => {
  it("moves the file into the thumb sub-directory", () => {
    expect(portraitThumb("/portraits/170.jpg")).toBe("/portraits/thumb/170.jpg");
  });

  /**
   * The mapping is a prefix rewrite, so it silently returns the input
   * unchanged for anything not under `/portraits/` — which would serve the
   * 400px original into a 48px box. Every stored portrait must match the
   * shape it assumes.
   */
  it("covers every stored portrait path", () => {
    const portraits = (composers as Composer[])
      .map((composer) => composer.portrait)
      .filter((portrait): portrait is string => Boolean(portrait));

    expect(portraits.length).toBeGreaterThan(0);
    for (const portrait of portraits) {
      expect(portrait).toMatch(/^\/portraits\/\d+\.jpg$/);
      expect(portraitThumb(portrait)).not.toBe(portrait);
    }
  });
});
