import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGame } from "../store";
import { hashJson, type PetSpec, type Species } from "../schema/petReading";
import { bendUniforms, BEND_CURVE_DEFAULT } from "../render/bend";
import { toonMaterial } from "../render/toon";
import { buildPet, disposePet, partsForReveal, petData } from "../pet/buildPet";
import { PET_STATES, PetAnimator, type PetAnimState } from "../pet/petAnimator";
import "./reveal.css";

/**
 * Reveal screen (PRD 6.5). The pet draws itself in part by part: a soft brown outline traces
 * in over 0.28 s with a few gold sparkles, then the coloured mesh pops from 55 to 100 percent
 * with a back-out ease. Parts are staggered 0.15 s. Then it idles on a slow turntable.
 */

const TRACE = 0.28;
const POP = 0.36;
const STAGGER = 0.15;
const START = 0.35;
const OUTLINE_COLOR = "#a07e66";
const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];

const ACCENT: Record<Species, string> = {
  dog: "var(--peach)",
  cat: "var(--lilac)",
  rabbit: "var(--mint)",
  small_rodent: "var(--mint)",
};

function backOut(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = t - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
}

// Sound is optional and off by default; the AudioContext is only created after a click.
let audio: AudioContext | null = null;
let soundOn = false;

function pluck(i: number): void {
  if (!soundOn || !audio) return;
  const t = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "triangle";
  osc.frequency.value = PENTATONIC[i % PENTATONIC.length];
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  osc.connect(gain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.4);
}

/** Three ellipses around a geometry's bounding box: a quick construction sketch of the part. */
function outlineGeometry(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!geo.boundingBox) geo.computeBoundingBox();
  const box = geo.boundingBox ?? new THREE.Box3();
  const c = box.getCenter(new THREE.Vector3());
  const h = box.getSize(new THREE.Vector3()).multiplyScalar(0.5 * 1.02);
  const seg = 40;
  const pts: number[] = [];
  const ring = (fn: (a: number) => [number, number, number]) => {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      pts.push(...fn(a0), ...fn(a1));
    }
  };
  ring((a) => [c.x + Math.cos(a) * h.x, c.y + Math.sin(a) * h.y, c.z]);
  ring((a) => [c.x, c.y + Math.sin(a) * h.y, c.z + Math.cos(a) * h.z]);
  ring((a) => [c.x + Math.cos(a) * h.x, c.y, c.z + Math.sin(a) * h.z]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

const sparkleGeo = new THREE.OctahedronGeometry(0.022, 0);
const sparkleMat = toonMaterial({ color: "#ffd66b", emissive: "#ffcf4a", emissiveIntensity: 0.55, flat: true });
const groundMat = toonMaterial({ color: "#fdebd0", emissive: "#fdebd0", emissiveIntensity: 0.3 });
const groundRimMat = toonMaterial({ color: "#f7d3a6", emissive: "#f7d3a6", emissiveIntensity: 0.25 });

/** Dev only: `?anim=sit` holds an animation state after the draw-in (to inspect poses). */
function animOverride(): PetAnimState | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("anim");
  return v && (PET_STATES as readonly string[]).includes(v) ? (v as PetAnimState) : null;
}

/** Dev only: `?turn=3.1` starts the turntable at another angle (to inspect tails). */
function turnOffset(): number {
  if (typeof window === "undefined") return 0;
  const v = Number(new URLSearchParams(window.location.search).get("turn"));
  return Number.isFinite(v) ? v : 0;
}

interface Sparkle {
  mesh: THREE.Mesh;
  life: number;
  vel: THREE.Vector3;
}

interface PartState {
  meshes: THREE.Mesh[];
  base: THREE.Vector3[];
  outlines: THREE.LineSegments[];
  counts: number[];
  start: number;
  popped: boolean;
  sparkled: boolean;
}

