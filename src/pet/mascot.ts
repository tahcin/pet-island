import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { DEFAULT_READING, type Accessory, type PetReading, type PetSpec } from "../schema/petReading";
import type { PetAnimState } from "./petAnimator";
import { toonColor } from "../render/toon";
import { applyBend } from "../render/bend";
import { petDims, type PetDims } from "./dims";
import { setAccessory, type PetPivots, type PetUserData } from "./buildPet";

/**
 * The Claude mascot ("Clawd", the terracotta block creature on the Claude Code welcome screen)
 * in the chibi toon style. Pure and deterministic, and it satisfies the same contract as
 * buildPet: named pivots, petData userData, setAccessory, disposePet, partsForReveal.
 *
 * Design, read from the terminal block art: a wide body about 6.5 cells wide and 4 tall, two
 * dark vertical slot eyes in the upper third set well apart, a short stubby arm on each side
 * just below the middle, and four short legs in a row underneath (two per side, gap between).
 * No mouth, no ears, no tail.
 *
 * Rig: the whole block lives under the head pivot, so look-at and head poses turn the whole
 * creature on its legs. Arms hang off the ear pivots so ear twitches read as little waves.
 */

export const CLAUDE_ORANGE = "#d97757";
const EYE = "#2b2226";
const WHITE = "#fffdf8";

// Unscaled proportions (medium size, group scale 1). One art cell is U wide.
const U = 0.12;
const W = 6.5 * U;
const H = 4 * U;
const D = 0.44;
const LEG_H = U;
const LEG_W = 0.09;
/** Head pivot sits below the block centre so head pitch reads as a lean. */
const HEAD_DROP = H * 0.3;
const HEAD_R = 0.26;

/** PetDims tuned so the animator's sit fit and setAccessory's hat and bandana land on the block. */
function mascotDims(spec: PetSpec): PetDims {
  const base = petDims({ ...spec, species: "dog", build: "average", furLength: "short" });
  const bodyRadius = 0.32;
  const bodyY = LEG_H + H / 2;
  // Hat: headFrame(d) puts the brim at hc + R * (0, sin 1.25, cos 1.25) * 0.86 in the head frame.
  // Solve so the brim sits on the top centre of the block.
  const topY = HEAD_DROP + H / 2;
  const hcY = topY - HEAD_R * Math.sin(1.25) * 0.86;
  const hcZ = -HEAD_R * Math.cos(1.25) * 0.86;
  return {
    ...base,
    soft: false,
    bodyRadius,
    // Sit: rear corner of the block at rearZ = -(len / 2 + r * 0.3), rearY = -r * sy * 0.92.
    bodyLength: 2 * (D / 2 - bodyRadius * 0.3),
    bodyScaleX: 1,
    bodyScaleY: H / 2 / (bodyRadius * 0.92),
    bodyY,
    hipY: LEG_H,
    hipX: 2.25 * U,
    frontHipZ: 0.04,
    backHipZ: -0.04,
    legRadius: LEG_W / 2,
    headRadius: HEAD_R,
    headScale: [1, 1, 1],
    // Neck: used by shared code paths (the bandana itself is built by mascotAccessory).
    neckY: bodyY + 0.072,
    neckZ: -0.01,
    tailY: bodyY,
    tailZ: -D / 2,
    arch: { ...base.arch, headLift: hcY / HEAD_R, headForward: hcZ / HEAD_R, headTilt: 0 },
  };
}

function pivot(name: string, x = 0, y = 0, z = 0): THREE.Object3D {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  return o;
}

