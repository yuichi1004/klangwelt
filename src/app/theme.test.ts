import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Contrast guard for the palette.
 *
 * The colours come from a design brief that was written for mood rather than
 * legibility: as given, terracotta sat at 1.98 on the olive ground, amber at
 * 3.08 and the secondary grey at 3.80, all below the 4.5 that WCAG AA asks of
 * body text. The values in `globals.css` are the adjusted ones, and this test
 * fails the build if a later edit drops any real pairing back under the line.
 */

const css = readFileSync(
  path.join(process.cwd(), "src/app/globals.css"),
  "utf8",
);

/** Reads a `--color-*` declaration straight out of the stylesheet. */
function token(name: string): string {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`--color-${name} is not defined in globals.css`);
  return match[1];
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

const AA_TEXT = 4.5;
/** WCAG 1.4.11: UI components and graphical objects. */
const AA_NON_TEXT = 3;

const surfaces = {
  page: "paper",
  card: "paper-raised",
  "amber surface": "accent-soft",
  "terracotta surface": "terra-surface",
} as const;

describe("colour tokens are defined", () => {
  it("exposes every token the components rely on", () => {
    for (const name of [
      "paper",
      "paper-raised",
      "line",
      "ink",
      "ink-soft",
      "ink-faint",
      "accent",
      "accent-fill",
      "accent-ink",
      "accent-soft",
      "terra",
      "terra-surface",
    ]) {
      expect(() => token(name), name).not.toThrow();
    }
  });

  it("uses neither pure white nor pure black, as the brief asks", () => {
    for (const match of css.matchAll(/--color-[\w-]+:\s*(#[0-9a-fA-F]{6})/g)) {
      expect(match[1].toLowerCase()).not.toBe("#ffffff");
      expect(match[1].toLowerCase()).not.toBe("#000000");
    }
  });
});

describe("text meets WCAG AA on every surface it is used on", () => {
  for (const [surfaceName, surfaceToken] of Object.entries(surfaces)) {
    for (const textToken of ["ink", "ink-soft", "ink-faint", "accent"]) {
      it(`${textToken} on the ${surfaceName}`, () => {
        expect(contrast(token(textToken), token(surfaceToken))).toBeGreaterThanOrEqual(
          AA_TEXT,
        );
      });
    }
  }

  it("the CTA label reads against the amber fill", () => {
    expect(
      contrast(token("accent-ink"), token("accent-fill")),
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("parchment reads against the terracotta tag ground", () => {
    expect(contrast(token("ink"), token("terra-surface"))).toBeGreaterThanOrEqual(
      AA_TEXT,
    );
  });
});

describe("interactive elements meet the non-text threshold", () => {
  it("the amber fill separates from the page", () => {
    expect(contrast(token("accent-fill"), token("paper"))).toBeGreaterThanOrEqual(
      AA_NON_TEXT,
    );
  });

  it("the focus ring is visible on both the page and cards", () => {
    for (const surface of ["paper", "paper-raised"] as const) {
      expect(
        contrast(token("accent"), token(surface)),
        surface,
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });
});

describe("the palette keeps its intended shape", () => {
  it("is dark: every surface is darker than every text colour", () => {
    for (const surfaceToken of Object.values(surfaces)) {
      for (const textToken of ["ink", "ink-soft", "ink-faint", "accent"]) {
        expect(
          relativeLuminance(token(textToken)),
          `${textToken} vs ${surfaceToken}`,
        ).toBeGreaterThan(relativeLuminance(token(surfaceToken)));
      }
    }
  });

  it("lifts cards above the page rather than sinking them", () => {
    expect(relativeLuminance(token("paper-raised"))).toBeGreaterThan(
      relativeLuminance(token("paper")),
    );
  });

  it("declares no light-mode override, since the site is dark only", () => {
    expect(css).not.toMatch(/prefers-color-scheme:\s*light/);
    expect(css).toMatch(/color-scheme:\s*dark/);
  });
});
