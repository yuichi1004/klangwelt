import { expect, test } from "@playwright/test";

/**
 * PWA install surface: the guide page, the manifest each locale links to,
 * and the mobile install sheet (`install-prompt.tsx`).
 *
 * The sheet's two real triggers — Chrome's `beforeinstallprompt` event and
 * being on iOS Safari — are not things Playwright's Chrome can produce on
 * its own (the event depends on Chrome's own installability heuristics, and
 * there is no Safari engine here). Both are therefore forced from the test:
 * `beforeinstallprompt` by dispatching it manually with a stubbed `prompt`,
 * and "iOS Safari" by overriding the user agent — `isIosSafari`
 * (`src/lib/install-prompt.ts`) only ever looks at the UA string, so this is
 * exactly what it would see on a real device.
 *
 * `beforeinstallprompt` is dispatched only after `networkidle`: the
 * component's own listener is attached by a `useEffect` on mount, and
 * dispatching before hydration finishes fires the event into an empty room
 * — nothing is listening for it yet, and there is no way to "replay" a
 * DOM event once it's gone. `page.clock` is deliberately not used to skip
 * the 8s show-delay for the same reason: advancing a fake clock before the
 * component's own `setTimeout` call has actually run does nothing, since
 * that call schedules against whatever the clock reads *then*, not before.
 */

type Page = import("@playwright/test").Page;

const IOS_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const INSTALL_PROMPT_DELAY_MS = 8000;

/** Fires a `beforeinstallprompt` with a stubbed, spyable `prompt()`. */
async function dispatchBeforeInstallPrompt(page: Page) {
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: () => {
        (window as unknown as { __promptCalls: number }).__promptCalls =
          ((window as unknown as { __promptCalls?: number }).__promptCalls ??
            0) + 1;
        return Promise.resolve();
      },
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(event);
  });
}

test.describe("install guide page", () => {
  test("renders in Japanese and English", async ({ page }) => {
    await page.goto("/ja/install");
    await expect(
      page.getByRole("heading", { level: 1, name: "アプリとして使う" }),
    ).toBeVisible();
    await expect(page.getByText("iPhone・iPad（Safari）")).toBeVisible();

    await page.goto("/en/install");
    await expect(
      page.getByRole("heading", { level: 1, name: "Install app" }),
    ).toBeVisible();
    await expect(page.getByText("iPhone and iPad (Safari)")).toBeVisible();
  });

  test("links to the favourites page for carrying over favourites", async ({
    page,
  }) => {
    await page.goto("/ja/install");
    await expect(
      page.getByRole("link", { name: "お気に入りページを開く" }),
    ).toHaveAttribute("href", "/ja/favorites");
  });

  test("is linked from the footer", async ({ page }) => {
    await page.goto("/ja");
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: "アプリとして使う" })
      .click();
    await expect(page).toHaveURL(/\/ja\/install$/);
  });
});

test.describe("manifest", () => {
  test("each locale links its own manifest with the right start URL and icons", async ({
    page,
    request,
  }) => {
    for (const locale of ["ja", "en"]) {
      await page.goto(`/${locale}`);
      const href = await page
        .locator('link[rel="manifest"]')
        .getAttribute("href");
      expect(href).toBe(`/manifest.${locale}.webmanifest`);

      const manifest = await (await request.get(href!)).json();
      expect(manifest.start_url).toBe(`/${locale}`);
      expect(manifest.display).toBe("standalone");
      expect(manifest.icons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ src: "/icon-512.png", purpose: "any" }),
          expect.objectContaining({
            src: "/icon-maskable-512.png",
            purpose: "maskable",
          }),
        ]),
      );
    }
  });
});

// A little over the component's own delay, to absorb scheduling jitter
// without every test paying for a much longer margin.
const WAIT_FOR_SHEET_MS = INSTALL_PROMPT_DELAY_MS + 1500;

test.describe("install prompt sheet", () => {
  test.describe("Android/Chrome", () => {
    test.skip(({ isMobile }) => !isMobile, "mobile-only sheet");

    test("appears after the delay once beforeinstallprompt fires, and installing dismisses it", async ({
      page,
    }) => {
      await page.goto("/ja");
      await page.waitForLoadState("networkidle");
      await dispatchBeforeInstallPrompt(page);

      const sheet = page.getByRole("region", { name: "アプリとして使う" });
      await expect(sheet).toBeVisible({ timeout: WAIT_FOR_SHEET_MS });

      await sheet.getByRole("button", { name: "インストール" }).click();
      await expect(sheet).toBeHidden();
      expect(
        await page.evaluate(
          () => (window as unknown as { __promptCalls?: number }).__promptCalls,
        ),
      ).toBe(1);
    });

    test("dismissing it once means it does not come back on the next visit", async ({
      page,
    }) => {
      await page.goto("/ja");
      await page.waitForLoadState("networkidle");
      await dispatchBeforeInstallPrompt(page);

      const sheet = page.getByRole("region", { name: "アプリとして使う" });
      await expect(sheet).toBeVisible({ timeout: WAIT_FOR_SHEET_MS });
      await sheet.getByRole("button", { name: "あとで" }).click();
      await expect(sheet).toBeHidden();

      await page.reload();
      await page.waitForLoadState("networkidle");
      await dispatchBeforeInstallPrompt(page);
      // No affirmative wait to assert against here — the sheet's listener is
      // never even attached once dismissed (see `shouldShowInstallPrompt` in
      // `install-prompt.tsx`), so there is nothing a delay would still be
      // waiting to *not* show. `toBeHidden` polls for the full timeout only
      // if the element never turns up.
      await expect(
        page.getByRole("region", { name: "アプリとして使う" }),
      ).toBeHidden({ timeout: WAIT_FOR_SHEET_MS });
    });
  });

  test.describe("iOS Safari", () => {
    test.skip(({ isMobile }) => !isMobile, "mobile-only sheet");
    test.use({ userAgent: IOS_SAFARI_UA });

    test("points at the guide page instead of a native install button", async ({
      page,
    }) => {
      await page.goto("/ja");

      const sheet = page.getByRole("region", { name: "アプリとして使う" });
      await expect(sheet).toBeVisible({ timeout: WAIT_FOR_SHEET_MS });
      const link = sheet.getByRole("link", { name: "くわしい手順" });
      await expect(link).toHaveAttribute("href", "/ja/install");

      await link.click();
      await expect(page).toHaveURL(/\/ja\/install$/);
    });
  });

  test.describe("desktop", () => {
    test.skip(({ isMobile }) => Boolean(isMobile), "mobile-only sheet");

    test("never appears, even if beforeinstallprompt fires", async ({
      page,
    }) => {
      await page.goto("/ja");
      await page.waitForLoadState("networkidle");
      await dispatchBeforeInstallPrompt(page);
      await expect(
        page.getByRole("region", { name: "アプリとして使う" }),
      ).toBeHidden({ timeout: WAIT_FOR_SHEET_MS });
    });
  });
});
