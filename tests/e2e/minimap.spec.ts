import { expect, test } from "@playwright/test";
import { FIXTURE_READING, mockReading, uploadAndPlay } from "./fixtures";

test("minimap shows compact, expands with M, closes with Escape", async ({ page }) => {
  await mockReading(page);
  await uploadAndPlay(page);
  await expect(page.getByTestId("minimap")).toBeVisible();

  await page.keyboard.press("m");
  const expanded = page.getByTestId("minimap-expanded");
  await expect(expanded).toBeVisible();
  const legend = page.getByTestId("minimap-legend");
  const names = FIXTURE_READING.villagers.map((v) => v.name);
  expect(names).toHaveLength(3);
  for (const name of names) await expect(legend).toContainText(name);

  await page.keyboard.press("Escape");
  await expect(expanded).toHaveCount(0);
  await expect(page.getByTestId("minimap")).toBeVisible();

  await page.getByTestId("minimap").click();
  await expect(page.getByTestId("minimap-expanded")).toBeVisible();
  await page.getByTestId("minimap-close").click();
  await expect(page.getByTestId("minimap")).toBeVisible();
});
