import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { toonMaterial } from "../render/toon";
import { applyBend } from "../render/bend";
import type { Collider } from "./collision";

/**
 * Villager cottages in the New Horizons spirit: soft plaster walls with a lighter base band,
 * a chunky tiled roof with overhang, chimney with a cap, an arched front door with a frame,
 * knob and porch light, framed windows with cross muntins and flower boxes, a doormat and
 * stepping stones, a mailbox and a few bushes.
 *
 * Every variant is three merged geometries (walls, roof, detail) built once and shared by
 * every house. Walls and roof are white and tinted per instance; the detail geometry carries
 * baked vertex colors. The door faces +z in local space.
 */

export const HOUSE_RADIUS = 2.1;
export const HOUSE_HEIGHT = 4;

/** Legacy per-instance roof tints (kept for existing callers). */
export const ROOF_COLORS = ["#f5a3a3", "#9cc7f0", "#b9a3e8", "#9fd9a8", "#ffc98a", "#f5b8d6"] as const;
export const WALL_COLOR = "#fff3dc";
export const DOOR_COLOR = "#a8744f";
export const WINDOW_COLOR = "#bfe6ff";
export const TRIM_COLOR = "#d9b98f";

/** Coral, sky blue, lilac, mint, butter yellow. */
export const ROOF_PALETTE = ["#f49a8a", "#8fc4ee", "#bba5ea", "#95d9b4", "#ffd67e"] as const;
/** Cream, peach, pale blue plaster. */
export const WALL_PALETTE = ["#fff1d6", "#ffdcc4", "#dcebfa"] as const;
export const HOUSE_VARIANTS = 4;

const C = {
  base: "#fffaf1",
  frame: "#fffdf8",
  glass: "#a9dcff",
  door: ["#a8744f", "#8a6a9e", "#5f93b8", "#b86a5a"],
  knob: "#f4c54f",
  lamp: "#fff0a6",
  metal: "#6b625c",
  box: "#b98459",
  flowers: ["#ff8fb1", "#ffe066", "#ffffff", "#ff7a6b"],
  leaf: "#6cbf6a",
  leafDark: "#58a95c",
  stone: "#d8cdbf",
  chimney: "#cdb7a3",
  cap: "#857a74",
  mat: "#e08a6c",
  post: "#9c7250",
  mailbox: ["#e8685f", "#5f9fd9", "#f2a950", "#7fbf7f"],
  flag: "#ffd23f",
  pot: "#d98659",
};

// Body dimensions (local space, door on +z).
const W = 2.8;
const D = 2.7;
const H = 2.15;
const FRONT = D / 2;

type Tint = "wall" | "roof" | null;
type Slot = "walls" | "roof" | "door" | "windows" | "trim" | null;

interface Piece {
  geo: THREE.BufferGeometry;
  tint: Tint;
  /** Legacy part the piece belongs to in HOUSE_PARTS (null: only in the new geometry). */
  slot: Slot;
}

const tmpColor = new THREE.Color();

/** Normalizes a geometry to non-indexed position/normal/color so everything merges. */
function prep(g: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== "position" && k !== "normal") n.deleteAttribute(k);
  n.clearGroups();
  if (!n.getAttribute("normal")) n.computeVertexNormals();
  tmpColor.set(color);
  const count = n.getAttribute("position").count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = tmpColor.r;
    arr[i * 3 + 1] = tmpColor.g;
    arr[i * 3 + 2] = tmpColor.b;
  }
  n.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return n;
}

function box(w: number, h: number, d: number, r: number, seg = 2): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) * 0.999);
}

function at(g: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry {
  g.translate(x, y, z);
  return g;
}

/** Arch (rounded top) outline of width 2r and height h, extruded along +z. */
function arch(r: number, h: number, depth: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  s.lineTo(r, h - r);
  s.absarc(0, h - r, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 10 });
}

