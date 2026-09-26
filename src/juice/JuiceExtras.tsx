import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { WorldData } from "../world/generateWorld";
import { isWater } from "../world/heightmap";
import { useGame } from "../store";
import { consumePress, input } from "../control/useInput";
import { runtime } from "../game/runtime";
import { dayClock, isShot } from "./dayCycle";
import { goNewIsland, useJuice } from "./juiceState";
import { composePhoto, downloadBlob, photoFilename, speciesAccent } from "./photo";
import { chirp, setAmbientMix, setMasterVolume } from "./audio";

const COUNTDOWN = 1;

// ---- Stars (F21): a fixed Points shell that fades in at night. ----
const STAR_COUNT = 700;
const starGeometry = (() => {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(STAR_COUNT * 3);
  let s = 1234567;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < STAR_COUNT; i++) {
    const az = rnd() * Math.PI * 2;
    const el = Math.asin(0.12 + rnd() * 0.88);
    const r = 400;
    pos[i * 3] = Math.cos(az) * Math.cos(el) * r;
    pos[i * 3 + 1] = Math.sin(el) * r;
    pos[i * 3 + 2] = Math.sin(az) * Math.cos(el) * r;
  }
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return g;
})();
const starMaterial = new THREE.PointsMaterial({
  color: "#fff6d8",
  size: 2.4,
  sizeAttenuation: false,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  fog: false,
});

function Stars() {
  const ref = useRef<THREE.Points>(null);
  useFrame(({ camera }) => {
    const p = ref.current;
    if (!p) return;
    p.position.copy(camera.position);
    const k = dayClock.look.stars;
    starMaterial.opacity = k * (0.75 + 0.25 * Math.sin(performance.now() * 0.002));
    p.visible = k > 0.01;
  });
  return <points ref={ref} geometry={starGeometry} material={starMaterial} renderOrder={-9} frustumCulled={false} />;
}

// ---- Photo mode (F16) and new island (F17) keys. ----
type Phase = "idle" | "count" | "busy";

function setBodyPhoto(on: boolean): void {
  document.body.classList.toggle("photo-mode", on);
}

function PhotoAndKeys() {
  const { gl, scene, camera } = useThree();
  const st = useRef<{ phase: Phase; start: number; digit: number }>({ phase: "idle", start: 0, digit: 0 });

  useEffect(
    () => () => {
      setBodyPhoto(false);
      if (st.current.phase !== "idle") input.suspended = false;
      useGame.getState().setPhotoMode(false);
      useJuice.getState().setCountdown(null);
    },
    [],
  );

  const finish = () => {
    st.current.phase = "idle";
    input.suspended = false;
    // Keys tapped during the countdown (N for a new island) must not fire after the shot.
    input.pressed.clear();
    setBodyPhoto(false);
    useGame.getState().setPhotoMode(false);
    useJuice.getState().setCountdown(null);
  };

  useFrame(() => {
    const s = st.current;
    const juice = useJuice.getState();
    if (s.phase === "idle") {
      const wantPhoto = (!input.suspended && consumePress("KeyP")) || juice.takeRequest();
      if (wantPhoto) {
        s.phase = "count";
        s.start = performance.now();
        s.digit = 3;
        input.suspended = true;
        input.down.clear();
        setBodyPhoto(true);
        useGame.getState().setPhotoMode(true);
        juice.setCountdown(3);
        return;
      }
      if (!input.suspended && consumePress("KeyN")) goNewIsland();
      return;
    }
    if (s.phase === "count") {
      if (consumePress("KeyP")) {
        finish();
        return;
      }
      // Wall clock, so a slow frame rate never stretches the countdown.
      const elapsed = (performance.now() - s.start) / 1000;
      const digit = Math.max(1, 3 - Math.floor((elapsed / COUNTDOWN) * 3));
      if (digit !== s.digit) {
        s.digit = digit;
        juice.setCountdown(digit);
      }
      if (elapsed < COUNTDOWN) return;
      s.phase = "busy";
      juice.setCountdown(null);
      // preserveDrawingBuffer is off, so render and read back in the same frame.
      gl.render(scene, camera);
      const dataUrl = gl.domElement.toDataURL("image/png");
      juice.bumpFlash();
      const game = useGame.getState();
      const name = game.reading.nameSuggestions[0] ?? "Pet";
      composePhoto(dataUrl, name, game.reading.islandName, speciesAccent(game.reading.spec.species))
        .then((blob) => {
          downloadBlob(blob, photoFilename(name, game.seed));
        })
        .catch((e: unknown) => console.warn("photo failed", e))
        .finally(() => setTimeout(finish, 450));
    }
  });
  return null;
}

// ---- Ambient audio mix (F22). ----
const TREE_TYPES = new Set(["tree", "pine", "fruitTree", "palm"]);

function AmbientMix({ world }: { world: WorldData }) {
  const muted = useGame((s) => s.muted);
  const trees = useMemo(() => world.props.filter((p) => TREE_TYPES.has(p.type)), [world]);
  const st = useRef({ tick: 0, nextChirp: 1.5, birds: 0 });
  useEffect(() => setMasterVolume(!muted), [muted]);
  useFrame((_, dt) => {
    if (muted) return;
    const s = st.current;
    s.tick += dt;
    if (s.tick > 0.4) {
      s.tick = 0;
      const f = runtime.focus;
      let wet = 0;
      let n = 0;
      for (const r of [5, 12]) {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          if (isWater(world.heightmap, f.x + Math.cos(a) * r, f.z + Math.sin(a) * r)) wet++;
          n++;
        }
      }
      let near = 0;
      for (const t of trees) {
        const dx = t.x - f.x;
        const dz = t.z - f.z;
        if (dx * dx + dz * dz < 18 * 18) near++;
      }
      const day = 1 - dayClock.look.stars;
      s.birds = Math.min(1, near / 5) * Math.max(0.15, day);
      setAmbientMix(Math.min(1, (wet / n) * 1.6), s.birds);
    }
    s.nextChirp -= dt;
    if (s.nextChirp <= 0) {
      if (s.birds > 0.08) chirp();
      s.nextChirp = 0.5 + Math.random() * (3.5 - 2.5 * s.birds);
    }
  });
  return null;
}

/** Slot owned by M7 juice. Mounted inside the island Canvas by Play.tsx. */
export default function JuiceExtras({ world }: { world: WorldData }) {
  const shot = useMemo(() => isShot(), []);
  return (
    <>
      <Stars />
      {!shot && <PhotoAndKeys />}
      {!shot && <AmbientMix world={world} />}
    </>
  );
}
