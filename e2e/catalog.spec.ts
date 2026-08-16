import fs from "node:fs";

import { expect, test } from "@playwright/test";

import catalogMeta from "../data/catalog/meta.json";

/**
 * Covers the parts of the site that only exist once JavaScript runs:
 * filtering, the URL round-trip, favourites in localStorage, and the mobile
 * filter sheet. The pure logic behind these is unit-tested in `src/lib`;
 * these tests check that it is actually wired to the UI.
 */

type Page = import("@playwright/test").Page;

const workCards = (page: Page) => page.locator('a[href^="/ja/works/"]');

/** The heading count above the results, not the ones in the hero or footer. */
const resultCount = (page: Page) => page.getByTestId("result-count");

// A curation batch can promote a work into the core index, so the total is
// read from the build rather than hardcoded — it does not stay 1,286.
const CORE_COUNT = catalogMeta.coreWorkCount.toLocaleString("ja-JP");
const allResultsText = `${CORE_COUNT}曲`;
const filteredResultsPattern = new RegExp(`^[\\d,]+曲 / 全${CORE_COUNT}曲$`);

const searchBox = (page: Page) =>
  page.getByRole("searchbox", { name: "曲名・作曲家名で検索" });

const discoverSection = (page: Page) => page.getByTestId("discover");
const discoverCards = (page: Page) =>
  discoverSection(page).locator('a[href^="/ja/works/"]');

async function seedFavorites(page: Page, workIds: string[]) {
  // Same idiom as the "corrupt storage" test below: navigate same-origin
  // first so localStorage is reachable, seed it, then navigate to the page
  // under test so it reads the seeded value on its initial mount.
  await page.goto("/ja");
  await page.evaluate(
    (ids) =>
      window.localStorage.setItem(
        "klangwelt.favorites.v1",
        JSON.stringify({ version: 1, workIds: ids }),
      ),
    workIds,
  );
}

/** Filters live in a collapsed-by-default panel shared by mobile and
 *  desktop; open it before interacting with anything inside it (the
 *  always-visible search box and the active-filter chips are not gated by
 *  this). */
const openFilterPanel = (page: Page) =>
  page.getByRole("button", { name: /^絞り込み/ }).click();

test.describe("catalogue filtering", () => {
  test("narrows results and reflects the filters in the URL", async ({ page }) => {
    // `?view=all` forces the results list on from the start, so the
    // "wait for the full index" checkpoint below has something to poll.
    await page.goto("/ja?view=all");

    // Wait for the full index to arrive before counting.
    await expect(resultCount(page)).toHaveText(allResultsText);

    await openFilterPanel(page);
    await page.getByRole("button", { name: "バロック" }).click();
    await expect(page).toHaveURL(/[?&]e=Baroque/);

    await page.getByRole("button", { name: "鍵盤楽器" }).click();
    await expect(page).toHaveURL(/[?&]g=Keyboard/);

    await expect(resultCount(page)).toHaveText(filteredResultsPattern);

    // Every visible card should belong to the filtered set.
    await expect(workCards(page).first()).toBeVisible();
  });

  test("restores state from a shared URL", async ({ page }) => {
    await page.goto("/ja?q=Moonlight");
    await expect(searchBox(page)).toHaveValue("Moonlight");
    await expect(page.getByText("月光")).toBeVisible();
  });

  test("searches by Japanese composer name", async ({ page }) => {
    await page.goto("/ja");
    await searchBox(page).fill("ベートーヴェン");
    await expect(page).toHaveURL(/q=/);
    await expect(workCards(page).first()).toBeVisible();
    await expect(
      page.getByText("ルートヴィヒ・ヴァン・ベートーヴェン").first(),
    ).toBeVisible();
  });

  test("clearing the filters brings every work back", async ({ page }) => {
    await page.goto("/ja?e=Baroque&stars=4");
    await openFilterPanel(page);
    await page.getByRole("button", { name: "条件をクリア" }).click();
    await expect(page).toHaveURL(/\/ja$/);
    // Clearing the filters returns to the discovery feed, which has no
    // result count of its own — going back to the full list is a deliberate
    // extra step (the "全{count}曲を見る" link), not the default any more.
    await expect(page.getByTestId("discover")).toBeVisible();
  });

  test("shows an empty state instead of a blank page", async ({ page }) => {
    await page.goto("/ja?q=zzzznosuchwork");
    await expect(
      page.getByText("条件に合う楽曲が見つかりませんでした。"),
    ).toBeVisible();
  });

  test("filtering by 定番度 narrows the URL and the results", async ({ page }) => {
    await page.goto("/ja");
    await openFilterPanel(page);
    // The chip's accessible name is "星4つ以上" — the visible "★4以上" label
    // would read as "black star 4 以上" to a screen reader, so the chip
    // overrides it with `aria-label` (see catalog-browser.tsx starChipLabel).
    await page.getByRole("button", { name: "星4つ以上" }).click();
    await expect(page).toHaveURL(/[?&]stars=4/);
    await expect(resultCount(page)).toHaveText(filteredResultsPattern);

    // Every visible card's rating chip (the WorkCard's `role="img"` span,
    // distinct from the favourite button) reads ★4 or ★5.
    const cardCount = await workCards(page).count();
    const ratingChips = workCards(page).locator('span[role="img"]');
    await expect(ratingChips).toHaveCount(cardCount);
    for (const chip of await ratingChips.all()) {
      await expect(chip).toHaveText(/^★[45]$/);
    }
  });

  test("an old ?pop= link still filters correctly and self-heals to ?stars=", async ({
    page,
  }) => {
    // Pre-★ links may still be bookmarked or shared; they must keep working.
    await page.goto("/ja?pop=popular");
    await expect(resultCount(page)).toHaveText(filteredResultsPattern);

    // The first filter interaction rewrites the URL in the new form.
    await openFilterPanel(page);
    await page.getByRole("button", { name: "バロック" }).click();
    await expect(page).toHaveURL(/[?&]stars=4/);
    await expect(page).not.toHaveURL(/pop=/);
  });
});

