import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const SUN_OFFSET = new THREE.Vector3(28, 55, 22);
const SHADOW_RADIUS = 40;
const SHADOW_MAP = 2048;

/**
 * Hemisphere plus one shadow-casting directional light (PRD section 8). The shadow frustum
 * follows the camera focus and snaps to whole texels so shadows do not shimmer.
 */
export default function Lights({ focus }: { focus: THREE.Vector3 }) {
  const sun = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const light = sun.current;
    if (!light) return;
    const cam = light.shadow.camera;
    cam.left = -SHADOW_RADIUS;
    cam.right = SHADOW_RADIUS;
    cam.top = SHADOW_RADIUS;
    cam.bottom = -SHADOW_RADIUS;
    cam.near = 1;
    cam.far = 160;
    cam.updateProjectionMatrix();
  }, []);
  useFrame(({ scene }) => {
    const light = sun.current;
    if (!light) return;
    const texel = (SHADOW_RADIUS * 2) / SHADOW_MAP;
    const x = Math.round(focus.x / texel) * texel;
    const z = Math.round(focus.z / texel) * texel;
    light.target.position.set(x, 0, z);
    light.position.set(x + SUN_OFFSET.x, SUN_OFFSET.y, z + SUN_OFFSET.z);
    if (light.target.parent !== scene) scene.add(light.target);
    light.target.updateMatrixWorld();
  });
  return (
    <>
      <hemisphereLight args={["#bfe3ff", "#ffe1b8", 1.4]} />
      <directionalLight
        ref={sun}
        color="#fff4dc"
        intensity={1.6}
        castShadow
        shadow-mapSize-width={SHADOW_MAP}
        shadow-mapSize-height={SHADOW_MAP}
        shadow-bias={-0.0008}
        shadow-normalBias={0.09}
      />
    </>
  );
}
