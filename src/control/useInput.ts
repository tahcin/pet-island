import { useEffect } from "react";

/**
 * Module-level input state. Listeners write here; game code reads it in useFrame.
 * Nothing here triggers React renders.
 */
export const input = {
  down: new Set<string>(),
  pressed: new Set<string>(),
  dragging: false,
  mouseDX: 0,
  mouseDY: 0,
  wheel: 0,
  /** Time (performance.now) of the last key press, for idle detection. */
  lastKeyAt: 0,
  /** When true, gameplay keys are ignored (chat bar has focus). */
  suspended: false,
  /** Virtual joystick vector (x right, y forward), magnitude in [0, 1]. Written by TouchControls. */
  touchX: 0,
  touchY: 0,
  /** True while the joystick is pushed far enough to run. */
  touchRun: false,
};

/** Joystick magnitude above which the player runs. */
export const TOUCH_RUN_THRESHOLD = 0.85;

const GAME_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ShiftLeft",
  "ShiftRight",
  "Space",
  "Tab",
  "KeyC",
  "KeyP",
  "KeyN",
  "KeyT",
  "Enter",
]);

/** True once per key press; clears the flag. */
export function consumePress(code: string): boolean {
  if (input.pressed.has(code)) {
    input.pressed.delete(code);
    return true;
  }
  return false;
}

export function isDown(code: string): boolean {
  return !input.suspended && input.down.has(code);
}

/** Camera-relative move intent in [-1, 1] on each axis: x right, y forward. */
export function moveIntent(): { x: number; y: number } {
  let x = 0;
  let y = 0;
  if (isDown("KeyW") || isDown("ArrowUp")) y += 1;
  if (isDown("KeyS") || isDown("ArrowDown")) y -= 1;
  if (isDown("KeyD") || isDown("ArrowRight")) x += 1;
  if (isDown("KeyA") || isDown("ArrowLeft")) x -= 1;
  if (x === 0 && y === 0 && !input.suspended) {
    // Analog stick: keep the magnitude so a light push walks slowly.
    x = input.touchX;
    y = input.touchY;
  }
  const len = Math.hypot(x, y);
  return len > 1 ? { x: x / len, y: y / len } : { x, y };
}

export function isRunning(): boolean {
  return isDown("ShiftLeft") || isDown("ShiftRight") || (!input.suspended && input.touchRun);
}

/** Simulates a key tap from a touch button: the same path as a real keydown. */
export function tapKey(code: string): void {
  input.pressed.add(code);
  input.lastKeyAt = performance.now();
}

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

/** Attaches keyboard and mouse listeners for the lifetime of the component. */
export function useInput(target: React.RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!input.down.has(e.code)) input.pressed.add(e.code);
      input.down.add(e.code);
      input.lastKeyAt = performance.now();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      input.down.delete(e.code);
    };
    const onBlur = () => input.down.clear();
    const el = target.current;
    // Active scene pointers. One pointer orbits; two pointers pinch to zoom.
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const spread = () => {
      const [a, b] = [...pts.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 2) return;
      // Clicks on HUD controls must reach them; only drags that start on the scene orbit the camera.
      const t = e.target as HTMLElement | null;
      if (t?.closest("button, a, input, textarea, select, label, [data-no-orbit]")) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) pinch = spread();
      input.dragging = true;
      el?.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      const prev = pts.get(e.pointerId);
      if (!input.dragging || !prev) return;
      // clientX deltas work for touch where movementX is missing or zero.
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      prev.x = e.clientX;
      prev.y = e.clientY;
      if (pts.size >= 2) {
        const d = spread();
        if (pinch > 0 && d > 0) input.wheel += Math.log(pinch / d) / Math.log(1.1);
        pinch = d;
        return;
      }
      const touch = e.pointerType === "touch";
      input.mouseDX += touch ? dx * 1.4 : e.movementX || dx;
      input.mouseDY += touch ? dy * 1.4 : e.movementY || dy;
    };
    const onPointerUp = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      pinch = pts.size === 2 ? spread() : 0;
      if (pts.size === 0) input.dragging = false;
      if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      input.wheel += Math.sign(e.deltaY);
    };
    const onContext = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    el?.addEventListener("pointerdown", onPointerDown);
    el?.addEventListener("pointermove", onPointerMove);
    el?.addEventListener("pointerup", onPointerUp);
    el?.addEventListener("pointercancel", onPointerUp);
    el?.addEventListener("wheel", onWheel, { passive: false });
    el?.addEventListener("contextmenu", onContext);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      el?.removeEventListener("pointerdown", onPointerDown);
      el?.removeEventListener("pointermove", onPointerMove);
      el?.removeEventListener("pointerup", onPointerUp);
      el?.removeEventListener("pointercancel", onPointerUp);
      el?.removeEventListener("wheel", onWheel);
      el?.removeEventListener("contextmenu", onContext);
      input.down.clear();
      input.pressed.clear();
      input.touchX = 0;
      input.touchY = 0;
      input.touchRun = false;
    };
  }, [target]);
}
