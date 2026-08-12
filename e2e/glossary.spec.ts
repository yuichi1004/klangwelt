import { expect, test } from "@playwright/test";

import glossaryData from "../data/glossary.json";

/**
 * Covers the parts of 専門用語 Tips that only exist once JavaScript runs:
 * opening/closing the popup and its two layouts. The detection logic itself
 * (longest match, word boundaries, first-occurrence-only) is unit-tested in
 * `src/lib/glossary.test.ts`; these tests check it is actually wired to the
 * UI on a real page.
 *
 * Beethoven's page (id 145) is already used throughout `e2e/catalog.spec.ts`
 * for the same reason it's useful here: stable content that reliably
 * contains glossary terms (his biography mentions both "ソナタ" and "四重奏").
 */

const sonata = glossaryData.sonata;
const quartet = glossaryData.quartet;

test.describe("glossary term popups", () => {
  test("a known term renders as a trigger, not plain text", async ({ page }) => {
    await page.goto("/ja/composers/145");
    await expect(
      page.getByRole("button", { name: sonata.term.ja }),
    ).toBeVisible();
  });

  test.describe("desktop popover", () => {
    test.skip(({ isMobile }) => Boolean(isMobile), "desktop-only layout");

    test("opening a term shows its definition", async ({ page }) => {
      await page.goto("/ja/composers/145");
      const trigger = page.getByRole("button", { name: sonata.term.ja });

      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await trigger.click();
      await expect(trigger).toHaveAttribute("aria-expanded", "true");

      const dialog = page.getByRole("dialog", { name: sonata.term.ja });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(sonata.short.ja);
    });

    test("Escape closes the open popup", async ({ page }) => {
      await page.goto("/ja/composers/145");
      await page.getByRole("button", { name: sonata.term.ja }).click();
      await expect(page.getByRole("dialog", { name: sonata.term.ja })).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: sonata.term.ja })).toBeHidden();
    });

    test("clicking outside the popup closes it", async ({ page }) => {
      await page.goto("/ja/composers/145");
      await page.getByRole("button", { name: sonata.term.ja }).click();
      await expect(page.getByRole("dialog", { name: sonata.term.ja })).toBeVisible();

      await page.getByRole("heading", { level: 1 }).click();
      await expect(page.getByRole("dialog", { name: sonata.term.ja })).toBeHidden();
    });

    test("clicking its own trigger again closes the popup", async ({ page }) => {
      await page.goto("/ja/composers/145");
      const trigger = page.getByRole("button", { name: sonata.term.ja });
      await trigger.click();
      await expect(page.getByRole("dialog", { name: sonata.term.ja })).toBeVisible();

      await trigger.click();
      await expect(page.getByRole("dialog", { name: sonata.term.ja })).toBeHidden();
    });

    test("opening a second term closes the first", async ({ page }) => {
      await page.goto("/ja/composers/145");
      await page.getByRole("button", { name: sonata.term.ja }).click();
      await expect(page.getByRole("dialog", { name: sonata.term.ja })).toBeVisible();

      await page.getByRole("button", { name: quartet.term.ja }).click();
      await expect(page.getByRole("dialog", { name: quartet.term.ja })).toBeVisible();
      await expect(page.getByRole("dialog", { name: sonata.term.ja })).toBeHidden();
    });
  });

  test.describe("mobile bottom sheet", () => {
    test.skip(({ isMobile }) => !isMobile, "mobile-only layout");

    test("opening a term shows a bottom sheet with a close button", async ({ page }) => {
      await page.goto("/ja/composers/145");
      await page.getByRole("button", { name: sonata.term.ja }).click();

      const sheet = page.getByRole("dialog", { name: sonata.term.ja });
      await expect(sheet).toBeVisible();
      await expect(sheet).toContainText(sonata.short.ja);

      await sheet.getByRole("button", { name: "閉じる" }).click();
      await expect(sheet).toBeHidden();
    });

    test("tapping the backdrop closes the sheet", async ({ page }) => {
      await page.goto("/ja/composers/145");
      await page.getByRole("button", { name: sonata.term.ja }).click();
      await expect(page.getByRole("dialog", { name: sonata.term.ja })).toBeVisible();

      // The backdrop covers the top strip above the sheet itself.
      await page.mouse.click(10, 10);
      await expect(page.getByRole("dialog", { name: sonata.term.ja })).toBeHidden();
    });
  });

  test("English pages show the English definition", async ({ page }) => {
    await page.goto("/en/composers/145");
    // The rendered trigger text is whichever inflection the prose actually
    // uses ("sonata" vs "sonatas"), so match any of the entry's declared
    // English forms rather than hard-coding one.
    const pattern = new RegExp(sonata.match.en.join("|"), "i");
    const trigger = page.getByRole("button", { name: pattern }).first();
    await expect(trigger).toBeVisible();

    await trigger.click();
    await expect(page.getByRole("dialog").filter({ hasText: sonata.short.en })).toBeVisible();
  });

  test("no page overflows the viewport horizontally with a popup open", async ({
    page,
  }, testInfo) => {
    const width = testInfo.project.use.viewport?.width ?? 412;
    await page.goto("/ja/composers/145");
    await page.getByRole("button", { name: sonata.term.ja }).click();
    await expect(page.getByRole("dialog", { name: sonata.term.ja })).toBeVisible();

    const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(docWidth).toBeLessThanOrEqual(width + 1);
  });
});