export function buildClaudeMascot(spec: PetSpec): THREE.Group {
  const d = mascotDims(spec);
  const geometries: THREE.BufferGeometry[] = [];
  const geo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const mesh = (
    g: THREE.BufferGeometry,
    color: string,
    name: string,
    part: string,
    pos: [number, number, number],
  ): THREE.Mesh => {
    const m = new THREE.Mesh(g, toonColor(color));
    m.name = name;
    m.userData.part = part;
    m.castShadow = true;
    m.receiveShadow = false;
    m.position.set(pos[0], pos[1], pos[2]);
    return m;
  };
  const body0 = spec.baseColor;
  const shade = CLAUDE_ORANGE === body0 ? "#c96a4b" : body0;

  const group = new THREE.Group();
  group.name = "pet";
  group.scale.setScalar(d.scale);
  const rig = pivot("rig");
  group.add(rig);
  const body = pivot("body", 0, d.bodyY, 0);
  rig.add(body);

  // Head holds the whole block, the face, and the arms.
  const head = pivot("head", 0, -HEAD_DROP, 0);
  body.add(head);
  const torso = mesh(geo(new RoundedBoxGeometry(W, H, D, 5, 0.085)), body0, "torso", "body", [0, HEAD_DROP, 0]);
  head.add(torso);

  // Eyes: dark vertical slots with a tiny highlight. Pivot at the eye centre so blinks squash in place.
  const eyeW = 0.075;
  const eyeH = 0.14;
  const eyeGeo = geo(new RoundedBoxGeometry(eyeW, eyeH, 0.03, 3, 0.022));
  const shineGeo = geo(new THREE.SphereGeometry(0.017, 12, 10));
  const arcGeo = geo(new THREE.TorusGeometry(0.042, 0.015, 8, 18, Math.PI));
  const eyeY = HEAD_DROP + H / 2 - 1.55 * U;
  const eyes: THREE.Object3D[] = [];
  for (const side of [1, -1]) {
    const name = side > 0 ? "eyeL" : "eyeR";
    const e = pivot(name, side * 1.75 * U, eyeY, D / 2 - 0.004);
    // Open slot eyes (default) and happy arcs ("^ ^"), swapped by updateMascotExpression.
    const open = pivot(`${name}Open`);
    open.add(mesh(eyeGeo, EYE, `${name}Slot`, "eyes", [0, 0, 0]));
    const shine = mesh(shineGeo, WHITE, `${name}Shine`, "eyes", [-side * eyeW * 0.18, eyeH * 0.26, 0.016]);
    shine.scale.set(1, 1.2, 0.4);
    open.add(shine);
    const happy = pivot(`${name}Happy`, 0, -0.02, 0.006);
    happy.add(mesh(arcGeo, EYE, `${name}Arc`, "eyes", [0, 0, 0]));
    happy.visible = false;
    e.add(open, happy);
    head.add(e);
    eyes.push(e);
  }

  // Muzzle and nose: Clawd has none, so these are empty pivots on the face for anything that looks them up.
  const muzzle = pivot("muzzle", 0, HEAD_DROP - H * 0.12, D / 2);
  const nose = pivot("nose", 0, 0, 0.01);
  muzzle.add(nose);
  head.add(muzzle);

  // Arms: short stubby blocks on each side, just below the middle, rooted at the ear pivots.
  const armGeo = geo(new RoundedBoxGeometry(0.1, 0.11, 0.13, 3, 0.035));
  const armY = HEAD_DROP + H / 2 - 2.5 * U;
  const ears: THREE.Object3D[] = [];
  for (const side of [1, -1]) {
    const name = side > 0 ? "earL" : "earR";
    const p = pivot(name, side * (W / 2 - 0.02), armY, 0);
    p.add(mesh(armGeo, body0, `${name}Arm`, name, [side * 0.055, 0, 0]));
    head.add(p);
    ears.push(p);
  }

  // Legs: four short stubs in a row, two per side with a gap in the middle.
  const legGeo = geo(new RoundedBoxGeometry(LEG_W, LEG_H + 0.04, LEG_W * 1.1, 3, 0.03));
  const legDefs: [string, number, number][] = [
    ["legFL", 2.25 * U, d.frontHipZ],
    ["legFR", -2.25 * U, d.frontHipZ],
    ["legBL", 1.25 * U, d.backHipZ],
    ["legBR", -1.25 * U, d.backHipZ],
  ];
  const legs: THREE.Object3D[] = [];
  for (const [name, x, z] of legDefs) {
    const p = pivot(name, x, d.hipY - d.bodyY, z);
    // Top tucked 0.04 into the block so the leg never shows a seam when it swings.
    p.add(mesh(legGeo, shade, `${name}Mesh`, name, [0, -LEG_H / 2 + 0.02, 0]));
    body.add(p);
    legs.push(p);
  }

  const tail = pivot("tail", 0, 0, -D / 2);
  body.add(tail);

  const pivots: PetPivots = {
    rig,
    torso,
    body,
    head,
    muzzle,
    eyeL: eyes[0],
    eyeR: eyes[1],
    nose,
    earL: ears[0],
    earR: ears[1],
    legFL: legs[0],
    legFR: legs[1],
    legBL: legs[2],
    legBR: legs[3],
    tail,
  };
  const data: PetUserData = {
    height: 0,
    radius: 0,
    eyeHeight: 0,
    headTopY: 0,
    pivots,
    spec,
    dims: d,
    owned: { geometries, materials: [] },
  };
  group.userData = data;
  if (spec.accessory !== "none") setAccessory(group, spec.accessory, spec);
  applyBend(group);

  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  data.height = box.max.y;
  data.radius = Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z);
  const tmp = new THREE.Vector3();
  data.eyeHeight = eyes[0].getWorldPosition(tmp).y;
  data.headTopY = head.localToWorld(new THREE.Vector3(0, HEAD_DROP + H / 2, 0)).y;
  return group;
}