test.describe("active filter chips", () => {
  test("removing a chip drops only that filter", async ({ page }) => {
    await page.goto("/ja?e=Baroque&g=Keyboard");
    await expect(resultCount(page)).toHaveText(filteredResultsPattern);

    await page.getByRole("button", { name: "バロック を解除" }).click();
    await expect(page).toHaveURL(/g=Keyboard/);
    await expect(page).not.toHaveURL(/e=Baroque/);
    await expect(page.getByRole("button", { name: "鍵盤楽器 を解除" })).toBeVisible();
  });

  test("clear all empties every filter, including the search text", async ({
    page,
  }) => {
    await page.goto("/ja?e=Baroque");
    await searchBox(page).fill("Sonata");
    await expect(page).toHaveURL(/q=Sonata/);

    await page.getByRole("button", { name: "すべてクリア" }).click();
    await expect(page).toHaveURL(/\/ja$/);
    await expect(searchBox(page)).toHaveValue("");
    // No filters left, so it's the discovery feed rather than a result list.
    await expect(page.getByTestId("discover")).toBeVisible();
  });
});

test.describe("filters survive an in-page round trip", () => {
  test("returning from a work page keeps the applied filters", async ({
    page,
  }) => {
    await page.goto("/ja");
    await openFilterPanel(page);
    await page.getByRole("button", { name: "バロック" }).click();
    await expect(page).toHaveURL(/e=Baroque/);
    await expect(resultCount(page)).toHaveText(filteredResultsPattern);

    await workCards(page).first().click();
    await expect(page).toHaveURL(/\/works\//);

    await page.getByRole("link", { name: "楽曲一覧に戻る" }).click();
    await expect(page).toHaveURL(/e=Baroque/);
    await expect(resultCount(page)).toHaveText(filteredResultsPattern);
    await expect(page.getByRole("button", { name: "バロック を解除" })).toBeVisible();
  });

  test("the header's browse-works link also restores the filters", async ({
    page,
    isMobile,
  }) => {
    // On mobile the header's nav links live behind the hamburger menu; this
    // test is about the session restore, not about opening that menu.
    test.skip(Boolean(isMobile), "header nav is desktop-only");
    await page.goto("/ja");
    await openFilterPanel(page);
    await page.getByRole("button", { name: "バロック" }).click();
    await expect(page).toHaveURL(/e=Baroque/);

    await workCards(page).first().click();
    await expect(page).toHaveURL(/\/works\//);

    await page.getByRole("link", { name: "楽曲を探す" }).first().click();
    await expect(page).toHaveURL(/e=Baroque/);
  });

  test("clearing filters is remembered across the round trip", async ({
    page,
  }) => {
    await page.goto("/ja?e=Baroque&pop=popular");
    await page.getByRole("button", { name: "すべてクリア" }).click();
    await expect(page).toHaveURL(/\/ja$/);

    await workCards(page).first().click();
    await expect(page).toHaveURL(/\/works\//);

    await page.getByRole("link", { name: "楽曲一覧に戻る" }).click();
    await expect(page).toHaveURL(/\/ja$/);
    // No filters left to restore, so it's the discovery feed, not a list.
    await expect(page.getByTestId("discover")).toBeVisible();
  });

  test("a link with its own filters wins over a saved one", async ({ page }) => {
    await page.goto("/ja");
    await openFilterPanel(page);
    await page.getByRole("button", { name: "バロック" }).click();
    await expect(page).toHaveURL(/e=Baroque/);

    // A full navigation, as if the user had followed a shared link rather
    // than clicking something inside the app.
    await page.goto("/ja?q=Moonlight");
    await expect(page).toHaveURL(/q=Moonlight/);
    await expect(page).not.toHaveURL(/e=Baroque/);
  });

  test("a new browser context never sees another tab's filters", async ({
    browser,
  }) => {
    const first = await browser.newContext();
    const firstPage = await first.newPage();
    await firstPage.goto("/ja");
    await openFilterPanel(firstPage);
    await firstPage.getByRole("button", { name: "バロック" }).click();
    await expect(firstPage).toHaveURL(/e=Baroque/);
    await first.close();

    const second = await browser.newContext();
    const secondPage = await second.newPage();
    await secondPage.goto("/ja");
    // A fresh context has no saved filters, so it's the discovery feed.
    await expect(secondPage.getByTestId("discover")).toBeVisible();
    await second.close();
  });
});

test.describe("favourites", () => {
  test("survive a reload and appear on the favourites page", async ({ page }) => {
    await page.goto("/ja/works/16406");

    // Scoped to the work's own header: each related-work card has a star too.
    const header = page.locator("article > header");
    const star = header.getByRole("button", { name: "お気に入りに追加" });
    await expect(star).toBeVisible();
    await star.click();

    await expect(
      header.getByRole("button", { name: "お気に入りから削除" }),
    ).toBeVisible();

    // Written to localStorage under the versioned key.
    const stored = await page.evaluate(() =>
      window.localStorage.getItem("klangwelt.favorites.v1"),
    );
    expect(JSON.parse(stored ?? "{}")).toEqual({
      version: 1,
      workIds: ["16406"],
    });

    await page.reload();
    await expect(
      page.locator("article > header").getByRole("button", {
        name: "お気に入りから削除",
      }),
    ).toBeVisible();

    await page.goto("/ja/favorites");
    await expect(page.getByText("1曲")).toBeVisible();
    await expect(page.getByText("交響曲第5番 ハ短調 作品67")).toBeVisible();
  });

  test("empty state shows when nothing is saved", async ({ page }) => {
    await page.goto("/ja/favorites");
    await expect(page.getByText("まだお気に入りがありません。")).toBeVisible();
  });

  test("corrupt storage does not break the page", async ({ page }) => {
    await page.goto("/ja");
    await page.evaluate(() =>
      window.localStorage.setItem("klangwelt.favorites.v1", "{not json"),
    );
    await page.goto("/ja/favorites");
    await expect(page.getByText("まだお気に入りがありません。")).toBeVisible();
  });
});

test.describe("favourites backup", () => {
  const backupToggle = (page: Page) =>
    page.getByRole("button", { name: "バックアップ・移行" });
  const exportTextarea = (page: Page) => page.locator("textarea[readonly]");
  const importTextarea = (page: Page) => page.getByPlaceholder("ここに貼り付け");
  const importSubmit = (page: Page) =>
    page.getByRole("button", { name: "読み込む" });
  const importApply = (page: Page) =>
    page.getByRole("button", { name: "適用する" });

  test("exports the current favourites as a downloadable file", async ({
    page,
  }) => {
    await seedFavorites(page, ["16406", "23610"]);
    await page.goto("/ja/favorites");
    await backupToggle(page).click();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "ファイルをダウンロード" }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(
      /^klangwelt-backup-\d{4}-\d{2}-\d{2}\.json$/,
    );
    const path = await download.path();
    const content = JSON.parse(fs.readFileSync(path!, "utf-8"));
    expect(content).toMatchObject({
      app: "klangwelt",
      exportVersion: 1,
      favorites: { version: 1, workIds: ["16406", "23610"] },
      locale: "ja",
    });
  });

  test("restores favourites pasted from another browser context", async ({
    browser,
  }) => {
    const firstContext = await browser.newContext();
    const firstPage = await firstContext.newPage();
    await seedFavorites(firstPage, ["16406", "23610"]);
    await firstPage.goto("/ja/favorites");
    await backupToggle(firstPage).click();
    const exported = await exportTextarea(firstPage).inputValue();
    await firstContext.close();

    const secondContext = await browser.newContext();
    const secondPage = await secondContext.newPage();
    await secondPage.goto("/ja/favorites");
    await backupToggle(secondPage).click();
    await importTextarea(secondPage).fill(exported);
    await importSubmit(secondPage).click();
    // The exported payload carries `locale: "ja"`, so the preview text uses
    // the locale-aware template rather than the favourites-only one.
    await expect(
      secondPage.getByText("お気に入り2曲・言語設定「日本語」を読み込みます"),
    ).toBeVisible();
    await importApply(secondPage).click();

    await expect(secondPage.getByText("2曲")).toBeVisible();
    const stored = await secondPage.evaluate(() =>
      window.localStorage.getItem("klangwelt.favorites.v1"),
    );
    expect(JSON.parse(stored ?? "{}")).toEqual({
      version: 1,
      workIds: ["16406", "23610"],
    });
    await secondContext.close();
  });

  test("merges with existing favourites instead of overwriting them", async ({
    page,
  }) => {
    await seedFavorites(page, ["16406"]);
    await page.goto("/ja/favorites");
    await backupToggle(page).click();

    const backup = JSON.stringify({
      app: "klangwelt",
      exportVersion: 1,
      exportedAt: "2026-08-15T00:00:00.000Z",
      favorites: { version: 1, workIds: ["16406", "23610"] },
    });
    await importTextarea(page).fill(backup);
    await importSubmit(page).click();
    await expect(
      page.getByText(
        "お気に入り2曲を読み込みます。1件が新規に追加されます（1件は既にお気に入り済みです）。",
      ),
    ).toBeVisible();
    await importApply(page).click();

    await expect(page.getByText("2曲")).toBeVisible();
    const stored = await page.evaluate(() =>
      window.localStorage.getItem("klangwelt.favorites.v1"),
    );
    expect(JSON.parse(stored ?? "{}")).toEqual({
      version: 1,
      workIds: ["16406", "23610"],
    });
  });

  test("shows an error and keeps existing favourites when the input is invalid", async ({
    page,
  }) => {
    await seedFavorites(page, ["16406"]);
    await page.goto("/ja/favorites");
    await backupToggle(page).click();

    await importTextarea(page).fill("{not json");
    await importSubmit(page).click();

    await expect(page.getByText("読み込めませんでした")).toBeVisible();
    const stored = await page.evaluate(() =>
      window.localStorage.getItem("klangwelt.favorites.v1"),
    );
    expect(JSON.parse(stored ?? "{}")).toEqual({
      version: 1,
      workIds: ["16406"],
    });
  });

  test("file selection is available on desktop", async ({
    page,
    isMobile,
  }) => {
    test.skip(
      Boolean(isMobile),
      "hidden file input + setInputFiles is unreliable under mobile emulation",
    );
    await seedFavorites(page, ["16406"]);
    await page.goto("/ja/favorites");
    await backupToggle(page).click();

    const backup = JSON.stringify({
      app: "klangwelt",
      exportVersion: 1,
      exportedAt: "2026-08-15T00:00:00.000Z",
      favorites: { version: 1, workIds: ["23610"] },
    });
    await page.setInputFiles('input[type="file"]', {
      name: "klangwelt-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(backup),
    });

    await expect(
      page.getByText(
        "お気に入り1曲を読み込みます。1件が新規に追加されます（0件は既にお気に入り済みです）。",
      ),
    ).toBeVisible();
    await importApply(page).click();

    const stored = await page.evaluate(() =>
      window.localStorage.getItem("klangwelt.favorites.v1"),
    );
    expect(JSON.parse(stored ?? "{}")).toEqual({
      version: 1,
      workIds: ["16406", "23610"],
    });
  });
});

test.describe("discover (homepage recommendations)", () => {
  // Chopin core works — 22 in the index, several stars bands, enough for the
  // recommendation pool to comfortably clear twelve distinct-composer picks
  // (the pool draws from the whole catalogue, not just Chopin's works).
  const CHOPIN_FAVORITES = ["17109", "17217", "17179"];
  const BATCH_SIZE = 12;

  /**
   * Until favourites and the client-side work index are both ready, the feed
   * shows a favourites-blind popularity fallback (`initialWorks`, for first
   * paint and SEO) that happens to render exactly `BATCH_SIZE` cards too —
   * the same count as the real, favourites-aware picks. Waiting for the
   * personalised heading is what actually distinguishes "the real picks
   * landed" from "the fallback just happens to look similar".
   */
  const favoritePicksReady = (page: Page) =>
    expect(
      page.getByRole("heading", { name: "お気に入りから、次の1曲" }),
    ).toBeVisible();

  test("shows twelve recommendations built from favourites", async ({ page }) => {
    await seedFavorites(page, CHOPIN_FAVORITES);
    await page.goto("/ja");

    await expect(discoverSection(page)).toBeVisible();
    await favoritePicksReady(page);
    await expect(discoverCards(page)).toHaveCount(BATCH_SIZE);
  });

  test("never recommends an already-favourited work", async ({ page }) => {
    await seedFavorites(page, CHOPIN_FAVORITES);
    await page.goto("/ja");

    await favoritePicksReady(page);
    await expect(discoverCards(page)).toHaveCount(BATCH_SIZE);
    const hrefs = await discoverCards(page).evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")),
    );
    for (const id of CHOPIN_FAVORITES) {
      expect(hrefs).not.toContain(`/ja/works/${id}`);
    }
  });

  test("選び直す draws a different lineup", async ({ page }) => {
    await seedFavorites(page, CHOPIN_FAVORITES);
    await page.goto("/ja");

    await favoritePicksReady(page);
    await expect(discoverCards(page)).toHaveCount(BATCH_SIZE);
    const before = await discoverCards(page).evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")),
    );

    await discoverSection(page)
      .getByRole("button", { name: "選び直す" })
      .click();
    await expect(discoverCards(page)).toHaveCount(BATCH_SIZE);
    const after = await discoverCards(page).evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")),
    );

    expect(after).not.toEqual(before);
  });

  test("shows popular picks when there are no favourites, instead of disappearing", async ({
    page,
  }) => {
    await page.goto("/ja");
    await expect(discoverSection(page)).toBeVisible();
    await expect(page.getByRole("heading", { name: "人気の曲" })).toBeVisible();
    await expect(discoverCards(page)).toHaveCount(BATCH_SIZE);
  });

  test("もっと見る appends more picks without duplicates", async ({ page }) => {
    await page.goto("/ja");
    await expect(discoverCards(page)).toHaveCount(BATCH_SIZE);

    await discoverSection(page)
      .getByRole("button", { name: "さらに表示" })
      .click();
    await expect(discoverCards(page)).toHaveCount(BATCH_SIZE * 2);

    const hrefs = await discoverCards(page).evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")),
    );
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  test("favouriting a recommended work does not remove it from view", async ({
    page,
  }) => {
    // Regression test: the picks are computed once per seed and must not
    // react to the favourites list changing mid-visit, or clicking a card's
    // own star would yank it out from under the pointer.
    await seedFavorites(page, CHOPIN_FAVORITES);
    await page.goto("/ja");

    await favoritePicksReady(page);
    await expect(discoverCards(page)).toHaveCount(BATCH_SIZE);
    const firstCard = discoverCards(page).first();
    const href = await firstCard.getAttribute("href");

    await firstCard.getByRole("button", { name: "お気に入りに追加" }).click();

    await expect(discoverCards(page)).toHaveCount(BATCH_SIZE);
    await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible();
  });
});

