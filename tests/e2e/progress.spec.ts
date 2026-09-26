import { expect, test } from "@playwright/test";
import { mockReading, uploadAndPlay } from "./fixtures";

const readXp = () => {
  try {
    const raw = window.localStorage.getItem("petIsland.progress.v1");
    return raw ? (JSON.parse(raw) as { xp: number }).xp : 0;
  } catch {
    return 0;
  }
};

test("progress pill, passport with daily tasks, and XP from collecting", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mockReading(page);
  await uploadAndPlay(page);

  // First visit of the day shows the welcome card with a streak and a gift.
  await expect(page.getByTestId("welcome-card")).toContainText("Day 1 streak");
  await page.getByTestId("welcome-ok").click();
  await expect(page.getByTestId("welcome-card")).toHaveCount(0);

  await expect(page.getByTestId("progress-pill")).toBeVisible();
  await page.getByTestId("progress-pill").click();
  await expect(page.getByTestId("passport")).toBeVisible();
  await expect(page.getByTestId("daily-task")).toHaveCount(3);
  await page.keyboard.press("KeyK");
  await expect(page.getByTestId("passport")).toHaveCount(0);

  const before = await page.evaluate(readXp);
  await page.waitForFunction("!!window.__pi && window.__pi.collectibles.length > 0");
  await page.evaluate(() => {
    const c = window.__pi!.collectibles.find((x) => x.kind === "shell" && !x.taken)!;
    window.__pi!.teleport(c.x + 1, c.z);
  });
  await expect(page.getByTestId("interact-hint")).toContainText("pick up");
  await page.keyboard.press("Space");
  await expect.poll(() => page.evaluate(readXp)).toBeGreaterThan(before);

  // The collection book counts the find.
  await page.keyboard.press("KeyK");
  await page.getByTestId("tab-collection").click();
  await expect(page.getByTestId("passport")).toContainText(/Seashell|Golden shell/);
  expect(errors).toEqual([]);
});
