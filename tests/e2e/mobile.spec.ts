import { expect, test, type Page } from "@playwright/test";
import { mockReading, uploadAndPlay } from "./fixtures";

type Box = { x: number; y: number; width: number; height: number };

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;

/** Visible HUD pieces that must never cover each other on a phone. */
const HUD = [
  "[data-testid=hud-pet]",
  "[data-testid=mode]",
  ".pi-pills",
  ".minimap-compact",
  ".pg-pill",
  "[data-testid=journal-button]",
  "[data-testid=photo-button]",
  "[data-testid=menu-button]",
  "[data-testid=touch-stick]",
  "[data-testid=touch-interact]",
  "[data-testid=touch-talk]",
  "[data-testid=touch-swap]",
];

async function hudBoxes(page: Page): Promise<{ sel: string; box: Box }[]> {
  const out: { sel: string; box: Box }[] = [];
  for (const sel of HUD) {
    const loc = page.locator(sel).first();
    if (!(await loc.isVisible())) continue;
    const box = await loc.boundingBox();
    if (box) out.push({ sel, box });
  }
  return out;
}

async function dismissWelcome(page: Page) {
  const btn = page.locator(".pg-welcome button").first();
  if (await btn.isVisible().catch(() => false)) await btn.click();
}

for (const vp of [
  { name: "portrait", width: 390, height: 844 },
  { name: "landscape", width: 844, height: 390 },
]) {
  test.describe(`phone ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });

    test("touch controls drive the player and the HUD does not overlap", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await mockReading(page);
      await uploadAndPlay(page);
      await dismissWelcome(page);

      const stick = page.getByTestId("touch-stick");
      await expect(stick).toBeVisible();
      await expect(page.getByTestId("touch-interact")).toBeVisible();
      await expect(page.locator(".hud-hints")).toBeHidden();

      const boxes = await hudBoxes(page);
      expect(boxes.length).toBeGreaterThanOrEqual(10);
      const clashes: string[] = [];
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i]!;
        expect(b.box.x, `${b.sel} left edge`).toBeGreaterThanOrEqual(0);
        expect(b.box.x + b.box.width, `${b.sel} right edge`).toBeLessThanOrEqual(vp.width + 1);
        for (let j = i + 1; j < boxes.length; j++) {
          const c = boxes[j]!;
          if (overlaps(b.box, c.box)) clashes.push(`${b.sel} x ${c.sel}`);
        }
      }
      expect(clashes).toEqual([]);

      // Push the stick forward with a real touch pointer and hold it.
      const start = await page.evaluate(() => window.__touchPos?.());
      expect(start).toBeTruthy();
      const sb = (await stick.boundingBox())!;
      const cx = sb.x + sb.width / 2;
      const cy = sb.y + sb.height / 2;
      const cdp = await page.context().newCDPSession(page);
      const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) =>
        cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
      await touch("touchStart", cx, cy);
      await touch("touchMove", cx, cy - 30);
      await touch("touchMove", cx, cy - 60);
      await page.waitForTimeout(1500);
      await touch("touchEnd", cx, cy - 60);
      const end = await page.evaluate(() => window.__touchPos?.());
      expect(end).toBeTruthy();
      const moved = Math.hypot(end!.x - start!.x, end!.z - start!.z);
      expect(moved).toBeGreaterThan(1);

      // Interact is a Space press: it must not throw, and Swap flips the mode.
      await page.getByTestId("touch-interact").tap();
      await page.getByTestId("touch-swap").tap();
      await expect(page.getByTestId("mode")).toContainText("Playing as");
      await expect(page.getByTestId("touch-petcam")).toBeVisible();
      await page.getByTestId("touch-swap").tap();
      await expect(page.getByTestId("mode")).toContainText("Exploring with");

      // Talk opens the chat bar and hides the touch controls while typing.
      await page.getByTestId("touch-talk").tap();
      await expect(page.getByTestId("talk-bar")).toBeVisible();
      await expect(stick).toBeHidden();
      expect(errors).toEqual([]);
    });
  });
}
