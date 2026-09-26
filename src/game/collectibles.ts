import type { CollectibleRuntime } from "./runtime";
import type { Species } from "../schema/petReading";
import type { ItemKind } from "../store";
import { isWater, levelAt, slopeAt, type WorldData } from "../world/generateWorld";
import { riverDistanceAt } from "../world/river";

/** Species-matched item (PRD 9.4): dog bones, cat yarn, rabbit and small rodent carrots. */
export function speciesItem(species: Species): ItemKind {
  if (species === "dog") return "bone";
  if (species === "cat") return "yarn";
  return "carrot";
}

export const ITEM_LABEL: Record<ItemKind, { one: string; many: string }> = {
  bone: { one: "bone", many: "bones" },
  yarn: { one: "yarn ball", many: "yarn balls" },
  carrot: { one: "carrot", many: "carrots" },
  shell: { one: "shell", many: "shells" },
};

export function itemName(kind: ItemKind, count = 1): string {
  return count === 1 ? ITEM_LABEL[kind].one : ITEM_LABEL[kind].many;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** True when an item may sit at (x, z): dry, not the river, not a cliff face. */
export function isGoodSpot(world: WorldData, x: number, z: number): boolean {
  const hm = world.heightmap;
  if (isWater(hm, x, z)) return false;
  if (riverDistanceAt(world.river, x, z) < 3) return false;
  if (slopeAt(hm, x, z) > 0.25) return false;
  // Keep clear of cliff edges and shorelines.
  for (let a = 0; a < 6; a++) {
    const ang = (a / 6) * Math.PI * 2;
    const px = x + Math.cos(ang) * 1.2;
    const pz = z + Math.sin(ang) * 1.2;
    if (isWater(hm, px, pz) || slopeAt(hm, px, pz) > 0.5) return false;
  }
  return true;
}

/**
 * Seeded collectibles for an island (PRD F11): 12 to 20 total, species items on grass levels
 * and shells on the beach. Pure and deterministic; ids are stable per seed.
 */
export function placeCollectibles(world: WorldData, species: Species): CollectibleRuntime[] {
  const rng = mulberry32((world.seed ^ 0x5eed1e55) >>> 0);
  const total = 12 + Math.floor(rng() * 9);
  const shells = Math.max(5, Math.round(total * 0.45));
  const items = total - shells;
  const kind = speciesItem(species);
  const out: CollectibleRuntime[] = [];
  const spawn = world.spawn;
  const place = (k: ItemKind, want: number, beach: boolean) => {
    let n = 0;
    for (let tries = 0; tries < 4000 && n < want; tries++) {
      const x = (rng() * 2 - 1) * 72;
      const z = (rng() * 2 - 1) * 72;
      const level = levelAt(world.heightmap, x, z);
      if (beach ? level !== 0 : level < 1) continue;
      if (!isGoodSpot(world, x, z)) continue;
      if (Math.hypot(x - spawn.x, z - spawn.z) < 3) continue;
      if (out.some((c) => Math.hypot(c.x - x, c.z - z) < 6)) continue;
      out.push({ id: `${k}-${world.seed}-${n}`, kind: k, x, z, taken: false });
      n++;
    }
    return n;
  };
  const gotShells = place("shell", shells, true);
  // If the beach is thin, move the missing shells to species items so the total holds.
  place(kind, items + (shells - gotShells), false);
  return out;
}
