import { IS_MOBILE } from "../mobile/device";
import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGame } from "../store";
import { generateWorld, heightAt, type WorldData } from "../world/generateWorld";
import Terrain from "../world/Terrain";
import Water from "../world/Water";
import SkyDome, { SKY_COLOR } from "../render/SkyDome";
import Lights from "../render/Lights";
import { bendUniforms } from "../render/bend";
import FollowCamera from "../control/FollowCamera";
import CharacterController from "../control/CharacterController";
import ModeKeys from "../control/ModeKeys";
import { useInput } from "../control/useInput";
import { resetBody, runtime } from "../game/runtime";
import { Puffs } from "../game/Effects";
import Avatar from "../avatar/Avatar";
import IslandPet from "../pet/IslandPet";
import { PET_BASE_SPEED } from "../pet/petBrain";
import { WALK_SPEED } from "../control/movement";
import Hud from "./Hud";
import { input } from "../control/useInput";
import WorldExtras from "../world/WorldExtras";
import PlayExtras from "../game/PlayExtras";
import PlayOverlay from "../game/PlayOverlay";
import TalkExtras from "../talk/TalkExtras";
import TalkOverlay from "../talk/TalkOverlay";
import JuiceExtras from "../juice/JuiceExtras";
import JuiceOverlay from "../juice/JuiceOverlay";
import { applyShot, readShot } from "./shots";
import Minimap from "./Minimap";
import PauseMenu from "./PauseMenu";
import Journal from "../town/Journal";
import ProgressRoot from "../progress/ProgressRoot";
import TouchControls from "../mobile/TouchControls";

/** Mounted last: drops key presses no system consumed this frame so they never fire late. */
function InputFlush() {
  useFrame(() => input.pressed.clear());
  return null;
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
  runtime.camera.petCam = false;
  runtime.camera.petCamBlend = 0;
  runtime.idleTime = 0;
}

const controlled = () => (useGame.getState().mode === "pet" ? runtime.pet : runtime.avatar);
const petBody = () => runtime.pet;

export default function Play() {
  const seed = useGame((s) => s.seed);
  const mode = useGame((s) => s.mode);
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
        dpr={IS_MOBILE ? [1, 1.25] : [1, 1.5]}
        performance={{ min: 0.6 }}
        camera={{ fov: 42, near: 0.2, far: 600 }}
        gl={{ antialias: true, preserveDrawingBuffer: shot !== null }}
      >
        <color attach="background" args={[SKY_COLOR]} />
        <fog attach="fog" args={[SKY_COLOR, 60, 160]} />
        <SkyDome />
        <Lights focus={runtime.focus} />
        <Terrain world={world} />
        <Water world={world} />
        <CharacterController
          world={world}
          getBody={controlled}
          speedScale={mode === "pet" ? PET_BASE_SPEED / WALK_SPEED : 1}
          enabled={shot === null}
        />
        <IslandPet world={world} />
        <Avatar world={world} />
        <Puffs />
        <WorldExtras world={world} />
        <PlayExtras world={world} />
        <TalkExtras world={world} />
        <JuiceExtras world={world} />
        <ModeKeys world={world} enabled={shot === null} />
        <FollowCamera world={world} getBody={controlled} getPet={petBody} />
        <Clock />
        <ReadyFlag world={world} />
        <InputFlush />
      </Canvas>
      {shot === null && (
        <>
          <Hud />
          <PlayOverlay />
          <TalkOverlay />
          <JuiceOverlay />
          <Minimap world={world} />
          <PauseMenu />
          <Journal />
          <ProgressRoot world={world} />
          <TouchControls />
        </>
      )}
    </div>
  );
}
