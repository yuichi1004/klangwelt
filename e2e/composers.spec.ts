import { expect, test } from "@playwright/test";

/**
 * Covers the parts of the composer list that only exist once JavaScript
 * runs: the 定番度/period/name filters, the URL round-trip, and the mobile
 * filter sheet. `src/lib/composer-filter.test.ts` and
 * `src/lib/composer-url.test.ts` cover the pure logic behind these; these
 * tests check that it is actually wired to the UI. Modelled on
 * `e2e/catalog.spec.ts`, which covers the same ground for the work list.
 */

type Page = import("@playwright/test").Page;

const resultCount = (page: Page) => page.getByTestId("result-count");

const searchBox = (page: Page) => page.getByRole("searchbox", { name: "作曲家を検索" });

/**
 * The composer's own "代表曲" list passes `composerName=""` — showing "この
 * 作曲家" on every card of their own profile page would be redundant — which
 * once meant the fallback tile's initial-letter derivation (also driven by
 * `composerName`) went blank too for composers with no portrait. Covers both
 * branches of `ComposerThumb`: a real portrait (Beethoven, #145) and the
 * initial-letter fallback (Pachelbel, #115, one of the 7 composers with none).
 */
test.describe("composer profile page's own-works thumbnails", () => {
  test("shows the portrait on a composer's own work cards", async ({
    page,
  }) => {
    await page.goto("/ja/composers/145");
    const section = page.locator("section", { has: page.getByRole("heading", { name: "代表曲" }) });
    const firstCard = section.locator('a[href^="/ja/works/"]').first();
    await expect(firstCard.locator("img")).toHaveCount(1);
    await expect(firstCard.locator("img")).toHaveAttribute("src", /\/portraits\/thumb\/145\.jpg/);
  });

  test("falls back to a non-empty initial tile when there is no portrait", async ({
    page,
  }) => {
    await page.goto("/ja/composers/115");
    const section = page.locator("section", { has: page.getByRole("heading", { name: "代表曲" }) });
    const firstCard = section.locator('a[href^="/ja/works/"]').first();
    await expect(firstCard.locator("img")).toHaveCount(0);
    const tile = firstCard.locator('[aria-hidden="true"]').first();
    await expect(tile).not.toBeEmpty();
  });
});

test.describe("composer filtering", () => {
  test.skip(
    ({ isMobile }) => Boolean(isMobile),
    "filter sidebar is desktop-only; the mobile sheet is covered separately",
  );

  test("opens filtered to ★3 and up, hiding empty-at-that-threshold periods", async ({
    page,
  }) => {
    await page.goto("/ja/composers");

    await expect(page.getByRole("heading", { name: "中世" })).toBeHidden();
    await expect(page.getByRole("heading", { name: "21世紀" })).toBeHidden();
    await expect(resultCount(page)).toHaveText(/^\d+名 \/ 全\d+名$/);

    // The default threshold shows as an active, removable chip so the
    // narrower-than-"all" view is not silently hiding composers.
    await expect(page.getByRole("button", { name: "★3以上 を解除" })).toBeVisible();
  });

  test("removing the default star chip reveals every composer and period", async ({
    page,
  }) => {
    await page.goto("/ja/composers");
    await page.getByRole("button", { name: "★3以上 を解除" }).click();

    await expect(page).toHaveURL(/[?&]stars=1/);
    await expect(page.getByRole("heading", { name: "中世" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "21世紀" })).toBeVisible();

    // At "all", the count shows as a single total rather than "x / 全y" —
    // there is no narrower set left to compare against.
    await expect(resultCount(page)).toHaveText(/^\d+名$/);
  });

  test("★5 only narrows further than the default ★3 and up", async ({ page }) => {
    await page.goto("/ja/composers");
    const defaultText = await resultCount(page).textContent();

    await page.getByRole("button", { name: "星5つのみ" }).click();
    await expect(page).toHaveURL(/[?&]stars=5/);

    const narrowedText = await resultCount(page).textContent();
    expect(narrowedText).not.toBe(defaultText);
  });

  test("searches by Japanese composer name", async ({ page }) => {
    await page.goto("/ja/composers");
    // Widen to "all" first so the search is not fighting the ★3 floor for a
    // composer who might fall under it.
    await page.getByRole("button", { name: "★3以上 を解除" }).click();

    await searchBox(page).fill("ベートーヴェン");
    await expect(page).toHaveURL(/q=/);
    await expect(
      page.getByText("ルートヴィヒ・ヴァン・ベートーヴェン"),
    ).toBeVisible();
  });

  test("combines period and star filters", async ({ page }) => {
    await page.goto("/ja/composers?e=Baroque");
    await expect(page).toHaveURL(/e=Baroque/);
    await expect(resultCount(page)).toHaveText(/^\d+名 \/ 全\d+名$/);
    // Only the Baroque section can be present.
    await expect(page.getByRole("heading", { name: "ロマン派", exact: true })).toBeHidden();
  });

  test("clearing all filters restores the default ★3-and-up view", async ({
    page,
  }) => {
    await page.goto("/ja/composers?stars=1&e=Baroque");
    await page.getByRole("button", { name: "すべてクリア" }).click();
    await expect(page).toHaveURL(/\/ja\/composers$/);
    await expect(page.getByRole("button", { name: "★3以上 を解除" })).toBeVisible();
  });
});

