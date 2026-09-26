import { expect, test } from "@playwright/test";
import { FIXTURE_READING, TINY_PNG, mockReading, uploadAndPlay } from "./fixtures";

test("upload, mocked reading, reveal, and play", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mockReading(page);
  await page.goto("/");
  await expect(page.getByTestId("landing")).toBeVisible();
  await page.getByTestId("file-input").setInputFiles({ name: "pet.png", mimeType: "image/png", buffer: TINY_PNG });
  await page.getByTestId("meet").click();
  await expect(page.getByTestId("pet-name")).toHaveText(FIXTURE_READING.nameSuggestions[0]);
  await expect(page.getByText(FIXTURE_READING.islandName)).toBeVisible();
  for (const trait of FIXTURE_READING.personality) await expect(page.getByText(trait, { exact: true })).toBeVisible();
  await page.getByTestId("lets-go").click();
  await page.waitForFunction("typeof window.__worldReady === 'number'", undefined, { timeout: 60_000 });
  await expect(page.getByTestId("play")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a failed reading still produces a pet and a friendly message", async ({ page }) => {
  await page.route("**/api/pet", (route) => route.fulfill({ status: 500, body: "boom" }));
  await page.route("**/api/pet/details", (route) => route.fulfill({ status: 500, body: "boom" }));
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({ name: "pet.png", mimeType: "image/png", buffer: TINY_PNG });
  await page.getByTestId("meet").click();
  await expect(page.getByTestId("pet-name")).toHaveText("Biscuit");
  await expect(page.getByText("here is a stand-in pet")).toBeVisible();
});

test("helper reaches the island", async ({ page }) => {
  await mockReading(page);
  await uploadAndPlay(page);
  await expect(page.getByTestId("play")).toBeVisible();
});
