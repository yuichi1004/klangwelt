import { expect, test } from "@playwright/test";

/**
 * Open Graph metadata (issue #103). The full text of every description is
 * covered by unit tests on `buildOpenGraph`/`composerOgImage` in
 * `src/lib/og.test.ts` — this only checks that the tags actually land in the
 * rendered `<head>`, and that `og:image` is a real absolute URL (Open Graph
 * consumers reject relative ones).
 */

type Page = import("@playwright/test").Page;

const ogContent = (page: Page, property: string) =>
  page.locator(`meta[property="${property}"]`).getAttribute("content");

async function expectBasicOgTags(page: Page) {
  await expect(ogContent(page, "og:title")).resolves.not.toBe("");
  await expect(ogContent(page, "og:description")).resolves.not.toBe("");
  await expect(ogContent(page, "og:image")).resolves.toMatch(/^https:\/\//);
}

test.describe("Open Graph metadata", () => {
  test("homepage has site-wide OG tags with the default image", async ({
    page,
  }) => {
    await page.goto("/ja");
    await expectBasicOgTags(page);
    await expect(ogContent(page, "og:image")).resolves.toMatch(
      /\/og-default\.png$/,
    );
    await expect(ogContent(page, "og:site_name")).resolves.toBe("Klangwelt");
    await expect(ogContent(page, "og:locale")).resolves.toBe("ja_JP");
  });

  test("a composer with a public-domain portrait uses it as og:image", async ({
    page,
  }) => {
    // Composer 170 (Copland) ships a public-domain portrait — no attribution
    // needed, so alt falls back to the composer's own name.
    await page.goto("/ja/composers/170");
    await expectBasicOgTags(page);
    await expect(ogContent(page, "og:image")).resolves.toMatch(
      /\/portraits\/170\.jpg$/,
    );
    await expect(ogContent(page, "og:image:alt")).resolves.toBe(
      "アーロン・コープランド",
    );
  });

  test("a composer with a CC BY/BY-SA portrait carries attribution in the image alt", async ({
    page,
  }) => {
    // Composer 5 (Pärt) ships a CC BY-SA 2.0 portrait by "Woesinger".
    await page.goto("/ja/composers/5");
    await expectBasicOgTags(page);
    await expect(ogContent(page, "og:image")).resolves.toMatch(
      /\/portraits\/5\.jpg$/,
    );
    await expect(ogContent(page, "og:image:alt")).resolves.toContain(
      "CC BY-SA",
    );
  });

  test("a composer with no portrait falls back to the default image", async ({
    page,
  }) => {
    // Composer 23 (Janequin) has no portrait in data/portraits.json.
    await page.goto("/ja/composers/23");
    await expectBasicOgTags(page);
    await expect(ogContent(page, "og:image")).resolves.toMatch(
      /\/og-default\.png$/,
    );
  });

  test("a work page reuses its composer's portrait", async ({ page }) => {
    // Beethoven's Symphony No. 5 — composer 145 has a public-domain portrait.
    await page.goto("/ja/works/16406");
    await expectBasicOgTags(page);
    await expect(ogContent(page, "og:image")).resolves.toMatch(
      /\/portraits\/145\.jpg$/,
    );
    await expect(ogContent(page, "og:title")).resolves.toContain(
      "交響曲第5番",
    );
  });

  test("other pages fall back to the default image with their own title", async ({
    page,
  }) => {
    await page.goto("/ja/credits");
    await expectBasicOgTags(page);
    await expect(ogContent(page, "og:title")).resolves.toBe("出典とライセンス");
    await expect(ogContent(page, "og:image")).resolves.toMatch(
      /\/og-default\.png$/,
    );
  });

  test("twitter tags are present via the site-wide default", async ({
    page,
  }) => {
    await page.goto("/ja");
    await expect(
      page.locator('meta[name="twitter:card"]').getAttribute("content"),
    ).resolves.toBe("summary_large_image");
  });
});