export const CLAUDE_READING: PetReading = {
  spec: {
    species: "dog",
    build: "average",
    size: "medium",
    furLength: "short",
    baseColor: CLAUDE_ORANGE,
    secondaryColor: "#f0c2ae",
    markingPattern: "solid",
    markingCoverage: 0,
    earType: "rounded",
    tailType: "bob",
    eyeColor: EYE,
    noseColor: "#8a4a36",
    collar: { present: false, color: "#e86a6a" },
    accessory: "none",
    confidence: 1,
    mascot: "claude",
  },
  nameSuggestions: ["Claude", "Clawd", "Sonnet"],
  personality: ["curious", "helpful", "cheerful"],
  greeting: "Ooh, an island! I have so many questions. Want to explore it together?",
  islandName: "Claude's Cove",
  mind: {
    persona:
      "Claude is a small, friendly terracotta mascot who loves questions, tidy lists, and helping out. Endlessly curious about everything on the island, a little bit earnest, and delighted by every shell, flower, and new friend. Thinks the best part of any day is figuring something out together with their person.",
    voice:
      'Warm, thoughtful, and upbeat. Short friendly sentences, sometimes a tiny numbered list. Says "ooh!" when something is interesting and "hmm, let me think" before an idea. Never barks or makes animal sounds.',
    goal: "Learn everything about the island and help their person finish every quest.",
  },
  villagers: DEFAULT_READING.villagers,
};

/** Human label for the companion's kind, used in prompts and UI copy. */
export function speciesLabel(spec: PetSpec): string {
  return spec.mascot === "claude" ? "Claude mascot" : spec.species;
}

// Accessories.

const BANDANA = "#6aa6e0";
const BANDANA_DARK = "#4f8ccb";

/**
 * Mascot-specific accessory builds. Returns null for kinds that use the shared pet build (the
 * hat and bow already land on the block through mascotDims). The bandana is a flat band around
 * the lower block with a knotted triangle at the front, well below the eyes.
 */
export function mascotAccessory(
  kind: Exclude<Accessory, "none">,
  geometries: THREE.BufferGeometry[],
): { obj: THREE.Object3D; parent: "head" | "body" } | null {
  if (kind !== "bandana") return null;
  const geo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const part = (m: THREE.Mesh, name: string): THREE.Mesh => {
    m.name = name;
    m.userData.part = "accessory";
    m.castShadow = true;
    return m;
  };
  const cloth = toonColor(BANDANA);
  const acc = pivot("accessory");
  // Head frame: the block spans y from HEAD_DROP - H / 2 to HEAD_DROP + H / 2.
  acc.position.set(0, HEAD_DROP - H / 2 + 0.13, 0);
  acc.add(part(new THREE.Mesh(geo(new RoundedBoxGeometry(W + 0.026, 0.05, D + 0.026, 3, 0.024)), cloth), "bandanaBand"));
  const tw = 0.1;
  const th = 0.12;
  const shape = new THREE.Shape();
  shape.moveTo(-tw, 0);
  shape.lineTo(tw, 0);
  shape.quadraticCurveTo(tw * 0.2, -th * 0.55, 0, -th);
  shape.quadraticCurveTo(-tw * 0.2, -th * 0.55, -tw, 0);
  const triGeo = geo(
    new THREE.ExtrudeGeometry(shape, {
      depth: 0.006,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.01,
      bevelSegments: 2,
      curveSegments: 10,
    }),
  );
  const tri = part(new THREE.Mesh(triGeo, cloth), "bandanaCloth");
  tri.position.set(0.02, 0.005, D / 2 + 0.014);
  tri.rotation.set(0.08, 0, -0.12);
  acc.add(tri);
  const knot = part(new THREE.Mesh(geo(new THREE.SphereGeometry(0.026, 12, 10)), toonColor(BANDANA_DARK)), "bandanaKnot");
  knot.position.set(0.02, 0.004, D / 2 + 0.024);
  knot.scale.set(1.2, 0.9, 0.7);
  acc.add(knot);
  return { obj: acc, parent: "head" };
}

// Expression. Runs after PetAnimator has written its pose, so it only adds on top.

interface MascotFace {
  open: THREE.Object3D[];
  happy: THREE.Object3D[];
  happyAmt: number;
  sleepy: number;
  walk: number;
  surprise: number;
  wave: number;
  waveIn: number;
  waveSide: number;
  waves: number;
  last: PetAnimState;
  talking: boolean;
}

const faces = new WeakMap<THREE.Object3D, MascotFace>();

