import { runtime } from "../game/runtime";
import type { WorldData } from "../world/generateWorld";

declare global {
  interface Window {
    __worldReady?: number;
  }
}

/** `?shot=0|1|2` selects a fixed camera for deterministic screenshots and hides the HUD. */
export function readShot(): number | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("shot");
  return v === null ? null : Number(v) || 0;
}

/** Camera presets: 0 behind the player, 1 high and wide, 2 low toward the horizon. */
export function applyShot(shot: number, world: WorldData): void {
  const cam = runtime.camera;
  const s = world.spawn;
  if (shot === 1) {
    cam.yaw = s.yaw + Math.PI + 0.5;
    cam.pitch = 0.95;
    cam.zoom = 2.6;
  } else if (shot === 2) {
    cam.yaw = s.yaw + Math.PI - 0.9;
    cam.pitch = 0.12;
    cam.zoom = 1.2;
  } else {
    cam.yaw = s.yaw + Math.PI;
    cam.pitch = 0.62;
    cam.zoom = 1.35;
  }
  cam.snap = true;
}
