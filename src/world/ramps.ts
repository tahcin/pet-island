import {
  CELL,
  HALF,
  LEVEL_HEIGHTS,
  RES,
  gridX,
  gridZ,
  heightAt,
  lerp,
  smoothstep,
  type Heightmap,
  type NoiseKit,
} from "./heightmap";
import { riverDistanceAt, type River } from "./river";

export interface Ramp {
  /** Low end center. */
  ax: number;
  az: number;
  /** High end center. */
  bx: number;
  bz: number;
  /** Unit direction from a to b. */
  dx: number;
  dz: number;
  length: number;
  halfWidth: number;
  fromLevel: number;
  toLevel: number;
  hLow: number;
  hHigh: number;
}

const RAMP_HALF_WIDTH = 1.5;
const RAMP_BLEND = 1.1;

function gradientAt(hm: Heightmap, x: number, z: number): [number, number] {
  const s = 1.5;
  return [
    (heightAt(hm, x + s, z) - heightAt(hm, x - s, z)) / (2 * s),
    (heightAt(hm, x, z + s) - heightAt(hm, x, z - s)) / (2 * s),
  ];
}

function flatAt(hm: Heightmap, river: River, x: number, z: number, h: number): boolean {
  return Math.abs(heightAt(hm, x, z) - h) < 0.08 && riverDistanceAt(river, x, z) > 4;
}

/** Local coordinates of p relative to the ramp: along in [0, 1] from a to b, lateral in meters. */
export function rampLocal(r: Ramp, x: number, z: number): { along: number; lateral: number } {
  const px = x - r.ax;
  const pz = z - r.az;
  return {
    along: (px * r.dx + pz * r.dz) / r.length,
    lateral: Math.abs(px * -r.dz + pz * r.dx),
  };
}

export function isOnRamp(ramps: Ramp[], x: number, z: number): boolean {
  for (const r of ramps) {
    const { along, lateral } = rampLocal(r, x, z);
    if (along > -0.15 && along < 1.15 && lateral < r.halfWidth + 0.4) return true;
  }
  return false;
}

function tryRamp(
  hm: Heightmap,
  river: River,
  x: number,
  z: number,
  fromLevel: number,
  length: number,
): Ramp | null {
  const hLow = LEVEL_HEIGHTS[fromLevel - 1];
  const hHigh = LEVEL_HEIGHTS[fromLevel];
  const [gx, gz] = gradientAt(hm, x, z);
  const g = Math.hypot(gx, gz);
  if (g < 0.2) return null;
  const dx = gx / g;
  const dz = gz / g;
  const half = length / 2;
  const ax = x - dx * half;
  const az = z - dz * half;
  const bx = x + dx * half;
  const bz = z + dz * half;
  const px = -dz;
  const pz = dx;
  // Both landings must be flat on their level, wide enough, and away from the river.
  for (const off of [-2.6, 0, 2.6]) {
    for (const extra of [0, 1.5]) {
      if (!flatAt(hm, river, ax + px * off - dx * extra, az + pz * off - dz * extra, hLow)) return null;
      if (!flatAt(hm, river, bx + px * off + dx * extra, bz + pz * off + dz * extra, hHigh)) return null;
    }
  }
  for (let t = 0.25; t < 1; t += 0.25) {
    if (riverDistanceAt(river, lerp(ax, bx, t), lerp(az, bz, t)) < 5) return null;
  }
  return {
    ax,
    az,
    bx,
    bz,
    dx,
    dz,
    length,
    halfWidth: RAMP_HALF_WIDTH,
    fromLevel,
    toLevel: fromLevel + 1,
    hLow,
    hHigh,
  };
}

function carveRamp(hm: Heightmap, r: Ramp): void {
  const reach = r.length + 4;
  const cx = (r.ax + r.bx) / 2;
  const cz = (r.az + r.bz) / 2;
  const i0 = Math.max(0, Math.floor((cx - reach + HALF) / CELL));
  const i1 = Math.min(RES - 1, Math.ceil((cx + reach + HALF) / CELL));
  const j0 = Math.max(0, Math.floor((cz - reach + HALF) / CELL));
  const j1 = Math.min(RES - 1, Math.ceil((cz + reach + HALF) / CELL));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const { along, lateral } = rampLocal(r, gridX(i), gridZ(j));
      if (along < -0.25 || along > 1.25) continue;
      const w = 1 - smoothstep(r.halfWidth, r.halfWidth + RAMP_BLEND, lateral);
      if (w <= 0) continue;
      const target = lerp(r.hLow, r.hHigh, Math.min(1, Math.max(0, along)));
      const k = j * RES + i;
      hm.heights[k] = lerp(hm.heights[k], target, w);
    }
  }
}

/**
 * Two ramps per level boundary (PRD 7.3), found by sampling mid-cliff points whose uphill
 * direction lands on flat ground at both ends, then carved as a straight 3 m corridor.
 */
export function buildRamps(hm: Heightmap, river: River, kit: NoiseKit): Ramp[] {
  const ramps: Ramp[] = [];
  for (const fromLevel of [1, 2]) {
    const hLow = LEVEL_HEIGHTS[fromLevel - 1];
    const hHigh = LEVEL_HEIGHTS[fromLevel];
    const mid: number[] = [];
    for (let k = 0; k < hm.heights.length; k++) {
      const h = hm.heights[k];
      if (h > hLow + 0.6 && h < hHigh - 0.6) mid.push(k);
    }
    // Seeded shuffle.
    for (let n = mid.length - 1; n > 0; n--) {
      const m = Math.floor(kit.rng() * (n + 1));
      [mid[n], mid[m]] = [mid[m], mid[n]];
    }
    const found: Ramp[] = [];
    for (const length of [8, 10, 12]) {
      for (const k of mid) {
        if (found.length >= 2) break;
        const x = gridX(k % RES);
        const z = gridZ(Math.floor(k / RES));
        if (found.some((r) => Math.hypot((r.ax + r.bx) / 2 - x, (r.az + r.bz) / 2 - z) < 22)) continue;
        if (ramps.some((r) => Math.hypot((r.ax + r.bx) / 2 - x, (r.az + r.bz) / 2 - z) < 10)) continue;
        const ramp = tryRamp(hm, river, x, z, fromLevel, length);
        if (ramp) found.push(ramp);
      }
      if (found.length >= 2) break;
    }
    for (const r of found) carveRamp(hm, r);
    ramps.push(...found);
  }
  return ramps;
}