test.describe("composer list survives an in-page round trip", () => {
  test.skip(
    ({ isMobile }) => Boolean(isMobile),
    "filter sidebar is desktop-only; the mobile sheet is covered separately",
  );

  test("returning from a composer page keeps the applied filters", async ({
    page,
  }) => {
    await page.goto("/ja/composers");
    await page.getByRole("button", { name: "星5つのみ" }).click();
    await expect(page).toHaveURL(/stars=5/);

    await page
      .locator('a[href^="/ja/composers/"]')
      .first()
      .click();
    await expect(page).toHaveURL(/\/composers\/\d+/);

    await page.getByRole("link", { name: "作曲家一覧" }).click();
    await expect(page).toHaveURL(/stars=5/);
    await expect(page.getByRole("button", { name: "★5のみ を解除" })).toBeVisible();
  });

  test("the header's composers link also restores the filters", async ({
    page,
  }) => {
    await page.goto("/ja/composers");
    await page.getByRole("button", { name: "星5つのみ" }).click();
    await expect(page).toHaveURL(/stars=5/);

    await page
      .locator('a[href^="/ja/composers/"]')
      .first()
      .click();
    await expect(page).toHaveURL(/\/composers\/\d+/);

    await page.getByRole("link", { name: "作曲家" }).first().click();
    await expect(page).toHaveURL(/stars=5/);
  });
});

test.describe("composer list responsive layout", () => {
  test("mobile hides the sidebar and opens filters in a sheet", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "mobile-only");
    await page.goto("/ja/composers");

    await expect(page.getByRole("heading", { name: "絞り込み" })).toBeHidden();

    await page.getByRole("button", { name: /^絞り込み/ }).click();
    const sheet = page.getByRole("dialog", { name: "絞り込み" });
    await expect(sheet).toBeVisible();
    await expect(page.getByRole("heading", { name: "絞り込み" })).toBeVisible();

    await page.getByRole("button", { name: "バロック" }).click();
    await expect(page).toHaveURL(/e=Baroque/);

    await sheet.getByRole("button", { name: "閉じる" }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole("heading", { name: "絞り込み" })).toBeHidden();
  });
});

/**
 * The modal behaviour #109 asked for: Escape, a focus trap, a background
 * scroll lock, and a header/CTA that stay put while the filters inside
 * scroll. Modelled on `e2e/glossary.spec.ts`'s "mobile bottom sheet" block,
 * the other consumer of the same shape.
 */
