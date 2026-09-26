import * as THREE from "three";
import { CELL, LEVEL_HEIGHTS, RES, gridX, gridZ, heightAt, levelOfHeight, type Heightmap } from "./heightmap";

export const TERRAIN_COLORS = {
  sand: "#f4e2b8",
  wetSand: "#e9cf9a",
  seabed: "#d9c690",
  grass1: "#8fd17a",
  grass2: "#7cc46a",
  grass3: "#6bb85f",
  cliff: "#c9b58f",
  cliffDark: "#b9a37c",
};

const palette = {
  sand: new THREE.Color(TERRAIN_COLORS.sand),
  sandLight: new THREE.Color("#f8ebc9"),
  wet: new THREE.Color(TERRAIN_COLORS.wetSand),
  damp: new THREE.Color("#e0c58f"),
  seabed: new THREE.Color(TERRAIN_COLORS.seabed),
  g1: new THREE.Color(TERRAIN_COLORS.grass1),
  g2: new THREE.Color(TERRAIN_COLORS.grass2),
  g3: new THREE.Color(TERRAIN_COLORS.grass3),
  grassLight: new THREE.Color("#b4e39a"),
  grassDark: new THREE.Color("#5fae5a"),
  cliff: new THREE.Color(TERRAIN_COLORS.cliff),
  cliffDark: new THREE.Color(TERRAIN_COLORS.cliffDark),
  cliffLight: new THREE.Color("#d8c7a2"),
};