class Builder {
  pieces: Piece[] = [];
  add(g: THREE.BufferGeometry, color: string, tint: Tint, slot: Slot, m?: THREE.Matrix4): void {
    if (m) g.applyMatrix4(m);
    this.pieces.push({ geo: prep(g, color), tint, slot });
  }
}

/** A framed window with cross muntins, sill flower box and flowers, built facing +z at the origin. */
function windowPieces(b: Builder, size: number, m: THREE.Matrix4, flowerSeed: number): void {
  const glass = size - 0.14;
  b.add(box(size, size, 0.1, 0.05), C.frame, null, "trim", m);
  b.add(at(box(glass, glass, 0.06, 0.03), 0, 0, 0.04), C.glass, null, "windows", m);
  b.add(at(box(0.045, glass, 0.05, 0.02), 0, 0, 0.08), C.frame, null, "trim", m);
  b.add(at(box(glass, 0.045, 0.05, 0.02), 0, 0, 0.08), C.frame, null, "trim", m);
  const bw = size + 0.12;
  const by = -size / 2 - 0.1;
  b.add(at(box(bw, 0.17, 0.2, 0.05), 0, by, 0.1), C.box, null, "door", m);
  const n = 4;
  for (let i = 0; i < n; i++) {
    const x = -bw / 2 + 0.1 + (i * (bw - 0.2)) / (n - 1);
    b.add(at(new THREE.IcosahedronGeometry(0.075, 0), x, by + 0.13, 0.05), C.leaf, null, null, m);
    const col = C.flowers[(i + flowerSeed) % C.flowers.length];
    b.add(at(new THREE.IcosahedronGeometry(0.06, 1), x + 0.03, by + 0.17, 0.14), col, null, "roof", m);
  }
}

function mat4(x: number, y: number, z: number, yaw = 0): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
}

/**
 * Gable roof with its ridge along z. Both slopes are mirror images: the underside of each
 * rests on the wall top edge (x = +-span/2, y = H), they meet under one ridge cap at x = 0,
 * and each has the same eave overhang, length and number of tile rows. Returns the height
 * of the roof top surface at the ridge.
 */
function gableRoof(b: Builder, span: number, length: number, pitch: number, attic: boolean, m: THREE.Matrix4): number {
  const t = Math.tan(pitch);
  const cos = Math.cos(pitch);
  const sin = Math.sin(pitch);
  const thick = 0.24;
  const overhang = 0.38;
  const half = span / 2;
  const eave = half + overhang;
  // Underside line: y(x) = yR - |x| * t, passing through the wall top edge.
  const yR = H - 0.02 + half * t;
  const yEave = yR - eave * t;
  const L = eave / cos + 0.08;
  const len = length + 0.6;
  for (const side of [1, -1]) {
    // Right slope (side 1) falls toward +x: rotate by -pitch. Left slope mirrors with +pitch.
    const rot = new THREE.Matrix4().makeRotationZ(-side * pitch);
    const nx = side * sin;
    const ny = cos;
    // Slab centre: midpoint of the underside, pushed out along the normal by half the thickness.
    const cx = side * (eave / 2) + nx * (thick / 2);
    const cy = yR - (eave / 2) * t + ny * (thick / 2);
    const slab = box(L, thick, len, 0.1, 3).applyMatrix4(rot);
    b.add(at(slab, cx, cy, 0), "#ffffff", "roof", "roof", m);
    // Rounded tile rows resting on the top surface, from the eave up.
    const rows = 4;
    for (let k = 0; k < rows; k++) {
      const s = 0.14 + (k * (L - 0.5)) / rows;
      const px = side * (eave - cos * s) + nx * (thick + 0.02);
      const py = yEave + sin * s + ny * (thick + 0.02);
      const tube = new THREE.CylinderGeometry(0.1, 0.1, len - 0.04, 8, 1);
      tube.rotateX(Math.PI / 2);
      tube.scale(1.35, 0.8, 1);
      tube.applyMatrix4(rot);
      b.add(at(tube, px, py, 0), "#ffffff", "roof", "roof", m);
    }
  }
  const top = yR + thick / cos;
  const cap = new THREE.CylinderGeometry(0.18, 0.18, len + 0.04, 10, 1);
  cap.rotateX(Math.PI / 2);
  b.add(at(cap, 0, top - 0.02, 0), "#ffffff", "roof", "roof", m);
  // Gable fill: a wall-colored triangle that stays just under the roof underside everywhere.
  const gHalf = half - 0.04;
  const baseY = H - 0.1;
  const apexY = yR - 0.03;
  const tri = new THREE.Shape();
  tri.moveTo(-gHalf, 0);
  tri.lineTo(gHalf, 0);
  tri.lineTo(0, apexY - baseY);
  tri.lineTo(-gHalf, 0);
  const gd = length - 0.16;
  const gable = new THREE.ExtrudeGeometry(tri, { depth: gd, bevelEnabled: false });
  b.add(at(gable, 0, baseY, -gd / 2), "#ffffff", "wall", "walls", m);
  if (attic) {
    const ay = H + (apexY - H) * 0.4;
    const az = gd / 2 + 0.01;
    const ring = new THREE.TorusGeometry(0.2, 0.05, 6, 16);
    b.add(at(ring, 0, ay, az + 0.03), C.frame, null, "trim", m);
    const g = new THREE.CylinderGeometry(0.19, 0.19, 0.04, 16, 1);
    g.rotateX(Math.PI / 2);
    b.add(at(g, 0, ay, az), C.glass, null, "windows", m);
    b.add(at(box(0.035, 0.36, 0.04, 0.015), 0, ay, az + 0.04), C.frame, null, "trim", m);
    b.add(at(box(0.36, 0.035, 0.04, 0.015), 0, ay, az + 0.04), C.frame, null, "trim", m);
  }
  return top;
}

