import { describe, expect, it } from "vitest";

import { buildOpenGraph, composerOgImage, DEFAULT_OG_IMAGE } from "./og";
import type { PortraitCredit } from "./licenses";

function credit(overrides: Partial<PortraitCredit> = {}): PortraitCredit {
  return {
    composerId: "1",
    file: "/portraits/1.jpg",
    commonsFile: "Example.jpg",
    author: "Jane Doe",
    license: "Public domain",
    licenseUrl: "",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Example.jpg",
    ...overrides,
  };
}

describe("buildOpenGraph", () => {
  it("falls back to the default image when none is given", () => {
    const { openGraph } = buildOpenGraph("ja", {
      title: "Title",
      description: "Description",
    });
    expect(openGraph?.images).toEqual([DEFAULT_OG_IMAGE]);
  });

  it("uses the given image instead of the default", () => {
    const image = { url: "/portraits/1.jpg", alt: "A portrait" };
    const { openGraph } = buildOpenGraph("ja", {
      title: "Title",
      description: "Description",
      image,
    });
    expect(openGraph?.images).toEqual([image]);
  });

  it("maps locale to the OG locale tag", () => {
    expect(
      buildOpenGraph("ja", { title: "T", description: "D" }).openGraph?.locale,
    ).toBe("ja_JP");
    expect(
      buildOpenGraph("en", { title: "T", description: "D" }).openGraph?.locale,
    ).toBe("en_US");
  });

  it("passes through title and description unchanged", () => {
    const { openGraph } = buildOpenGraph("en", {
      title: "My title",
      description: "My description",
    });
    expect(openGraph?.title).toBe("My title");
    expect(openGraph?.description).toBe("My description");
  });
});

describe("composerOgImage", () => {
  it("returns undefined when the composer has no portrait", () => {
    expect(
      composerOgImage({ portrait: undefined }, credit(), "Fallback"),
    ).toBeUndefined();
  });

  it("returns undefined when there is a portrait path but no credit record", () => {
    expect(
      composerOgImage({ portrait: "/portraits/1.jpg" }, undefined, "Fallback"),
    ).toBeUndefined();
  });

  it("uses the fallback alt text for a licence that needs no attribution", () => {
    expect(
      composerOgImage(
        { portrait: "/portraits/1.jpg" },
        credit({ license: "Public domain" }),
        "Fallback",
      ),
    ).toEqual({ url: "/portraits/1.jpg", alt: "Fallback" });
  });

  it("uses author/licence as alt text when attribution is required", () => {
    expect(
      composerOgImage(
        { portrait: "/portraits/1.jpg" },
        credit({ author: "Jane Doe", license: "CC BY-SA 4.0" }),
        "Fallback",
      ),
    ).toEqual({ url: "/portraits/1.jpg", alt: "Jane Doe / CC BY-SA 4.0" });
  });
});
