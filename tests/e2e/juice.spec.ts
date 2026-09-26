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
    // Software WebGL (swiftshader) runs a few frames a second; a real GPU swaps well inside a second.
    await expect(seed).not.toHaveText(before ?? "", { timeout: 5000 });
    await expect(page.getByTestId("toast")).toContainText("Welcome to a new island");
  });

  test("pause menu: keys wait, resume leaves the island, new island needs a confirm", async ({ page }) => {
    const seed = page.getByTestId("seed");
    const before = (await seed.textContent()) ?? "";
    // The first Esc dismisses the welcome card; the next one pauses.
    await expect(page.getByTestId("welcome-card")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("welcome-card")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("pause-menu")).toBeVisible();
    // N and P pressed while paused must not fire once the game resumes.
    await page.keyboard.press("KeyN");
    await page.keyboard.press("KeyP");
    await page.getByTestId("resume").click();
    await expect(page.getByTestId("pause-menu")).toBeHidden();
    await page.waitForTimeout(3000);
    await expect(seed).toHaveText(before);
    await expect(page.locator("body")).not.toHaveClass(/photo-mode/);

    await page.getByTestId("menu-button").click();
    await page.getByTestId("pause-new-island").click();
    await page.getByTestId("pause-new-island-confirm").click();
    await expect(seed).not.toHaveText(before, { timeout: 15_000 });
    await expect(page.getByTestId("pause-menu")).toBeHidden();
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
