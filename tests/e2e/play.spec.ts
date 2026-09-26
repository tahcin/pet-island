import { expect, test } from "@playwright/test";
import { FIXTURE_READING, mockReading, uploadAndPlay } from "./fixtures";

test("collect an item and talk to a villager", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mockReading(page);
  await uploadAndPlay(page);
  await page.waitForFunction("!!window.__pi && window.__pi.collectibles.length > 0 && window.__pi.villagers.length === 3");
  await expect(page.locator(".pi-nametag")).toHaveCount(3);

  // Teleport next to a shell (1 m off so walking does not grab it) and press Space.
  const shell = await page.evaluate(() => {
    const c = window.__pi!.collectibles.find((x) => x.kind === "shell" && !x.taken)!;
    window.__pi!.teleport(c.x + 1, c.z);
    return c.id;
  });
  await expect(page.getByTestId("interact-hint")).toContainText("pick up shell");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("count-shell")).toContainText("1");
  expect(await page.evaluate((id) => window.__pi!.collectibles.find((x) => x.id === id)!.taken, shell)).toBe(true);

  // Talk to the first villager: quest villagers ask for their quest first.
  const villager = FIXTURE_READING.villagers[0];
  await page.evaluate(() => {
    const v = window.__pi!.villagers[0];
    window.__pi!.teleport(v.body.pos.x + 1.5, v.body.pos.z);
  });
  await expect(page.getByTestId("interact-hint")).toContainText(`talk to ${villager.name}`);
  await page.keyboard.press("Space");
  const bubble = page.getByTestId("villager-bubble-0");
  await expect(bubble).toHaveAttribute("data-full", villager.questAsk);
  await expect(page.getByTestId("quest-0")).toContainText("(1 of 3)");
  await page.keyboard.press("Space");
  await expect(bubble).toHaveAttribute("data-full", villager.lines[0]);
  expect(errors).toEqual([]);
});
