import {
  RES,
  buildHeightmap,
  createNoiseKit,
  gridX,
  gridZ,
  heightAt,
  isWater,
  levelAt,
  slopeAt,
  type Heightmap,
} from "./heightmap";
import { carveRiver, riverDistanceAt, type River } from "./river";
import { buildRamps, type Ramp } from "./ramps";
import { placeProps, propInterest, type PropInstance } from "./placement";
import { findTown, type Town } from "./town";

export type { PropInstance, PropType } from "./placement";
export type { Town, TownHome } from "./town";

export interface Spawn {
  x: number;
  z: number;
  /** Facing angle; forward is (sin(yaw), cos(yaw)). */
  yaw: number;
}

export interface WorldData {
  seed: number;
  heightmap: Heightmap;
  river: River;
  ramps: Ramp[];
  spawn: Spawn;
  petSpawn: Spawn;
  /** Seeded spots the pet likes to sniff (props add more in M4). */
  interest: { x: number; z: number }[];
  /** Six cottages around the town plaza: 0 to 2 for the reading villagers, 3 to 5 for townsfolk. */
  homes: { x: number; z: number; yaw?: number }[];
  /** The town plaza near spawn (homes ring it). */
  town: Town;
  /** Placed scenery (PRD 7.2 step 9), rendered instanced by Props.tsx. */
  props: PropInstance[];
}

/** Seeded dry, flat, non-river points for the pet to sniff at. */
function findInterest(hm: Heightmap, river: River, rng: () => number, count: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let tries = 0; tries < count * 40 && out.length < count; tries++) {
    const x = (rng() * 2 - 1) * 70;
    const z = (rng() * 2 - 1) * 70;
    if (isWater(hm, x, z) || slopeAt(hm, x, z) > 0.3 || riverDistanceAt(river, x, z) < 4) continue;
    if (out.some((q) => Math.hypot(q.x - x, q.z - z) < 5)) continue;
    out.push({ x, z });
  }
  return out;
}

/** Flattest dry beach point nearest the island center (PRD 7.2 step 11). */
function findSpawn(hm: Heightmap, river: River): Spawn {
  let best: Spawn | null = null;
  let bestScore = Infinity;
  for (let j = 2; j < RES - 2; j += 1) {
    for (let i = 2; i < RES - 2; i += 1) {
      const x = gridX(i);
      const z = gridZ(j);
      if (levelAt(hm, x, z) !== 0) continue;
      if (riverDistanceAt(river, x, z) < 8) continue;
      const slope = slopeAt(hm, x, z);
      if (slope > 0.2) continue;
      let dry = true;
      for (let a = 0; a < 8 && dry; a++) {
        const ang = (a / 8) * Math.PI * 2;
        if (isWater(hm, x + Math.cos(ang) * 3, z + Math.sin(ang) * 3)) dry = false;
      }
      if (!dry) continue;
      const score = Math.hypot(x, z) + slope * 40;
      if (score < bestScore) {
        bestScore = score;
        best = { x, z, yaw: Math.atan2(-x, -z) };
      }
    }
  }
  return best ?? { x: 0, z: 0, yaw: 0 };
}

/** Seed to world data. Pure and deterministic; no React, no three.js. */
export function generateWorld(seed: number): WorldData {
  const kit = createNoiseKit(seed);
  const heightmap = buildHeightmap(kit);
  const river = carveRiver(heightmap, kit);
  const ramps = buildRamps(heightmap, river, kit);
  const spawn = findSpawn(heightmap, river);
  let petSpawn: Spawn = {
    x: spawn.x - Math.sin(spawn.yaw) * 2,
    z: spawn.z - Math.cos(spawn.yaw) * 2,
    yaw: spawn.yaw,
  };
  if (isWater(heightmap, petSpawn.x, petSpawn.z)) {
    petSpawn = { x: spawn.x + Math.cos(spawn.yaw) * 1.5, z: spawn.z - Math.sin(spawn.yaw) * 1.5, yaw: spawn.yaw };
  }
  const interest = findInterest(heightmap, river, kit.rng, 90);
  const town = findTown(heightmap, river, ramps, spawn, seed);
  const homes = town.homes;
  const props = placeProps({ seed, heightmap, river, ramps, spawn, homes, town });
  interest.push(...propInterest(props, 60));
  return { seed, heightmap, river, ramps, spawn, petSpawn, interest, homes, props, town };
}

export const MAX_WALK_SLOPE = 1.0;
/** Rise over run above which a character is scrambling up or down a cliff and moves slower. */
export const SCRAMBLE_SLOPE = 0.9;

/**
 * Movement rule. The whole island is walkable: characters scramble up and down cliff faces
 * (stepBody slows them on steep ground) and only water and the river block. A short probe
 * ahead keeps fast movers from stepping into the water in one frame. Ramps stay as the
 * easy way up.
 */
export function canWalk(world: WorldData, fromX: number, fromZ: number, toX: number, toZ: number): boolean {
  const hm = world.heightmap;
  if (isWater(hm, toX, toZ)) return false;
  const dist = Math.hypot(toX - fromX, toZ - fromZ);
  if (dist > 1e-6) {
    const ax = toX + ((toX - fromX) / dist) * 0.3;
    const az = toZ + ((toZ - fromZ) / dist) * 0.3;
    if (isWater(hm, ax, az)) return false;
  }
  return true;
}

export { heightAt, levelAt, isWater, slopeAt };
