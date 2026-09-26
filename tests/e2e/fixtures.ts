import type { Page } from "@playwright/test";
import { DEFAULT_READING, type PetReading } from "../../src/schema/petReading";

/** A 2x2 orange PNG; enough for the browser to decode, resize, and upload. */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4/5+B4T8DAwMDAxQAAAC+AQL+qkfYAAAAAElFTkSuQmCC",
  "base64",
);

export const FIXTURE_READING: PetReading = {
  ...DEFAULT_READING,
  spec: { ...DEFAULT_READING.spec, species: "cat", earType: "pointy", tailType: "long", markingPattern: "tuxedo" },
  nameSuggestions: ["Domino", "Oreo", "Mitten"],
  personality: ["curious", "gentle", "watchful"],
  greeting: "I peeked over the fence and found a whole island.",
  islandName: "Tuxedo Cove",
};

/** Mocks both reading routes so e2e tests never call Claude. */
export async function mockReading(page: Page, reading: PetReading = FIXTURE_READING): Promise<void> {
  await page.route("**/api/pet", (route) =>
    route.fulfill({ json: { reading, fallback: false, ms: 5 } }),
  );
  await page.route("**/api/pet/details", (route) =>
    route.fulfill({ json: { details: { mind: reading.mind, villagers: reading.villagers }, fallback: false } }),
  );
}

/** Landing to island: upload, meet, reveal, Let's go. Returns once the island has rendered. */
export async function uploadAndPlay(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({ name: "pet.png", mimeType: "image/png", buffer: TINY_PNG });
  await page.getByTestId("meet").click();
  await page.getByTestId("reveal-card").waitFor();
  await page.getByTestId("lets-go").click();
  await page.waitForFunction("typeof window.__worldReady === 'number'", undefined, { timeout: 60_000 });
}
