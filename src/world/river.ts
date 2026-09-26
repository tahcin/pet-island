import {
  CELL,
  HALF,
  RES,
  RIVER_BED,
  gridX,
  gridZ,
  lerp,
  smoothstep,
  type Heightmap,
  type NoiseKit,
} from "./heightmap";

export const RIVER_WIDTH = 2.5;
/** Distance from the centerline inside which nothing may be placed (water plus banks). */
export const RIVER_CLEARANCE = RIVER_WIDTH / 2 + 1.6;

export interface River {
  /** Polyline from the source on level 3 to past the coast, as [x, z] pairs. */
  points: [number, number][];
  /** Per-vertex distance to the polyline, capped at 10 m. */
  distance: Float32Array;
}

/** Distance from p to segment ab. */
export function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz;
  let t = len2 > 0 ? ((px - ax) * vx + (pz - az) * vz) / len2 : 0;
  t = Math.min(1, Math.max(0, t));
  const dx = px - (ax + vx * t);
  const dz = pz - (az + vz * t);
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * One river from a seeded point on the top level to the sea (PRD 7.2 step 6): a
 * noise-perturbed walk that bends outward, carved as a smoothstep trench to just below
 * sea level. Mutates hm.heights.
 */
export function carveRiver(hm: Heightmap, kit: NoiseKit): River {
  const { elevation, thresholds } = hm;
  // Source: a seeded pick among the top-level vertices, biased toward the island interior.
  const candidates: number[] = [];
  for (let k = 0; k < elevation.length; k++) if (elevation[k] > thresholds.l3 + 0.02) candidates.push(k);
  let start = candidates.length
    ? candidates[Math.floor(kit.rng() * candidates.length)]
    : elevation.indexOf(Math.max(...elevation));
  let sx = gridX(start % RES);
  let sz = gridZ(Math.floor(start / RES));
  if (Math.hypot(sx, sz) > 40) {
    // Keep the source inland so the river has a real run to the sea.
    sx *= 0.5;
    sz *= 0.5;
    start = -1;
  }

  const points: [number, number][] = [[sx, sz]];
  let angle = Math.hypot(sx, sz) > 3 ? Math.atan2(sz, sx) : kit.rng() * Math.PI * 2;
  const wobbleSeed = kit.rng() * 100;
  let x = sx;
  let z = sz;
  let pastCoast = 0;
  for (let step = 0; step < 220 && pastCoast < 8; step++) {
    const outward = Math.atan2(z, x);
    let diff = outward - angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    angle += diff * 0.06 + kit.noise2D(step * 0.07, wobbleSeed) * 0.22;
    x += Math.cos(angle) * 1.0;
    z += Math.sin(angle) * 1.0;
    if (Math.abs(x) > HALF - 1 || Math.abs(z) > HALF - 1) break;
    points.push([x, z]);
    const i = Math.round((x + HALF) / CELL);
    const j = Math.round((z + HALF) / CELL);
    if (elevation[j * RES + i] < thresholds.sea - 0.01) pastCoast++;
  }

  const distance = new Float32Array(RES * RES).fill(10);
  const reach = 10;
  for (let s = 0; s < points.length - 1; s++) {
    const [ax, az] = points[s];
    const [bx, bz] = points[s + 1];
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach + HALF) / CELL));
    const i1 = Math.min(RES - 1, Math.ceil((Math.max(ax, bx) + reach + HALF) / CELL));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - reach + HALF) / CELL));
    const j1 = Math.min(RES - 1, Math.ceil((Math.max(az, bz) + reach + HALF) / CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * RES + i;
        const d = distToSegment(gridX(i), gridZ(j), ax, az, bx, bz);
        if (d < distance[k]) distance[k] = d;
      }
    }
  }

  const half = RIVER_WIDTH / 2;
  for (let k = 0; k < distance.length; k++) {
    const d = distance[k];
    if (d >= half + 1.0) continue;
    const w = 1 - smoothstep(half * 0.6, half + 1.0, d);
    const carved = lerp(hm.heights[k], RIVER_BED, w);
    if (carved < hm.heights[k]) hm.heights[k] = carved;
  }
  return { points, distance };
}

/** Bilinear distance to the river centerline in meters (capped at 10). */
export function riverDistanceAt(river: River, x: number, z: number): number {
  const fx = (x + HALF) / CELL;
  const fz = (z + HALF) / CELL;
  if (fx < 0 || fz < 0 || fx > RES - 1 || fz > RES - 1) return 10;
  const i = Math.min(RES - 2, Math.floor(fx));
  const j = Math.min(RES - 2, Math.floor(fz));
  const tx = fx - i;
  const tz = fz - j;
  const d = river.distance;
  const k = j * RES + i;
  return lerp(lerp(d[k], d[k + 1], tx), lerp(d[k + RES], d[k + RES + 1], tx), tz);
}

export function isRiver(river: River, x: number, z: number): boolean {
  return riverDistanceAt(river, x, z) < RIVER_CLEARANCE;
}
