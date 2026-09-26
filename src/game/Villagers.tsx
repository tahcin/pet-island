import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import Pet from "../pet/Pet";
import { petData } from "../pet/buildPet";
import type { PetAnimator } from "../pet/petAnimator";
import { useGame } from "../store";
import { dampAngle, stepBody } from "../control/movement";
import { bendUniforms } from "../render/bend";
import { heightAt, type WorldData } from "../world/generateWorld";
import { isGoodSpot } from "./collectibles";
import {
  makeBody,
  resetBody,
  villagers,
  type VillagerRuntime,
} from "./runtime";
import { controlledBody, labelEls, setLabel, tickTalk, TALK_RANGE } from "./interactions";
import type { EarType, PetSpec, Species, TailType } from "../schema/petReading";

type Home = { x: number; z: number };

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(rng: () => number, list: readonly T[]): T =>
  list[Math.floor(rng() * list.length)];

const COATS = [
  "#f2c48d",
  "#d9a066",
  "#b98a6a",
  "#f5ede0",
  "#8a7a70",
  "#e8b0a0",
  "#c9c2d6",
  "#f0d79a",
  "#a88a70",
];
const SECONDS = ["#fff6ea", "#f6e4d0", "#5b4636", "#efe0c8", "#d8c8f0"];
const COLLARS = ["#7fc8e8", "#f29ab0", "#9ad69a", "#f2c23a", "#b89af0"];
const EARS: Record<Species, readonly EarType[]> = {
  dog: ["floppy", "pointy", "folded", "rounded"],
  cat: ["pointy", "folded", "rounded"],
  rabbit: ["long_upright", "long_floppy"],
  small_rodent: ["rounded"],
};
const TAILS: Record<Species, readonly TailType[]> = {
  dog: ["curly", "long", "fluffy", "bob"],
  cat: ["long", "fluffy", "thin"],
  rabbit: ["puff"],
  small_rodent: ["thin", "puff"],
};

/** Seeded random villager body (PRD F12). Pure. */
export function villagerSpec(
  seed: number,
  index: number,
  species: Species,
): PetSpec {
  const rng = mulberry32((seed * 31 + index * 7919 + 0xbeef) >>> 0);
  return {
    species,
    build: pick(rng, ["slim", "average", "stocky", "long"] as const),
    size: pick(rng, ["small", "medium"] as const),
    furLength: pick(rng, ["short", "medium", "long"] as const),
    baseColor: pick(rng, COATS),
    secondaryColor: pick(rng, SECONDS),
    markingPattern: pick(rng, [
      "solid",
      "patches",
      "spots",
      "tabby",
      "mask",
      "blaze",
      "socks",
    ] as const),
    markingCoverage: 0.2 + rng() * 0.5,
    earType: pick(rng, EARS[species]),
    tailType: pick(rng, TAILS[species]),
    eyeColor: "#3a2a20",
    noseColor: pick(rng, ["#4a3434", "#e89aa0", "#5b4636"]),
    collar: { present: rng() < 0.7, color: pick(rng, COLLARS) },
    accessory: "none",
    confidence: 1,
  };
}

/** Fallback homes when the world does not carry them: dry flat points 15 to 30 m from spawn. */
function fallbackHomes(world: WorldData): Home[] {
  const rng = mulberry32((world.seed ^ 0x40a3e5) >>> 0);
  const out: Home[] = [];
  for (let tries = 0; tries < 3000 && out.length < 3; tries++) {
    const a = rng() * Math.PI * 2;
    const r = 15 + rng() * 15;
    const x = world.spawn.x + Math.cos(a) * r;
    const z = world.spawn.z + Math.sin(a) * r;
    if (Math.abs(x) > 75 || Math.abs(z) > 75 || !isGoodSpot(world, x, z))
      continue;
    if (out.some((h) => Math.hypot(h.x - x, h.z - z) < 8)) continue;
    out.push({ x, z });
  }
  while (out.length < 3)
    out.push({ x: world.spawn.x + 3 + out.length * 2, z: world.spawn.z + 3 });
  return out;
}

export function villagerHomes(world: WorldData): Home[] {
  const w: WorldData & { homes?: Home[] } = world;
  return w.homes && w.homes.length >= 3 ? w.homes : fallbackHomes(world);
}

interface Brain {
  target: Home | null;
  pause: number;
  stuck: number;
  greetHold: number;
  greeted: boolean;
}

const WANDER = 10;
const WALK = 1.6;
const tmp = new THREE.Vector3();

function bendDrop(x: number, z: number): number {
  const o = bendUniforms.uBendOrigin.value;
  const dx = x - o.x;
  const dz = z - o.z;
  return bendUniforms.uCurve.value * (dx * dx + dz * dz);
}

interface VillagerProps {
  v: VillagerRuntime;
  spec: PetSpec;
  world: WorldData;
}