test.describe("composer filter sheet modal behaviour", () => {
  test.skip(({ isMobile }) => !isMobile, "mobile-only layout");

  test("Escape closes the sheet and returns focus to the 絞り込み button", async ({
    page,
  }) => {
    await page.goto("/ja/composers");
    const toggle = page.getByRole("button", { name: /^絞り込み/ });
    await toggle.click();
    const sheet = page.getByRole("dialog", { name: "絞り込み" });
    await expect(sheet).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(toggle).toBeFocused();
  });

  test("focus starts inside the sheet and Tab cannot leave it", async ({
    page,
  }) => {
    await page.goto("/ja/composers");
    await page.getByRole("button", { name: /^絞り込み/ }).click();
    await expect(page.getByRole("dialog", { name: "絞り込み" })).toBeVisible();

    const containedInDialog = () =>
      page.evaluate(() =>
        document
          .querySelector('[role="dialog"]')
          ?.contains(document.activeElement),
      );

    await expect.poll(containedInDialog).toBe(true);
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
    }
    await expect.poll(containedInDialog).toBe(true);
  });

  test("the page behind the sheet does not scroll", async ({ page }) => {
    await page.goto("/ja/composers");
    await page.getByRole("button", { name: /^絞り込み/ }).click();
    const sheet = page.getByRole("dialog", { name: "絞り込み" });
    await expect(sheet).toBeVisible();

    await expect
      .poll(() => page.evaluate(() => document.body.style.overflow))
      .toBe("hidden");
    await page.mouse.wheel(0, 600);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    await sheet.getByRole("button", { name: "閉じる" }).click();
    await expect(sheet).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => document.body.style.overflow))
      .toBe("");
  });

  test("the heading and the CTA stay put while the filters scroll", async ({
    page,
  }) => {
    await page.goto("/ja/composers");
    await page.getByRole("button", { name: /^絞り込み/ }).click();
    const sheet = page.getByRole("dialog", { name: "絞り込み" });
    const heading = sheet.getByRole("heading", { name: "絞り込み" });
    const cta = sheet.getByRole("button", { name: /^\d+名を表示$/ });
    await expect(heading).toBeInViewport();
    await expect(cta).toBeInViewport();

    await sheet.locator(".overflow-y-auto").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });

    await expect(heading).toBeInViewport();
    await expect(cta).toBeInViewport();
  });

  // At most one — never the nested pair #109 complained about. Composer
  // filters alone (unlike the catalogue's, which also lists ~220 composers)
  // are short enough that the sheet may not need to scroll at all on a
  // tall-enough phone, so "at most 1" rather than "exactly 1".
  test("the sheet has at most one scrolling region", async ({ page }) => {
    await page.goto("/ja/composers");
    await page.getByRole("button", { name: /^絞り込み/ }).click();
    const sheet = page.getByRole("dialog", { name: "絞り込み" });
    await expect(sheet).toBeVisible();

    const scrollerCount = await sheet.evaluate((dialog) => {
      const all = dialog.querySelectorAll("*");
      let count = 0;
      for (const el of all) {
        const style = getComputedStyle(el);
        const scrollable =
          style.overflowY === "auto" || style.overflowY === "scroll";
        if (scrollable && el.scrollHeight > el.clientHeight) count++;
      }
      return count;
    });
    expect(scrollerCount).toBeLessThanOrEqual(1);
  });

  test("the primary action reads as an action, and closes the sheet", async ({
    page,
  }) => {
    await page.goto("/ja/composers");
    await page.getByRole("button", { name: /^絞り込み/ }).click();
    const sheet = page.getByRole("dialog", { name: "絞り込み" });
    const cta = sheet.getByRole("button", { name: /^\d+名を表示$/ });
    await expect(cta).toBeVisible();

    const urlBefore = page.url();
    await cta.click();
    await expect(sheet).toBeHidden();
    expect(page.url()).toBe(urlBefore);
  });
});

/**
 * Issue #111. `?stars=1` in both tests below is deliberate: the grid
 * defaults to ★3+ (`composer-url.ts`'s `DEFAULT_COMPOSER_FILTERS`), and both
 * regressions need a composer that default view excludes — Corigliano (the
 * widest portrait in the collection) is ★1.
 */
test.describe("composer grid portrait and meta-row alignment", () => {
  test("a wide portrait is letterboxed, not cropped", async ({ page }) => {
    await page.goto("/ja/composers?stars=1&q=コリリアーノ");
    const card = page.locator('a[href="/ja/composers/144"]');
    const img = card.locator("img").first();
    const [imgBox, wellBox] = await Promise.all([
      img.boundingBox(),
      img.locator("..").boundingBox(),
    ]);
    // The old `max-h-full w-auto` bounded height only, so a wide portrait
    // rendered past the well's width and was silently clipped by the well's
    // `overflow-hidden` instead of properly letterboxed — this would render
    // wider than `wellBox` under that implementation.
    expect(imgBox!.width).toBeLessThanOrEqual(wellBox!.width + 1);
    expect(imgBox!.height).toBeLessThanOrEqual(wellBox!.height + 1);
  });

  test("meta rows align within a grid row regardless of name length", async ({
    page,
    isMobile,
  }) => {
    test.skip(Boolean(isMobile), "single column, so there is no row to level");
    // Early Romantic mixes 1-line names (Cherubini, Sor) with 2-line ones
    // (Beethoven, Hummel) at desktop width — manually confirmed to land in
    // the same grid row.
    await page.goto("/ja/composers?stars=1&e=Early Romantic");

    const rows = await page.evaluate(() => {
      const byTop: Record<number, number[]> = {};
      for (const meta of document.querySelectorAll(
        '[data-testid="composer-meta"]',
      )) {
        const { top } = meta.getBoundingClientRect();
        const card = meta.closest("li")!.getBoundingClientRect();
        (byTop[Math.round(card.top)] ||= []).push(Math.round(top));
      }
      return Object.values(byTop);
    });

    expect(rows.length).toBeGreaterThan(1);
    for (const tops of rows) {
      expect(new Set(tops).size, `row tops ${tops}`).toBe(1);
    }
  });
});
