/**
 * Deterministic visual review: starts Vite, opens the island at seed 12345 from three fixed
 * camera angles, and saves PNGs to ./screenshots. Also saves pet turntables to
 * ./screenshots/pets. Usage: npm run screenshot [-- --only=island|pets|ui]
 */
import { mkdirSync } from "node:fs";
import { createServer } from "vite";
import { chromium, type Page } from "@playwright/test";

const SEED = 12345;
const PORT = Number(process.env.SHOT_PORT ?? 5175);
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);

async function waitFor(page: Page, expr: string, timeout = 90_000): Promise<void> {
  await page.waitForFunction(expr, undefined, { timeout, polling: 250 });
}

async function main(): Promise<void> {
  mkdirSync("screenshots/pets", { recursive: true });
  const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: "error" });
  await server.listen();
  const browser = await chromium.launch({
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on("pageerror", (e) => console.error("page error:", e.message));
    if (!only || only === "island") {
      for (const shot of [0, 1, 2]) {
        await page.goto(`http://localhost:${PORT}/?shot=${shot}#seed=${SEED}`);
        await waitFor(page, `window.__worldReady === ${SEED}`);
        await page.waitForTimeout(1500);
        const file = `screenshots/island-${shot}.png`;
        await page.screenshot({ path: file });
        console.log("wrote", file);
      }
    }
    if (!only || only === "ui") {
      await page.goto(`http://localhost:${PORT}/`);
      await page.getByTestId("landing").waitFor();
      await page.waitForTimeout(2500);
      await page.screenshot({ path: "screenshots/landing.png" });
      console.log("wrote screenshots/landing.png");
    }
    if (!only || only === "pets") {
      for (const species of ["dog", "cat", "rabbit"]) {
        await page.goto(`http://localhost:${PORT}/?reveal=${species}`);
        await waitFor(page, "window.__petReady === true");
        await page.waitForTimeout(500);
        const file = `screenshots/pets/${species}.png`;
        await page.screenshot({ path: file });
        console.log("wrote", file);
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
