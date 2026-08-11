import { expect, test, type Page } from "@playwright/test";

import catalogMeta from "../data/catalog/meta.json";

/**
 * Japanese input in the catalogue search box.
 *
 * Reported from iOS: flick-typing ベートーベン produced `へべべーべーとべーとー`
 * — every keystroke of the in-progress composition was being committed. The
 * cause was a controlled input whose `value` came from `useSearchParams()`
 * while `onChange` pushed through `router.replace()`. That round-trip is
 * asynchronous, so React re-rendered with the *previous* query and wrote it
 * back into the field; writing to `input.value` mid-composition makes the
 * browser commit the composition, and the fragments piled up.
 *
 * These tests drive a real composition session through CDP. They fail against
 * the buggy version, which is the point — a regression test for an IME bug is
 * worthless if it passes either way.
 */

const searchBox = (page: Page) =>
  page.getByRole("searchbox", { name: "曲名・作曲家名で検索" });

/**
 * Types as a Japanese IME does: each keystroke replaces the whole
 * pre-edit string, then the conversion is committed in one go.
 */
async function composeAndCommit(
  page: Page,
  steps: string[],
  committed: string,
) {
  const cdp = await page.context().newCDPSession(page);
  for (const text of steps) {
    await cdp.send("Input.imeSetComposition", {
      text,
      selectionStart: text.length,
      selectionEnd: text.length,
    });
    // Give React a chance to run the offending re-render between keystrokes.
    await page.waitForTimeout(60);
  }
  await cdp.send("Input.insertText", { text: committed });
  await cdp.detach();
}

test.describe("Japanese IME input in the search box", () => {
  test.skip(
    ({ isMobile }) => Boolean(isMobile),
    "covered separately through the mobile filter sheet",
  );

  test("keeps only the committed text, not every pre-edit keystroke", async ({
    page,
  }) => {
    await page.goto("/ja");
    const field = searchBox(page);
    await field.click();

    // The pre-edit string as it grows on a flick keyboard.
    await composeAndCommit(
      page,
      ["へ", "べ", "べー", "べーと", "べーとー", "べーとーへ", "べーとーべん"],
      "ベートーベン",
    );

    await expect(field).toHaveValue("ベートーベン");
  });

  test("does not disturb the field while a composition is in flight", async ({
    page,
  }) => {
    await page.goto("/ja");
    const field = searchBox(page);
    await field.click();

    const cdp = await page.context().newCDPSession(page);
    for (const text of ["こ", "こう", "こうき", "こうきょう"]) {
      await cdp.send("Input.imeSetComposition", {
        text,
        selectionStart: text.length,
        selectionEnd: text.length,
      });
      await page.waitForTimeout(60);
      // The field shows exactly the pre-edit string — nothing committed yet,
      // and nothing rolled back to an earlier value by a re-render.
      await expect(field).toHaveValue(text);
    }
    await cdp.send("Input.insertText", { text: "交響曲" });
    await cdp.detach();

    await expect(field).toHaveValue("交響曲");
  });

  test("a committed query still reaches the URL and filters", async ({
    page,
  }) => {
    await page.goto("/ja");
    const field = searchBox(page);
    await field.click();

    await composeAndCommit(page, ["も", "もー", "もーつ"], "モーツァルト");

    await expect(field).toHaveValue("モーツァルト");
    await expect(page).toHaveURL(/[?&]q=/);
    await expect(page.getByTestId("result-count")).not.toHaveText(
      `${catalogMeta.coreWorkCount.toLocaleString("ja-JP")}曲`,
    );
  });

  test("plain typing still works and is not swallowed", async ({ page }) => {
    await page.goto("/ja");
    const field = searchBox(page);
    await field.click();
    await field.pressSequentially("Moonlight", { delay: 30 });

    await expect(field).toHaveValue("Moonlight");
    await expect(page).toHaveURL(/[?&]q=Moonlight/);
  });
});

/**
 * The field owning its own text means it can now drift from the URL. These
 * cover the ways the two have to stay in step.
 */
test.describe("search field and URL stay in step", () => {
  test.skip(({ isMobile }) => Boolean(isMobile), "uses the desktop sidebar");

  test("clearing the filters empties the field, not just the URL", async ({
    page,
  }) => {
    await page.goto("/ja?q=Moonlight");
    await expect(searchBox(page)).toHaveValue("Moonlight");

    await page.getByRole("button", { name: "条件をクリア" }).click();

    await expect(page).toHaveURL(/\/ja$/);
    await expect(searchBox(page)).toHaveValue("");
  });

  test("returning from a work page restores the query into the field", async ({
    page,
  }) => {
    await page.goto("/ja");
    await searchBox(page).fill("Moonlight");
    await expect(page).toHaveURL(/q=Moonlight/);

    await page.getByRole("link", { name: /月光/ }).first().click();
    await expect(page).toHaveURL(/\/works\//);

    // The browser remounts the catalogue, so the field has to seed itself
    // from the query string rather than starting empty.
    await page.goBack();
    await expect(page).toHaveURL(/q=Moonlight/);
    await expect(searchBox(page)).toHaveValue("Moonlight");
  });

  test("clicking a chip keeps text that has not reached the URL yet", async ({
    page,
  }) => {
    await page.goto("/ja");
    // Type and immediately click, inside the debounce window.
    await searchBox(page).pressSequentially("Symphony", { delay: 10 });
    await page.getByRole("button", { name: "バロック" }).click();

    await expect(page).toHaveURL(/e=Baroque/);
    await expect(page).toHaveURL(/q=Symphony/);
    await expect(searchBox(page)).toHaveValue("Symphony");
  });

  test("does not push a history entry per keystroke", async ({ page }) => {
    await page.goto("/ja");
    const before = await page.evaluate(() => history.length);
    await searchBox(page).pressSequentially("Beethoven", { delay: 20 });
    await expect(page).toHaveURL(/q=Beethoven/);
    // router.replace should not grow history at all, let alone once per key.
    expect(await page.evaluate(() => history.length)).toBe(before);
  });
});

test.describe("Japanese IME input inside the mobile filter sheet", () => {
  test.skip(({ isMobile }) => !isMobile, "mobile-only");

  test("keeps only the committed text", async ({ page }) => {
    await page.goto("/ja");
    await page.getByRole("button", { name: /^絞り込み/ }).click();

    // The desktop sidebar is display:none here, so only the sheet's field is
    // visible; scope to it rather than matching both copies of the panel.
    const field = searchBox(page).and(page.locator(":visible"));
    await field.click();

    await composeAndCommit(page, ["へ", "べ", "べー", "べーとー"], "ベートーベン");

    await expect(field).toHaveValue("ベートーベン");
  });
});
