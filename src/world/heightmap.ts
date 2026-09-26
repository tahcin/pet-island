import Alea from "alea";
import { createNoise2D, type NoiseFunction2D } from "simplex-noise";

/** World constants from PRD section 7.1. */
export const WORLD_SIZE = 160;
export const HALF = WORLD_SIZE / 2;
export const RES = 200;
export const CELL = WORLD_SIZE / (RES - 1);
/** Grass terrace heights in meters for levels 1, 2, 3. The beach sits in [0, 0.6). */
export const LEVEL_HEIGHTS = [0.6, 3.0, 5.4] as const;
export const SEA_FLOOR = -2.5;
export const RIVER_BED = -0.45;
/** Band half-width in noise space for the vertical cliff between levels. */
const CLIFF_W = 0.008;
/** Band fractions of the square that are water, beach, level 1, level 2 (level 3 is the rest). */
const FRACTIONS = { water: 0.47, beach: 0.12, l1: 0.2, l2: 0.125 };

export interface Heightmap {
  res: number;
  size: number;
  /** Height in meters per vertex, row-major with index = j * res + i (i along x, j along z). */
  heights: Float32Array;
  /** Raw elevation in noise space per vertex, before terracing. */
  elevation: Float32Array;
  thresholds: { sea: number; beach: number; l2: number; l3: number };
}

export interface NoiseKit {
  rng: () => number;
  noise2D: NoiseFunction2D;
}

export function createNoiseKit(seed: number): NoiseKit {
  const rng = Alea(seed >>> 0);
  const noise2D = createNoise2D(rng);
  return { rng, noise2D };
}

