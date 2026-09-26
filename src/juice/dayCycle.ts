import * as THREE from "three";

/** One full day in seconds (PRD F21: a 4-minute cycle). */
export const DAY_SECONDS = 240;

/** Palette at one moment of the day. Colors are hex strings; blended into THREE.Colors. */
interface Key {
  t: number;
  skyTop: string;
  horizon: string;
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  sun: string;
  sunI: number;
  stars: number;
}

/**
 * Pastel keyframes over timeOfDay in [0, 1). The day plateau (0.3 to 0.62) matches the look the
 * screenshots were tuned on. Night is deep blue-lilac and never pitch dark.
 */
const KEYS: Key[] = [
  { t: 0.0, skyTop: "#39406f", horizon: "#6d6aa6", hemiSky: "#8c8fd0", hemiGround: "#4f4a78", hemi: 1.05, sun: "#b9c4ff", sunI: 0.45, stars: 1 },
  { t: 0.18, skyTop: "#434a7c", horizon: "#8a7fb8", hemiSky: "#9c9ad6", hemiGround: "#5d557f", hemi: 1.05, sun: "#c3c8ff", sunI: 0.5, stars: 0.85 },
  { t: 0.24, skyTop: "#9fb8e8", horizon: "#ffd2b8", hemiSky: "#e6d4f0", hemiGround: "#ffd0b0", hemi: 1.2, sun: "#ffc79e", sunI: 1.1, stars: 0.1 },
  { t: 0.3, skyTop: "#8ccbf5", horizon: "#cfeaff", hemiSky: "#bfe3ff", hemiGround: "#ffe1b8", hemi: 1.4, sun: "#fff4dc", sunI: 1.6, stars: 0 },
  { t: 0.62, skyTop: "#8ccbf5", horizon: "#cfeaff", hemiSky: "#bfe3ff", hemiGround: "#ffe1b8", hemi: 1.4, sun: "#fff4dc", sunI: 1.6, stars: 0 },
  { t: 0.72, skyTop: "#a9b9ee", horizon: "#ffd6b5", hemiSky: "#ffd9c4", hemiGround: "#ffc9a0", hemi: 1.3, sun: "#ffc08c", sunI: 1.35, stars: 0 },
  { t: 0.8, skyTop: "#6e6aa8", horizon: "#e4a9c0", hemiSky: "#c8b0e0", hemiGround: "#b08aa8", hemi: 1.15, sun: "#ffb0a0", sunI: 0.8, stars: 0.35 },
  { t: 0.88, skyTop: "#39406f", horizon: "#6d6aa6", hemiSky: "#8c8fd0", hemiGround: "#4f4a78", hemi: 1.05, sun: "#b9c4ff", sunI: 0.45, stars: 1 },
  { t: 1.0, skyTop: "#39406f", horizon: "#6d6aa6", hemiSky: "#8c8fd0", hemiGround: "#4f4a78", hemi: 1.05, sun: "#b9c4ff", sunI: 0.45, stars: 1 },
];

export interface DayLook {
  skyTop: THREE.Color;
  horizon: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemi: number;
  sun: THREE.Color;
  sunI: number;
  stars: number;
  /** Unit direction toward the sun (or the moon at night). */
  sunDir: THREE.Vector3;
}

export function makeDayLook(): DayLook {
  return {
    skyTop: new THREE.Color(),
    horizon: new THREE.Color(),
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    hemi: 1,
    sun: new THREE.Color(),
    sunI: 1,
    stars: 0,
    sunDir: new THREE.Vector3(),
  };
}

const ca = new THREE.Color();
const cb = new THREE.Color();
function mix(out: THREE.Color, a: string, b: string, k: number): void {
  ca.set(a);
  cb.set(b);
  out.copy(ca).lerp(cb, k);
}

const smooth = (k: number) => k * k * (3 - 2 * k);

/** Fills `out` with the blended look at time `t` (wrapped into [0, 1)). Pure apart from `out`. */
export function dayLookAt(t: number, out: DayLook): DayLook {
  const tt = ((t % 1) + 1) % 1;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].t <= tt) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const k = smooth(Math.min(1, Math.max(0, (tt - a.t) / (b.t - a.t))));
  mix(out.skyTop, a.skyTop, b.skyTop, k);
  mix(out.horizon, a.horizon, b.horizon, k);
  mix(out.hemiSky, a.hemiSky, b.hemiSky, k);
  mix(out.hemiGround, a.hemiGround, b.hemiGround, k);
  mix(out.sun, a.sun, b.sun, k);
  out.hemi = a.hemi + (b.hemi - a.hemi) * k;
  out.sunI = a.sunI + (b.sunI - a.sunI) * k;
  out.stars = a.stars + (b.stars - a.stars) * k;
  // The sun arcs from east (0.25) over the top (0.5) to west (0.75); the moon takes over at night.
  // Elevation never drops below 0.35 so shadows stay short and readable.
  const day = tt >= 0.22 && tt <= 0.8;
  const phase = day ? (tt - 0.22) / 0.58 : ((tt + 0.2) % 1) / 0.42;
  const az = -0.9 + phase * 1.8;
  const el = 0.35 + 0.55 * Math.sin(Math.min(1, Math.max(0, phase)) * Math.PI);
  out.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el) * 0.6 + 0.4).normalize();
  return out;
}

/** Live clock shared by the sky, lights, stars, and HUD. Advanced by DayClock in useFrame. */
export const dayClock = {
  t: 0.4,
  look: dayLookAt(0.4, makeDayLook()),
};

/** True when the page is a deterministic screenshot (`?shot=`): time stays at bright day. */
export function isShot(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("shot");
}

declare global {
  interface Window {
    __dayClock?: typeof dayClock;
  }
}

// Dev hook for screenshot scripts to scrub the time of day.
if (import.meta.env?.DEV && typeof window !== "undefined") window.__dayClock = dayClock;