/** Hip roof as stacked rounded tiers: reads as chunky tile rows from every side. */
function hipRoof(b: Builder): number {
  const y0 = H - 0.08;
  const tiers = 4;
  let y = y0;
  for (let i = 0; i < tiers; i++) {
    const bot = 1.85 - i * 0.43;
    const top = Math.max(0.06, bot - 0.52);
    const h = 0.42;
    const g = new THREE.CylinderGeometry(top * Math.SQRT2, bot * Math.SQRT2, h, 4, 1);
    g.rotateY(Math.PI / 4);
    g.scale(1, 1, (D + 0.7) / (W + 0.7));
    b.add(at(g, 0, y + h / 2, 0), "#ffffff", "roof", "roof");
    // Rounded lip at the bottom of each tier.
    const lip = box(bot * 2 + 0.06, 0.12, (bot * 2 + 0.06) * ((D + 0.7) / (W + 0.7)), 0.06, 2);
    b.add(at(lip, 0, y + 0.02, 0), "#ffffff", "roof", "roof");
    y += h - 0.08;
  }
  b.add(at(new THREE.IcosahedronGeometry(0.16, 1), 0, y + 0.08, 0), "#ffffff", "roof", "roof");
  return y;
}

function chimney(b: Builder, x: number, z: number, roofY: number): void {
  b.add(at(box(0.42, 1.0, 0.42, 0.07), x, roofY + 0.3, z), C.chimney, null, "trim");
  b.add(at(box(0.54, 0.14, 0.54, 0.06), x, roofY + 0.84, z), C.cap, null, "trim");
}

