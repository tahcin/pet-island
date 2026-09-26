import * as THREE from "three";
import type { Accessory, PetSpec } from "../schema/petReading";
import { toonColor, toonMaterial } from "../render/toon";
import { applyBend } from "../render/bend";
import { petDims, type PetDims } from "./dims";
import { hasTexture, markingTextures } from "./markingTexture";

/**
 * Parametric chibi pet builder (PRD 6.5). Pure and deterministic: the same spec always gives
 * the same hierarchy, names, and transforms. No React, no store.
 *
 * Frame: the pet faces +Z, Y is up, feet on y = 0. Its left side is +X.
 * Hierarchy: pet (size scale) > rig (hop and squash) > body (torso centre) > head, legs, tail.
 */

export const PIVOT_NAMES = [
  "body",
  "head",
  "muzzle",
  "eyeL",
  "eyeR",
  "nose",
  "earL",
  "earR",
  "legFL",
  "legFR",
  "legBL",
  "legBR",
  "tail",
] as const;
export type CorePivot = (typeof PIVOT_NAMES)[number];
export type PivotName = CorePivot | "rig" | "torso" | "collar" | "accessory";
export type PetPivots = Record<CorePivot | "rig" | "torso", THREE.Object3D> & {
  collar?: THREE.Object3D;
  accessory?: THREE.Object3D;
};

export interface PetUserData {
  /** Top of the pet (ears included) in the parent frame, size scale applied. */
  height: number;
  /** Horizontal half extent, for follow distance and colliders. */
  radius: number;
  eyeHeight: number;
  headTopY: number;
  pivots: PetPivots;
  spec: PetSpec;
  dims: PetDims;
  owned: { geometries: THREE.BufferGeometry[]; materials: THREE.Material[] };
}

/** Typed access to the metrics buildPet stores on the group. */
export function petData(group: THREE.Object3D): PetUserData {
  return group.userData as PetUserData;
}

// Palette constants (PRD 8: no black except pupils).
const PUPIL = "#2b2226";
const WHITE = "#fffdf8";
const BLUSH = "#ffb0b8";
const INNER_EAR = "#ffc6cb";
const MOUTH = "#8a5a50";
const TONGUE = "#ff8f9c";
const GOLD = "#f5cf5b";

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixHex(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return `#${((1 << 24) | (c[0] << 16) | (c[1] << 8) | c[2]).toString(16).slice(1)}`;
}

function lum(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Collects every geometry and material a build creates so the pet can be disposed. */
class Ctx {
  geometries: THREE.BufferGeometry[] = [];
  materials: THREE.Material[] = [];
  constructor(
    readonly spec: PetSpec,
    readonly d: PetDims,
  ) {}

  geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  mat(color: string): THREE.Material {
    return toonColor(color, this.d.soft);
  }

  mesh(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    name: string,
    part: string,
    pos?: [number, number, number],
    scale?: [number, number, number],
  ): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.userData.part = part;
    m.castShadow = true;
    m.receiveShadow = false;
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    return m;
  }

  sphere(r: number, w = 20, h = 14): THREE.SphereGeometry {
    return this.geo(new THREE.SphereGeometry(r, w, h));
  }
}

function pivot(name: string, x = 0, y = 0, z = 0): THREE.Object3D {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  return o;
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** Rounded cone for ears: a slightly convex cone with a soft hemispherical tip. */
function roundedCone(ctx: Ctx, r: number, h: number): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  const rt = r * 0.2;
  const body = h - rt;
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector2(r + (rt - r) * Math.pow(t, 0.85), body * t));
  }
  for (let j = 1; j <= 6; j++) {
    const a = (j / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(0.0001, rt * Math.cos(a)), body + rt * Math.sin(a)));
  }
  return ctx.geo(new THREE.LatheGeometry(pts, 24));
}

interface HeadFrame {
  hc: THREE.Vector3;
  R: number;
  s: [number, number, number];
}

