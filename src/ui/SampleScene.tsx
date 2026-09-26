import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import Pet from "../pet/Pet";
import { sampleReading } from "../pet/samples";
import type { PetAnimState } from "../pet/petAnimator";
import type { PetAnimator } from "../pet/petAnimator";
import { toonColor } from "../render/toon";
import { BEND_CURVE_DEFAULT, bendUniforms } from "../render/bend";

const grass = toonColor("#9edb86");
const grassRim = toonColor("#86c96f");
const sand = toonColor("#f4dcaa");
const island = new THREE.CylinderGeometry(1.6, 1.75, 0.35, 48);
const islandTop = new THREE.CylinderGeometry(1.25, 1.3, 0.12, 48);

function Turntable({ anim }: { anim: PetAnimState }) {
  const ref = useRef<THREE.Group>(null);
  const animator = useRef<PetAnimator | null>(null);
  const hopIn = useRef(2);
  const spec = useMemo(() => sampleReading("dog").spec, []);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.25;
    hopIn.current -= dt;
    if (hopIn.current <= 0 && animator.current) {
      animator.current.hop(anim === "happy" ? 1 : 0.6);
      hopIn.current = anim === "happy" ? 0.9 : 3.5 + Math.random() * 2;
    }
  });
  return (
    <group ref={ref}>
      <mesh geometry={island} material={sand} position={[0, -0.18, 0]} receiveShadow />
      <mesh geometry={islandTop} material={grassRim} position={[0, 0.0, 0]} receiveShadow />
      <mesh geometry={islandTop} material={grass} position={[0, 0.01, 0]} scale={[0.96, 1, 0.96]} receiveShadow />
      <Pet
        spec={spec}
        state={anim === "happy" ? "idle" : anim}
        position={[0, 0.07, 0]}
        animatorRef={(a) => {
          animator.current = a;
        }}
      />
    </group>
  );
}

/** A small toon island with a sample pet, behind the landing and reading screens. */
export default function SampleScene({ anim = "idle" }: { anim?: PetAnimState }) {
  useEffect(() => {
    bendUniforms.uCurve.value = 0;
    return () => {
      bendUniforms.uCurve.value = BEND_CURVE_DEFAULT;
    };
  }, []);
  return (
    <Canvas
      className="sample-scene"
      flat
      shadows
      dpr={[1, 1.5]}
      camera={{ fov: 30, near: 0.1, far: 50, position: [0, 1.7, 7.4] }}
      onCreated={({ camera }) => camera.lookAt(0, -0.75, 0)}
    >
      <hemisphereLight args={["#bfe3ff", "#ffe1b8", 1.4]} />
      <directionalLight
        color="#fff4dc"
        intensity={1.6}
        position={[2, 4, 3]}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-intensity={0.45}
        shadow-bias={-0.0005}
      />
      <Turntable anim={anim} />
    </Canvas>
  );
}
