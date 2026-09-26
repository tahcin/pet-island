import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { toonMaterial } from "../render/toon";
import { bendDepthMaterial, type BendOptions } from "../render/bend";
import type { PropInstance, PropType } from "./placement";
import type { WorldData } from "./generateWorld";

/**
 * Instanced primitive props (PRD 7.4 fallback): one InstancedMesh per part, all toon and bent.
 * Foliage sways in the wind (F18) and everything pops in from spawn (PRD 7.2 step 12).
 */

// Wind: displace by height so bases stay planted; phase from the instance position.
export const WIND: BendOptions = {
  key: "wind",
  vertexHook: /* glsl */ `
#ifdef USE_INSTANCING
  vec3 windP = instanceMatrix[3].xyz;
#else
  vec3 windP = vec3(0.0);
#endif
  float windK = max(transformed.y, 0.0);
  windK = windK * windK * 0.012;
  transformed.x += sin(uTime * 1.7 + windP.x * 0.31 + windP.z * 0.17) * windK;
  transformed.z += cos(uTime * 1.3 + windP.z * 0.27 - windP.x * 0.11) * windK * 0.7;
`,
};

type Geo = THREE.BufferGeometry;

function sphere(r: number, x: number, y: number, z: number, sy = 1, seg = 14): Geo {
  const g = new THREE.SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.75)));
  g.scale(1, sy, 1);
  g.translate(x, y, z);
  return g;
}
function cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, seg = 10): Geo {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1);
  g.translate(x, y + h / 2, z);
  return g;
}
function cone(r: number, h: number, y: number): Geo {
  const g = new THREE.ConeGeometry(r, h, 14, 1);
  g.translate(0, y + h / 2, 0);
  return g;
}
function merge(parts: Geo[]): Geo {
  // Primitive normals are already transformed, so merged shapes keep smooth shading.
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  g.computeBoundingSphere();
  return g;
}

const BLOOMS: [number, number][] = [
  [0, 0],
  [0.28, 0.16],
  [-0.2, 0.24],
  [0.08, -0.28],
];

function hemi(r: number, x: number, y: number, z: number): Geo {
  const g = new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, 0.75, 1);
  g.translate(x, y, z);
  return g;
}

function rockGeometry(): Geo {
  const g = new THREE.SphereGeometry(0.72, 11, 8);
  const p = g.attributes.position;
  // Deterministic bumps keep rocks lumpy but soft.
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k);
    const y = p.getY(k);
    const z = p.getZ(k);
    const n = 1 + 0.08 * Math.sin(x * 5.1 + z * 3.7) + 0.06 * Math.cos(y * 6.3 - x * 2.2);
    p.setXYZ(k, x * n, y * n, z * n);
  }
  g.scale(1, 0.62, 0.85);
  g.translate(0, 0.22, 0);
  g.computeVertexNormals();
  return g;
}

function palmLeaves(): Geo {
  const leaves: Geo[] = Array.from({ length: 7 }, (_, k) => {
    const g = new THREE.SphereGeometry(0.5, 10, 6);
    g.scale(2.2, 0.16, 0.6);
    g.translate(1.0, 0, 0);
    g.rotateZ(-0.38);
    g.rotateY((k / 7) * Math.PI * 2);
    g.translate(0.58, 3.72, 0);
    return g;
  });
  leaves.push(sphere(0.3, 0.58, 3.7, 0, 1, 10));
  return merge(leaves);
}

