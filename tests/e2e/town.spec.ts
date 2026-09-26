import { expect, test } from "@playwright/test";
import { mockReading, uploadAndPlay } from "./fixtures";

test("journal lists townsfolk and guides to a quest", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mockReading(page);
  await uploadAndPlay(page);
  await page.waitForFunction("!!window.__pi && window.__pi.villagers.length === 6");

  await page.keyboard.press("j");
  const journal = page.getByTestId("journal");
  await expect(journal).toBeVisible();
  await journal.getByRole("tab", { name: "Townsfolk" }).click();
  await expect(journal.locator(".jn-folk")).toHaveCount(6);
  const names = await page.evaluate(() => window.__pi!.villagers.map((v) => v.name));
  for (const n of names) await expect(journal).toContainText(n);

  await journal.getByRole("tab", { name: "Quests" }).click();
  await page.getByTestId("guide-3").click();
  await page.waitForFunction("!!window.__pi && window.__pi.waypoint !== null");
  const wp = await page.evaluate(() => window.__pi!.waypoint);
  expect(wp?.quest).toBe(3);
  await expect(page.getByTestId("waypoint-arrow")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(journal).toHaveCount(0);
  expect(errors).toEqual([]);
});