function RevealPet({ spec, onReady }: { spec: PetSpec; onReady: () => void }) {
  const key = hashJson(spec);
  const pet = useMemo(() => buildPet(spec), [key]);
  const animator = useMemo(() => new PetAnimator(pet), [pet]);
  const scene = useThree((s) => s.scene);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  const draw = useMemo(() => {
    const outlineMat = new THREE.LineBasicMaterial({ color: OUTLINE_COLOR, transparent: true, opacity: 0.9 });
    const parts: PartState[] = partsForReveal(pet).map((meshes, i) => {
      const outlines = meshes.map((m) => {
        const line = new THREE.LineSegments(outlineGeometry(m.geometry), outlineMat);
        line.position.copy(m.position);
        line.quaternion.copy(m.quaternion);
        line.scale.copy(m.scale);
        line.visible = false;
        line.geometry.setDrawRange(0, 0);
        m.parent?.add(line);
        return line;
      });
      return {
        meshes,
        base: meshes.map((m) => m.scale.clone()),
        outlines,
        counts: outlines.map((l) => l.geometry.getAttribute("position").count),
        start: START + i * STAGGER,
        popped: false,
        sparkled: false,
      };
    });
    for (const p of parts) for (const m of p.meshes) m.visible = false;
    const sparkles: Sparkle[] = [];
    for (let i = 0; i < 28; i++) {
      const mesh = new THREE.Mesh(sparkleGeo, sparkleMat);
      mesh.visible = false;
      sparkles.push({ mesh, life: 0, vel: new THREE.Vector3() });
    }
    const last = parts.length ? parts[parts.length - 1].start : 0;
    return { parts, sparkles, outlineMat, end: last + TRACE + POP + 0.1, t: 0, done: false, nextHop: 2.5, turn: turnOffset() };
  }, [pet]);

  useEffect(() => {
    for (const s of draw.sparkles) scene.add(s.mesh);
    return () => {
      for (const s of draw.sparkles) scene.remove(s.mesh);
      for (const p of draw.parts) for (const l of p.outlines) l.geometry.dispose();
      draw.outlineMat.dispose();
      disposePet(pet);
    };
  }, [draw, pet, scene]);

  const tmp = useMemo(() => new THREE.Vector3(), []);

  const spawn = (line: THREE.LineSegments, vertex: number) => {
    const s = draw.sparkles.find((x) => x.life <= 0);
    if (!s) return;
    const pos = line.geometry.getAttribute("position");
    tmp.fromBufferAttribute(pos, Math.min(vertex, pos.count - 1));
    line.localToWorld(tmp);
    s.mesh.position.copy(tmp);
    s.vel.set((Math.random() - 0.5) * 0.5, 0.35 + Math.random() * 0.4, (Math.random() - 0.5) * 0.5);
    s.life = 0.55;
    s.mesh.visible = true;
  };

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    draw.t += dt;
    const t = draw.t;
    pet.rotation.y = draw.turn - 0.2 + t * 0.22;

    let partIndex = 0;
    for (const p of draw.parts) {
      const local = t - p.start;
      if (local >= 0 && !p.sparkled) {
        p.sparkled = true;
        for (let k = 0; k < p.outlines.length && k < 2; k++) spawn(p.outlines[k], Math.floor(Math.random() * p.counts[k]));
      }
      for (let k = 0; k < p.outlines.length; k++) {
        const line = p.outlines[k];
        if (local < 0) continue;
        const trace = Math.min(1, local / TRACE);
        line.visible = local < TRACE + POP + 0.2;
        line.geometry.setDrawRange(0, Math.floor((trace * p.counts[k]) / 2) * 2);
      }
      if (local >= TRACE) {
        if (!p.popped) {
          p.popped = true;
          pluck(partIndex);
          if (p.outlines[0]) spawn(p.outlines[0], Math.floor(p.counts[0] / 2));
        }
        const q = Math.min(1, (local - TRACE) / POP);
        const s = 0.55 + 0.45 * backOut(q);
        for (let k = 0; k < p.meshes.length; k++) {
          const m = p.meshes[k];
          m.visible = true;
          m.scale.copy(p.base[k]).multiplyScalar(s);
        }
      }
      partIndex++;
    }

    for (const s of draw.sparkles) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vel.y -= 0.8 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.y += dt * 6;
      const k = Math.max(0, s.life / 0.55);
      s.mesh.scale.setScalar(Math.sin(k * Math.PI) * 1.2 + 0.01);
      if (s.life <= 0) s.mesh.visible = false;
    }

    if (!draw.done && t >= draw.end) {
      draw.done = true;
      for (const p of draw.parts) {
        for (const l of p.outlines) l.visible = false;
        for (let k = 0; k < p.meshes.length; k++) p.meshes[k].scale.copy(p.base[k]);
      }
      const forced = animOverride();
      if (forced) animator.setState(forced);
      else animator.hop(0.8);
      readyRef.current();
    }
    if (draw.done) {
      draw.nextHop -= dt;
      if (draw.nextHop <= 0 && animator.state === "idle") {
        animator.hop(0.8);
        draw.nextHop = 4 + Math.random() * 3;
      }
      animator.update(dt, state.clock.elapsedTime);
    }
  });

  return <primitive object={pet} />;
}

