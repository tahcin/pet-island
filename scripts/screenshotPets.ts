/**
 * Reveal-screen screenshots of the three sample pets (and optional variants).
 *
 *   npx tsx scripts/screenshotPets.ts                      # dog, cat, rabbit
 *   npx tsx scripts/screenshotPets.ts lop="reveal=dog&ear=long_floppy&pattern=tuxedo"
 *
 * Expects a Vite dev server (default http://localhost:5174, override with PET_SHOT_URL).
 * Saves PNGs to screenshots/pets/<name>.png at 1280x800 after window.__petReady plus 0.5 s.
 */
import { chromium, type Browser } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.PET_SHOT_URL ?? "http://localhost:5174";
const OUT = join(process.cwd(), "screenshots", "pets");

const jobs: [string, string][] = [];
for (const arg of process.argv.slice(2)) {
  const eq = arg.indexOf("=");
  if (eq > 0) jobs.push([arg.slice(0, eq), arg.slice(eq + 1)]);
}
if (!jobs.length) jobs.push(["dog", "reveal=dog"], ["cat", "reveal=cat"], ["rabbit", "reveal=rabbit"]);

async function launch(): Promise<Browser> {
  const swiftshader = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
  try {
    return await chromium.launch({ args: ["--ignore-gpu-blocklist", "--use-angle=default"] });
  } catch {
    return chromium.launch({ args: swiftshader });
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  for (const [name, query] of jobs) {
    await page.goto(`${BASE}/?${query}`, { waitUntil: "load" });
    // Apply the dev route even if main.tsx has not wired applyDevRoute yet.
    await page.evaluate(async (url) => {
      if (window.__petReady === undefined) {
        const mod = (await import(/* @vite-ignore */ url)) as { applyDevRoute: () => void };
        mod.applyDevRoute();
      }
    }, "/src/ui/devRoutes.ts");
    // "name@1.2" shoots 1.2 s into the draw-in instead of waiting for it to finish.
    const [file0, at] = name.split("@");
    if (at) {
      await page.waitForTimeout(Number(at) * 1000);
    } else {
      await page.waitForFunction(() => window.__petReady === true, undefined, { timeout: 30000 });
      await page.waitForTimeout(500);
    }
    const file = join(OUT, `${file0}${at ? `-t${at}` : ""}.png`);
    await page.screenshot({ path: file });
    console.log("saved", file);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
