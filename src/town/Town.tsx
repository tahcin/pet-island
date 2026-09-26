import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { toonMaterial } from "../render/toon";
import { bendDepthMaterial } from "../render/bend";
import { heightAt, type WorldData } from "../world/generateWorld";
import type { Collider } from "../world/collision";

/** Town plaza look: paved disc, fountain, quest board, lamps, benches, planters, stepping stones. */

const MAT = {
  stone: toonMaterial({ color: "#e8dccb" }),
  stoneDark: toonMaterial({ color: "#cdbca6" }),
  water: toonMaterial({ color: "#8fd3f0", emissive: "#5fb8e0", emissiveIntensity: 0.15 }),
  wood: toonMaterial({ color: "#c08a5c" }),
  woodLight: toonMaterial({ color: "#e8c08f" }),
  paper: toonMaterial({ color: "#fff8ea" }),
  roof: toonMaterial({ color: "#f5a3a3" }),
  lampPost: toonMaterial({ color: "#6f8f9a" }),
  lamp: toonMaterial({ color: "#fff1b8", emissive: "#ffd970", emissiveIntensity: 0.6 }),
  leaf: toonMaterial({ color: "#8fd18a" }),
  flower: toonMaterial({ color: "#ffffff" }),
  plaza: Object.assign(toonMaterial({ vertexColors: true }), { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
};

const GEO = {
  stoneDisc: new THREE.CylinderGeometry(0.55, 0.6, 0.12, 14),
  lampPost: new THREE.CylinderGeometry(0.07, 0.1, 2.4, 8).translate(0, 1.2, 0),
  lampHead: new THREE.SphereGeometry(0.26, 14, 10).translate(0, 2.55, 0),
  lampCap: new THREE.ConeGeometry(0.3, 0.22, 10).translate(0, 2.85, 0),
  benchSeat: new RoundedBoxGeometry(1.6, 0.14, 0.5, 2, 0.05).translate(0, 0.45, 0),
  benchBack: new RoundedBoxGeometry(1.6, 0.45, 0.1, 2, 0.04).translate(0, 0.78, -0.22),
  benchLegs: new THREE.BoxGeometry(1.3, 0.4, 0.35).translate(0, 0.2, 0),
  planter: new RoundedBoxGeometry(1.2, 0.5, 0.6, 2, 0.1).translate(0, 0.25, 0),
  bush: new THREE.SphereGeometry(0.42, 12, 8).scale(1.3, 0.7, 0.7).translate(0, 0.6, 0),
  bloom: new THREE.SphereGeometry(0.12, 8, 6),
};

const BLOOMS = ["#ff9ab0", "#ffd166", "#c7a8f5", "#ffffff", "#ff8f70"];

export const FOUNTAIN_RADIUS = 2.3;

interface Decor {
  board: { x: number; z: number; yaw: number };
  lamps: { x: number; z: number }[];
  benches: { x: number; z: number; yaw: number }[];
  planters: { x: number; z: number; yaw: number }[];
}

/** Deterministic decor spots from the town layout. */
function decor(world: WorldData): Decor {
  const t = world.town;
  const e = t.entranceYaw;
  const at = (a: number, r: number) => ({ x: t.x + Math.sin(a) * r, z: t.z + Math.cos(a) * r });
  const board = { ...at(e + 0.45, 5.2), yaw: e + 0.45 };
  const lamps = Array.from({ length: 6 }, (_, k) => at(e + ((k + 1.5) / 7) * Math.PI * 2, t.plaza + 0.4));
  lamps.push(at(e - 0.35, t.plaza + 0.4), at(e + 0.35, t.plaza + 0.4));
  const benches = [1, 2, 3, 4].map((k) => {
    const a = e + Math.PI * 0.25 + (k / 4) * Math.PI * 2;
    return { ...at(a, 4.2), yaw: a + Math.PI };
  });
  const planters = Array.from({ length: 6 }, (_, k) => {
    const a = e + ((k + 1) / 7) * Math.PI * 2;
    return { ...at(a, t.plaza - 0.9), yaw: a };
  });
  return { board, lamps, benches, planters };
}

export function townColliders(world: WorldData): Collider[] {
  const t = world.town;
  if (!t) return [];
  const d = decor(world);
  const y = (x: number, z: number) => heightAt(world.heightmap, x, z);
  return [
    { x: t.x, z: t.z, r: FOUNTAIN_RADIUS, top: y(t.x, t.z) + 1.4 },
    { x: d.board.x, z: d.board.z, r: 0.7, top: y(d.board.x, d.board.z) + 2.4 },
    ...d.lamps.map((l) => ({ x: l.x, z: l.z, r: 0.15, top: y(l.x, l.z) + 3 })),
  ];
}

/** Plaza disc that follows the terrain, with soft stone rings. */
function plazaGeometry(world: WorldData): THREE.BufferGeometry {
  const t = world.town;
  const rings = 14;
  const segs = 64;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const cA = new THREE.Color("#f3e3c4");
  const cB = new THREE.Color("#e6d2b0");
  const cEdge = new THREE.Color("#d9c29c");
  for (let r = 0; r <= rings; r++) {
    const rad = (r / rings) * t.plaza;
    const c = r === rings ? cEdge : r % 3 === 1 ? cB : cA;
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const x = t.x + Math.sin(a) * rad;
      const z = t.z + Math.cos(a) * rad;
      pos.push(x, heightAt(world.heightmap, x, z) + 0.14, z);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * (segs + 1) + s;
      const b = a + segs + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], colors?: string[]): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, mats.length));
  m.count = mats.length;
  mats.forEach((x, i) => m.setMatrixAt(i, x));
  if (colors) colors.forEach((c, i) => m.setColorAt(i, new THREE.Color(c)));
  m.frustumCulled = false;
  m.castShadow = true;
  m.receiveShadow = true;
  m.customDepthMaterial = bendDepthMaterial();
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  return m;
}

