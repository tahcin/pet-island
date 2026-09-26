import { expect, test } from "@playwright/test";
import { FIXTURE_READING, mockReading, uploadAndPlay } from "./fixtures";

test("load, mocked reading, reveal, play, Tab swap, pet-cam, dig", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mockReading(page);
  await uploadAndPlay(page);
  const name = FIXTURE_READING.nameSuggestions[0];
  const mode = page.getByTestId("mode");
  await expect(mode).toHaveText(`Exploring with ${name}`);
  await expect(page.getByTestId("hud-pet")).toContainText(name);

  // Walk a little so the pet has something to follow.
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(600);
  await page.keyboard.up("KeyW");

  await page.keyboard.press("Tab");
  await expect(mode).toHaveText(`Playing as ${name}`);
  await page.keyboard.press("KeyC");
  await page.keyboard.press("Space");
  await page.waitForTimeout(500);
  await page.keyboard.press("KeyC");
  await page.keyboard.press("Tab");
  await expect(mode).toHaveText(`Exploring with ${name}`);
  expect(errors).toEqual([]);
});