function buildVariant(variant: number): Piece[] {
  const b = new Builder();
  const v = ((variant % HOUSE_VARIANTS) + HOUSE_VARIANTS) % HOUSE_VARIANTS;
  // Walls and the lighter base band.
  b.add(at(box(W, H, D, 0.3, 4), 0, H / 2, 0), "#ffffff", "wall", "walls");
  b.add(at(box(W + 0.14, 0.36, D + 0.14, 0.16, 3), 0, 0.18, 0), C.base, null, "trim");

  // Roof.
  if (v === 0 || v === 2) {
    const pitch = v === 0 ? 0.56 : 0.72;
    const ridge = gableRoof(b, W, D, pitch, true, new THREE.Matrix4());
    const cx = v === 0 ? 0.78 : -0.72;
    chimney(b, cx, -0.55, ridge - Math.abs(cx) * Math.tan(pitch));
  } else if (v === 3) {
    // Ridge parallel to the front: the classic cottage silhouette, gables on the sides.
    const ridge = gableRoof(b, D, W, 0.62, false, new THREE.Matrix4().makeRotationY(Math.PI / 2));
    chimney(b, 0.8, -0.6, ridge - 0.6 * Math.tan(0.62));
  } else {
    const top = hipRoof(b);
    chimney(b, -0.75, -0.5, top - 0.75);
  }

  // Front door: arched, framed, with a knob, a round peek window and a doorstep.
  const dr = 0.36;
  const dh = 1.3;
  const frame = arch(dr + 0.09, dh + 0.09, 0.06);
  b.add(at(frame, 0, 0.1, FRONT - 0.03), C.frame, null, "trim");
  b.add(at(arch(dr, dh, 0.08), 0, 0.12, FRONT), C.door[v], null, "door");
  const peek = new THREE.CylinderGeometry(0.11, 0.11, 0.04, 12, 1);
  peek.rotateX(Math.PI / 2);
  b.add(at(peek, 0, 0.12 + dh - dr, FRONT + 0.11), C.glass, null, "windows");
  b.add(at(new THREE.IcosahedronGeometry(0.06, 1), 0.22, 0.72, FRONT + 0.15), C.knob, null, "trim");
  b.add(at(box(1.15, 0.12, 0.5, 0.05), 0, 0.06, FRONT + 0.28), C.stone, null, "trim");
  b.add(at(box(0.8, 0.03, 0.46, 0.012), 0, 0.02, FRONT + 0.78), C.mat, null, "door");

  // Porch light, and an awning on every variant but the first.
  b.add(at(box(0.06, 0.2, 0.12, 0.02), 0.58, 1.5, FRONT + 0.05), C.metal, null, "trim");
  b.add(at(new THREE.IcosahedronGeometry(0.1, 1), 0.58, 1.44, FRONT + 0.15), C.lamp, null, "windows");
  if (v !== 0) {
    const aw = box(1.12, 0.08, 0.62, 0.04, 2);
    aw.rotateX(0.38);
    b.add(at(aw, 0, dh + 0.42, FRONT + 0.27), "#ffffff", "roof", "roof");
    for (let i = 0; i < 5; i++) {
      const s = new THREE.SphereGeometry(0.1, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      b.add(at(s, -0.44 + i * 0.22, dh + 0.33, FRONT + 0.55), C.frame, null, "trim");
    }
  }

  // Windows: two small ones flanking the door, one on each side wall.
  windowPieces(b, 0.5, mat4(0.93, 1.3, FRONT + 0.01), v);
  windowPieces(b, 0.5, mat4(-0.93, 1.3, FRONT + 0.01), v + 1);
  windowPieces(b, 0.68, mat4(W / 2 + 0.01, 1.25, 0.1, Math.PI / 2), v + 2);
  windowPieces(b, 0.68, mat4(-W / 2 - 0.01, 1.25, 0.1, -Math.PI / 2), v + 3);

  // Stepping stones.
  const stones: [number, number, number][] = [
    [0.08, FRONT + 1.35, 0.27],
    [-0.12, FRONT + 1.92, 0.24],
    [0.1, FRONT + 2.45, 0.26],
  ];
  for (const [x, z, r] of stones) {
    const s = new THREE.CylinderGeometry(r, r * 1.05, 0.08, 9, 1);
    b.add(at(s, x, 0.03, z), C.stone, null, "trim");
  }

  // Mailbox beside the path.
  const mx = v % 2 === 0 ? 1.62 : -1.62;
  const mz = FRONT + 0.95;
  b.add(at(box(0.09, 0.72, 0.09, 0.03), mx, 0.36, mz), C.post, null, "door");
  b.add(at(box(0.3, 0.27, 0.44, 0.12, 3), mx, 0.82, mz), C.mailbox[v], null, "roof");
  b.add(at(box(0.03, 0.2, 0.06, 0.012), mx + 0.17, 0.95, mz - 0.1), C.flag, null, "trim");

  // Bushes hugging the walls and a potted plant by the door.
  const bushes: [number, number, number][] = [
    [-mx * 0.95, 0.32, FRONT + 0.05],
    [W / 2 + 0.12, 0.3, -D / 2 + 0.2],
    [-W / 2 - 0.1, 0.28, -D / 2 + 0.35],
  ];
  bushes.forEach(([x, y, z], i) => {
    b.add(at(new THREE.IcosahedronGeometry(0.34, 1), x, y, z), i % 2 ? C.leafDark : C.leaf, null, null);
    b.add(at(new THREE.IcosahedronGeometry(0.26, 1), x + 0.24 * Math.sign(x), y - 0.06, z + 0.14), C.leafDark, null, null);
    b.add(at(new THREE.IcosahedronGeometry(0.07, 1), x + 0.1, y + 0.3, z + 0.12), C.flowers[(i + v) % 4], null, null);
  });
  const px = mx > 0 ? -0.66 : 0.66;
  const pot = new THREE.CylinderGeometry(0.17, 0.13, 0.3, 10, 1);
  b.add(at(pot, px, 0.15, FRONT + 0.42), C.pot, null, "door");
  b.add(at(new THREE.IcosahedronGeometry(0.2, 1), px, 0.42, FRONT + 0.42), C.leaf, null, null);
  b.add(at(new THREE.IcosahedronGeometry(0.06, 1), px + 0.06, 0.6, FRONT + 0.5), C.flowers[v % 4], null, null);
  return b.pieces;
}

export interface HouseGeometries {
  /** White, tinted by the wall color. */
  walls: THREE.BufferGeometry;
  /** White, tinted by the roof color. */
  roof: THREE.BufferGeometry;
  /** Baked vertex colors, untinted. */
  detail: THREE.BufferGeometry;
}

function mergeTint(pieces: Piece[], tint: Tint): THREE.BufferGeometry {
  const g = mergeGeometries(pieces.filter((p) => p.tint === tint).map((p) => p.geo));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

const variantCache = new Map<number, HouseGeometries>();

/** Shared geometries for one variant (built once, cached). */
export function houseGeometries(variant: number): HouseGeometries {
  const v = ((Math.floor(variant) % HOUSE_VARIANTS) + HOUSE_VARIANTS) % HOUSE_VARIANTS;
  let g = variantCache.get(v);
  if (!g) {
    const pieces = buildVariant(v);
    g = { walls: mergeTint(pieces, "wall"), roof: mergeTint(pieces, "roof"), detail: mergeTint(pieces, null) };
    variantCache.set(v, g);
  }
  return g;
}

export interface HouseStyle {
  variant: number;
  roof: string;
  wall: string;
}

function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Deterministic look for the i-th house. Neighbouring indices never share a roof color or variant. */
export function houseStyle(index: number, seed = 0): HouseStyle {
  const i = Math.abs(Math.floor(index));
  const s = hash(seed + 101);
  const h = hash(i * 7919 + seed * 31 + 17);
  return {
    variant: (i + s) % HOUSE_VARIANTS,
    roof: ROOF_PALETTE[(i + (s >>> 4)) % ROOF_PALETTE.length],
    wall: WALL_PALETTE[(h >>> 8) % WALL_PALETTE.length],
  };
}

let sharedMat: THREE.MeshToonMaterial | null = null;
/** One vertex-colored toon material for every instanced house. */
function houseMaterial(): THREE.MeshToonMaterial {
  if (!sharedMat) sharedMat = toonMaterial({ vertexColors: true });
  return sharedMat;
}

const tintedMats = new Map<string, THREE.MeshToonMaterial>();
function tintedMaterial(color: string): THREE.MeshToonMaterial {
  let m = tintedMats.get(color);
  if (!m) {
    m = toonMaterial({ vertexColors: true, color });
    tintedMats.set(color, m);
  }
  return m;
}

/** A single cottage as a small group (3 meshes), for previews and one-off placements. */
export function buildHouse(style: Partial<HouseStyle> = {}): THREE.Group {
  const g = houseGeometries(style.variant ?? 0);
  const root = new THREE.Group();
  root.name = "house";
  const parts: [THREE.BufferGeometry, string][] = [
    [g.walls, style.wall ?? WALL_PALETTE[0]],
    [g.roof, style.roof ?? ROOF_PALETTE[0]],
    [g.detail, "#ffffff"],
  ];
  for (const [geo, color] of parts) {
    const mesh = new THREE.Mesh(geo, tintedMaterial(color));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  applyBend(root);
  return root;
}

export interface CreateHousesOptions {
  /** Mixed into the style hash so different islands look different. */
  seed?: number;
  /** Overrides the style for the i-th home. */
  style?: (index: number) => HouseStyle;
}

/**
 * Every home as instanced meshes: 3 draw calls per variant in use (at most 12 total).
 * Each home faces its yaw (or the island center). Dispose the returned meshes when done;
 * geometries and the material are shared and are not disposed.
 */
export function createHouses(
  homes: { x: number; z: number; yaw?: number }[],
  groundY: (x: number, z: number) => number,
  opts: CreateHousesOptions = {},
): THREE.Group {
  const root = new THREE.Group();
  root.name = "houses";
  const styles = homes.map((_, i) => (opts.style ? opts.style(i) : houseStyle(i, opts.seed ?? 0)));
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  const color = new THREE.Color();
  for (let v = 0; v < HOUSE_VARIANTS; v++) {
    const idx = styles.map((s, i) => ((((s.variant % HOUSE_VARIANTS) + HOUSE_VARIANTS) % HOUSE_VARIANTS) === v ? i : -1)).filter((i) => i >= 0);
    if (idx.length === 0) continue;
    const g = houseGeometries(v);
    for (const key of ["walls", "roof", "detail"] as const) {
      const mesh = new THREE.InstancedMesh(g[key], houseMaterial(), idx.length);
      mesh.name = `house-${v}-${key}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      idx.forEach((hi, j) => {
        const h = homes[hi];
        q.setFromAxisAngle(up, h.yaw ?? houseYaw(h.x, h.z));
        m4.compose(pos.set(h.x, groundY(h.x, h.z) - 0.02, h.z), q, one);
        mesh.setMatrixAt(j, m4);
        const s = styles[hi];
        mesh.setColorAt(j, color.set(key === "walls" ? s.wall : key === "roof" ? s.roof : "#ffffff"));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      root.add(mesh);
    }
  }
  applyBend(root);
  return root;
}

export interface HousePart {
  name: string;
  geometry: THREE.BufferGeometry;
}

function legacyParts(): Record<"walls" | "roof" | "door" | "windows" | "trim", THREE.BufferGeometry> {
  const pieces = buildVariant(0);
  const pick = (slot: Slot): THREE.BufferGeometry => mergeGeometries(pieces.filter((p) => p.slot === slot).map((p) => p.geo));
  return { walls: pick("walls"), roof: pick("roof"), door: pick("door"), windows: pick("windows"), trim: pick("trim") };
}

/**
 * Legacy single-color parts (variant 0) for callers that instance one material per part.
 * Prefer createHouses, which adds color variants, greenery and flowers.
 */
export const HOUSE_PARTS = legacyParts();

/** House faces the island center so doors are visible when walking in from the beach. */
export function houseYaw(x: number, z: number): number {
  return Math.atan2(-x, -z);
}

export function houseColliders(homes: { x: number; z: number }[], groundY: (x: number, z: number) => number): Collider[] {
  return homes.map((h) => ({ x: h.x, z: h.z, r: HOUSE_RADIUS, top: groundY(h.x, h.z) + HOUSE_HEIGHT }));
}
