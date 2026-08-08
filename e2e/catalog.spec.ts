import { expect, test } from "@playwright/test";

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

const searchBox = (page: Page) =>
  page.getByRole("searchbox", { name: "曲名・作曲家名で検索" });

test.describe("catalogue filtering", () => {
  test.skip(
    ({ isMobile }) => Boolean(isMobile),
    "filter sidebar is desktop-only; the mobile sheet is covered separately",
  );

  test("narrows results and reflects the filters in the URL", async ({ page }) => {
    await page.goto("/ja");

    // Wait for the full index to arrive before counting.
    await expect(resultCount(page)).toHaveText("1,286曲");

    await page.getByRole("button", { name: "バロック" }).click();
    await expect(page).toHaveURL(/[?&]e=Baroque/);

    await page.getByRole("button", { name: "鍵盤楽器" }).click();
    await expect(page).toHaveURL(/[?&]g=Keyboard/);

    await expect(resultCount(page)).toHaveText(/^[\d,]+曲 \/ 全1,286曲$/);

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
    await page.goto("/ja?e=Baroque&pop=popular");
    await page.getByRole("button", { name: "条件をクリア" }).click();
    await expect(page).toHaveURL(/\/ja$/);
    await expect(resultCount(page)).toHaveText("1,286曲");
  });

  test("shows an empty state instead of a blank page", async ({ page }) => {
    await page.goto("/ja?q=zzzznosuchwork");
    await expect(
      page.getByText("条件に合う楽曲が見つかりませんでした。"),
    ).toBeVisible();
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

test.describe("responsive layout", () => {
  test("desktop shows the filter sidebar inline", async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), "desktop-only");
    await page.goto("/ja");
    await expect(page.getByRole("heading", { name: "絞り込み" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^絞り込み/ })).toBeHidden();
  });

  test("mobile hides the sidebar and opens filters in a sheet", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "mobile-only");
    await page.goto("/ja");

    await expect(page.getByRole("heading", { name: "絞り込み" })).toBeHidden();

    await page.getByRole("button", { name: /^絞り込み/ }).click();
    await expect(page.getByRole("heading", { name: "絞り込み" })).toBeVisible();

    await page.getByRole("button", { name: "バロック" }).click();
    await expect(page).toHaveURL(/e=Baroque/);

    await page.getByRole("button", { name: "閉じる" }).last().click();
    await expect(page.getByRole("heading", { name: "絞り込み" })).toBeHidden();
  });

  test("mobile filter sheet closes when the backdrop is tapped", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "mobile-only");
    await page.goto("/ja");
    await page.getByRole("button", { name: /^絞り込み/ }).click();
    await expect(page.getByRole("heading", { name: "絞り込み" })).toBeVisible();

    // The sheet covers the centre of the backdrop, so tap the strip above it.
    await page
      .getByRole("button", { name: "閉じる" })
      .first()
      .click({ position: { x: 10, y: 10 } });
    await expect(page.getByRole("heading", { name: "絞り込み" })).toBeHidden();
  });

  test("no page overflows the viewport horizontally", async ({ page }, testInfo) => {
    const width = testInfo.project.use.viewport?.width ?? 412;
    for (const path of [
      "/ja",
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
});