/** Point on the head ellipsoid at azimuth az (0 = face) and elevation el, scaled by k. */
function surf(f: HeadFrame, az: number, el: number, k = 1): THREE.Vector3 {
  return new THREE.Vector3(
    f.hc.x + f.R * f.s[0] * Math.sin(az) * Math.cos(el) * k,
    f.hc.y + f.R * f.s[1] * Math.sin(el) * k,
    f.hc.z + f.R * f.s[2] * Math.cos(az) * Math.cos(el) * k,
  );
}

function surfNormal(f: HeadFrame, az: number, el: number): THREE.Vector3 {
  return new THREE.Vector3(
    (Math.sin(az) * Math.cos(el)) / f.s[0],
    Math.sin(el) / f.s[1],
    (Math.cos(az) * Math.cos(el)) / f.s[2],
  ).normalize();
}

function faceOut(o: THREE.Object3D, n: THREE.Vector3): void {
  o.quaternion.setFromUnitVectors(Z_AXIS, n);
}

function muzzleColor(spec: PetSpec): string {
  const p = spec.markingPattern;
  if (p === "blaze" || p === "tuxedo" || p === "mask") return spec.secondaryColor;
  return mixHex(spec.baseColor, "#fff4e2", 0.42);
}

function buildEyes(ctx: Ctx, head: THREE.Object3D, f: HeadFrame): [THREE.Object3D, THREE.Object3D] {
  const a = ctx.d.arch;
  const e = a.eyeSize * f.R;
  const eyeGeo = ctx.sphere(e, 24, 18);
  const hiGeo = ctx.sphere(e * 0.3, 12, 10);
  const hi2Geo = ctx.sphere(e * 0.14, 10, 8);
  const out: THREE.Object3D[] = [];
  for (const side of [1, -1]) {
    const name = side > 0 ? "eyeL" : "eyeR";
    const p = pivot(name);
    p.position.copy(surf(f, side * a.eyeAzimuth, a.eyeElevation, 0.97));
    faceOut(p, surfNormal(f, side * a.eyeAzimuth * 0.8, a.eyeElevation));
    if (a.irisRing) {
      p.add(ctx.mesh(eyeGeo, ctx.mat(ctx.spec.eyeColor), `${name}Iris`, "eyes", [0, 0, 0], [1, 1.12, 0.5]));
      p.add(ctx.mesh(eyeGeo, ctx.mat(PUPIL), `${name}Pupil`, "eyes", [0, 0, e * 0.12], [0.74, 0.86, 0.45]));
    } else {
      p.add(ctx.mesh(eyeGeo, ctx.mat(PUPIL), `${name}Pupil`, "eyes", [0, 0, 0], [1, 1.12, 0.5]));
    }
    p.add(ctx.mesh(hiGeo, ctx.mat(WHITE), `${name}Shine`, "eyes", [e * 0.3 * side, e * 0.4, e * 0.48], [1, 1, 0.5]));
    p.add(ctx.mesh(hi2Geo, ctx.mat(WHITE), `${name}Shine2`, "eyes", [-e * 0.28 * side, -e * 0.34, e * 0.47], [1, 1, 0.5]));
    head.add(p);
    out.push(p);
  }
  return [out[0], out[1]];
}

