import { expect, test } from "@playwright/test";
import { FIXTURE_READING, mockReading, uploadAndPlay } from "./fixtures";

test.describe("juice", () => {
  test.beforeEach(async ({ page }) => {
    await mockReading(page);
    await uploadAndPlay(page);
  });

  test("N makes a new island within a second", async ({ page }) => {
    const seed = page.getByTestId("seed");
    const before = await seed.textContent();
    await page.locator("body").click({ position: { x: 640, y: 420 } });
    await page.keyboard.press("KeyN");
    await expect(seed).not.toHaveText(before ?? "", { timeout: 1000 });
    await expect(page.getByTestId("toast")).toContainText("Welcome to a new island");
  });

  test("P downloads a named PNG and hides the HUD", async ({ page }) => {
    // Software WebGL in CI makes the one-frame readback slow; a real GPU takes milliseconds.
    test.setTimeout(180_000);
    const name = FIXTURE_READING.nameSuggestions[0];
    const download = page.waitForEvent("download", { timeout: 90_000 });
    await page.keyboard.press("KeyP");
    await expect(page.locator("body")).toHaveClass(/photo-mode/);
    const file = await download;
    const filename = file.suggestedFilename();
    expect(filename).toMatch(/\.png$/);
    expect(filename).toContain(name);
    await expect(page.locator("body")).not.toHaveClass(/photo-mode/, { timeout: 10_000 });
  });
});
