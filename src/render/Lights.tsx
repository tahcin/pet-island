import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGame } from "../store";
import { DAY_SECONDS, dayClock, dayLookAt, isShot } from "../juice/dayCycle";

const SUN_OFFSET = new THREE.Vector3(28, 55, 22);
const SUN_DISTANCE = SUN_OFFSET.length();
const SHADOW_RADIUS = 30;
const SHADOW_MAP = 4096;
/** How often the live clock is mirrored into the store (for saves), in seconds. */
const STORE_SYNC = 2;

/**
 * Hemisphere plus one shadow-casting directional light (PRD section 8). The shadow frustum
 * follows the camera focus and snaps to whole texels so shadows do not shimmer. Also runs the
 * day and night clock (F21): light, fog, and background colors blend through pastel keyframes.
 */
export default function Lights({ focus }: { focus: THREE.Vector3 }) {
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const shot = useMemo(() => isShot(), []);
  const sync = useRef({ since: 0, written: -1 });
  const offset = useMemo(() => new THREE.Vector3(), []);
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
  useFrame(({ scene }, dt) => {
    const light = sun.current;
    if (!light) return;

    // Day clock.
    const game = useGame.getState();
    const s = sync.current;
    if (shot) {
      dayClock.t = 0.4;
    } else {
      if (game.timeOfDay !== s.written) dayClock.t = game.timeOfDay;
      if (!game.dayPaused && !game.photoMode) dayClock.t = (dayClock.t + Math.min(dt, 0.1) / DAY_SECONDS) % 1;
      s.since += dt;
      if (s.since > STORE_SYNC || s.written < 0) {
        s.since = 0;
        s.written = dayClock.t;
        game.setTimeOfDay(dayClock.t);
      }
    }
    const look = dayLookAt(dayClock.t, dayClock.look);
    if (shot) offset.copy(SUN_OFFSET);
    else offset.copy(look.sunDir).multiplyScalar(SUN_DISTANCE);

    light.color.copy(look.sun);
    light.intensity = look.sunI;
    const h = hemi.current;
    if (h) {
      h.color.copy(look.hemiSky);
      h.groundColor.copy(look.hemiGround);
      h.intensity = look.hemi;
    }
    if (scene.fog) scene.fog.color.copy(look.horizon);
    if (scene.background instanceof THREE.Color) scene.background.copy(look.horizon);

    const texel = (SHADOW_RADIUS * 2) / SHADOW_MAP;
    const x = Math.round(focus.x / texel) * texel;
    const z = Math.round(focus.z / texel) * texel;
    light.target.position.set(x, 0, z);
    light.position.set(x + offset.x, offset.y, z + offset.z);
    if (light.target.parent !== scene) scene.add(light.target);
    light.target.updateMatrixWorld();
  });
  return (
    <>
      <hemisphereLight ref={hemi} args={["#bfe3ff", "#ffe1b8", 1.4]} />
      <directionalLight
        ref={sun}
        color="#fff4dc"
        intensity={1.6}
        castShadow
        shadow-mapSize-width={SHADOW_MAP}
        shadow-mapSize-height={SHADOW_MAP}
        shadow-bias={-0.0004}
        shadow-radius={5}
        shadow-intensity={0.6}
        shadow-normalBias={0.05}
      />
    </>
  );
}