function buildMuzzle(ctx: Ctx, head: THREE.Object3D, f: HeadFrame): { muzzle: THREE.Object3D; nose: THREE.Object3D } {
  const a = ctx.d.arch;
  const spec = ctx.spec;
  const R = f.R;
  const mc = ctx.mat(muzzleColor(spec));
  const muzzle = pivot("muzzle");
  const nose = pivot("nose");
  if (a.muzzle === "long") {
    const ms = a.muzzleSize * R;
    muzzle.position.copy(surf(f, 0, -0.42, 0.7));
    const len = a.muzzleLength;
    const mz = ms * 0.55;
    muzzle.add(ctx.mesh(ctx.sphere(ms, 24, 16), mc, "muzzleMesh", "muzzle", [0, 0, mz], [1.12, 0.78, len]));
    const front = mz + ms * len;
    nose.position.set(0, ms * 0.38, front - ms * 0.12);
    const nr = a.noseSize * R;
    nose.add(ctx.mesh(ctx.sphere(nr, 16, 12), ctx.mat(spec.noseColor), "noseMesh", "nose", [0, 0, 0], [1.35, 0.9, 0.85]));
    nose.add(ctx.mesh(ctx.sphere(nr * 0.28, 8, 6), ctx.mat(WHITE), "noseShine", "nose", [nr * 0.35, nr * 0.4, nr * 0.62], [1, 0.7, 0.5]));
    muzzle.add(nose);
    // Smile: a small U under the nose.
    const smile = ctx.mesh(
      ctx.geo(new THREE.TorusGeometry(ms * 0.26, ms * 0.045, 6, 18, Math.PI)),
      ctx.mat(MOUTH),
      "mouth",
      "muzzle",
      [0, -ms * 0.12, front - ms * 0.2],
    );
    smile.rotation.set(-0.35, 0, Math.PI);
    muzzle.add(smile);
    if (a.tongue) {
      muzzle.add(
        ctx.mesh(ctx.sphere(ms * 0.2, 14, 10), ctx.mat(TONGUE), "tongue", "muzzle", [0, -ms * 0.42, front - ms * 0.3], [1, 0.75, 0.6]),
      );
    }
  } else {
    const ps = a.muzzleSize * R;
    muzzle.position.copy(surf(f, 0, -0.3, 0.86));
    const pad = ctx.sphere(ps, 18, 14);
    muzzle.add(ctx.mesh(pad, mc, "padL", "muzzle", [ps * 0.62, 0, 0], [1, 0.82, 0.8]));
    muzzle.add(ctx.mesh(pad, mc, "padR", "muzzle", [-ps * 0.62, 0, 0], [1, 0.82, 0.8]));
    const nr = a.noseSize * R;
    nose.position.set(0, ps * 0.62, ps * 0.62);
    nose.add(ctx.mesh(ctx.sphere(nr, 14, 10), ctx.mat(spec.noseColor), "noseMesh", "nose", [0, 0, 0], [1.4, 0.85, 0.8]));
    muzzle.add(nose);
    if (a.teeth) {
      const tooth = ctx.geo(new THREE.CapsuleGeometry(ps * 0.16, ps * 0.22, 4, 10));
      muzzle.add(ctx.mesh(tooth, ctx.mat(WHITE), "toothL", "muzzle", [ps * 0.17, -ps * 0.72, ps * 0.42], [1, 1, 0.6]));
      muzzle.add(ctx.mesh(tooth, ctx.mat(WHITE), "toothR", "muzzle", [-ps * 0.17, -ps * 0.72, ps * 0.42], [1, 1, 0.6]));
    }
    if (a.whiskers) {
      const wc = lum(spec.baseColor) > 0.55 ? "#b39a88" : "#fff3e2";
      const wGeo = ctx.geo(new THREE.CapsuleGeometry(0.0055, R * 0.42, 3, 6));
      wGeo.rotateZ(Math.PI / 2);
      wGeo.translate(R * 0.23, 0, 0);
      for (const side of [1, -1]) {
        for (let i = 0; i < 3; i++) {
          const w = ctx.mesh(wGeo, ctx.mat(wc), `whisker${side > 0 ? "L" : "R"}${i}`, "muzzle", [side * ps * 1.1, ps * 0.1 - i * ps * 0.28, ps * 0.2]);
          w.rotation.set(0, side > 0 ? 0.25 : Math.PI - 0.25, (0.22 - i * 0.2) * (side > 0 ? 1 : -1));
          muzzle.add(w);
        }
      }
    }
  }
  head.add(muzzle);
  return { muzzle, nose };
}

