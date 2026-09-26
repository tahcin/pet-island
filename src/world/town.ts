import Alea from "alea";
import { HALF, RES, gridX, gridZ, heightAt, isWater, levelAt, slopeAt, type Heightmap } from "./heightmap";
import { riverDistanceAt, type River } from "./river";
import { isOnRamp, type Ramp } from "./ramps";

/** Pure town layout: a flat plaza near spawn ringed by six cottages. No three.js, no React. */

export interface TownHome {
  x: number;
  z: number;
  /** Facing angle so the door looks at the plaza. */
  yaw: number;
}

export interface Town {
  x: number;
  z: number;
  /** Whole town radius (plaza plus the cottage ring). */
  radius: number;
  /** Paved plaza radius. */
  plaza: number;
  level: number;
  /** Plaza surface height. */
  y: number;
  /** Direction from the town center toward spawn (the open entrance). */
  entranceYaw: number;
  homes: TownHome[];
  /** Stepping stones from the plaza edge toward spawn and the nearest ramps. */
  stones: { x: number; z: number }[];
  /** A high, dry lookout spot on the top level for the visit quest. */
  lookout: { x: number; z: number; level: number };
}

export const TOWN_RADIUS = 16;
export const PLAZA_RADIUS = 8.5;
export const HOME_RING = 12.5;
export const TOWN_HOMES = 6;
export const TOWN_MIN_SPAWN = 15;
export const TOWN_MAX_SPAWN = 35;

interface P2 {
  x: number;
  z: number;
}

/** True when a disk around (x, z) is dry, one level, flat, and clear of ramps and the river. */
export function flatDisk(hm: Heightmap, river: River, ramps: Ramp[], x: number, z: number, r: number, level: number, tol: number): boolean {
  // The river distance field saturates at 10 m, so ask for a clear margin below that.
  if (riverDistanceAt(river, x, z) < Math.min(r + 3, 9)) return false;
  const h0 = heightAt(hm, x, z);
  for (const rr of [r * 0.3, r * 0.55, r * 0.8, r]) {
    const n = Math.max(10, Math.round(rr * 2.5));
    for (let a = 0; a < n; a++) {
      const ang = (a / n) * Math.PI * 2;
      const px = x + Math.cos(ang) * rr;
      const pz = z + Math.sin(ang) * rr;
      const lv = levelAt(hm, px, pz);
      // Beach and level 1 differ by well under a meter, so a low plaza may span both.
      if (isWater(hm, px, pz) || (level <= 1 ? lv < 0 || lv > 1 : lv !== level)) return false;
      if (Math.abs(heightAt(hm, px, pz) - h0) > tol) return false;
      if (isOnRamp(ramps, px, pz)) return false;
    }
  }
  return true;
}

/** True when (x, z) is dry land clear of the river channel. */
export function isDryLand(hm: Heightmap, river: River, x: number, z: number): boolean {
  return !isWater(hm, x, z) && levelAt(hm, x, z) >= 0 && riverDistanceAt(river, x, z) >= 4;
}

/** Most flatDisk probes per radius pass; keeps generation well under budget. */
const MAX_PROBES = 60;

function findCenter(hm: Heightmap, river: River, ramps: Ramp[], spawn: P2, rng: () => number): { c: P2; level: number } | null {
  // Coarse 4 m grid of dry candidates; lower levels and about 24 m from spawn score best.
  const cands: { x: number; z: number; level: number; score: number }[] = [];
  for (let z = -HALF + 8; z < HALF - 8; z += 4) {
    for (let x = -HALF + 8; x < HALF - 8; x += 4) {
      const d = Math.hypot(x - spawn.x, z - spawn.z);
      if (d < 12 || d > 70) continue;
      const level = levelAt(hm, x, z);
      if (level < 0 || isWater(hm, x, z) || slopeAt(hm, x, z) > 0.12) continue;
      if (riverDistanceAt(river, x, z) < 9) continue;
      const far = Math.max(0, d - TOWN_MAX_SPAWN) * 1.5 + Math.max(0, TOWN_MIN_SPAWN - d) * 2;
      cands.push({ x, z, level, score: Math.abs(d - 24) * 0.4 + far + [3, 0, 12, 24][level] + rng() * 3 });
    }
  }
  cands.sort((p, q) => p.score - q.score);
  // Lowest walkable level first (level 1, then beach, then level 2), bigger plazas first.
  for (const level of [1, 0, 2, 3]) {
    for (const r of [PLAZA_RADIUS + 3, PLAZA_RADIUS + 1.5, PLAZA_RADIUS]) {
      let probes = 0;
      for (const c of cands) {
        if (c.level !== level) continue;
        if (probes++ >= MAX_PROBES) break;
        if (flatDisk(hm, river, ramps, c.x, c.z, r, level, level <= 1 ? 0.65 : 0.35)) return { c: { x: c.x, z: c.z }, level };
      }
    }
  }
  const dry = cands.find((c) => isDryLand(hm, river, c.x, c.z));
  return dry ? { c: { x: dry.x, z: dry.z }, level: dry.level } : null;
}

function stoneLine(hm: Heightmap, ramps: Ramp[], from: P2, to: P2, startR: number, out: P2[]): void {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  if (len < startR + 2) return;
  const ux = dx / len;
  const uz = dz / len;
  for (let s = startR + 0.6; s < len - 1.5; s += 1.5) {
    const wob = Math.sin(s * 0.7) * 0.35;
    const x = from.x + ux * s - uz * wob;
    const z = from.z + uz * s + ux * wob;
    if (isWater(hm, x, z) || slopeAt(hm, x, z) > 0.3 || isOnRamp(ramps, x, z)) continue;
    out.push({ x, z });
  }
}

