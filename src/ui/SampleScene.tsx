import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import Pet from "../pet/Pet";
import { sampleReading } from "../pet/samples";
import { CLAUDE_READING } from "../pet/mascot";
import type { PetAnimState } from "../pet/petAnimator";
import type { PetAnimator } from "../pet/petAnimator";
import { toonColor, toonMaterial } from "../render/toon";
import { BEND_CURVE_DEFAULT, bendUniforms } from "../render/bend";

/** Which companion stands on the sample island. */
export type SampleCharacter = "claude" | "dog";
/** "hero" pushes the diorama right on wide screens so the landing copy sits beside it. */
export type SampleLayout = "hero" | "center";

const reducedMotion =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

const M = {
  grass: toonColor("#a6de8a"),
  grassRim: toonColor("#8dcc74"),
  sand: toonColor("#f6ddab"),
  earth: toonColor("#e8c29a"),
  earthDeep: toonColor("#d2a88a"),
  rock: toonColor("#cbbfd8"),
  trunk: toonColor("#b98a66"),
  leaf: toonColor("#7fcf7a"),
  leafLight: toonColor("#9fe08d"),
  pink: toonColor("#ffb3c1"),
  yellow: toonColor("#ffd66b"),
  cloud: toonColor("#ffffff", true),
  bird: toonColor("#ffffff"),
  water: toonMaterial({ color: "#8fd6f2", flat: true }),
};
const foam = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.75, depthWrite: false });
const shimmer = new THREE.MeshBasicMaterial({ color: "#f2fdff", transparent: true, opacity: 0.5, depthWrite: false });

const G = {
  waterTop: new THREE.CylinderGeometry(2.55, 2.55, 0.1, 64),
  shelf: new THREE.CylinderGeometry(2.7, 2.55, 0.36, 64),
  under: new THREE.ConeGeometry(2.7, 1.7, 9, 1),
  island: new THREE.CylinderGeometry(1.45, 1.62, 0.3, 48),
  islandTop: new THREE.CylinderGeometry(1.2, 1.26, 0.12, 48),
  foam: new THREE.RingGeometry(1.62, 1.78, 64),
  rim: new THREE.TorusGeometry(2.62, 0.05, 8, 96),
  glint: new THREE.RingGeometry(0.1, 0.16, 16),
  trunk: new THREE.CylinderGeometry(0.06, 0.09, 0.5, 8),
  crown: new THREE.SphereGeometry(0.34, 16, 12),
  rock: new THREE.DodecahedronGeometry(0.2, 0),
  flower: new THREE.SphereGeometry(0.055, 8, 6),
  puff: new THREE.SphereGeometry(0.5, 16, 12),
  wing: new THREE.BoxGeometry(0.12, 0.02, 0.2),
  birdBody: new THREE.SphereGeometry(0.07, 10, 8),
};

const GLINTS: [number, number][] = [
  [1.9, 0.9],
  [-2.0, 0.7],
  [0.4, 2.1],
  [-1.1, -1.8],
  [2.1, -0.6],
];

const FLOWERS: [number, number, boolean][] = [
  [-0.9, 0.35, true],
  [-0.75, 0.55, false],
  [0.95, 0.5, true],
  [0.7, 0.75, false],
  [-0.2, 0.95, true],
  [0.35, -0.9, false],
];

function Tree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh geometry={G.trunk} material={M.trunk} position={[0, 0.25, 0]} castShadow />
      <mesh geometry={G.crown} material={M.leaf} position={[0, 0.62, 0]} castShadow />
      <mesh geometry={G.crown} material={M.leafLight} position={[0.1, 0.84, 0.05]} scale={0.66} castShadow />
    </group>
  );
}

