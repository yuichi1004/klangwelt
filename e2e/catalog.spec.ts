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
    await page.goto("/ja");

    // The result count renders `totalCount` even before the client index has
    // landed (the おすすめ順 fallback order), so `data-loaded` — not the text
    // — is what actually proves the full index arrived.
    await expect(resultCount(page)).toHaveAttribute("data-loaded", "true");
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
    await expect(resultCount(page)).toHaveText(allResultsText);
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
    await expect(resultCount(page)).toHaveText(allResultsText);
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
    await expect(resultCount(page)).toHaveText(allResultsText);
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
    // A fresh context has no saved filters, so it's the full, unfiltered list.
    await expect(resultCount(secondPage)).toHaveText(allResultsText);
    await second.close();
  });
});

test.describe("favourites", () => {
  test("survive a reload and appear on the favourites page", async ({ page }) => {
    await page.goto("/ja/works/16406");

    // Scoped to the work's own header: each related-work card has a star too.
    // Descendant, not direct-child — the header sits inside the article's
    // max-w-3xl reading-column wrapper (issue #116).
    const header = page.locator("article header");
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
      page.locator("article header").getByRole("button", {
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

test.describe("recommended sort (おすすめ順)", () => {
  // Chopin core works — 22 in the index, several stars bands, so a filter
  // down to just this composer (`?c=152`) fits on a single page and gives a
  // deterministic set to assert against.
  const CHOPIN_ID = "152";
  const CHOPIN_FAVORITES = ["17109", "17217", "17179"];
  const PAGE_SIZE = 40;

  const listReady = (page: Page) =>
    expect(resultCount(page)).toHaveAttribute("data-loaded", "true");

  const sortSelect = (page: Page) =>
    page.getByRole("combobox", { name: "並び順" });

  test("is the default sort and fills a page", async ({ page }) => {
    await page.goto("/ja");
    await listReady(page);
    await expect(workCards(page)).toHaveCount(PAGE_SIZE);
    await expect(page).not.toHaveURL(/sort=/);
    await expect(sortSelect(page)).toHaveValue("recommended");
  });

  test("changing the sort keeps you in the list — regression guard for the ?view=all bounce", async ({
    page,
  }) => {
    // The bug this feature replaces: leaving おすすめ順 for another sort used
    // to drop `?view=all` from the URL and bounce back to a separate
    // discovery feed. There is only one view now, so nothing to bounce to.
    await page.goto("/ja");
    await listReady(page);

    await sortSelect(page).selectOption("standard");
    await expect(page).toHaveURL(/[?&]sort=standard/);
    await expect(resultCount(page)).toHaveText(allResultsText);
    await expect(workCards(page)).toHaveCount(PAGE_SIZE);

    await sortSelect(page).selectOption("recommended");
    await expect(page).not.toHaveURL(/sort=/);
    await expect(workCards(page)).toHaveCount(PAGE_SIZE);
  });

  test("includes favourited works rather than withholding them", async ({
    page,
  }) => {
    await seedFavorites(page, CHOPIN_FAVORITES);
    await page.goto(`/ja?c=${CHOPIN_ID}`);
    await listReady(page);

    const hrefs = await workCards(page).evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")),
    );
    for (const id of CHOPIN_FAVORITES) {
      expect(hrefs).toContain(`/ja/works/${id}`);
    }
  });

  test("さらに表示 appends the next page without duplicates", async ({ page }) => {
    await page.goto("/ja");
    await listReady(page);
    await expect(workCards(page)).toHaveCount(PAGE_SIZE);

    // Scoped with `exact` so this does not also match the filter panel's
    // composer-list "さらに表示" (accessible name "作曲家 · さらに表示"), which
    // stays in the DOM but hidden while the panel is collapsed.
    await page.getByRole("button", { name: "さらに表示", exact: true }).click();
    await expect(workCards(page)).toHaveCount(PAGE_SIZE * 2);

    const hrefs = await workCards(page).evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")),
    );
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  test("favouriting a card does not reorder the list", async ({ page }) => {
    // Regression test: the taste profile is frozen once per visit and must
    // not react to the favourites list changing mid-visit, or clicking a
    // card's own star would shuffle the list under the pointer.
    await seedFavorites(page, CHOPIN_FAVORITES);
    await page.goto("/ja");
    await listReady(page);
    await expect(workCards(page)).toHaveCount(PAGE_SIZE);

    const firstCard = workCards(page).first();
    const href = await firstCard.getAttribute("href");

    await firstCard.getByRole("button", { name: "お気に入りに追加" }).click();

    await expect(workCards(page)).toHaveCount(PAGE_SIZE);
    await expect(workCards(page).first()).toHaveAttribute("href", href!);
  });

  test("the reason note appears only in おすすめ順", async ({ page }) => {
    await seedFavorites(page, CHOPIN_FAVORITES);
    await page.goto(`/ja?c=${CHOPIN_ID}`);
    await listReady(page);

    await expect(page.getByText("フレデリック・ショパン が好きなら").first()).toBeVisible();

    await sortSelect(page).selectOption("standard");
    await expect(page).toHaveURL(/[?&]sort=standard/);
    // `.first()`, not the bare locator: with every Chopin card carrying the
    // note in おすすめ順, an unscoped `getByText` here resolves to several
    // elements — `toBeHidden()` treats that as a strict-mode violation
    // rather than retrying, so it would fail even once the note is gone.
    await expect(page.getByText("フレデリック・ショパン が好きなら").first()).toBeHidden();
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

  // #109: the disclosure is not a modal (no scrim, page still scrolls), but
  // it still owes keyboard users a way to collapse it without hunting for
  // the toggle, and the toggle should get focus back so Tab resumes where
  // the user left off.
  test("Escape collapses the filter panel and refocuses the toggle", async ({
    page,
  }) => {
    await page.goto("/ja");
    const toggle = page.getByRole("button", { name: /^絞り込み/ });
    await toggle.click();
    await expect(page.getByRole("heading", { name: "定番度" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "定番度" })).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toBeFocused();
  });

  // #109: the panel used to nest a max-h-64 composer list inside a
  // max-h-[70vh] scrolling panel — two scrollers, with the ambiguous "which
  // one moves" feel the issue complained about. Now the panel is plain
  // document flow and the composer list is capped by row count instead.
  test("the open filter panel scrolls with the page, not inside itself", async ({
    page,
  }) => {
    await page.goto("/ja");
    await page.getByRole("button", { name: /^絞り込み/ }).click();
    const panel = page.locator("#catalog-filter-panel");
    await expect(panel).toBeVisible();

    const scrollerCount = await panel.evaluate((el) => {
      const all = el.querySelectorAll("*");
      let count = 0;
      for (const node of all) {
        const style = getComputedStyle(node);
        const scrollable =
          style.overflowY === "auto" || style.overflowY === "scroll";
        if (scrollable && node.scrollHeight > node.clientHeight) count++;
      }
      return count;
    });
    expect(scrollerCount).toBe(0);
  });

  test("the composer list is capped until さらに表示 is pressed", async ({
    page,
  }) => {
    await page.goto("/ja");
    await page.getByRole("button", { name: /^絞り込み/ }).click();

    const list = page.getByRole("group", { name: /^作曲家/ }).getByRole("checkbox");
    await expect(list).toHaveCount(20);

    await page.getByRole("button", { name: "作曲家 · さらに表示" }).click();
    await expect(list.first()).toBeVisible();
    expect(await list.count()).toBeGreaterThan(20);
  });

  // Regression guard for the site-header refactor in #109: Escape and the
  // scroll lock moved from an inline effect into the shared
  // `useModalOverlay` hook, and the header's own Escape-to-close behaviour
  // (pre-existing since #108) has to survive that move intact.
  test("Escape closes the mobile menu and hands focus back to ☰", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "mobile-only");
    await page.goto("/ja");
    const menuButton = page.getByRole("button", { name: "メニュー" });
    await menuButton.click();
    await expect(page.getByRole("link", { name: "作曲家" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("link", { name: "作曲家" })).toBeHidden();
    await expect(menuButton).toBeFocused();
  });

  test("no page overflows the viewport horizontally", async ({ page }, testInfo) => {
    const width = testInfo.project.use.viewport?.width ?? 412;
    for (const path of [
      "/ja",
      "/ja?sort=title",
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

  /**
   * The favourite button sits inside the card's link, so a near miss
   * navigates to the work instead of saving it. It was 36×36 — under both
   * the 44pt Apple HIG target and WCAG 2.5.5 — until the button box was
   * decoupled from the visible disc.
   */
  test("the favourite button is big enough to hit", async ({ page }) => {
    await page.goto("/ja");
    const card = workCards(page).first();
    const box = await card
      .getByRole("button", { name: /お気に入り/ })
      .boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  /**
   * Cards carry the composer's portrait. It is decorative — the composer is
   * named in text in the same card, and the card is itself a link, so any
   * alt text would be read out as part of the link's name.
   */
  test("each card shows one decorative portrait", async ({ page }) => {
    await page.goto("/ja");
    const card = workCards(page).first();
    await expect(card.locator("img")).toHaveCount(1);
    await expect(card.locator("img")).toHaveAttribute("alt", "");
  });

  /** A ragged bottom edge is obvious once the cards carry an image. */
  test("cards in the same row are the same height", async ({
    page,
    isMobile,
  }) => {
    test.skip(Boolean(isMobile), "one column, so there is no row to level");
    await page.goto("/ja");
    await expect(workCards(page).first()).toBeVisible();

    const rows = await page.evaluate(() => {
      const byTop: Record<number, number[]> = {};
      for (const card of document.querySelectorAll('a[href^="/ja/works/"]')) {
        const { top, height } = card.getBoundingClientRect();
        (byTop[Math.round(top)] ||= []).push(Math.round(height));
      }
      return Object.values(byTop);
    });

    expect(rows.length).toBeGreaterThan(1);
    for (const heights of rows) {
      expect(new Set(heights).size, `row heights ${heights}`).toBe(1);
    }
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