function buildEar(ctx: Ctx, side: number, f: HeadFrame): THREE.Object3D {
  const spec = ctx.spec;
  const R = f.R * ctx.d.arch.earScale;
  const name = side > 0 ? "earL" : "earR";
  const p = pivot(name);
  const inner = ctx.mat(INNER_EAR);
  const earColor =
    spec.markingPattern === "mask" || spec.markingPattern === "tabby" ? mixHex(spec.baseColor, spec.secondaryColor, 0.5) : spec.baseColor;
  const outer = ctx.mat(earColor);
  const part = name;
  // Inner content is built for the left ear and mirrored with a scale on the holder.
  const mirror = new THREE.Object3D();
  mirror.scale.x = side;
  p.add(mirror);
  const holder = new THREE.Object3D();
  holder.name = `${name}Shape`;
  mirror.add(holder);
  const hanging = spec.earType === "floppy" || spec.earType === "long_floppy";
  if (hanging) {
    p.position.copy(surf(f, side * 1.02, 0.58, 0.86));
    const long = spec.earType === "long_floppy";
    const h = long ? 0.7 : 0.42;
    const dark = ctx.mat(mixHex(earColor, "#6b4a3a", spec.markingPattern === "mask" ? 0 : 0.14));
    holder.add(
      ctx.mesh(ctx.sphere(1, 24, 18), dark, `${name}Mesh`, part, [R * 0.1, -R * h * 0.66, 0], [R * 0.16, R * h, R * 0.3]),
    );
    holder.rotation.set(0.1, -0.3, 0.12);
  } else {
    p.position.copy(surf(f, side * 0.52, 0.92, 0.9));
    switch (spec.earType) {
      case "pointy": {
        const cone = roundedCone(ctx, R * 0.36, R * 0.62);
        holder.add(ctx.mesh(cone, outer, `${name}Mesh`, part, [0, 0, 0], [1, 1, 0.5]));
        holder.add(ctx.mesh(cone, inner, `${name}Inner`, part, [0, R * 0.04, R * 0.07], [0.62, 0.78, 0.32]));
        holder.rotation.set(-0.08, 0, -0.32);
        break;
      }
      case "folded": {
        const cone = roundedCone(ctx, R * 0.34, R * 0.4);
        holder.add(ctx.mesh(cone, outer, `${name}Mesh`, part, [0, 0, 0], [1, 1, 0.55]));
        const flap = ctx.mesh(cone, outer, `${name}Flap`, part, [0, R * 0.33, R * 0.02], [0.82, 0.75, 0.4]);
        flap.rotation.x = 2.1;
        holder.add(flap);
        holder.rotation.set(0, 0, -0.38);
        break;
      }
      case "long_upright": {
        const g = ctx.sphere(1, 20, 18);
        holder.add(ctx.mesh(g, outer, `${name}Mesh`, part, [0, R * 0.72, 0], [R * 0.2, R * 0.78, R * 0.11]));
        holder.add(ctx.mesh(g, inner, `${name}Inner`, part, [0, R * 0.72, R * 0.085], [R * 0.11, R * 0.6, R * 0.04]));
        holder.rotation.set(-0.1, 0, -0.16);
        break;
      }
      case "rounded":
      default: {
        const g = ctx.sphere(1, 18, 14);
        holder.add(ctx.mesh(g, outer, `${name}Mesh`, part, [0, R * 0.14, 0], [R * 0.27, R * 0.25, R * 0.12]));
        holder.add(ctx.mesh(g, inner, `${name}Inner`, part, [0, R * 0.13, R * 0.1], [R * 0.16, R * 0.14, R * 0.04]));
        holder.rotation.set(0, 0, -0.3);
        break;
      }
    }
  }
  return p;
}