/** Frames the pet in the left part of the screen on wide layouts, centred on narrow ones. */
function CameraRig({ height }: { height: number }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useEffect(() => {
    const wide = size.width > 820;
    const dist = 1.5 + height * 1.25;
    const shift = wide ? dist * 0.2 : 0;
    const lookY = height * (wide ? 0.46 : 0.3);
    camera.position.set(shift + dist * 0.04, lookY + dist * 0.16, dist);
    camera.lookAt(shift, wide ? lookY : lookY - height * 0.35, 0);
    camera.updateProjectionMatrix();
  }, [camera, size, height]);
  return null;
}

function Ground() {
  const geo = useMemo(() => new THREE.CircleGeometry(0.95, 64).rotateX(-Math.PI / 2), []);
  const rim = useMemo(() => new THREE.CircleGeometry(1.03, 64).rotateX(-Math.PI / 2), []);
  useEffect(
    () => () => {
      geo.dispose();
      rim.dispose();
    },
    [geo, rim],
  );
  return (
    <group>
      <mesh geometry={rim} material={groundRimMat} position={[0, -0.004, 0]} receiveShadow />
      <mesh geometry={geo} material={groundMat} receiveShadow />
    </group>
  );
}

export default function Reveal() {
  const reading = useGame((s) => s.reading);
  const fallbackMessage = useGame((s) => s.fallbackMessage);
  const [ready, setReady] = useState(false);
  const [sound, setSound] = useState(false);
  const spec = reading.spec;
  const name = reading.nameSuggestions[0] ?? "Buddy";
  // Framing size: the taller of height and body length, so long pets fit too.
  const height = useMemo(() => {
    const pet = buildPet(spec);
    const d = petData(pet);
    const h = Math.max(d.height, d.radius * (spec.mascot === "claude" ? 2.4 : 1.5));
    disposePet(pet);
    return h;
  }, [spec]);

  useEffect(() => {
    bendUniforms.uCurve.value = 0;
    window.__petReady = false;
    return () => {
      bendUniforms.uCurve.value = BEND_CURVE_DEFAULT;
    };
  }, []);

  useEffect(() => {
    if (ready) window.__petReady = true;
  }, [ready]);

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    soundOn = next;
    if (next && !audio) {
      const Ctor = window.AudioContext;
      if (Ctor) audio = new Ctor();
    }
    if (next) void audio?.resume();
  };

  const style = { "--accent": spec.mascot === "claude" ? "#f5c4ae" : ACCENT[spec.species] } as CSSProperties;
  const confidence = spec.confidence;

  return (
    <div className="screen reveal" style={style}>
      <Canvas flat shadows dpr={[1, 1.5]} camera={{ fov: 32, near: 0.05, far: 50, position: [0, 1, 3] }}>
        <CameraRig height={height} />
        <hemisphereLight args={["#bfe3ff", "#ffe1b8", 1.4]} />
        <directionalLight
          color="#fff4dc"
          intensity={1.6}
          position={[1.8, 3.2, 2.4]}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-1.5}
          shadow-camera-right={1.5}
          shadow-camera-top={1.5}
          shadow-camera-bottom={-1.5}
          shadow-camera-near={0.5}
          shadow-camera-far={8}
          shadow-intensity={0.45}
          shadow-bias={-0.0005}
          shadow-normalBias={0.02}
        />
        <Ground />
        <RevealPet key={hashJson(spec)} spec={spec} onReady={() => setReady(true)} />
      </Canvas>

      <button className="reveal-sound" onClick={toggleSound} aria-pressed={sound}>
        {sound ? "Sound on" : "Sound off"}
      </button>

      <div className={`reveal-card panel${ready ? " is-ready" : ""}`} data-testid="reveal-card">
        <div className="reveal-kicker">Say hello to</div>
        <h1 className="title reveal-name" data-testid="pet-name">
          {name}
        </h1>
        <div className="reveal-chips">
          {reading.personality.map((trait) => (
            <span className="reveal-chip" key={trait}>
              {trait}
            </span>
          ))}
        </div>
        <div className="reveal-bubble">{reading.greeting}</div>
        <p className="reveal-island">
          Welcome to <strong>{reading.islandName}</strong>
        </p>
        <button className="btn reveal-go" data-testid="lets-go" onClick={() => useGame.getState().setScreen("play")}>
          Let's go
        </button>
        {fallbackMessage && <p className="reveal-confidence">{fallbackMessage}</p>}
        {!fallbackMessage && confidence < 0.5 && (
          <p className="reveal-confidence">
            Claude is {Math.round(confidence * 100)}% sure about this one. A clearer photo helps.
          </p>
        )}
      </div>
    </div>
  );
}
