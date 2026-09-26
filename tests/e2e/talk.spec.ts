import { expect, test } from "@playwright/test";
import { mockReading, uploadAndPlay } from "./fixtures";

test("talk to the pet, then continue after a reload", async ({ page }) => {
  await mockReading(page);
  await page.route("**/api/pet/talk", (route) =>
    route.fulfill({
      json: {
        talk: { say: "Mrrp. Sitting right here.", act: "sit", target: "", mood: "calm", remember: "" },
        fallback: false,
        ms: 5,
      },
    }),
  );
  await page.route("**/api/villagers/chat", (route) => route.fulfill({ json: { chat: null, fallback: true, reason: "no_key" } }));

  await uploadAndPlay(page);
  await page.waitForFunction("typeof window.__petTalk === 'object'");

  await page.keyboard.press("t");
  const field = page.getByTestId("talk-input");
  await expect(field).toBeFocused();
  await field.fill("sit");
  await field.press("Enter");

  await page.waitForFunction("window.__petTalk.plan() === 'sit' && window.__petTalk.brainState() === 'sit'");
  await expect(page.getByTestId("pet-bubble")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("continue")).toHaveText("Continue with Domino");
  await page.getByTestId("continue").click();
  await page.waitForFunction("typeof window.__worldReady === 'number'", undefined, { timeout: 60_000 });
});