function buildTail(ctx: Ctx): THREE.Object3D {
  const spec = ctx.spec;
  const d = ctx.d;
  const tail = pivot("tail", 0, d.tailY - d.bodyY, d.tailZ);
  const fur = spec.furLength === "long" ? 1.25 : spec.furLength === "medium" ? 1.1 : 1;
  const base = ctx.mat(spec.baseColor);
  const tipped = ["tuxedo", "patches", "blaze"].includes(spec.markingPattern);
  const tip = tipped ? ctx.mat(spec.secondaryColor) : base;
  switch (spec.tailType) {
    case "curly": {
      const tr = 0.085;
      const tube = 0.042 * fur;
      const g = ctx.geo(new THREE.TorusGeometry(tr, tube, 12, 28, Math.PI * 1.5));
      g.rotateZ(-Math.PI / 2);
      g.rotateY(Math.PI / 2);
      tail.add(ctx.mesh(g, base, "tailMesh", "tail", [0, tr, 0]));
      tail.add(ctx.mesh(ctx.sphere(tube, 12, 10), tip, "tailTip", "tail", [0, tr, tr]));
      break;
    }
    case "long":
    case "thin": {
      const thin = spec.tailType === "thin";
      const pts = thin
        ? [
            [0, 0, 0.02],
            [0, 0.03, -0.1],
            [0, 0.1, -0.22],
            [0, 0.22, -0.28],
            [0, 0.3, -0.26],
          ]
        : [
            [0, 0, 0.02],
            [0, 0.08, -0.1],
            [0, 0.22, -0.16],
            [0, 0.36, -0.15],
            [0, 0.44, -0.08],
          ];
      const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
      const r = (thin ? 0.022 : 0.034) * fur;
      tail.add(ctx.mesh(ctx.geo(new THREE.TubeGeometry(curve, 28, r, 10, false)), base, "tailMesh", "tail"));
      const end = curve.getPoint(1);
      tail.add(ctx.mesh(ctx.sphere(r * (tipped ? 1.25 : 1), 12, 10), tip, "tailTip", "tail", [end.x, end.y, end.z]));
      break;
    }
    case "fluffy": {
      const g = ctx.geo(new THREE.CapsuleGeometry(0.075 * fur, 0.16, 8, 16));
      const m = ctx.mesh(g, base, "tailMesh", "tail", [0, 0.12, -0.08]);
      m.rotation.x = -0.75;
      tail.add(m);
      tail.add(ctx.mesh(ctx.sphere(0.07 * fur, 14, 12), tip, "tailTip", "tail", [0, 0.23, -0.16]));
      break;
    }
    case "bob":
      tail.add(ctx.mesh(ctx.sphere(0.055 * fur, 14, 12), base, "tailMesh", "tail", [0, 0.02, -0.01]));
      break;
    case "puff":
      tail.add(
        ctx.mesh(ctx.sphere(0.095 * fur, 18, 14), ctx.mat(mixHex(spec.baseColor, WHITE, 0.7)), "tailMesh", "tail", [0, 0.04, -0.075]),
      );
      break;
  }
  return tail;
}

function buildLegs(ctx: Ctx, body: THREE.Object3D): THREE.Object3D[] {
  const d = ctx.d;
  const spec = ctx.spec;
  const lr = d.legRadius;
  const base = ctx.mat(spec.baseColor);
  const sockPattern = spec.markingPattern === "socks";
  const pawColor = sockPattern || spec.markingPattern === "tuxedo" ? spec.secondaryColor : spec.baseColor;
  const paw = ctx.mat(pawColor);
  const sock = ctx.mat(spec.secondaryColor);
  const hipLocalY = d.hipY - d.bodyY;
  const legs: THREE.Object3D[] = [];
  const defs: [string, number, number][] = [
    ["legFL", 1, d.frontHipZ],
    ["legFR", -1, d.frontHipZ],
    ["legBL", 1, d.backHipZ],
    ["legBR", -1, d.backHipZ],
  ];
  for (const [name, side, z] of defs) {
    const back = name.startsWith("legB");
    const p = pivot(name, side * d.hipX, hipLocalY, z);
    const h = d.hipY;
    if (back && d.arch.haunches) {
      // Rabbit: a big haunch and a long flat foot.
      const hr = d.bodyRadius * 0.62;
      p.add(ctx.mesh(ctx.sphere(hr, 20, 16), base, `${name}Haunch`, name, [side * 0.01, 0.03, 0.03], [0.5, 0.82, 0.95]));
      p.add(
        ctx.mesh(ctx.sphere(lr * 1.15, 16, 12), paw, `${name}Paw`, name, [side * 0.02, -h + lr * 0.7, lr * 0.9], [1, 0.62, 2.1]),
      );
    } else {
      const lrr = d.arch.haunches ? lr * 0.85 : lr;
      const len = Math.max(0.001, h - 2 * lrr);
      const g = ctx.geo(new THREE.CapsuleGeometry(lrr, len, 6, 14));
      p.add(ctx.mesh(g, base, `${name}Mesh`, name, [0, -h / 2, 0]));
      if (sockPattern) {
        const sg = ctx.geo(new THREE.CapsuleGeometry(lrr * 1.06, Math.max(0.001, h * 0.35), 6, 14));
        p.add(ctx.mesh(sg, sock, `${name}Sock`, name, [0, -h + lrr + h * 0.175, 0]));
      }
      p.add(
        ctx.mesh(ctx.sphere(lrr * 1.14, 16, 12), paw, `${name}Paw`, name, [0, -h + lrr * 0.78, lrr * 0.25], [1, 0.7, 1.2]),
      );
    }
    body.add(p);
    legs.push(p);
  }
  return legs;
}

