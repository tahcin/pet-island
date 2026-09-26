import { expect, test } from "@playwright/test";

test("play with Claude: no photo, mascot reveal, then the island", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByTestId("play-claude").click();
  await expect(page.getByText("Claude", { exact: true })).toBeVisible();
  await expect(page.getByText("Claude's Cove")).toBeVisible();
  await page.getByRole("button", { name: "Let's go" }).click();
  await page.waitForFunction("typeof window.__worldReady === 'number'", undefined, { timeout: 60_000 });
  expect(errors).toEqual([]);
});