function VillagerBody({ v, spec, world }: VillagerProps) {
  const group = useRef<THREE.Group>(null);
  const animator = useRef<PetAnimator | null>(null);
  const ui = useRef({
    bubble: null as string | null,
    near: false,
    glyphUntil: 0,
    glyph: false,
  });
  const brain = useRef<Brain>({
    target: null,
    pause: 1 + Math.random() * 3,
    stuck: 0,
    greetHold: 0,
    greeted: false,
  });

  useFrame((s, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const now = s.clock.elapsedTime;
    const body = v.body;
    const b = brain.current;
    const player = controlledBody();
    const pd = Math.hypot(player.pos.x - body.pos.x, player.pos.z - body.pos.z);

    // Greeting beat (PRD 9.2): stop, face, pop a glyph; re-arm after the player leaves 12 m.
    if (!b.greeted && pd < 3.5 + body.radius) {
      b.greeted = true;
      b.greetHold = 2.6;
      ui.current.glyphUntil = now + 2.2;
      ui.current.glyph = true;
      setLabel(v.index, { glyph: Math.random() < 0.75 ? "!" : "♪" });
    } else if (b.greeted && pd > 12) b.greeted = false;
    if (ui.current.glyph && now > ui.current.glyphUntil) {
      ui.current.glyph = false;
      setLabel(v.index, { glyph: null });
    }

    let dx = 0;
    let dz = 0;
    let faceX: number | null = null;
    let faceZ = 0;
    if (v.goto) {
      const gx = v.goto.x - body.pos.x;
      const gz = v.goto.z - body.pos.z;
      const d = Math.hypot(gx, gz);
      if (d > 0.8) {
        dx = (gx / d) * WALK * 1.3;
        dz = (gz / d) * WALK * 1.3;
      }
    } else if (b.greetHold > 0 || pd < TALK_RANGE) {
      b.greetHold -= dt;
      faceX = player.pos.x;
      faceZ = player.pos.z;
    } else if (b.pause > 0) {
      b.pause -= dt;
      if (b.pause <= 0) {
        for (let i = 0; i < 12; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = 2 + Math.random() * (WANDER - 2);
          const x = v.home.x + Math.cos(a) * r;
          const z = v.home.z + Math.sin(a) * r;
          if (isGoodSpot(world, x, z)) {
            b.target = { x, z };
            break;
          }
        }
        b.stuck = 0;
      }
    } else if (b.target) {
      const gx = b.target.x - body.pos.x;
      const gz = b.target.z - body.pos.z;
      const d = Math.hypot(gx, gz);
      b.stuck += body.speed < 0.3 ? dt : 0;
      if (d < 0.5 || b.stuck > 1.5) {
        b.target = null;
        b.pause = 3 + Math.random() * 3;
      } else {
        dx = (gx / d) * WALK;
        dz = (gz / d) * WALK;
      }
    } else b.pause = 3 + Math.random() * 3;

    if (v.face) {
      faceX = v.face.x;
      faceZ = v.face.z;
    }
    stepBody(body, dx, dz, dt, world, undefined, 6);
    if (faceX !== null && dx === 0 && dz === 0) {
      body.yaw = dampAngle(
        body.yaw,
        Math.atan2(faceX - body.pos.x, faceZ - body.pos.z),
        8,
        dt,
      );
    }

    const a = animator.current;
    if (a) {
      const walking = body.speed > 0.3;
      a.setState(walking ? "walk" : "idle");
      a.setMove(walking ? Math.min(1, body.speed / 5) : -1);
      if (pd < TALK_RANGE + 1)
        a.lookAt(
          tmp.set(
            player.pos.x,
            player.pos.y + player.height * 0.85,
            player.pos.z,
          ),
        );
      else a.lookAt(null);
    }
    const g = group.current;
    if (g) {
      g.position.copy(body.pos);
      g.rotation.y = body.yaw;
    }
    // Project the head (with the curved-world drop) to the screen for the DOM label layer.
    const el = labelEls[v.index];
    if (el) {
      tmp.set(body.pos.x, body.pos.y + body.height + 0.3 - bendDrop(body.pos.x, body.pos.z), body.pos.z).project(s.camera);
      const visible = tmp.z < 1 && Math.abs(tmp.x) < 1.2 && Math.abs(tmp.y) < 1.2 && pd < 40;
      el.style.display = visible ? "block" : "none";
      el.style.transform = `translate(${((tmp.x + 1) / 2) * s.size.width}px, ${((1 - tmp.y) / 2) * s.size.height}px)`;
    }

    const isNear = pd < TALK_RANGE + body.radius;
    if (v.say !== ui.current.bubble) {
      ui.current.bubble = v.say;
      setLabel(v.index, { bubble: v.say });
    }
    if (isNear !== ui.current.near) {
      ui.current.near = isNear;
      setLabel(v.index, { near: isNear });
    }
  });

  return (
    <>
      <Pet
        ref={group}
        spec={spec}
        animatorRef={(an) => {
          animator.current = an;
        }}
        onBuilt={(built) => {
          const d = petData(built);
          v.body.height = d.height;
          v.body.radius = d.radius;
        }}
      />
    </>
  );
}


/** The three island villagers (PRD F12 and 9.5). Rebuilds when the world or reading changes. */
export default function Villagers({ world }: { world: WorldData }) {
  const all = useGame((s) => s.reading.villagers);
  // Only rebuild when who lives here changes, not when the same details arrive again.
  const who = all
    .slice(0, 3)
    .map((r) => `${r.name}/${r.species}`)
    .join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const list = useMemo(() => all, [who]);
  const entries = useMemo(() => {
    const homes = villagerHomes(world);
    return list.slice(0, 3).map((r, i) => {
      const home = homes[i % homes.length];
      const body = makeBody(0.7, 0.35);
      resetBody(
        body,
        home.x,
        heightAt(world.heightmap, home.x, home.z),
        home.z,
        Math.random() * Math.PI * 2,
      );
      const v: VillagerRuntime = {
        index: i,
        name: r.name,
        species: r.species,
        body,
        home,
        say: null,
        goto: null,
        face: null,
      };
      return { v, spec: villagerSpec(world.seed, i, r.species) };
    });
  }, [world, list]);

  useEffect(() => {
    villagers.length = 0;
    for (const e of entries) villagers.push(e.v);
    return () => {
      villagers.length = 0;
    };
  }, [entries]);

  useFrame(() => tickTalk());

  return (
    <>
      {entries.map((e, i) => (
        <VillagerBody
          key={i}
          v={e.v}
          spec={e.spec}
          world={world}
        />
      ))}
    </>
  );
}