const GEO = {
  trunk: merge([cyl(0.15, 0.24, 1.5, 0, 0, 0)]),
  canopy: merge([
    sphere(1.05, 0, 2.15, 0),
    sphere(0.75, 0.7, 1.85, 0.25),
    sphere(0.78, -0.62, 1.9, -0.2),
    sphere(0.7, 0.1, 1.85, -0.72),
    sphere(0.66, -0.05, 1.8, 0.72),
    sphere(0.62, 0.15, 2.85, 0.05),
  ]),
  fruit: merge([
    sphere(0.14, 0.95, 1.95, 0.45, 1, 8),
    sphere(0.14, -0.9, 2.15, 0.35, 1, 8),
    sphere(0.14, 0.35, 2.3, 1.05, 1, 8),
    sphere(0.14, -0.35, 1.75, -0.95, 1, 8),
    sphere(0.14, 0.6, 2.7, -0.55, 1, 8),
  ]),
  pineTrunk: merge([cyl(0.13, 0.2, 1.0, 0, 0, 0)]),
  pine: merge([cone(1.25, 1.5, 0.75), cone(1.0, 1.3, 1.6), cone(0.72, 1.15, 2.4), sphere(0.22, 0, 3.55, 0, 1, 8)]),
  palmTrunk: merge([
    cyl(0.17, 0.22, 1.0, 0, 0, 0),
    cyl(0.15, 0.18, 1.0, 0.12, 0.95, 0),
    cyl(0.13, 0.16, 1.0, 0.3, 1.9, 0),
    cyl(0.12, 0.14, 0.9, 0.52, 2.85, 0),
  ]),
  palmLeaves: palmLeaves(),
  bush: merge([sphere(0.58, 0, 0.45, 0), sphere(0.44, 0.5, 0.33, 0.1), sphere(0.46, -0.46, 0.35, -0.08), sphere(0.36, 0.05, 0.3, 0.48)]),
  rock: rockGeometry(),
  stem: merge(BLOOMS.map(([x, z], k) => cyl(0.028, 0.035, 0.42 + (k % 2) * 0.1, x, 0, z, 5))),
  petals: merge(
    BLOOMS.flatMap(([x, z], k) =>
      Array.from({ length: 5 }, (_, a) => {
        const ang = (a / 5) * Math.PI * 2 + k;
        return sphere(0.085, x + Math.cos(ang) * 0.1, 0.44 + (k % 2) * 0.1, z + Math.sin(ang) * 0.1, 0.55, 8);
      }),
    ),
  ),
  centers: merge(BLOOMS.map(([x, z], k) => sphere(0.06, x, 0.46 + (k % 2) * 0.1, z, 0.7, 8))),
  mushStem: merge([cyl(0.07, 0.09, 0.26, 0, 0, 0, 8), cyl(0.05, 0.07, 0.18, 0.25, 0, 0.12, 8)]),
  mushCap: merge([hemi(0.2, 0, 0.24, 0), hemi(0.14, 0.25, 0.16, 0.12)]),
};

const white = (bend?: BendOptions) => toonMaterial({ color: "#ffffff", bend });
const MAT = {
  trunk: toonMaterial({ color: "#b58360" }),
  canopy: white(WIND),
  fruit: white(WIND),
  pine: white(WIND),
  palmTrunk: toonMaterial({ color: "#d2a877" }),
  palmLeaves: toonMaterial({ color: "#86cf6e", bend: WIND }),
  bush: white(WIND),
  rock: toonMaterial({ color: "#c4bdb3" }),
  stem: toonMaterial({ color: "#6fba5c", bend: WIND }),
  petals: white(WIND),
  centers: toonMaterial({ color: "#ffe28a", bend: WIND }),
  mushStem: toonMaterial({ color: "#fff1dc" }),
  mushCap: white(),
};

const CANOPY_GREENS = ["#8fd67a", "#7fcf7f", "#a3dc7c"];
const PINE_GREENS = ["#6cc08a", "#78c77a"];
const BUSH_GREENS = ["#84cf74", "#9bd98a", "#76c585"];
const FRUIT_COLORS = ["#ff8f8f", "#ffb36b", "#ff9ec7"];
const FLOWER_COLORS = ["#ffb3c7", "#fff0a3", "#ffffff", "#d7b8ff", "#ffc49e"];
const CAP_COLORS = ["#f08878", "#e9a86b"];

interface PartDef {
  name: string;
  geo: Geo;
  mat: THREE.MeshToonMaterial;
  types: PropType[];
  shadow: boolean;
  sway: boolean;
  color?: (p: PropInstance) => string;
}

