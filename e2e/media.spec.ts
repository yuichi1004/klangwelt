import { expect, test } from "@playwright/test";

import mediaData from "../data/media.json";

/**
 * Covers the parts of the film/anime/TV appearances feature that only exist
 * once JavaScript runs: searching by a media title on the catalogue and
 * seeing the "featured in ..." badge on the result card. The pure logic
 * (haystack, `matchedMediaTitle`) is unit-tested in `src/lib/catalog.test.ts`;
 * the work detail page's own section is plain server-rendered HTML and is
 * checked here mainly to confirm it actually reaches the page.
 *
 * Beethoven's 9th (id 16238) is used because it is one of the seed entries
 * in `data/media.json` and, being ★5, is stable in the catalogue's default
 * view.
 */

const clockworkOrange = mediaData["16238"].media[0];

const searchBox = (page: import("@playwright/test").Page) =>
  page.getByRole("searchbox", { name: "曲名・作曲家名で検索" });

test.describe("film/anime/TV appearances", () => {
  test("the work detail page shows the media section", async ({ page }) => {
    await page.goto("/ja/works/16238");
    await expect(
      page.getByRole("heading", { name: "映像作品での使用" }),
    ).toBeVisible();
    await expect(page.getByText(clockworkOrange.title.ja)).toBeVisible();
    await expect(page.getByText(String(clockworkOrange.year))).toBeVisible();
  });

  test("a work with no media data shows no section", async ({ page }) => {
    // Eine kleine Nachtmusik (23610) has no entry in data/media.json.
    await page.goto("/ja/works/23610");
    await expect(
      page.getByRole("heading", { name: "映像作品での使用" }),
    ).toBeHidden();
  });

  test("English pages show the English title and note", async ({ page }) => {
    await page.goto("/en/works/16238");
    await expect(
      page.getByRole("heading", { name: "In film and television" }),
    ).toBeVisible();
    await expect(page.getByText(clockworkOrange.title.en)).toBeVisible();
  });

  test("searching by a film title narrows the catalogue and badges the card", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/ja");
    // The search box lives inside the mobile filter sheet, hidden until it's
    // opened — same pattern as e2e/ime.spec.ts's mobile IME coverage.
    if (isMobile) await page.getByRole("button", { name: /^絞り込み/ }).click();

    await searchBox(page).fill(clockworkOrange.title.ja);
    await expect(page).toHaveURL(/q=/);
    if (isMobile) await page.getByRole("button", { name: "閉じる" }).last().click();

    const card = page.locator('a[href="/ja/works/16238"]');
    await expect(card).toBeVisible();
    await expect(
      card.getByRole("img", {
        name: `映像作品: ${clockworkOrange.title.ja}`,
      }),
    ).toBeVisible();
  });

  test("searching by the work's own title shows no media badge", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/ja");
    if (isMobile) await page.getByRole("button", { name: /^絞り込み/ }).click();

    await searchBox(page).fill("交響曲第9番");
    if (isMobile) await page.getByRole("button", { name: "閉じる" }).last().click();

    const card = page.locator('a[href="/ja/works/16238"]');
    await expect(card).toBeVisible();
    await expect(card.locator('span[role="img"][aria-label^="映像作品:"]')).toHaveCount(
      0,
    );
  });
});
