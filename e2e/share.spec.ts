import { expect, test } from "@playwright/test";

/**
 * Issue #133. Covers the parts of the share menu that only exist once
 * JavaScript runs: opening/closing the popup and its two layouts (modelled
 * directly on `e2e/glossary.spec.ts`, the closest existing popup), and that
 * the three outbound links are actually built from `SITE_URL`
 * (`src/lib/site.ts`) rather than the dev origin. The pure URL-building
 * logic itself is unit-tested in `src/lib/share.test.ts` and
 * `src/lib/site.test.ts`.
 */

type Page = import("@playwright/test").Page;

const shareTrigger = (page: Page) => page.getByRole("button", { name: "共有" });

test.describe("share menu", () => {
  test("the trigger opens a dialog listing all four actions", async ({ page }) => {
    await page.goto("/ja/works/16406");
    const trigger = shareTrigger(page);

    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    const dialog = page.getByRole("dialog", { name: "共有" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "リンクをコピー" })).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Xで共有" })).toBeVisible();
    await expect(dialog.getByRole("link", { name: "LinkedInで共有" })).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Facebookで共有" })).toBeVisible();
  });

  test("the three service links are built from the production origin, not localhost", async ({
    page,
  }) => {
    // This is the single most important assertion in this file: it proves
    // `canonicalUrl` (src/lib/site.ts) is what built these hrefs, not
    // `window.location`, which would carry the dev server's own origin
    // (`playwright.config.ts` runs against http://localhost:3100).
    await page.goto("/ja/works/16406");
    await shareTrigger(page).click();
    const dialog = page.getByRole("dialog", { name: "共有" });

    const encodedProdUrl = "https%3A%2F%2Fklangwelt-dun.vercel.app%2Fja%2Fworks%2F16406";
    await expect(dialog.getByRole("link", { name: "Xで共有" })).toHaveAttribute(
      "href",
      new RegExp(`^https://x\\.com/intent/post\\?.*${encodedProdUrl}`),
    );
    await expect(dialog.getByRole("link", { name: "LinkedInで共有" })).toHaveAttribute(
      "href",
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodedProdUrl}`,
    );
    await expect(dialog.getByRole("link", { name: "Facebookで共有" })).toHaveAttribute(
      "href",
      `https://www.facebook.com/sharer/sharer.php?u=${encodedProdUrl}`,
    );
  });

  test("the X link's text carries the work's title", async ({ page }) => {
    await page.goto("/ja/works/16406");
    await shareTrigger(page).click();
    const dialog = page.getByRole("dialog", { name: "共有" });

    const href = await dialog.getByRole("link", { name: "Xで共有" }).getAttribute("href");
    const text = new URL(href!).searchParams.get("text");
    expect(text).toContain("交響曲第5番");
  });

  test("all three service links open in a new tab without leaking window.opener", async ({
    page,
  }) => {
    await page.goto("/ja/works/16406");
    await shareTrigger(page).click();
    const dialog = page.getByRole("dialog", { name: "共有" });

    for (const name of ["Xで共有", "LinkedInで共有", "Facebookで共有"]) {
      const link = dialog.getByRole("link", { name });
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", /noopener/);
    }
  });

  test("the composer page carries the composer's own share links", async ({ page }) => {
    await page.goto("/ja/composers/145");
    await shareTrigger(page).click();
    const dialog = page.getByRole("dialog", { name: "共有" });

    const encodedProdUrl = "https%3A%2F%2Fklangwelt-dun.vercel.app%2Fja%2Fcomposers%2F145";
    await expect(dialog.getByRole("link", { name: "LinkedInで共有" })).toHaveAttribute(
      "href",
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodedProdUrl}`,
    );
    const href = await dialog.getByRole("link", { name: "Xで共有" }).getAttribute("href");
    expect(new URL(href!).searchParams.get("text")).toContain("ベートーヴェン");
  });

  test.describe("desktop popover", () => {
    test.skip(({ isMobile }) => Boolean(isMobile), "desktop-only layout");

    test("Escape closes the open popup", async ({ page }) => {
      await page.goto("/ja/works/16406");
      await shareTrigger(page).click();
      await expect(page.getByRole("dialog", { name: "共有" })).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "共有" })).toBeHidden();
    });

    test("clicking outside the popup closes it", async ({ page }) => {
      await page.goto("/ja/works/16406");
      await shareTrigger(page).click();
      await expect(page.getByRole("dialog", { name: "共有" })).toBeVisible();

      await page.getByRole("heading", { level: 1 }).click();
      await expect(page.getByRole("dialog", { name: "共有" })).toBeHidden();
    });

    test("clicking the trigger again closes the popup", async ({ page }) => {
      await page.goto("/ja/works/16406");
      const trigger = shareTrigger(page);
      await trigger.click();
      await expect(page.getByRole("dialog", { name: "共有" })).toBeVisible();

      await trigger.click();
      await expect(page.getByRole("dialog", { name: "共有" })).toBeHidden();
    });

    test("copying shows a confirmation that reverts", async ({
      page,
      context,
      baseURL,
    }) => {
      await context.grantPermissions(["clipboard-read", "clipboard-write"], {
        origin: baseURL,
      });
      await page.goto("/ja/works/16406");
      await shareTrigger(page).click();
      const dialog = page.getByRole("dialog", { name: "共有" });

      await dialog.getByRole("button", { name: "リンクをコピー" }).click();
      await expect(dialog.getByRole("button", { name: "コピーしました" })).toBeVisible();

      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toBe("https://klangwelt-dun.vercel.app/ja/works/16406");

      // Reverts on its own — no hard wait, `toBeVisible` polls until it does.
      await expect(
        dialog.getByRole("button", { name: "リンクをコピー" }),
      ).toBeVisible({ timeout: 4000 });
    });
  });

  test.describe("mobile bottom sheet", () => {
    test.skip(({ isMobile }) => !isMobile, "mobile-only layout");

    test("opening the trigger shows a bottom sheet with a close button", async ({
      page,
    }) => {
      await page.goto("/ja/works/16406");
      await shareTrigger(page).click();

      const sheet = page.getByRole("dialog", { name: "共有" });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole("link", { name: "Xで共有" })).toBeVisible();

      await sheet.getByRole("button", { name: "閉じる" }).click();
      await expect(sheet).toBeHidden();
    });

    test("tapping the backdrop closes the sheet", async ({ page }) => {
      await page.goto("/ja/works/16406");
      await shareTrigger(page).click();
      await expect(page.getByRole("dialog", { name: "共有" })).toBeVisible();

      await page.mouse.click(10, 10);
      await expect(page.getByRole("dialog", { name: "共有" })).toBeHidden();
    });
  });

  test("the trigger is big enough to hit (issue #113's 44px target)", async ({ page }) => {
    await page.goto("/ja/works/16406");
    const box = await shareTrigger(page).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test("English pages show English labels", async ({ page }) => {
    await page.goto("/en/works/16406");
    await page.getByRole("button", { name: "Share" }).click();
    const dialog = page.getByRole("dialog", { name: "Share" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Copy link" })).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Share on X" })).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Share on LinkedIn" })).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Share on Facebook" })).toBeVisible();

    const encodedProdUrl = "https%3A%2F%2Fklangwelt-dun.vercel.app%2Fen%2Fworks%2F16406";
    await expect(dialog.getByRole("link", { name: "Share on LinkedIn" })).toHaveAttribute(
      "href",
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodedProdUrl}`,
    );
  });

  /**
   * Regression guard for issue #133's change to the work page's header: it
   * now holds five controls (composer link, ♡, and the share trigger), and
   * `e2e/catalog.spec.ts`'s favourites block scopes its own button lookup to
   * `article header` — confirms that scope still resolves exactly one
   * favourite button after this change.
   */
  test("the work header still resolves exactly one favourite button", async ({ page }) => {
    await page.goto("/ja/works/16406");
    const header = page.locator("article header");
    await expect(header.getByRole("button", { name: /お気に入り/ })).toHaveCount(1);
    await expect(header.getByRole("button", { name: "共有" })).toHaveCount(1);
  });
});
