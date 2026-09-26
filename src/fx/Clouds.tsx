import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { toonGradient } from "../render/toon";
import { dayClock } from "../juice/dayCycle";

const CLOUDS = 11;
/** Slow drift of the whole cloud ring, radians per second. */
const DRIFT = 0.004;

// Sky elements are not bent (like the sky dome) and ignore fog so they stay crisp and white.
const material = new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: toonGradient, fog: false });
const blob = new THREE.IcosahedronGeometry(1, 2);
const WHITE = new THREE.Color("#ffffff");

function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Puffy toon clouds: blob clusters on a high ring that follows the camera and drifts slowly. */
export default function Clouds() {
  const group = useRef<THREE.Group>(null);
  const mesh = useMemo(() => {
    const r = rand(7);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const mats: THREE.Matrix4[] = [];
    for (let c = 0; c < CLOUDS; c++) {
      const ang = (c / CLOUDS) * Math.PI * 2 + r() * 0.4;
      const dist = 230 + r() * 90;
      const cx = Math.cos(ang) * dist;
      const cz = Math.sin(ang) * dist;
      const cy = 55 + r() * 45;
      const size = 9 + r() * 7;
      const blobs = 4 + Math.floor(r() * 3);
      // Tangent direction so clouds stretch sideways across the view.
      const tx = -Math.sin(ang);
      const tz = Math.cos(ang);
      for (let b = 0; b < blobs; b++) {
        const f = blobs === 1 ? 0 : b / (blobs - 1) - 0.5;
        const along = f * size * 2.6;
        const rad = size * (1 - Math.abs(f) * 0.9) * (0.75 + r() * 0.35);
        p.set(cx + tx * along, cy + rad * 0.25 + r() * size * 0.25, cz + tz * along);
        s.set(rad, rad * 0.78, rad);
        mats.push(m4.compose(p, q, s).clone());
      }
      // Flat base blob.
      p.set(cx, cy - size * 0.05, cz);
      s.set(size * 1.7, size * 0.45, size * 1.1);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ang);
      mats.push(m4.compose(p, q, s).clone());
      q.identity();
    }
    const m = new THREE.InstancedMesh(blob, material, mats.length);
    mats.forEach((mm, i) => m.setMatrixAt(i, mm));
    m.frustumCulled = false;
    m.renderOrder = -9;
    m.name = "clouds";
    return m;
  }, []);
  useEffect(() => () => mesh.dispose(), [mesh]);
  useFrame(({ camera, clock }) => {
    const g = group.current;
    if (!g) return;
    g.position.set(camera.position.x, 0, camera.position.z);
    g.rotation.y = clock.elapsedTime * DRIFT;
    // Warm or dim the clouds with the day look: white by day, tinted at dusk and night.
    material.color.copy(WHITE).lerp(dayClock.look.horizon, 0.28);
    material.emissive.copy(dayClock.look.horizon).multiplyScalar(0.18);
  });
  return (
    <group ref={group}>
      <primitive object={mesh} />
    </group>
  );
}
