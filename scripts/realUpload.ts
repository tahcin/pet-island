/**
 * End-to-end real-photo check against a running `npm run dev` (live Claude, no mocks):
 * uploads every photo in a folder through the landing page, times "Meet your pet" to the
 * reveal card, and saves each reveal to screenshots/real/. Usage:
 *   npx tsx scripts/realUpload.ts [folder] [baseUrl]   (defaults: test-photos, http://localhost:5173)
 */
import { mkdirSync, readdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { chromium } from "@playwright/test";

const dir = process.argv[2] ?? "test-photos";
const base = process.argv[3] ?? "http://localhost:5173";

async function main(): Promise<void> {
  mkdirSync("screenshots/real", { recursive: true });
  const files = readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(extname(f)));
  const browser = await chromium.launch({
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  let worst = 0;
  try {
    for (const f of files) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(base);
      await page.getByTestId("file-input").setInputFiles(join(dir, f));
      await page.getByTestId("meet").click();
      const t0 = Date.now();
      await page.getByTestId("reveal-card").waitFor({ timeout: 40_000 });
      const ms = Date.now() - t0;
      worst = Math.max(worst, ms);
      await page.waitForFunction("window.__petReady === true", undefined, { timeout: 30_000 });
      const name = await page.getByTestId("pet-name").textContent();
      const note = await page.locator(".reveal-confidence").textContent().catch(() => null);
      const shot = `screenshots/real/${basename(f, extname(f))}.png`;
      await page.screenshot({ path: shot });
      console.log(`${f}: reveal after ${(ms / 1000).toFixed(1)} s, name ${name}${note ? ` | note: ${note}` : ""} -> ${shot}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`worst ${(worst / 1000).toFixed(1)} s over ${files.length} photos`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