export function gridX(i: number): number {
  return -HALF + i * CELL;
}
export function gridZ(j: number): number {
  return -HALF + j * CELL;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function quantile(values: Float32Array, q: number): number {
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/**
 * Seeded fBm elevation with a jittered radial island mask (PRD 7.2 steps 2 and 3).
 * Returns elevation in noise space; thresholds are quantiles so every seed has the
 * same proportions of water, beach, and terraces.
 */
export function buildElevation(kit: NoiseKit): Pick<Heightmap, "elevation" | "thresholds"> {
  const { noise2D } = kit;
  const elevation = new Float32Array(RES * RES);
  const f = 1 / 42;
  const ox = kit.rng() * 1000;
  const oz = kit.rng() * 1000;
  for (let j = 0; j < RES; j++) {
    for (let i = 0; i < RES; i++) {
      const x = gridX(i);
      const z = gridZ(j);
      const nx = x * f + ox;
      const nz = z * f + oz;
      const n =
        (noise2D(nx, nz) + 0.5 * noise2D(2 * nx, 2 * nz) + 0.25 * noise2D(4 * nx, 4 * nz)) / 1.75;
      let e = n * 0.5 + 0.5;
      const a = Math.atan2(z, x);
      const jitter = 0.11 * noise2D(Math.cos(a) * 1.4 + 300, Math.sin(a) * 1.4 + 300);
      const d = Math.sqrt(x * x + z * z) / 74 + jitter;
      e = lerp(e, 1 - d, 0.6);
      // Guarantee open sea along the square edge so the heightmap border never shows.
      e -= 0.6 * smoothstep(0.8, 0.97, Math.max(Math.abs(x), Math.abs(z)) / HALF);
      elevation[j * RES + i] = e;
    }
  }
  const sea = quantile(elevation, FRACTIONS.water);
  const beach = quantile(elevation, FRACTIONS.water + FRACTIONS.beach);
  const l2 = quantile(elevation, FRACTIONS.water + FRACTIONS.beach + FRACTIONS.l1);
  const l3 = quantile(elevation, FRACTIONS.water + FRACTIONS.beach + FRACTIONS.l1 + FRACTIONS.l2);
  return { elevation, thresholds: { sea, beach, l2, l3 } };
}

/** Maps elevation to terraced meters: shelf, sloped beach with a lip, three flat levels. */
export function terraceHeight(e: number, t: Heightmap["thresholds"]): number {
  if (e < t.sea) return SEA_FLOOR * smoothstep(0, 0.09, t.sea - e);
  const u = Math.min(1, (e - t.sea) / (t.beach - t.sea));
  let h = 0.35 * u + (LEVEL_HEIGHTS[0] - 0.35) * smoothstep(t.beach - CLIFF_W, t.beach + CLIFF_W, e);
  h += (LEVEL_HEIGHTS[1] - LEVEL_HEIGHTS[0]) * smoothstep(t.l2 - CLIFF_W, t.l2 + CLIFF_W, e);
  h += (LEVEL_HEIGHTS[2] - LEVEL_HEIGHTS[1]) * smoothstep(t.l3 - CLIFF_W, t.l3 + CLIFF_W, e);
  return h;
}

export function buildHeightmap(kit: NoiseKit): Heightmap {
  const { elevation, thresholds } = buildElevation(kit);
  const heights = new Float32Array(RES * RES);
  for (let k = 0; k < heights.length; k++) heights[k] = terraceHeight(elevation[k], thresholds);
  return { res: RES, size: WORLD_SIZE, heights, elevation, thresholds };
}

/** Bilinear height in meters. Outside the grid returns the sea floor. */
export function heightAt(hm: Heightmap, x: number, z: number): number {
  const fx = (x + HALF) / CELL;
  const fz = (z + HALF) / CELL;
  if (fx < 0 || fz < 0 || fx > RES - 1 || fz > RES - 1) return SEA_FLOOR;
  const i = Math.min(RES - 2, Math.floor(fx));
  const j = Math.min(RES - 2, Math.floor(fz));
  const tx = fx - i;
  const tz = fz - j;
  const h = hm.heights;
  const k = j * RES + i;
  const a = lerp(h[k], h[k + 1], tx);
  const b = lerp(h[k + RES], h[k + RES + 1], tx);
  return lerp(a, b, tz);
}

/** Terrace index from height: -1 water, 0 beach, 1 to 3 grass levels. */
export function levelOfHeight(h: number): number {
  if (h < 0.02) return -1;
  if (h < 0.5) return 0;
  if (h < (LEVEL_HEIGHTS[0] + LEVEL_HEIGHTS[1]) / 2) return 1;
  if (h < (LEVEL_HEIGHTS[1] + LEVEL_HEIGHTS[2]) / 2) return 2;
  return 3;
}

export function levelAt(hm: Heightmap, x: number, z: number): number {
  return levelOfHeight(heightAt(hm, x, z));
}

/** Sea or river water: anything below the waterline. */
export function isWater(hm: Heightmap, x: number, z: number): boolean {
  return heightAt(hm, x, z) < 0.06;
}

/** Gradient magnitude (rise over run) from central differences at 0.5 m. */
export function slopeAt(hm: Heightmap, x: number, z: number): number {
  const s = 0.5;
  const dx = (heightAt(hm, x + s, z) - heightAt(hm, x - s, z)) / (2 * s);
  const dz = (heightAt(hm, x, z + s) - heightAt(hm, x, z - s)) / (2 * s);
  return Math.sqrt(dx * dx + dz * dz);
}

/** Snaps a height to the nearest terrace (or the beach lip) so building pads sit on a level. */
export function snapToTerrace(h: number): number {
  const levels = [0.35, ...LEVEL_HEIGHTS];
  let best = h;
  let bestD = 1.3;
  for (const l of levels) {
    const d = Math.abs(h - l);
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  }
  return best;
}

/**
 * Terraforms a flat round pad (radius r) at height `target`, blending back to the original
 * terrain over `blend` meters, like leveling ground before building. Mutates hm.heights.
 */
export function flattenPad(hm: Heightmap, x: number, z: number, r: number, blend: number, target: number): void {
  const reach = r + blend;
  const i0 = Math.max(0, Math.floor((x - reach + HALF) / CELL));
  const i1 = Math.min(RES - 1, Math.ceil((x + reach + HALF) / CELL));
  const j0 = Math.max(0, Math.floor((z - reach + HALF) / CELL));
  const j1 = Math.min(RES - 1, Math.ceil((z + reach + HALF) / CELL));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(gridX(i) - x, gridZ(j) - z);
      if (d >= reach) continue;
      const w = 1 - smoothstep(r, reach, d);
      const k = j * RES + i;
      hm.heights[k] = lerp(hm.heights[k], target, w);
    }
  }
}
