import { expect, test } from "@playwright/test";

test("island renders at a fixed seed", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?shot=0#seed=12345");
  await page.waitForFunction("window.__worldReady === 12345", undefined, { timeout: 60_000 });
  await expect(page.locator("canvas")).toBeVisible();
  expect(errors).toEqual([]);
});