function buildCollar(ctx: Ctx): THREE.Object3D {
  const d = ctx.d;
  const c = pivot("collar", 0, d.neckY - d.bodyY - 0.015, d.neckZ - 0.02);
  const cr = d.bodyRadius * 0.84;
  const ring = ctx.mesh(
    ctx.geo(new THREE.TorusGeometry(cr, 0.028, 10, 36)),
    ctx.mat(ctx.spec.collar.color),
    "collarMesh",
    "collar",
  );
  ring.rotation.x = Math.PI / 2 - 0.55;
  c.add(ring);
  const tagY = -Math.sin(0.55) * cr;
  const tagZ = Math.cos(0.55) * cr;
  c.add(ctx.mesh(ctx.sphere(0.03, 14, 10), ctx.mat(GOLD), "collarTag", "collar", [0, tagY - 0.03, tagZ + 0.004]));
  return c;
}

/** Head frame for a built pet, used by accessories. */
function headFrame(d: PetDims): HeadFrame {
  const R = d.headRadius;
  const a = d.arch;
  return { hc: new THREE.Vector3(0, R * a.headLift, R * a.headForward), R, s: d.headScale };
}

function buildAccessory(ctx: Ctx, kind: Exclude<Accessory, "none">): { obj: THREE.Object3D; parent: "head" | "body" } {
  const d = ctx.d;
  const f = headFrame(d);
  const R = f.R;
  const acc = pivot("accessory");
  if (kind === "hat") {
    const straw = ctx.mat("#f3d58c");
    const band = ctx.mat("#ef7f7f");
    acc.position.copy(surf(f, 0, 1.25, 0.86));
    acc.rotation.set(-0.12, 0, 0.14);
    acc.add(ctx.mesh(ctx.geo(new THREE.CylinderGeometry(R * 0.72, R * 0.74, R * 0.05, 36)), straw, "hatBrim", "accessory"));
    acc.add(ctx.mesh(ctx.sphere(R * 0.4, 28, 16), straw, "hatCrown", "accessory", [0, R * 0.08, 0], [1, 0.72, 1]));
    acc.add(ctx.mesh(ctx.geo(new THREE.CylinderGeometry(R * 0.405, R * 0.41, R * 0.1, 32)), band, "hatBand", "accessory", [0, R * 0.06, 0]));
    return { obj: acc, parent: "head" };
  }
  if (kind === "bow") {
    const pink = ctx.mat("#ff9ec4");
    acc.position.copy(surf(f, -0.62, 0.72, 0.98));
    faceOut(acc, surfNormal(f, -0.62, 0.72));
    const lobe = ctx.sphere(R * 0.17, 16, 12);
    const l = ctx.mesh(lobe, pink, "bowL", "accessory", [R * 0.17, 0, 0], [1.1, 0.75, 0.5]);
    l.rotation.z = 0.3;
    const r = ctx.mesh(lobe, pink, "bowR", "accessory", [-R * 0.17, 0, 0], [1.1, 0.75, 0.5]);
    r.rotation.z = -0.3;
    acc.add(l, r, ctx.mesh(ctx.sphere(R * 0.08, 12, 10), ctx.mat("#ff7fb0"), "bowKnot", "accessory", [0, 0, R * 0.03]));
    return { obj: acc, parent: "head" };
  }
  // Bandana: a soft triangle on the chest plus a band around the neck.
  const red = ctx.mat("#ff8f8f");
  acc.position.set(0, d.neckY - d.bodyY - 0.02, d.neckZ - 0.01);
  const cr = d.bodyRadius * 0.88;
  const band = ctx.mesh(ctx.geo(new THREE.TorusGeometry(cr, 0.032, 10, 36)), red, "bandanaBand", "accessory");
  band.rotation.x = Math.PI / 2 - 0.55;
  acc.add(band);
  const shape = new THREE.Shape();
  const w = d.bodyRadius * 0.62;
  const h = d.bodyRadius * 0.72;
  shape.moveTo(-w, 0);
  shape.lineTo(w, 0);
  shape.quadraticCurveTo(w * 0.15, -h * 0.55, 0, -h);
  shape.quadraticCurveTo(-w * 0.15, -h * 0.55, -w, 0);
  const tri = ctx.geo(
    new THREE.ExtrudeGeometry(shape, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.012, bevelSegments: 3, curveSegments: 12 }),
  );
  const tm = ctx.mesh(tri, red, "bandanaCloth", "accessory");
  tm.position.set(0, -Math.sin(0.55) * cr + 0.015, Math.cos(0.55) * cr - 0.02);
  tm.rotation.x = 0.32;
  acc.add(tm);
  return { obj: acc, parent: "body" };
}