function hash2(i: number, j: number): number {
  const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Smooth deterministic value noise in [0, 1]. Render-only, independent of the world seed. */
export function patchNoise(x: number, z: number): number {
  const i = Math.floor(x);
  const j = Math.floor(z);
  const fx = x - i;
  const fz = z - j;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash2(i, j);
  const b = hash2(i + 1, j);
  const c = hash2(i, j + 1);
  const d = hash2(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Largest height rise (positive) and drop (positive) within radius r around (x, z). */
function reliefAround(hm: Heightmap, x: number, z: number, h: number, r: number): { rise: number; drop: number } {
  let rise = 0;
  let drop = 0;
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    const hn = heightAt(hm, x + Math.cos(ang) * r, z + Math.sin(ang) * r);
    rise = Math.max(rise, hn - h);
    drop = Math.max(drop, h - hn);
  }
  return { rise, drop };
}

/**
 * Ground color for flat faces: soft light and dark patches on the grass levels, a light lip
 * along every cliff top, faint occlusion at cliff bases, and ripples plus damp sand on beaches.
 */
function groundColorAt(hm: Heightmap, x: number, z: number, h: number, out: THREE.Color): void {
  const level = levelOfHeight(h);
  const n = patchNoise(x * 0.09, z * 0.09) * 0.65 + patchNoise(x * 0.31 + 17, z * 0.31 - 9) * 0.35;
  const { rise, drop } = reliefAround(hm, x, z, h, CELL * 1.3);
  if (level <= 0) {
    out.copy(palette.sand);
    const ripple = Math.sin(x * 1.1 + z * 0.35 + patchNoise(x * 0.2, z * 0.2) * 6);
    if (ripple > 0.6) out.lerp(palette.sandLight, 0.3);
    else if (ripple < -0.75) out.lerp(palette.wet, 0.12);
    // Darker damp band just above the waterline.
    const damp = 1 - Math.min(1, Math.max(0, (h - 0.12) / 0.22));
    if (damp > 0) out.lerp(palette.damp, damp * 0.7);
  } else {
    out.copy(level === 1 ? palette.g1 : level === 2 ? palette.g2 : palette.g3);
    if (n > 0.6) out.lerp(palette.grassLight, Math.min(1, (n - 0.6) * 2.2) * 0.45);
    else if (n < 0.38) out.lerp(palette.grassDark, Math.min(1, (0.38 - n) * 2.5) * 0.35);
    // Lighter grass lip along cliff tops.
    if (drop > 1) out.lerp(palette.grassLight, 0.55);
  }
  // Faint ambient occlusion at the foot of a cliff.
  if (rise > 1) out.multiplyScalar(0.88);
  else if (rise > 0.5) out.multiplyScalar(0.94);
}

/** Heights where the terrain steps: beach lip, level 1 to 2, level 2 to 3, and the waterline. */
const ISO_LEVELS = [0.06, 0.475, (LEVEL_HEIGHTS[0] + LEVEL_HEIGHTS[1]) / 2, (LEVEL_HEIGHTS[1] + LEVEL_HEIGHTS[2]) / 2];
const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
];

/**
 * Render-only smoothing of the grid staircase. Every vertex next to a height step slides
 * (horizontally, most of the way) onto the nearest iso-line crossing on its edges, so cliff
 * walls, cliff tops, and the sand line follow smooth contours instead of sawtooth triangles.
 * Heights are unchanged, so gameplay (heightAt) and the render agree to within a cell.
 */
function snapToContours(hm: Heightmap, positions: Float32Array): void {
  const h = hm.heights;
  const moved = new Float32Array(RES * RES * 2);
  for (let j = 1; j < RES - 1; j++) {
    for (let i = 1; i < RES - 1; i++) {
      const k = j * RES + i;
      const hv = h[k];
      let best = Infinity;
      let bx = 0;
      let bz = 0;
      for (const c of ISO_LEVELS) {
        for (const [di, dj] of NEIGHBORS) {
          const hn = h[(j + dj) * RES + i + di];
          if ((hv - c) * (hn - c) >= 0) continue;
          const t = (c - hv) / (hn - hv);
          const dist = t * Math.hypot(di, dj);
          if (dist < best) {
            best = dist;
            bx = di * t;
            bz = dj * t;
          }
        }
      }
      if (best < Infinity) {
        moved[k * 2] = bx * CELL * 0.8;
        moved[k * 2 + 1] = bz * CELL * 0.8;
      }
    }
  }
  for (let k = 0; k < RES * RES; k++) {
    positions[k * 3] += moved[k * 2];
    positions[k * 3 + 2] += moved[k * 2 + 1];
  }
}

/**
 * Vertices partway up a cliff make spiky wall triangles. For rendering, snap them to the
 * nearer terrace so every wall is a clean top edge and bottom edge. Ramps and river banks
 * (where keep(k) is true) keep their real heights.
 */
function quantizeCliffs(hm: Heightmap, keep?: (k: number) => boolean): Float32Array {
  const out = Float32Array.from(hm.heights);
  const [l1, l2, l3] = LEVEL_HEIGHTS;
  for (let k = 0; k < out.length; k++) {
    const h = out[k];
    if (keep?.(k)) continue;
    if (h > l1 + 0.02 && h < l2 - 0.02) out[k] = h < (l1 + l2) / 2 ? l1 : l2;
    else if (h > l2 + 0.02 && h < l3 - 0.02) out[k] = h < (l2 + l3) / 2 ? l2 : l3;
  }
  return out;
}

/**
 * Flat-shaded, vertex-colored terrain mesh from the heightmap (PRD 7.2 step 7). Each triangle
 * gets one color from its average height and steepness, so levels read as crisp blocks.
 */
export function buildTerrainGeometry(hm: Heightmap, keep?: (k: number) => boolean): THREE.BufferGeometry {
  const positions = new Float32Array(RES * RES * 3);
  const renderHeights = quantizeCliffs(hm, keep);
  for (let j = 0; j < RES; j++) {
    for (let i = 0; i < RES; i++) {
      const k = j * RES + i;
      positions[k * 3] = gridX(i);
      positions[k * 3 + 1] = renderHeights[k];
      positions[k * 3 + 2] = gridZ(j);
    }
  }
  snapToContours(hm, positions);
  const indices: number[] = [];
  for (let j = 0; j < RES - 1; j++) {
    for (let i = 0; i < RES - 1; i++) {
      const a = j * RES + i;
      const b = a + 1;
      const c = a + RES;
      const d = c + 1;
      // Alternate the diagonal so slopes do not show a directional grain.
      if ((i + j) % 2 === 0) indices.push(a, c, b, b, c, d);
      else indices.push(a, c, d, a, d, b);
    }
  }
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  indexed.setIndex(indices);
  const geo = indexed.toNonIndexed();
  indexed.dispose();
  geo.computeVertexNormals();

  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const nor = geo.getAttribute("normal") as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let f = 0; f < pos.count; f += 3) {
    const hAvg = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
    const hMax = Math.max(pos.getY(f), pos.getY(f + 1), pos.getY(f + 2));
    const ny = nor.getY(f);
    const cx = (pos.getX(f) + pos.getX(f + 1) + pos.getX(f + 2)) / 3;
    const cz = (pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2)) / 3;
    if (ny < 0.62 && hMax > 0.7) {
      // Cliff faces: soft horizontal strata, darker toward the base for a hint of occlusion.
      const baseLevel = hAvg < LEVEL_HEIGHTS[1] ? LEVEL_HEIGHTS[0] : LEVEL_HEIGHTS[1];
      const up = hAvg - baseLevel;
      const band = Math.floor(up / 0.6 + patchNoise(cx * 2.5, cz * 2.5) * 0.5) % 2;
      tmp.copy(up < 0.7 ? palette.cliffDark : palette.cliff);
      if (band === 1) tmp.lerp(palette.cliffLight, 0.5);
      if (up < 0.35) tmp.multiplyScalar(0.94);
    } else if (hAvg < -0.05) tmp.copy(palette.seabed);
    else if (hAvg < 0.12) tmp.copy(palette.wet);
    else groundColorAt(hm, cx, cz, hAvg, tmp);
    // Tiny deterministic per-face jitter keeps big flat areas from looking like plastic.
    const jitter = (((f * 2654435761) >>> 0) % 1000) / 1000;
    tmp.multiplyScalar(0.985 + jitter * 0.03);
    for (let v = 0; v < 3; v++) {
      colors[(f + v) * 3] = tmp.r;
      colors[(f + v) * 3 + 1] = tmp.g;
      colors[(f + v) * 3 + 2] = tmp.b;
    }
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeBoundingSphere();
  return geo;
}