const mtx = (x: number, y: number, z: number, yaw = 0, s = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(s, s, s));

export default function Town({ world }: { world: WorldData }) {
  const built = useMemo(() => {
    const t = world.town;
    const hy = (x: number, z: number) => heightAt(world.heightmap, x, z);
    const d = decor(world);
    const plaza = new THREE.Mesh(plazaGeometry(world), MAT.plaza);
    plaza.receiveShadow = true;
    plaza.frustumCulled = false;
    const meshes: THREE.Object3D[] = [plaza];
    const stones = t.stones.map((s, i) => mtx(s.x, hy(s.x, s.z) + 0.03, s.z, i, 0.8 + (i % 3) * 0.12));
    meshes.push(instanced(GEO.stoneDisc, MAT.stoneDark, stones));
    const lampM = d.lamps.map((l) => mtx(l.x, hy(l.x, l.z), l.z));
    meshes.push(instanced(GEO.lampPost, MAT.lampPost, lampM), instanced(GEO.lampHead, MAT.lamp, lampM), instanced(GEO.lampCap, MAT.lampPost, lampM));
    const benchM = d.benches.map((b) => mtx(b.x, hy(b.x, b.z) + 0.05, b.z, b.yaw));
    meshes.push(instanced(GEO.benchSeat, MAT.woodLight, benchM), instanced(GEO.benchBack, MAT.woodLight, benchM), instanced(GEO.benchLegs, MAT.wood, benchM));
    const planterM = d.planters.map((p) => mtx(p.x, hy(p.x, p.z) + 0.05, p.z, p.yaw));
    meshes.push(instanced(GEO.planter, MAT.wood, planterM), instanced(GEO.bush, MAT.leaf, planterM));
    const bloomM: THREE.Matrix4[] = [];
    const bloomC: string[] = [];
    d.planters.forEach((p, k) => {
      for (let j = 0; j < 5; j++) {
        const off = (j - 2) * 0.22;
        const x = p.x + Math.cos(p.yaw) * off;
        const z = p.z - Math.sin(p.yaw) * off;
        bloomM.push(mtx(x, hy(p.x, p.z) + 0.95 + (j % 2) * 0.08, z));
        bloomC.push(BLOOMS[(k + j) % BLOOMS.length]);
      }
    });
    meshes.push(instanced(GEO.bloom, MAT.flower, bloomM, bloomC));

    // Fountain: stone basin, water, pillar, and a top bowl.
    const f = new THREE.Group();
    f.position.set(t.x, hy(t.x, t.z), t.z);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.y = y;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      f.add(m);
    };
    add(new THREE.CylinderGeometry(FOUNTAIN_RADIUS, FOUNTAIN_RADIUS + 0.15, 0.6, 32), MAT.stone, 0.3);
    add(new THREE.CylinderGeometry(FOUNTAIN_RADIUS - 0.25, FOUNTAIN_RADIUS - 0.25, 0.08, 32), MAT.water, 0.58);
    add(new THREE.CylinderGeometry(0.25, 0.35, 1.3, 14), MAT.stone, 1.1);
    add(new THREE.CylinderGeometry(0.85, 0.35, 0.3, 20), MAT.stone, 1.8);
    add(new THREE.CylinderGeometry(0.7, 0.7, 0.06, 20), MAT.water, 1.94);
    add(new THREE.SphereGeometry(0.22, 12, 10), MAT.water, 2.15);
    meshes.push(f);

    // Quest noticeboard.
    const b = new THREE.Group();
    b.position.set(d.board.x, hy(d.board.x, d.board.z), d.board.z);
    b.rotation.y = d.board.yaw;
    const part = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.frustumCulled = false;
      b.add(m);
    };
    const post = new THREE.CylinderGeometry(0.08, 0.1, 2.1, 8);
    part(post, MAT.wood, -0.75, 1.05, 0);
    part(post, MAT.wood, 0.75, 1.05, 0);
    part(new RoundedBoxGeometry(1.8, 1.1, 0.14, 2, 0.05), MAT.woodLight, 0, 1.45, 0);
    part(new RoundedBoxGeometry(0.5, 0.6, 0.03, 1, 0.02), MAT.paper, -0.45, 1.5, 0.09);
    part(new RoundedBoxGeometry(0.45, 0.4, 0.03, 1, 0.02), MAT.paper, 0.2, 1.62, 0.09);
    part(new RoundedBoxGeometry(0.4, 0.35, 0.03, 1, 0.02), MAT.lamp, 0.55, 1.2, 0.09);
    part(new RoundedBoxGeometry(2.1, 0.16, 0.5, 2, 0.06), MAT.roof, 0, 2.12, 0);
    meshes.push(b);
    return meshes;
  }, [world]);

  useEffect(
    () => () => {
      for (const o of built) {
        o.traverse((c) => {
          if (c instanceof THREE.Mesh && !Object.values(GEO).includes(c.geometry)) c.geometry.dispose();
        });
      }
    },
    [built],
  );

  return (
    <group name="town">
      {built.map((o) => (
        <primitive key={o.uuid} object={o} />
      ))}
    </group>
  );
}
