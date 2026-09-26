import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGame } from "../store";
import { generateWorld, heightAt, type WorldData } from "../world/generateWorld";
import Terrain from "../world/Terrain";
import Water from "../world/Water";
import SkyDome, { SKY_COLOR } from "../render/SkyDome";
import Lights from "../render/Lights";
import { applyBend, bendUniforms } from "../render/bend";
import { toonMaterial } from "../render/toon";
import FollowCamera from "../control/FollowCamera";
import CharacterController from "../control/CharacterController";
import { useInput } from "../control/useInput";
import { resetBody, runtime } from "../game/runtime";
import { applyShot, readShot } from "./shots";
import Pet from "../pet/Pet";

const capsuleMaterial = toonMaterial({ color: "#ffc9a8" });
const capsuleGeometry = new THREE.CapsuleGeometry(0.35, 0.6, 8, 16);

function Placeholder() {
  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    if (ref.current) applyBend(ref.current);
  }, []);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const b = runtime.avatar;
    g.position.copy(b.pos);
    g.rotation.y = b.yaw;
  });
  return (
    <group ref={ref}>
      <mesh geometry={capsuleGeometry} material={capsuleMaterial} position={[0, 0.65, 0]} castShadow />
    </group>
  );
}

/** The pet idling at its spawn point, looking at the player. The follow brain arrives in M3. */
function IslandPet() {
  const spec = useGame((s) => s.reading.spec);
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const b = runtime.pet;
    g.position.copy(b.pos);
    const a = runtime.avatar.pos;
    g.rotation.y = Math.atan2(a.x - b.pos.x, a.z - b.pos.z);
  });
  return <Pet ref={ref} spec={spec} state="idle" />;
}

function Clock() {
  useFrame((_, dt) => {
    bendUniforms.uTime.value += Math.min(dt, 0.1);
  });
  return null;
}

/** Marks the world as rendered after a few frames so screenshot scripts can wait for it. */
function ReadyFlag({ world }: { world: WorldData }) {
  const frames = useRef(0);
  useFrame(() => {
    frames.current++;
    if (frames.current === 20) window.__worldReady = world.seed;
  });
  return null;
}

function spawnCharacters(world: WorldData) {
  const hm = world.heightmap;
  const s = world.spawn;
  resetBody(runtime.avatar, s.x, heightAt(hm, s.x, s.z), s.z, s.yaw);
  const p = world.petSpawn;
  resetBody(runtime.pet, p.x, heightAt(hm, p.x, p.z), p.z, p.yaw);
  runtime.camera.yaw = s.yaw + Math.PI;
  runtime.camera.snap = true;
}

export default function Play() {
  const seed = useGame((s) => s.seed);
  const world = useMemo(() => generateWorld(seed), [seed]);
  const shot = useMemo(() => readShot(), []);
  const wrap = useRef<HTMLDivElement>(null);
  useInput(wrap);
  useMemo(() => {
    spawnCharacters(world);
    if (shot !== null) applyShot(shot, world);
  }, [world, shot]);

  return (
    <div ref={wrap} className="screen" data-testid="play">
      <Canvas
        flat
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, 1.5]}
        camera={{ fov: 42, near: 0.2, far: 600 }}
        gl={{ antialias: true, preserveDrawingBuffer: shot !== null }}
      >
        <color attach="background" args={[SKY_COLOR]} />
        <fog attach="fog" args={[SKY_COLOR, 60, 160]} />
        <SkyDome />
        <Lights focus={runtime.avatar.pos} />
        <Terrain world={world} />
        <Water />
        <Placeholder />
        <IslandPet />
        <CharacterController world={world} getBody={() => runtime.avatar} enabled={shot === null} />
        <FollowCamera world={world} getBody={() => runtime.avatar} />
        <Clock />
        <ReadyFlag world={world} />
      </Canvas>
      {shot === null && (
        <div className="hud-seed" data-testid="seed">
          Seed {seed}
        </div>
      )}
    </div>
  );
}
