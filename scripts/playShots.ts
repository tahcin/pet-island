/**
 * Gameplay screenshots for visual review: drives the keyboard on a running dev server and saves
 * PNGs to screenshots/play/. Usage: npx tsx scripts/playShots.ts [baseUrl]  (default localhost:5173)
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5173";

async function hold(page: Page, key: string, ms: number): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

async function main(): Promise<void> {
  mkdirSync("screenshots/play", { recursive: true });
  const browser = await chromium.launch({
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.goto(`${base}/?play#seed=12345`);
  await page.waitForFunction("typeof window.__worldReady === 'number'", undefined, { timeout: 60_000 });
  await page.waitForTimeout(800);
  const shot = async (name: string) => {
    await page.screenshot({ path: `screenshots/play/${name}.png` });
    console.log("wrote", name);
  };
  await shot("01-start");
  await hold(page, "KeyW", 1500);
  await page.waitForTimeout(700);
  await shot("02-walked");
  await page.waitForTimeout(3000);
  await shot("03-idle");
  await page.keyboard.press("Tab");
  await hold(page, "KeyS", 900);
  await page.waitForTimeout(900);
  await shot("04-pet-mode");
  await page.keyboard.press("KeyC");
  await page.waitForTimeout(6000);
  await shot("05-pet-cam");
  await page.keyboard.press("Space");
  await page.waitForTimeout(250);
  await shot("06-dig");
  await page.keyboard.press("KeyC");
  await page.waitForTimeout(2000);
  await hold(page, "KeyW", 700);
  await page.waitForTimeout(400);
  await shot("07-back-to-avatar-wave");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
