import * as THREE from "three";
import { hashJson, type PetSpec } from "../schema/petReading";
import { petDims } from "./dims";

/**
 * Marking textures (PRD 6.6). Painted into a plain RGBA pixel buffer so the painter is pure
 * and runs in node tests, then wrapped in a DataTexture. Patterns are evaluated in 3D on the
 * actual part surface (head sphere, body capsule), so they never show a UV seam.
 *
 * UV conventions (three.js r186):
 * - Head SphereGeometry: dir = (-cos(2 PI u) sin(t), cos(t), sin(2 PI u) sin(t)), t = PI (1 - v).
 *   The face (+Z) is at u = 0.25.
 * - Body CapsuleGeometry rotated +90 degrees about X: v runs rear (0) to chest (1) by arc
 *   length, around = 2 PI u with x = -cos, y = -sin. The belly is at u = 0.25.
 */

export const MARKING_SIZE = 256;
export type MarkingPart = "body" | "head";

type RGB = [number, number, number];
type Vec3 = [number, number, number];

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** 1 inside radius r, 0 outside, with a soft edge of half width w. */
function disc(d: number, r: number, w: number): number {
  return 1 - smoothstep(r - w, r + w, d);
}

function dist3(ax: number, ay: number, az: number, b: Vec3): number {
  const dx = ax - b[0];
  const dy = ay - b[1];
  const dz = az - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Distance from point (x, y) to segment a-b in 2D. */
function segDist(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const t = Math.min(1, Math.max(0, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
  const dx = x - (ax + vx * t);
  const dy = y - (ay + vy * t);
  return Math.sqrt(dx * dx + dy * dy);
}

interface Blob {
  c: Vec3;
  r: number;
}

/** Pattern alpha for a surface point: 0 is the base colour, 1 is the secondary colour. */
type Shader = (x: number, y: number, z: number) => number;

function effectiveCoverage(spec: PetSpec): number {
  return 0.25 + 0.75 * Math.min(1, Math.max(0, spec.markingCoverage));
}

function wobble(x: number, y: number, z: number, seed: number): number {
  return 0.05 * Math.sin(5.1 * x + seed) * Math.sin(4.3 * y + 1.7 * seed) + 0.04 * Math.sin(6.7 * z + 2.3 * seed);
}

function bodyShader(spec: PetSpec, rng: () => number, zMax: number): Shader {
  const c = effectiveCoverage(spec);
  const ws = rng() * 10;
  switch (spec.markingPattern) {
    case "patches": {
      const n = 2 + (rng() < 0.5 ? 1 : 0);
      const blobs: Blob[] = [];
      for (let i = 0; i < n; i++) {
        const phi = (rng() * 2 - 1) * 1.5;
        const z = (rng() * 2 - 1) * zMax * 0.75;
        blobs.push({ c: [Math.sin(phi), Math.cos(phi), z], r: 0.5 + 0.6 * c + rng() * 0.15 });
      }
      return (x, y, z) => {
        let a = 0;
        const w = wobble(x, y, z, ws);
        for (const b of blobs) a = Math.max(a, disc(dist3(x, y, z, b.c) + w, b.r, 0.05));
        return a;
      };
    }
    case "spots": {
      const n = Math.round(8 + 18 * c);
      const blobs: Blob[] = [];
      for (let i = 0; i < n; i++) {
        const phi = (rng() * 2 - 1) * 2.3;
        const z = (rng() * 2 - 1) * zMax * 0.85;
        blobs.push({ c: [Math.sin(phi), Math.cos(phi), z], r: 0.13 + rng() * 0.12 });
      }
      return (x, y, z) => {
        let a = 0;
        for (const b of blobs) a = Math.max(a, disc(dist3(x, y, z, b.c), b.r, 0.035));
        return a;
      };
    }
    case "tabby": {
      const t = 0.55 - 0.45 * c;
      return (x, y, z) => {
        const ang = Math.atan2(x, y);
        const stripe = Math.sin(z * 7.5 + 0.9 * Math.sin(ang * 2.2 + z * 0.7));
        const band = smoothstep(t - 0.12, t + 0.12, stripe);
        const dorsal = disc(Math.abs(x), 0.14, 0.05) * smoothstep(0.4, 0.7, y);
        const region = smoothstep(-0.45, 0.05, y);
        return Math.max(band, dorsal) * region;
      };
    }
    case "tuxedo": {
      const line = -0.45 + 0.4 * c;
      return (x, y, z) => {
        const belly = 1 - smoothstep(line - 0.07, line + 0.07, y);
        const chest =
          smoothstep(zMax - 1.25, zMax - 0.75, z) * (1 - smoothstep(0.05, 0.45, y)) * (1 - smoothstep(0.5, 0.85, Math.abs(x)));
        return Math.max(belly, chest);
      };
    }
    case "blaze":
      return (x, y, z) => {
        const bib = smoothstep(zMax - 0.85, zMax - 0.45, z) * (1 - smoothstep(-0.1, 0.25, y));
        return bib * disc(Math.abs(x), 0.5, 0.15);
      };
    case "brindle_approx":
      return (x, y, z) => {
        const ang = Math.atan2(x, y);
        const s = Math.sin((z + ang * 0.8) * 9 + 1.5 * Math.sin(z * 2.3 + ws));
        return 0.3 * smoothstep(0.15, 0.45, s) * smoothstep(-0.6, -0.1, y);
      };
    case "mask":
    case "socks":
    case "solid":
      return () => 0;
  }
}

function headShader(spec: PetSpec, rng: () => number): Shader {
  const c = effectiveCoverage(spec);
  const dims = petDims(spec);
  const az = dims.arch.eyeAzimuth;
  const el = dims.arch.eyeElevation;
  const eyeR: Vec3 = [-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  const eyeL: Vec3 = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  const ws = rng() * 10;
  switch (spec.markingPattern) {
    case "patches": {
      // One patch over an ear and the side of the crown (reads as a marking, not a black eye).
      const side = rng() < 0.5 ? 1 : -1;
      const blobs: Blob[] = [{ c: [side * 0.62, 0.62, 0.2], r: 0.3 + 0.22 * c }];
      const phi = (rng() * 2 - 1) * 1.2;
      blobs.push({ c: [Math.sin(phi) * 0.6, 0.55, -0.6], r: 0.35 + 0.3 * c });
      return (x, y, z) => {
        let a = 0;
        const w = wobble(x, y, z, ws) * 0.6;
        for (const b of blobs) a = Math.max(a, disc(dist3(x, y, z, b.c) + w, b.r, 0.04));
        return a;
      };
    }
    case "spots": {
      const blobs: Blob[] = [];
      const n = Math.round(4 + 6 * c);
      for (let i = 0; i < n; i++) {
        const phi = rng() * Math.PI * 2;
        const t = 0.2 + rng() * 1.2;
        const d: Vec3 = [Math.sin(t) * Math.cos(phi), Math.cos(t), Math.sin(t) * Math.sin(phi)];
        if (d[2] > 0.55 && Math.abs(d[0]) < 0.6) d[2] = -d[2];
        blobs.push({ c: d, r: 0.1 + rng() * 0.08 });
      }
      return (x, y, z) => {
        let a = 0;
        for (const b of blobs) a = Math.max(a, disc(dist3(x, y, z, b.c), b.r, 0.03));
        return a;
      };
    }
    case "tabby": {
      const pts: [number, number][] = [
        [-0.24, 0.42],
        [-0.14, 0.74],
        [0, 0.52],
        [0.14, 0.74],
        [0.24, 0.42],
      ];
      return (x, y, z) => {
        let a = 0;
        if (z > 0.2) {
          let d = 1;
          for (let i = 0; i < pts.length - 1; i++) {
            d = Math.min(d, segDist(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
          }
          a = disc(d, 0.035, 0.015);
        }
        // Cheek stripes.
        if (Math.abs(x) > 0.7 && z > -0.1) {
          const s1 = segDist(z, y, 0.05, -0.08, 0.5, -0.02);
          const s2 = segDist(z, y, 0.05, -0.26, 0.45, -0.2);
          a = Math.max(a, disc(Math.min(s1, s2), 0.03, 0.015));
        }
        // Stripes over the back of the head.
        if (z < 0.15 && y > 0.1) {
          const s = Math.sin(Math.atan2(-z, y) * 7 + x * 0.5);
          a = Math.max(a, smoothstep(0.55, 0.8, s) * smoothstep(0.1, 0.35, y));
        }
        return a;
      };
    }
    case "tuxedo": {
      const line = -0.18 + 0.2 * c;
      return (x, y, z) => {
        const low = (1 - smoothstep(line - 0.08, line + 0.08, y)) * smoothstep(0.0, 0.45, z);
        const w = 0.06 + 0.12 * Math.max(0, 0.6 - y);
        const stripe =
          c > 0.45 ? disc(Math.abs(x), w, 0.03) * smoothstep(0.2, 0.5, z) * (1 - smoothstep(0.7, 0.85, y)) : 0;
        return Math.max(low, stripe);
      };
    }
    case "mask": {
      const r = 0.3 + 0.12 * c;
      return (x, y, z) => {
        const eyes = Math.max(disc(dist3(x, y, z, eyeL), r, 0.05), disc(dist3(x, y, z, eyeR), r, 0.05));
        const bridge = disc(Math.abs(y - el - 0.02), 0.13, 0.04) * smoothstep(0.55, 0.75, z);
        return Math.max(eyes, bridge);
      };
    }
    case "blaze":
      return (x, y, z) => {
        const w = 0.06 + 0.12 * Math.max(0, 0.75 - y);
        const top = 1 - smoothstep(0.78, 0.9, y);
        return disc(Math.abs(x), w, 0.03) * smoothstep(0.25, 0.45, z) * top;
      };
    case "brindle_approx":
      return (x, y, z) => {
        const s = Math.sin((y * 1.2 + Math.atan2(x, z) * 1.5) * 6 + ws);
        return 0.3 * smoothstep(0.2, 0.5, s) * (1 - smoothstep(0.55, 0.8, z));
      };
    case "socks":
    case "solid":
      return () => 0;
  }
}

/**
 * Paints one part's markings into a 256x256 RGBA buffer. Row 0 is v = 0 (DataTexture
 * uploads without flipY). Pure and deterministic for a given spec.
 */
export function paintMarkings(spec: PetSpec, part: MarkingPart): Uint8ClampedArray {
  const N = MARKING_SIZE;
  const out = new Uint8ClampedArray(N * N * 4);
  const base = hexToRgb(spec.baseColor);
  const sec = hexToRgb(spec.secondaryColor);
  const rng = mulberry32(markingKey(spec) ^ (part === "body" ? 0x9e3779b9 : 0x85ebca6b));
  const dims = petDims(spec);
  const rb = dims.bodyRadius;
  const len = dims.bodyLength;
  const capArc = (Math.PI / 2) * rb;
  const total = 2 * capArc + len;
  const zMax = (len / 2 + rb) / rb;
  const shade = part === "body" ? bodyShader(spec, rng, zMax) : headShader(spec, rng);

  for (let j = 0; j < N; j++) {
    const v = (j + 0.5) / N;
    let profR = 1;
    let pz = 0;
    let sinT = 0;
    let cosT = 0;
    if (part === "body") {
      const s = v * total;
      if (s < capArc) {
        const a = s / rb;
        profR = Math.sin(a);
        pz = (-len / 2 - rb * Math.cos(a)) / rb;
      } else if (s < capArc + len) {
        pz = (-len / 2 + (s - capArc)) / rb;
      } else {
        const a = (s - capArc - len) / rb;
        profR = Math.cos(a);
        pz = (len / 2 + rb * Math.sin(a)) / rb;
      }
    } else {
      const t = Math.PI * (1 - v);
      sinT = Math.sin(t);
      cosT = Math.cos(t);
    }
    for (let i = 0; i < N; i++) {
      const th = (2 * Math.PI * (i + 0.5)) / N;
      let x: number;
      let y: number;
      let z: number;
      if (part === "body") {
        x = -profR * Math.cos(th);
        y = -profR * Math.sin(th);
        z = pz;
      } else {
        x = -Math.cos(th) * sinT;
        y = cosT;
        z = Math.sin(th) * sinT;
      }
      const a = Math.min(1, Math.max(0, shade(x, y, z)));
      const k = (j * N + i) * 4;
      out[k] = base[0] + (sec[0] - base[0]) * a;
      out[k + 1] = base[1] + (sec[1] - base[1]) * a;
      out[k + 2] = base[2] + (sec[2] - base[2]) * a;
      out[k + 3] = 255;
    }
  }
  return out;
}

export interface MarkingTextures {
  body: THREE.DataTexture;
  head: THREE.DataTexture;
}

function toTexture(data: Uint8ClampedArray): THREE.DataTexture {
  const tex = new THREE.DataTexture(
    new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    MARKING_SIZE,
    MARKING_SIZE,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

/** Only the fields that change the painted pixels go into the key. */
export function markingKey(spec: PetSpec): number {
  return hashJson([
    spec.species,
    spec.build,
    spec.furLength,
    spec.baseColor,
    spec.secondaryColor,
    spec.markingPattern,
    spec.markingCoverage,
  ]);
}

const cache = new Map<number, MarkingTextures>();
const CACHE_MAX = 24;

/** Body and head marking textures for a spec, generated once and cached by spec hash. */
export function markingTextures(spec: PetSpec): MarkingTextures {
  const key = markingKey(spec);
  const hit = cache.get(key);
  if (hit) return hit;
  const tex: MarkingTextures = {
    body: toTexture(paintMarkings(spec, "body")),
    head: toTexture(paintMarkings(spec, "head")),
  };
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, tex);
  return tex;
}

/** True when the pattern has anything to paint on the textured parts. */
export function hasTexture(spec: PetSpec): boolean {
  return spec.markingPattern !== "solid" && spec.markingPattern !== "socks" && spec.baseColor !== spec.secondaryColor;
}
