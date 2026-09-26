import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { toonMaterial } from "../render/toon";
import { heightAt, slopeAt, type WorldData } from "../world/generateWorld";
import { levelOfHeight } from "../world/heightmap";
import { TERRAIN_COLORS, patchNoise } from "../world/terrainGeometry";
import { rampLocal } from "../world/ramps";
import { gfx } from "./quality";

/** Radius of the camera-following grass patch, in meters. */
const RADIUS = 24;
/** Recenter the patch once the focus drifts this far. */
const RECENTER = 2.5;

// Wind sway: tips bend more than roots, phase varies across the island so it ripples.
const SWAY = /* glsl */ `
vec2 gBase = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
float gPhase = uTime * 1.7 + gBase.x * 0.35 + gBase.y * 0.22;
float gTip = max(position.y, 0.0) * 2.6;
transformed.x += (sin(gPhase) * 0.6 + sin(gPhase * 2.3) * 0.25) * 0.09 * gTip;
transformed.z += cos(gPhase * 0.8) * 0.05 * gTip;
`;

const material = toonMaterial({ bend: { vertexHook: SWAY, key: "grass" } });

/** One small rounded tuft: three plump blades leaning outward. */
function tuftGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const blades = [
    { yaw: 0, lean: 0.25, h: 0.34 },
    { yaw: 2.1, lean: 0.35, h: 0.27 },
    { yaw: 4.2, lean: 0.32, h: 0.24 },
  ];
  for (const b of blades) {
    const g = new THREE.ConeGeometry(0.075, b.h, 5, 1);
    g.translate(0, b.h / 2, 0);
    g.rotateZ(b.lean);
    g.rotateY(b.yaw);
    g.translate(Math.cos(b.yaw) * 0.03, 0, Math.sin(b.yaw) * 0.03);
    parts.push(g);
  }
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  merged.computeVertexNormals();
  // Point normals mostly up so tufts shade like the ground they sit on.
  const n = merged.getAttribute("normal") as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) {
    const v = new THREE.Vector3(n.getX(i) * 0.35, 1, n.getZ(i) * 0.35).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return merged;
}

function hash(i: number, j: number, s: number): number {
  const n = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

const LEVEL_GREENS = [TERRAIN_COLORS.grass1, TERRAIN_COLORS.grass2, TERRAIN_COLORS.grass3].map((c) => new THREE.Color(c));
const LIGHT = new THREE.Color("#b8e79c");
const DARK = new THREE.Color("#5aa955");

/**
 * Stylized grass (one InstancedMesh). Tufts sit on world-fixed jittered cells so they never
 * swim, and only the patch around the camera focus is filled, thinning out with distance.
 */
export default function Grass({ world }: { world: WorldData }) {
  const spacing = 0.62 / Math.sqrt(Math.max(0.05, gfx.grassDensity));
  const cells = Math.ceil((RADIUS * 2) / spacing);
  const capacity = Math.ceil(cells * cells * 0.62);
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(tuftGeometry(), material, capacity);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    m.frustumCulled = false;
    m.receiveShadow = true;
    m.count = 0;
    m.name = "grass";
    return m;
  }, [capacity]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      mesh.dispose();
    },
    [mesh],
  );

  const blocked = useMemo(() => {
    const t = world.town;
    return (x: number, z: number): boolean => {
      const dt = Math.hypot(x - t.x, z - t.z);
      if (dt < t.plaza + 1.2) return true;
      for (const h of world.homes) if (Math.hypot(x - h.x, z - h.z) < 3) return true;
      for (const s of t.stones) if (Math.hypot(x - s.x, z - s.z) < 0.75) return true;
      for (const r of world.ramps) {
        const { along, lateral } = rampLocal(r, x, z);
        if (along > -0.1 && along < 1.1 && lateral < r.halfWidth + 0.3) return true;
      }
      return false;
    };
  }, [world]);

  const center = useRef(new THREE.Vector2(Infinity, Infinity));
  const tmp = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
      e: new THREE.Euler(),
      p: new THREE.Vector3(),
      s: new THREE.Vector3(),
      c: new THREE.Color(),
      dir: new THREE.Vector3(),
    }),
    [],
  );

  const rebuild = (cx: number, cz: number) => {
    const hm = world.heightmap;
    const i0 = Math.floor((cx - RADIUS) / spacing);
    const j0 = Math.floor((cz - RADIUS) / spacing);
    let n = 0;
    for (let j = j0; j < j0 + cells && n < capacity; j++) {
      for (let i = i0; i < i0 + cells && n < capacity; i++) {
        const x = (i + hash(i, j, 1)) * spacing;
        const z = (j + hash(i, j, 2)) * spacing;
        const d = Math.hypot(x - cx, z - cz);
        if (d > RADIUS) continue;
        const fall = 1 - THREE.MathUtils.smoothstep(d, RADIUS * 0.45, RADIUS);
        // Clumpy coverage: soft noise meadows plus a distance falloff.
        const meadow = patchNoise(x * 0.12 + 40, z * 0.12 - 11);
        if (hash(i, j, 3) > fall * (0.35 + meadow * 0.75)) continue;
        const h = heightAt(hm, x, z);
        const level = levelOfHeight(h);
        if (level < 1) continue;
        if (slopeAt(hm, x, z) > 0.35) continue;
        if (blocked(x, z)) continue;
        const sc = (0.75 + hash(i, j, 4) * 0.6) * (0.35 + fall * 0.65);
        tmp.p.set(x, h - 0.03, z);
        tmp.e.set(0, hash(i, j, 5) * Math.PI * 2, 0);
        tmp.q.setFromEuler(tmp.e);
        tmp.s.set(sc, sc * (0.85 + meadow * 0.4), sc);
        tmp.m.compose(tmp.p, tmp.q, tmp.s);
        mesh.setMatrixAt(n, tmp.m);
        const g = patchNoise(x * 0.09, z * 0.09) * 0.65 + patchNoise(x * 0.31 + 17, z * 0.31 - 9) * 0.35;
        tmp.c.copy(LEVEL_GREENS[Math.min(2, level - 1)]);
        if (g > 0.5) tmp.c.lerp(LIGHT, (g - 0.5) * 0.9 + 0.12);
        else tmp.c.lerp(DARK, (0.5 - g) * 0.8);
        tmp.c.offsetHSL((hash(i, j, 6) - 0.5) * 0.02, 0, (hash(i, j, 7) - 0.5) * 0.05);
        mesh.setColorAt(n, tmp.c);
        n++;
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  useFrame(({ camera }) => {
    // Focus: where the view ray meets the ground plane, clamped so high cameras still work.
    camera.getWorldDirection(tmp.dir);
    const t = tmp.dir.y < -0.05 ? Math.min(40, (camera.position.y - 3) / -tmp.dir.y) : 20;
    const fx = camera.position.x + tmp.dir.x * t;
    const fz = camera.position.z + tmp.dir.z * t;
    if (Math.hypot(fx - center.current.x, fz - center.current.y) < RECENTER) return;
    center.current.set(fx, fz);
    rebuild(fx, fz);
  });

  if (gfx.grassDensity <= 0) return null;
  return <primitive object={mesh} />;
}