function disposeList(geos: THREE.BufferGeometry[]): void {
  for (const g of geos) g.dispose();
}

/**
 * Swaps the pet's accessory (quest rewards equip a bandana, then a hat). Removes the old one
 * and disposes its geometry. Materials are shared from the toon cache and are not disposed.
 */
export function setAccessory(group: THREE.Object3D, kind: Accessory, spec?: PetSpec): void {
  const data = petData(group);
  const old = data.pivots.accessory;
  if (old) {
    old.parent?.remove(old);
    disposeList((old.userData.geometries as THREE.BufferGeometry[] | undefined) ?? []);
    delete data.pivots.accessory;
  }
  if (kind === "none") return;
  const s = spec ?? data.spec;
  const ctx = new Ctx(s, data.dims);
  const { obj, parent } = buildAccessory(ctx, kind);
  obj.userData.geometries = ctx.geometries;
  applyBend(obj);
  data.pivots[parent].add(obj);
  data.pivots.accessory = obj;
}

/** Builds a pet from a spec. Pure: no globals are touched besides shared material caches. */
export function buildPet(spec: PetSpec): THREE.Group {
  const d = petDims(spec);
  const ctx = new Ctx(spec, d);
  const a = d.arch;

  const group = new THREE.Group();
  group.name = "pet";
  group.scale.setScalar(d.scale);
  const rig = pivot("rig");
  group.add(rig);

  // Torso.
  const textured = hasTexture(spec);
  const tex = textured ? markingTextures(spec) : null;
  const bodyMat = tex ? toonMaterial({ map: tex.body, soft: d.soft }) : ctx.mat(spec.baseColor);
  const headMat = tex ? toonMaterial({ map: tex.head, soft: d.soft }) : ctx.mat(spec.baseColor);
  if (tex) ctx.materials.push(bodyMat, headMat);

  const body = pivot("body", 0, d.bodyY, 0);
  rig.add(body);
  const torsoGeo = ctx.geo(new THREE.CapsuleGeometry(d.bodyRadius, d.bodyLength, 12, 32, 2));
  torsoGeo.rotateX(Math.PI / 2);
  const torso = ctx.mesh(torsoGeo, bodyMat, "torso", "body", [0, 0, 0], [d.bodyScaleX, d.bodyScaleY, 1]);
  body.add(torso);

  const legs = buildLegs(ctx, body);
  const tail = buildTail(ctx);
  body.add(tail);

  // Head.
  const f = headFrame(d);
  const head = pivot("head", 0, d.neckY - d.bodyY, d.neckZ);
  head.rotation.x = a.headTilt;
  body.add(head);
  head.add(ctx.mesh(ctx.sphere(f.R, 40, 30), headMat, "headMesh", "head", [f.hc.x, f.hc.y, f.hc.z], d.headScale));
  const [eyeL, eyeR] = buildEyes(ctx, head, f);
  const { muzzle, nose } = buildMuzzle(ctx, head, f);
  // Blush cheeks.
  const blushGeo = ctx.sphere(f.R * 0.13, 16, 10);
  for (const side of [1, -1]) {
    const az = side * (a.eyeAzimuth + 0.36);
    const el = a.eyeElevation - 0.36;
    const b = ctx.mesh(blushGeo, ctx.mat(BLUSH), side > 0 ? "blushL" : "blushR", "head", undefined, [1.25, 0.7, 0.3]);
    b.position.copy(surf(f, az, el, 0.985));
    faceOut(b, surfNormal(f, az, el));
    head.add(b);
  }
  const earL = buildEar(ctx, 1, f);
  const earR = buildEar(ctx, -1, f);
  head.add(earL, earR);

  const pivots: PetPivots = {
    rig,
    torso,
    body,
    head,
    muzzle,
    eyeL,
    eyeR,
    nose,
    earL,
    earR,
    legFL: legs[0],
    legFR: legs[1],
    legBL: legs[2],
    legBR: legs[3],
    tail,
  };
  if (spec.collar.present) {
    const collar = buildCollar(ctx);
    body.add(collar);
    pivots.collar = collar;
  }

  const data: PetUserData = {
    height: 0,
    radius: 0,
    eyeHeight: 0,
    headTopY: 0,
    pivots,
    spec,
    dims: d,
    owned: { geometries: ctx.geometries, materials: ctx.materials },
  };
  group.userData = data;

  if (spec.accessory !== "none") setAccessory(group, spec.accessory, spec);

  applyBend(group);

  // Metrics in the parent frame (size scale applied).
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  data.height = box.max.y;
  data.radius = Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z);
  const tmp = new THREE.Vector3();
  data.eyeHeight = eyeL.getWorldPosition(tmp).y;
  const top = new THREE.Vector3(f.hc.x, f.hc.y + f.R * f.s[1], f.hc.z);
  data.headTopY = head.localToWorld(top).y;
  return group;
}

