import Alea from "alea";
import PoissonDiskSampling from "poisson-disk-sampling";
import { HALF, RES, gridX, gridZ, isWater, levelAt, slopeAt, type Heightmap, heightAt } from "./heightmap";
import { RIVER_CLEARANCE, riverDistanceAt, type River } from "./river";
import { isOnRamp, type Ramp } from "./ramps";

/** Pure prop and home placement (PRD 7.2 steps 9 and 10). No three.js, no React. */

export type PropType = "tree" | "pine" | "fruitTree" | "palm" | "bush" | "rock" | "flower" | "mushroom";

export interface PropInstance {
  type: PropType;
  /** Color or shape variant index within the type. */
  variant: number;
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
  /** Collision radius in meters (0 for walk-through props). */
  radius: number;
}

export interface Point2 {
  x: number;
  z: number;
}

export const HOME_COUNT = 3;
export const HOME_MIN_SPACING = 20;
export const HOME_CLEARANCE = 8;
export const PROP_HOME_CLEARANCE = 6;
export const PROP_SPAWN_CLEARANCE = 4;
/** Tall props keep a wider clearing around spawn so the opening shot is not blocked. */
export const TALL_SPAWN_CLEARANCE = 8;
export const PROP_MAX_SLOPE = 0.35;
export const FLOWER_COLORS = 5;

/** Solid props the player bumps into. */
export const SOLID_TYPES: ReadonlySet<PropType> = new Set<PropType>(["tree", "pine", "fruitTree", "palm", "rock"]);

/** True when a disk of radius r around (x, z) is all dry, on one level, flat, and clear of the river and ramps. */
function flatPad(hm: Heightmap, river: River, ramps: Ramp[], x: number, z: number, r: number, level: number): boolean {
  if (riverDistanceAt(river, x, z) < HOME_CLEARANCE) return false;
  const h0 = heightAt(hm, x, z);
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2;
    for (const rr of [r * 0.5, r]) {
      const px = x + Math.cos(ang) * rr;
      const pz = z + Math.sin(ang) * rr;
      if (isWater(hm, px, pz) || levelAt(hm, px, pz) !== level) return false;
      if (Math.abs(heightAt(hm, px, pz) - h0) > 0.08) return false;
      if (isOnRamp(ramps, px, pz)) return false;
    }
  }
  return true;
}

/**
 * Three villager home spots on level 1: flat, dry, at least 20 m apart, and at least 8 m from
 * water, the river, and spawn. Seeded order so the same seed gives the same homes.
 */
export function findHomes(hm: Heightmap, river: River, ramps: Ramp[], spawn: Point2, seed: number): Point2[] {
  const rng = Alea((seed ^ 0x51f15e) >>> 0);
  const cands: Point2[] = [];
  for (let j = 4; j < RES - 4; j += 4) {
    for (let i = 4; i < RES - 4; i += 4) {
      const x = gridX(i);
      const z = gridZ(j);
      if (levelAt(hm, x, z) !== 1) continue;
      if (Math.hypot(x - spawn.x, z - spawn.z) < HOME_CLEARANCE + 4) continue;
      if (slopeAt(hm, x, z) > 0.05) continue;
      cands.push({ x, z });
    }
  }
  // Seeded shuffle, then prefer spots nearer the island center so villagers are easy to find.
  const keyed = cands.map((c) => ({ c, k: rng() * 30 + Math.hypot(c.x, c.z) * 0.4 }));
  keyed.sort((a, b) => a.k - b.k);
  const out: Point2[] = [];
  for (const radius of [HOME_CLEARANCE, 6, 4]) {
    for (const { c } of keyed) {
      if (out.length >= HOME_COUNT) break;
      if (out.some((q) => Math.hypot(q.x - c.x, q.z - c.z) < HOME_MIN_SPACING)) continue;
      if (!flatPad(hm, river, ramps, c.x, c.z, radius, 1)) continue;
      out.push(c);
    }
    if (out.length >= HOME_COUNT) break;
  }
  return out;
}

export interface PlacementInput {
  seed: number;
  heightmap: Heightmap;
  river: River;
  ramps: Ramp[];
  spawn: Point2;
  homes: Point2[];
}

