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
    // Kinderszenen (15046) has no entry in data/media.json. (Eine kleine
    // Nachtmusik, 23610, used to be the example here, but the ★4・★5拡充
    // project — commit 9e132b0, unrelated to issue #91 — later gave it two
    // appearances, so this pins a work still genuinely absent from the file.)
    await page.goto("/ja/works/15046");
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
  }) => {
    await page.goto("/ja");
    // The search box is a single always-visible field shared by mobile and
    // desktop — no panel to open first.
    await searchBox(page).fill(clockworkOrange.title.ja);
    await expect(page).toHaveURL(/q=/);

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
  }) => {
    await page.goto("/ja");
    await searchBox(page).fill("交響曲第9番");

    const card = page.locator('a[href="/ja/works/16238"]');
    await expect(card).toBeVisible();
    await expect(card.locator('span[role="img"][aria-label^="映像作品:"]')).toHaveCount(
      0,
    );
  });
});

/**
 * The `/media` list and detail pages (issue #91): browsing by production
 * instead of by musical work, built from the reverse index in
 * `src/lib/media-index.ts`. `src/lib/media-index.test.ts` and
 * `src/lib/media-filter.test.ts` cover the pure grouping/filtering logic;
 * these check that it's actually wired to the UI.
 *
 * "2001: A Space Odyssey" (1968) is used for the bundling test because it is
 * credited from three different works in `data/media.json` — its id,
 * `2001-a-space-odyssey-1968`, is `mediaId()` applied to that title and year.
 */
test.describe("browsing by film, anime and TV", () => {
  const resultCount = (page: import("@playwright/test").Page) =>
    page.getByTestId("result-count");
  const mediaSearchBox = (page: import("@playwright/test").Page) =>
    page.getByRole("searchbox", { name: "作品名で検索" });

  test("the list shows every production and narrows by kind", async ({ page }) => {
    await page.goto("/ja/media");
    await expect(resultCount(page)).toHaveText(/^\d+作品$/);
    const before = await resultCount(page).textContent();

    await page.getByRole("button", { name: "アニメ" }).click();
    await expect(page).toHaveURL(/[?&]k=anime/);
    await expect(resultCount(page)).toHaveText(/^\d+作品 \/ 全\d+作品$/);
    expect(await resultCount(page).textContent()).not.toBe(before);
  });

  test("searching finds a production by Japanese title", async ({ page }) => {
    await page.goto("/ja/media");
    await mediaSearchBox(page).fill("時計じかけのオレンジ");
    await expect(page).toHaveURL(/q=/);
    await expect(
      page.locator('a[href="/ja/media/a-clockwork-orange-1971"]'),
    ).toBeVisible();
  });

  test("an unmatched search shows the empty state", async ({ page }) => {
    await page.goto("/ja/media");
    await mediaSearchBox(page).fill("zzzznosuchmovie");
    await expect(page.getByText("該当する映像作品が見つかりませんでした。")).toBeVisible();
  });

  test("the detail page bundles every work credited to that production", async ({
    page,
  }) => {
    await page.goto("/ja/media/2001-a-space-odyssey-1968");
    await expect(page.getByRole("heading", { name: "2001年宇宙の旅" })).toBeVisible();
    await expect(page.getByText("2001: A Space Odyssey")).toBeVisible();

    await expect(page.locator('a[href="/ja/works/2076"]')).toBeVisible();
    await expect(page.locator('a[href="/ja/works/18889"]')).toBeVisible();
    await expect(page.locator('a[href="/ja/works/19622"]')).toBeVisible();
  });

  test("the work detail page's media section links to the production page", async ({
    page,
  }) => {
    await page.goto("/ja/works/16238");
    await page.getByRole("link", { name: clockworkOrange.title.ja }).click();
    await expect(page).toHaveURL("/ja/media/a-clockwork-orange-1971");
    await expect(
      page.getByRole("heading", { name: clockworkOrange.title.ja }),
    ).toBeVisible();
  });
});