/** Frees every geometry and per-pet material a build created. Shared toon materials stay. */
export function disposePet(group: THREE.Object3D): void {
  const data = petData(group);
  disposeList(data.owned.geometries);
  for (const m of data.owned.materials) m.dispose();
  const acc = data.pivots.accessory;
  if (acc) disposeList((acc.userData.geometries as THREE.BufferGeometry[] | undefined) ?? []);
}

/** Meshes grouped by reveal part, in draw-in order (body first, face details last). */
export const REVEAL_ORDER = [
  "body",
  "legBL",
  "legBR",
  "legFL",
  "legFR",
  "tail",
  "collar",
  "head",
  "earL",
  "earR",
  "muzzle",
  "nose",
  "eyes",
  "accessory",
] as const;

export function partsForReveal(group: THREE.Object3D): THREE.Mesh[][] {
  const byPart = new Map<string, THREE.Mesh[]>();
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const part = (m.userData.part as string | undefined) ?? "body";
    let list = byPart.get(part);
    if (!list) {
      list = [];
      byPart.set(part, list);
    }
    list.push(m);
  });
  const out: THREE.Mesh[][] = [];
  for (const p of REVEAL_ORDER) {
    const list = byPart.get(p);
    if (list) {
      out.push(list);
      byPart.delete(p);
    }
  }
  for (const list of byPart.values()) out.push(list);
  return out;
}