test.describe("responsive layout", () => {
  // The filter panel is a single collapsed-by-default disclosure shared by
  // mobile and desktop — no more desktop-only sidebar or mobile-only sheet,
  // so this now applies identically to both projects.
  test("filters are collapsed by default and open via the toggle", async ({
    page,
  }) => {
    await page.goto("/ja");

    await expect(page.getByRole("heading", { name: "定番度" })).toBeHidden();
    await expect(
      page.getByRole("button", { name: /^絞り込み/ }),
    ).toHaveAttribute("aria-expanded", "false");

    await page.getByRole("button", { name: /^絞り込み/ }).click();
    await expect(page.getByRole("heading", { name: "定番度" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^絞り込み/ }),
    ).toHaveAttribute("aria-expanded", "true");

    await page.getByRole("button", { name: "バロック" }).click();
    await expect(page).toHaveURL(/e=Baroque/);

    await page.getByRole("button", { name: /^絞り込み/ }).click();
    await expect(page.getByRole("heading", { name: "定番度" })).toBeHidden();
  });

  test("no page overflows the viewport horizontally", async ({ page }, testInfo) => {
    const width = testInfo.project.use.viewport?.width ?? 412;
    for (const path of [
      "/ja",
      "/ja?view=all",
      "/ja?e=Baroque",
      "/ja?c=145",
      "/ja/works/16406",
      "/ja/composers/145",
      "/ja/composers",
      "/ja/credits",
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const docWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      // A card that refuses to shrink widens the whole document and, on a
      // real phone, zooms the page out. Caught exactly that on /ja?e=Baroque.
      expect(docWidth, `${path} overflows horizontally`).toBeLessThanOrEqual(
        width + 1,
      );
    }
  });

  test("header stays on one line down to the narrowest phones", async ({
    page,
    isMobile,
  }) => {
    test.skip(Boolean(isMobile), "drives the viewport directly");
    await page.goto("/ja");

    // Adding the logo mark once pushed the language pill over the edge at
    // 320px, and "日本語" wrapped to three stacked characters — the bar grew
    // from 59px to 87px. Nothing in the header may wrap.
    for (const width of [320, 344, 360, 390, 412]) {
      await page.setViewportSize({ width, height: 720 });
      await page.waitForTimeout(120);
      const { height, docWidth } = await page.evaluate(() => ({
        height: document.querySelector("header")!.getBoundingClientRect().height,
        docWidth: document.documentElement.scrollWidth,
      }));
      expect(height, `header wraps at ${width}px`).toBeLessThan(70);
      expect(docWidth, `${width}px overflows`).toBeLessThanOrEqual(width + 1);
    }
  });

  test("mobile navigation lives behind the menu button", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "mobile-only");
    await page.goto("/ja");
    await page.getByRole("button", { name: "メニュー" }).click();
    await expect(page.getByRole("link", { name: "作曲家" })).toBeVisible();
  });
});