function findLookout(hm: Heightmap, river: River, from: P2): { x: number; z: number; level: number } {
  let top = 1;
  let best: P2 | null = null;
  let bestD = Infinity;
  for (let j = 4; j < RES - 4; j += 2) {
    for (let i = 4; i < RES - 4; i += 2) {
      const x = gridX(i);
      const z = gridZ(j);
      const l = levelAt(hm, x, z);
      if (l < top || slopeAt(hm, x, z) > 0.05 || riverDistanceAt(river, x, z) < 4) continue;
      const d = Math.hypot(x - from.x, z - from.z);
      if (d < 30) continue;
      if (l > top || d < bestD) {
        top = l;
        best = { x, z };
        bestD = d;
      }
    }
  }
  return best ? { ...best, level: top } : { x: from.x, z: from.z, level: 1 };
}

/**
 * Town plaza near spawn with six cottages around it, leaving an opening toward spawn.
 * Deterministic for the same inputs.
 */
export function findTown(hm: Heightmap, river: River, ramps: Ramp[], spawn: P2, seed: number): Town {
  const rng = Alea((seed ^ 0x70e7a11) >>> 0);
  const found = findCenter(hm, river, ramps, spawn, rng);
  const c = found?.c ?? { x: spawn.x, z: spawn.z };
  const level = found?.level ?? levelAt(hm, c.x, c.z);
  const entranceYaw = Math.atan2(spawn.x - c.x, spawn.z - c.z);
  const homes: TownHome[] = [];
  // Seven slots around the ring; the one facing spawn stays open as the entrance.
  const slots = 7;
  const nudges: [number, number][] = [[0, 0], [0.12, 0], [-0.12, 0], [0, -1.5], [0.2, -1.5], [-0.2, -1.5], [0, 1.5]];
  for (let k = 1; k < slots && homes.length < TOWN_HOMES; k++) {
    const base = entranceYaw + (k / slots) * Math.PI * 2;
    let placed = false;
    for (const [da, dr] of nudges) {
      const a = base + da;
      const r = HOME_RING + dr;
      const x = c.x + Math.sin(a) * r;
      const z = c.z + Math.cos(a) * r;
      if (!isDryLand(hm, river, x, z) || !flatDisk(hm, river, ramps, x, z, 2.6, levelAt(hm, x, z), 0.2)) continue;
      homes.push({ x, z, yaw: Math.atan2(c.x - x, c.z - z) });
      placed = true;
      break;
    }
    if (!placed) {
      // Fallback: any dry spot on this spoke, walking inward, never water or river.
      for (let r = HOME_RING + 2; r >= 4 && !placed; r -= 1) {
        const x = c.x + Math.sin(base) * r;
        const z = c.z + Math.cos(base) * r;
        if (!isDryLand(hm, river, x, z) || homes.some((h) => Math.hypot(h.x - x, h.z - z) < 4.5)) continue;
        homes.push({ x, z, yaw: Math.atan2(c.x - x, c.z - z) });
        placed = true;
      }
    }
  }
  // Last resort: dry points spiralling out from the center until there are six.
  for (let k = 0; homes.length < TOWN_HOMES && k < 400; k++) {
    const a = k * 2.39996;
    const r = 5 + k * 0.15;
    const x = c.x + Math.sin(a) * r;
    const z = c.z + Math.cos(a) * r;
    if (!isDryLand(hm, river, x, z) || homes.some((h) => Math.hypot(h.x - x, h.z - z) < 4.5)) continue;
    homes.push({ x, z, yaw: Math.atan2(c.x - x, c.z - z) });
  }
  const stones: P2[] = [];
  stoneLine(hm, ramps, c, spawn, PLAZA_RADIUS, stones);
  const nearRamps = ramps
    .map((r) => {
      const end = r.toLevel === level ? { x: r.bx, z: r.bz } : { x: r.ax, z: r.az };
      return { end, d: Math.hypot(end.x - c.x, end.z - c.z) };
    })
    .filter((r) => r.d < 45)
    .sort((a, b) => a.d - b.d)
    .slice(0, 2);
  for (const r of nearRamps) stoneLine(hm, ramps, c, r.end, PLAZA_RADIUS, stones);
  return {
    x: c.x,
    z: c.z,
    radius: TOWN_RADIUS,
    plaza: PLAZA_RADIUS,
    level,
    y: heightAt(hm, c.x, c.z),
    entranceYaw,
    homes,
    stones,
    lookout: findLookout(hm, river, c),
  };
}

/** Compass words for a direction from (fromX, fromZ) to (x, z); north is -z (the map's top). */
export function compass(fromX: number, fromZ: number, x: number, z: number): string {
  const a = Math.atan2(x - fromX, -(z - fromZ));
  const names = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
  const k = Math.round(a / (Math.PI / 4));
  return names[((k % 8) + 8) % 8];
}

/** "In town, north side", "Near town, to the east", or "65 m northwest". */
export function whereWords(town: Pick<Town, "x" | "z" | "radius">, x: number, z: number, from?: P2): string {
  const dt = Math.hypot(x - town.x, z - town.z);
  if (dt < 3) return "In town, by the plaza";
  if (dt <= town.radius + 1) return `In town, ${compass(town.x, town.z, x, z)} side`;
  if (!from) return `Near town, to the ${compass(town.x, town.z, x, z)}`;
  return `${Math.round(Math.hypot(x - from.x, z - from.z))} m ${compass(from.x, from.z, x, z)}`;
}