function Diorama({ character, anim }: { character: SampleCharacter; anim: PetAnimState }) {
  const animator = useRef<PetAnimator | null>(null);
  const hopIn = useRef(1.2);
  const pet = useRef<THREE.Group>(null);
  const rimRef = useRef<THREE.Mesh>(null);
  const foamRef = useRef<THREE.Mesh>(null);
  const glints = useRef<THREE.Group>(null);
  const spec = useMemo(() => (character === "claude" ? CLAUDE_READING.spec : sampleReading("dog").spec), [character]);
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (pet.current) pet.current.rotation.y = reducedMotion ? 0.2 : Math.sin(t * 0.6) * 0.45 + 0.1;
    if (!reducedMotion) {
      hopIn.current -= dt;
      if (hopIn.current <= 0 && animator.current) {
        animator.current.hop(anim === "happy" ? 1 : 0.8);
        hopIn.current = anim === "happy" ? 0.9 : 1.8 + Math.random() * 1.6;
      }
    }
    shimmer.opacity = 0.35 + Math.sin(t * 2.2) * 0.2;
    if (rimRef.current) rimRef.current.rotation.z = t * 0.1;
    if (foamRef.current) foamRef.current.scale.setScalar(1 + Math.sin(t * 1.6) * 0.025);
    if (glints.current)
      glints.current.children.forEach((g, i) => {
        g.scale.setScalar(0.3 + Math.max(0, Math.sin(t * 1.7 + i * 1.9)));
      });
  });
  return (
    <group>
      <mesh geometry={G.under} material={M.earthDeep} position={[0, -1.29, 0]} rotation={[Math.PI, 0, 0]} />
      <mesh geometry={G.shelf} material={M.earth} position={[0, -0.26, 0]} />
      <mesh geometry={G.waterTop} material={M.water} position={[0, -0.1, 0]} receiveShadow />
      <mesh ref={rimRef} geometry={G.rim} material={shimmer} position={[0, -0.04, 0]} rotation={[Math.PI / 2, 0, 0]} />
      <mesh ref={foamRef} geometry={G.foam} material={foam} position={[0, -0.035, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      <group ref={glints}>
        {GLINTS.map(([x, z], i) => (
          <mesh key={i} geometry={G.glint} material={foam} position={[x, -0.03, z]} rotation={[-Math.PI / 2, 0, 0]} />
        ))}
      </group>
      <mesh geometry={G.island} material={M.sand} position={[0, -0.05, 0]} receiveShadow />
      <mesh geometry={G.islandTop} material={M.grassRim} position={[0, 0.12, 0]} receiveShadow />
      <mesh geometry={G.islandTop} material={M.grass} position={[0, 0.13, 0]} scale={[0.96, 1, 0.96]} receiveShadow />
      <Tree position={[-0.82, 0.18, -0.55]} scale={1.1} />
      <Tree position={[0.9, 0.18, -0.35]} scale={0.85} />
      <Tree position={[-0.25, 0.18, -0.95]} scale={0.7} />
      <mesh geometry={G.rock} material={M.rock} position={[1.35, 0.02, 0.6]} rotation={[0.4, 0.6, 0]} castShadow />
      <mesh geometry={G.rock} material={M.rock} position={[-1.45, 0.0, 0.3]} scale={0.7} rotation={[0.2, 1.2, 0.3]} castShadow />
      {FLOWERS.map(([x, z, pink], i) => (
        <mesh key={i} geometry={G.flower} material={pink ? M.pink : M.yellow} position={[x, 0.22, z]} />
      ))}
      <group ref={pet} position={[0, 0.19, 0.25]} scale={1.25}>
        <Pet
          spec={spec}
          state={anim === "happy" ? "idle" : anim}
          animatorRef={(a) => {
            animator.current = a;
          }}
        />
      </group>
    </group>
  );
}

const CLOUDS: { p: [number, number, number]; s: number; v: number }[] = [
  { p: [-4.5, 1.8, -4], s: 0.9, v: 0.12 },
  { p: [3.6, 2.4, -5], s: 1.2, v: 0.08 },
  { p: [0.5, 3.1, -7], s: 1.4, v: 0.06 },
  { p: [-2.4, -2.0, -3], s: 0.7, v: 0.1 },
  { p: [4.8, -1.2, -2], s: 0.6, v: 0.09 },
];

function Cloud({ p, s, v }: { p: [number, number, number]; s: number; v: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!ref.current || reducedMotion) return;
    const t = state.clock.elapsedTime;
    ref.current.position.x = ((((p[0] + t * v + 8) % 16) + 16) % 16) - 8;
    ref.current.position.y = p[1] + Math.sin(t * 0.5 + p[0]) * 0.08;
  });
  return (
    <group ref={ref} position={p} scale={s}>
      <mesh geometry={G.puff} material={M.cloud} />
      <mesh geometry={G.puff} material={M.cloud} position={[0.55, -0.1, 0]} scale={0.75} />
      <mesh geometry={G.puff} material={M.cloud} position={[-0.55, -0.12, 0.05]} scale={0.7} />
      <mesh geometry={G.puff} material={M.cloud} position={[0.2, 0.25, -0.05]} scale={0.65} />
    </group>
  );
}