test.describe("navigation and language", () => {
  test("switching language keeps you on the same work", async ({ page }) => {
    await page.goto("/ja/works/16406");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "交響曲第5番 ハ短調 作品67",
    );

    await page.getByRole("link", { name: "English" }).click();
    await expect(page).toHaveURL("/en/works/16406");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Symphony no. 5 in C minor, op. 67",
    );
  });

  test("streaming links point at the two services and open in a new tab", async ({
    page,
  }) => {
    await page.goto("/ja/works/16406");

    const spotify = page.getByRole("link", { name: /Spotify で聴く/ });
    await expect(spotify).toHaveAttribute(
      "href",
      /^https:\/\/open\.spotify\.com\/search\/.+Beethoven/,
    );
    await expect(spotify).toHaveAttribute("target", "_blank");
    await expect(spotify).toHaveAttribute("rel", /noopener/);

    const youtube = page.getByRole("link", { name: /YouTube Music/ });
    await expect(youtube).toHaveAttribute(
      "href",
      /^https:\/\/music\.youtube\.com\/search\?q=.+Beethoven/,
    );
  });

  test("a composer's full catalogue loads on demand", async ({ page }) => {
    await page.goto("/ja/composers/145");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "ルートヴィヒ・ヴァン・ベートーヴェン",
    );

    const toggle = page.getByRole("button", { name: /全作品/ });
    await toggle.click();

    // Fetched from /data/works/145.json, not bundled into the page.
    await expect(page.getByRole("button", { name: "室内楽" })).toBeVisible();
    await expect(page.locator("li a, li div").first()).toBeVisible();
  });

  test("portrait credit is shown next to the portrait", async ({ page }) => {
    await page.goto("/ja/composers/145");
    await expect(page.getByText(/^肖像: /)).toBeVisible();
    await expect(page.getByRole("link", { name: "出典" }).first()).toHaveAttribute(
      "href",
      /commons\.wikimedia\.org|creativecommons\.org/,
    );
  });

  test("a composer's nationality flag appears on both the list and the profile", async ({
    page,
  }) => {
    // Beethoven (id 145) has a seeded nationality (data/nationalities.json);
    // ★5, so he is present in the composer list's default (★3+) view.
    await page.goto("/ja/composers");
    const card = page.locator('a[href="/ja/composers/145"]');
    await expect(card.getByRole("img", { name: "ドイツ" })).toBeVisible();

    await card.click();
    await expect(page).toHaveURL(/\/composers\/145$/);
    await expect(page.getByText("国籍")).toBeVisible();
    await expect(
      page.getByRole("img", { name: "ドイツ" }).first(),
    ).toBeVisible();
  });
});