const PARTS: PartDef[] = [
  { name: "trunk", geo: GEO.trunk, mat: MAT.trunk, types: ["tree", "fruitTree"], shadow: true, sway: false },
  { name: "canopy", geo: GEO.canopy, mat: MAT.canopy, types: ["tree", "fruitTree"], shadow: true, sway: true, color: (p) => CANOPY_GREENS[p.variant % 3] },
  { name: "fruit", geo: GEO.fruit, mat: MAT.fruit, types: ["fruitTree"], shadow: false, sway: true, color: (p) => FRUIT_COLORS[p.variant % 3] },
  { name: "pineTrunk", geo: GEO.pineTrunk, mat: MAT.trunk, types: ["pine"], shadow: true, sway: false },
  { name: "pine", geo: GEO.pine, mat: MAT.pine, types: ["pine"], shadow: true, sway: true, color: (p) => PINE_GREENS[p.variant % 2] },
  { name: "palmTrunk", geo: GEO.palmTrunk, mat: MAT.palmTrunk, types: ["palm"], shadow: true, sway: false },
  { name: "palmLeaves", geo: GEO.palmLeaves, mat: MAT.palmLeaves, types: ["palm"], shadow: true, sway: true },
  { name: "bush", geo: GEO.bush, mat: MAT.bush, types: ["bush"], shadow: true, sway: true, color: (p) => BUSH_GREENS[p.variant % 3] },
  { name: "rock", geo: GEO.rock, mat: MAT.rock, types: ["rock"], shadow: true, sway: false },
  { name: "stem", geo: GEO.stem, mat: MAT.stem, types: ["flower"], shadow: false, sway: true },
  { name: "petals", geo: GEO.petals, mat: MAT.petals, types: ["flower"], shadow: false, sway: true, color: (p) => FLOWER_COLORS[p.variant % FLOWER_COLORS.length] },
  { name: "centers", geo: GEO.centers, mat: MAT.centers, types: ["flower"], shadow: false, sway: true },
  { name: "mushStem", geo: GEO.mushStem, mat: MAT.mushStem, types: ["mushroom"], shadow: false, sway: false },
  { name: "mushCap", geo: GEO.mushCap, mat: MAT.mushCap, types: ["mushroom"], shadow: false, sway: false, color: (p) => CAP_COLORS[p.variant % 2] },
];

/** Back-out ease: overshoots a little, then settles at 1. */
export function backOut(t: number): number {
  const c = 1.9;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

export const POP_DURATION = 0.45;

interface Built {
  meshes: THREE.InstancedMesh[];
  /** Per mesh: indices into the props array. */
  owners: number[][];
  delays: Float32Array;
  maxDelay: number;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const tmpC = new THREE.Color();

function writeMatrices(b: Built, props: PropInstance[], elapsed: number): void {
  for (let m = 0; m < b.meshes.length; m++) {
    const mesh = b.meshes[m];
    const own = b.owners[m];
    for (let k = 0; k < own.length; k++) {
      const p = props[own[k]];
      const t = Math.min(1, Math.max(0, (elapsed - b.delays[own[k]]) / POP_DURATION));
      const s = p.scale * (t <= 0 ? 0.0001 : backOut(t));
      tmpQ.setFromAxisAngle(UP, p.rotY);
      tmpP.set(p.x, p.y - 0.05, p.z);
      tmpS.set(s, s, s);
      tmpM.compose(tmpP, tmpQ, tmpS);
      mesh.setMatrixAt(k, tmpM);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
}

export default function Props({ world }: { world: WorldData }) {
  const props = world.props;
  const spawn = world.spawn;
  const built = useMemo<Built>(() => {
    const delays = new Float32Array(props.length);
    let maxDelay = 0;
    props.forEach((p, i) => {
      const d = 0.2 + Math.hypot(p.x - spawn.x, p.z - spawn.z) / 90;
      delays[i] = d;
      maxDelay = Math.max(maxDelay, d);
    });
    const meshes: THREE.InstancedMesh[] = [];
    const owners: number[][] = [];
    for (const part of PARTS) {
      const own: number[] = [];
      props.forEach((p, i) => {
        if (part.types.includes(p.type)) own.push(i);
      });
      if (own.length === 0) continue;
      const mesh = new THREE.InstancedMesh(part.geo, part.mat, own.length);
      mesh.name = `props-${part.name}`;
      mesh.frustumCulled = false;
      mesh.castShadow = part.shadow;
      mesh.receiveShadow = true;
      mesh.customDepthMaterial = bendDepthMaterial(part.sway ? WIND : {});
      const colorOf = part.color;
      if (colorOf) {
        own.forEach((idx, k) => mesh.setColorAt(k, tmpC.set(colorOf(props[idx]))));
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      meshes.push(mesh);
      owners.push(own);
    }
    const b: Built = { meshes, owners, delays, maxDelay };
    writeMatrices(b, props, 0);
    return b;
  }, [props, spawn]);

  useEffect(() => () => built.meshes.forEach((m) => m.dispose()), [built]);

  const start = useRef<number | null>(null);
  const done = useRef(false);
  useEffect(() => {
    start.current = null;
    done.current = false;
  }, [built]);

  useFrame((state) => {
    if (done.current) return;
    const now = state.clock.elapsedTime;
    if (start.current === null) start.current = now;
    const elapsed = now - start.current;
    writeMatrices(built, props, elapsed);
    if (elapsed > built.maxDelay + POP_DURATION) done.current = true;
  });

  return (
    <group name="props">
      {built.meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </group>
  );
}