/** Poisson-disk props over the island, filtered by level, slope, water, river, ramps, homes, spawn. */
export function placeProps(input: PlacementInput): PropInstance[] {
  const { heightmap: hm, river, ramps, spawn, homes } = input;
  const rng = Alea((input.seed ^ 0x2c9277b5) >>> 0);
  const size = HALF * 2 - 8;
  const pds = new PoissonDiskSampling({ shape: [size, size], minDistance: 2.5, maxDistance: 4, tries: 10 }, rng);
  const pts = pds.fill();
  const out: PropInstance[] = [];
  for (const p of pts) {
    const x = p[0] - size / 2;
    const z = p[1] - size / 2;
    if (isWater(hm, x, z)) continue;
    const level = levelAt(hm, x, z);
    if (level < 0) continue;
    if (slopeAt(hm, x, z) > PROP_MAX_SLOPE) continue;
    if (riverDistanceAt(river, x, z) < RIVER_CLEARANCE + 0.8) continue;
    if (isOnRamp(ramps, x, z)) continue;
    if (Math.hypot(x - spawn.x, z - spawn.z) < PROP_SPAWN_CLEARANCE) continue;
    if (homes.some((h) => Math.hypot(h.x - x, h.z - z) < PROP_HOME_CLEARANCE)) continue;
    const roll = rng();
    const rotY = rng() * Math.PI * 2;
    const jitter = 0.85 + rng() * 0.3;
    const variantRoll = rng();
    let type: PropType | null = null;
    if (level === 0) {
      // Beach: sparse palms and rocks, plenty of open sand.
      if (isWater(hm, x + 2, z) || isWater(hm, x - 2, z) || isWater(hm, x, z + 2) || isWater(hm, x, z - 2)) continue;
      if (roll < 0.07) type = "palm";
      else if (roll < 0.11) type = "rock";
      else continue;
    } else {
      // Grass: clearings keep paths open; trees denser on higher terraces.
      const treeP = level === 1 ? 0.15 : level === 2 ? 0.22 : 0.26;
      if (roll < treeP) type = level >= 3 && variantRoll < 0.55 ? "pine" : variantRoll < 0.22 ? "fruitTree" : variantRoll < 0.35 ? "pine" : "tree";
      else if (roll < treeP + 0.12) type = "bush";
      else if (roll < treeP + 0.3) type = "flower";
      else if (roll < treeP + 0.35) type = "rock";
      else if (roll < treeP + 0.39) type = "mushroom";
      else continue;
    }
    const tall = type === "tree" || type === "fruitTree" || type === "pine" || type === "palm";
    if (tall && Math.hypot(x - spawn.x, z - spawn.z) < TALL_SPAWN_CLEARANCE) continue;
    const y = heightAt(hm, x, z);
    let variant = 0;
    let scale = jitter;
    let radius = 0;
    switch (type) {
      case "tree":
      case "fruitTree":
        variant = Math.floor(variantRoll * 3) % 3;
        radius = 0.55 * scale;
        break;
      case "pine":
        variant = Math.floor(variantRoll * 2) % 2;
        radius = 0.5 * scale;
        break;
      case "palm":
        radius = 0.35 * scale;
        break;
      case "rock":
        scale = 0.6 + (variantRoll % 0.5) * 1.2;
        radius = 0.6 * scale;
        break;
      case "bush":
        variant = Math.floor(variantRoll * 3) % 3;
        break;
      case "flower":
        variant = Math.floor(variantRoll * FLOWER_COLORS) % FLOWER_COLORS;
        scale = 0.8 + (roll % 0.1) * 4;
        break;
      case "mushroom":
        scale = 0.7 + variantRoll * 0.5;
        break;
    }
    out.push({ type, variant, x, y, z, rotY, scale, radius });
  }
  return out;
}

/** Up to `max` sniff spots from flowers, bushes, and trees, seeded and spread out. */
export function propInterest(props: PropInstance[], max: number): Point2[] {
  const out: Point2[] = [];
  const step = Math.max(1, Math.floor(props.length / (max * 2)));
  for (let k = 0; k < props.length && out.length < max; k += step) {
    const p = props[k];
    if (p.type !== "flower" && p.type !== "bush" && p.type !== "tree" && p.type !== "fruitTree") continue;
    const off = p.radius > 0 ? p.radius + 0.6 : 0.4;
    out.push({ x: p.x + Math.sin(p.rotY) * off, z: p.z + Math.cos(p.rotY) * off });
  }
  return out;
}