function Bird({ radius, height, speed, phase }: { radius: number; height: number; speed: number; phase: number }) {
  const ref = useRef<THREE.Group>(null);
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  useFrame((state) => {
    const t = reducedMotion ? phase : state.clock.elapsedTime * speed + phase;
    if (ref.current) {
      ref.current.position.set(Math.cos(t) * radius, height + Math.sin(t * 2) * 0.12, Math.sin(t) * radius * 0.45 - 0.6);
      ref.current.rotation.y = -t;
    }
    const flap = reducedMotion ? 0.4 : 0.35 + Math.sin(state.clock.elapsedTime * 8 + phase) * 0.55;
    if (left.current) left.current.rotation.x = -flap;
    if (right.current) right.current.rotation.x = flap;
  });
  return (
    <group ref={ref}>
      <mesh geometry={G.birdBody} material={M.bird} scale={[1, 0.8, 0.8]} />
      <group ref={left} position={[0, 0.02, 0.04]}>
        <mesh geometry={G.wing} material={M.bird} position={[0, 0, 0.1]} />
      </group>
      <group ref={right} position={[0, 0.02, -0.04]}>
        <mesh geometry={G.wing} material={M.bird} position={[0, 0, -0.1]} />
      </group>
    </group>
  );
}

/** Frames the floating diorama for the viewport (projection shift, not a world offset, so it stays front-on), bobs it, and eases the camera toward the pointer. */
function Stage({ character, anim, layout }: { character: SampleCharacter; anim: PetAnimState; layout: SampleLayout }) {
  const group = useRef<THREE.Group>(null);
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera);
  const aspect = size.width / Math.max(1, size.height);
  const halfH = Math.tan((15 * Math.PI) / 180) * 8.5;
  const halfW = halfH * aspect;
  const wide = layout === "hero" && aspect > 1.15;
  const narrow = aspect < 0.8;
  const scale = narrow ? Math.min(0.62, halfW / 3.4) : wide ? 0.6 : 0.62;
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const { width: w, height: h } = size;
    if (wide) cam.setViewOffset(w, h, -w * 0.21, h * 0.05, w, h);
    else if (narrow && layout === "hero") cam.setViewOffset(w, h, 0, h * 0.27, w, h);
    else if (narrow) cam.setViewOffset(w, h, 0, -h * 0.2, w, h);
    else cam.setViewOffset(w, h, 0, -h * 0.24, w, h);
    cam.updateProjectionMatrix();
  }, [camera, size, wide, narrow, layout]);
  const look = useRef(new THREE.Vector3(0, 0, 0));
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (group.current) {
      group.current.position.y = reducedMotion ? 0 : Math.sin(t * 0.8) * 0.06;
      group.current.rotation.z = reducedMotion ? 0 : Math.sin(t * 0.5) * 0.015;
    }
    const cam = state.camera;
    const px = reducedMotion ? 0 : state.pointer.x;
    const py = reducedMotion ? 0 : state.pointer.y;
    const k = 1 - Math.exp(-dt * 2.5);
    cam.position.x += (px * 0.6 - cam.position.x) * k;
    cam.position.y += (2.4 + py * 0.35 - cam.position.y) * k;
    look.current.set(0, 0.25, 0);
    cam.lookAt(look.current);
  });
  return (
    <>
      <group ref={group} scale={scale}>
        <Diorama character={character} anim={anim} />
        <Bird radius={3.0} height={2.2} speed={0.45} phase={0} />
        <Bird radius={3.4} height={2.7} speed={0.38} phase={2.4} />
        <Bird radius={3.2} height={2.5} speed={0.42} phase={4.1} />
      </group>
      {CLOUDS.map((c, i) => (
        <Cloud key={i} {...c} />
      ))}
    </>
  );
}

const root = typeof document !== "undefined" ? (document.getElementById("root") ?? undefined) : undefined;

/** The living hero diorama behind the landing and reading screens. */
export default function SampleScene({
  anim = "idle",
  character = "dog",
  layout = "center",
}: {
  anim?: PetAnimState;
  character?: SampleCharacter;
  layout?: SampleLayout;
}) {
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
      gl={{ alpha: true, antialias: true }}
      camera={{ fov: 30, near: 0.1, far: 60, position: [0, 2.2, 8.2] }}
      eventSource={root}
    >
      <hemisphereLight args={["#cfe9ff", "#ffe1c4", 1.5]} />
      <directionalLight
        color="#fff4dc"
        intensity={1.7}
        position={[3, 5, 4]}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-intensity={0.4}
        shadow-bias={-0.0005}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
      />
      <Stage character={character} anim={anim} layout={layout} />
    </Canvas>
  );
}