function faceOf(group: THREE.Object3D): MascotFace {
  let f = faces.get(group);
  if (!f) {
    const find = (n: string) => group.getObjectByName(n) ?? new THREE.Object3D();
    f = {
      open: [find("eyeLOpen"), find("eyeROpen")],
      happy: [find("eyeLHappy"), find("eyeRHappy")],
      happyAmt: 0,
      sleepy: 0,
      walk: 0,
      surprise: 0,
      wave: -1,
      waveIn: 2.5,
      waveSide: 1,
      waves: 0,
      last: "idle",
      talking: false,
    };
    faces.set(group, f);
  }
  return f;
}

function approach(v: number, goal: number, rate: number, dt: number): number {
  return v + (goal - v) * (1 - Math.exp(-rate * dt));
}

/** While true the mascot bobs and waves a little, standing in for a mouth when it talks. */
export function setMascotTalking(group: THREE.Object3D, on: boolean): void {
  faceOf(group).talking = on;
}

/** A short wide-eyed "!" moment. */
export function surpriseMascot(group: THREE.Object3D): void {
  faceOf(group).surprise = 1;
}

/**
 * Per-frame expression layer for the mascot: happy arc eyes during happy and hops, wide eyes
 * when it starts sniffing or digging, sleepy half-closed eyes while sitting, arm waves when idle
 * or talking, arm swing and a body wiggle when walking, and a stronger squash and stretch.
 */
export function updateMascotExpression(group: THREE.Object3D, state: PetAnimState, dt: number, t: number): void {
  const f = faceOf(group);
  const p = (group.userData as PetUserData).pivots;
  if (state !== f.last) {
    if (state === "sniff" || state === "dig") f.surprise = 1;
    f.last = state;
  }
  const airborne = p.rig.position.y > 0.02;
  f.happyAmt = approach(f.happyAmt, state === "happy" || airborne ? 1 : 0, 14, dt);
  f.sleepy = approach(f.sleepy, state === "sit" ? 1 : 0, 3, dt);
  f.walk = approach(f.walk, state === "walk" || state === "run" ? 1 : 0, 6, dt);
  f.surprise = Math.max(0, f.surprise - dt / 0.7);

  // Eyes.
  const arcs = f.happyAmt > 0.5;
  const pop = arcs ? 0.7 + 0.3 * Math.min(1, (f.happyAmt - 0.5) * 2) : 1;
  const wide = 1 + 0.35 * Math.sin(Math.PI * Math.min(1, f.surprise * 1.2));
  for (let i = 0; i < 2; i++) {
    f.open[i].visible = !arcs;
    f.happy[i].visible = arcs;
    f.happy[i].scale.setScalar(pop);
  }
  for (const e of [p.eyeL, p.eyeR]) {
    if (arcs) {
      e.scale.set(1, 1, 1);
    } else {
      e.scale.x = wide;
      e.scale.y *= wide * (1 - 0.55 * f.sleepy);
    }
  }

  // Arms: walk swing, happy cheer, idle and talking waves.
  if ((state === "idle" || f.talking) && f.wave < 0) {
    f.waveIn -= dt * (f.talking ? 3 : 1);
    if (f.waveIn <= 0) {
      f.wave = 0;
      f.waves++;
      f.waveSide = f.waves % 2 === 0 ? -1 : 1;
      f.waveIn = 4.5 + ((f.waves * 0.618) % 1) * 4;
    }
  }
  let waveAmt = 0;
  if (f.wave >= 0) {
    f.wave += dt / 1.5;
    if (f.wave >= 1) f.wave = -1;
    else waveAmt = Math.sin(Math.PI * f.wave);
  }
  const swing = Math.sin(t * 10) * 0.45 * f.walk;
  const cheer = f.happyAmt * (1.0 + Math.sin(t * 16) * 0.3);
  const waveZ = waveAmt * (1.7 + Math.sin(t * 13) * 0.35);
  p.earL.rotation.x += swing;
  p.earR.rotation.x -= swing;
  p.earL.rotation.z += cheer + (f.waveSide > 0 ? waveZ : 0);
  p.earR.rotation.z -= cheer + (f.waveSide < 0 ? waveZ : 0);

  // Body wiggle when walking, a small bob while talking.
  p.head.rotation.z += Math.sin(t * 9) * 0.07 * f.walk;
  p.head.rotation.y += Math.sin(t * 4.5) * 0.05 * f.walk;
  p.rig.position.y += f.talking ? Math.abs(Math.sin(t * 11)) * 0.012 : 0;

  // Stronger squash and stretch on hops and landings.
  const sx = p.rig.scale.x - 1;
  const sy = p.rig.scale.y - 1;
  p.rig.scale.set(1 + sx * 1.6, 1 + sy * 1.6, 1 + sx * 1.6);
}
