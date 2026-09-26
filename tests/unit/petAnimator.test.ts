import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildPet, petData, PIVOT_NAMES } from "../../src/pet/buildPet";
import { PET_STATES, PetAnimator, type PetAnimState } from "../../src/pet/petAnimator";
import { mulberry32 } from "../../src/pet/markingTexture";
import { sampleReading } from "../../src/pet/samples";

const DT = 1 / 60;

function rotations(group: THREE.Object3D): number[] {
  const p = petData(group).pivots;
  const out: number[] = [];
  for (const n of [...PIVOT_NAMES, "rig"] as const) {
    const o = p[n];
    out.push(o.rotation.x, o.rotation.y, o.rotation.z);
  }
  return out;
}

function allFinite(group: THREE.Object3D): boolean {
  let ok = true;
  group.traverse((o) => {
    for (const v of [o.position, o.scale]) if (!Number.isFinite(v.x + v.y + v.z)) ok = false;
    if (!Number.isFinite(o.rotation.x + o.rotation.y + o.rotation.z)) ok = false;
  });
  return ok;
}

describe("PetAnimator", () => {
  for (const species of ["dog", "cat", "rabbit"] as const) {
    it(`${species}: every state runs 2 s without NaN`, () => {
      const g = buildPet(sampleReading(species).spec);
      const anim = new PetAnimator(g, { rng: mulberry32(7) });
      let t = 0;
      for (const s of PET_STATES) {
        anim.setState(s);
        if (s === "happy") anim.hop();
        for (let i = 0; i < 120; i++) {
          t += DT;
          anim.update(DT, t);
        }
        expect(allFinite(g), s).toBe(true);
      }
    });
  }

  it("cross-fades between states without single-frame jumps", () => {
    const g = buildPet(sampleReading("dog").spec);
    const anim = new PetAnimator(g, { rng: mulberry32(3) });
    let t = 0;
    let prev = rotations(g);
    let maxJump = 0;
    const order: PetAnimState[] = ["idle", "walk", "sit", "run", "dig", "sniff", "happy", "idle", "sit", "walk", "idle"];
    for (const s of order) {
      anim.setState(s);
      for (let i = 0; i < 45; i++) {
        t += DT;
        anim.update(DT, t);
        const cur = rotations(g);
        for (let k = 0; k < cur.length; k++) maxJump = Math.max(maxJump, Math.abs(cur[k] - prev[k]));
        prev = cur;
      }
    }
    expect(maxJump).toBeLessThan(0.25);
  });

  it("sit folds the back legs and pitches the body up; walk swings diagonal pairs", () => {
    const g = buildPet(sampleReading("dog").spec);
    const p = petData(g).pivots;
    const anim = new PetAnimator(g, { rng: mulberry32(1) });
    let t = 0;
    anim.setState("sit");
    for (let i = 0; i < 60; i++) anim.update(DT, (t += DT));
    expect(p.body.rotation.x).toBeLessThan(-0.3);
    expect(p.legBL.rotation.x).toBeLessThan(-0.6);
    anim.setState("walk");
    for (let i = 0; i < 60; i++) anim.update(DT, (t += DT));
    expect(p.legFL.rotation.x).toBeCloseTo(p.legBR.rotation.x, 5);
    expect(p.legFR.rotation.x).toBeCloseTo(p.legBL.rotation.x, 5);
    expect(Math.abs(p.legFL.rotation.x - p.legFR.rotation.x)).toBeGreaterThan(0);
  });

  it("hop leaves the ground and lands with a squash", () => {
    const g = buildPet(sampleReading("cat").spec);
    const p = petData(g).pivots;
    const anim = new PetAnimator(g, { rng: mulberry32(2) });
    anim.hop();
    let maxY = 0;
    let minScaleY = 1;
    let t = 0;
    for (let i = 0; i < 90; i++) {
      anim.update(DT, (t += DT));
      maxY = Math.max(maxY, p.rig.position.y);
      minScaleY = Math.min(minScaleY, p.rig.scale.y);
    }
    expect(maxY).toBeGreaterThan(0.1);
    expect(minScaleY).toBeLessThan(0.95);
    expect(anim.grounded).toBe(true);
    expect(p.rig.position.y).toBe(0);
  });

  it("looks at a target within range, clamped to 0.8 rad", () => {
    const g = buildPet(sampleReading("dog").spec);
    const p = petData(g).pivots;
    const rest = p.head.rotation.y;
    const anim = new PetAnimator(g, { rng: mulberry32(4) });
    anim.lookAt(new THREE.Vector3(5, 0.5, 0.2));
    let t = 0;
    for (let i = 0; i < 180; i++) anim.update(DT, (t += DT));
    const yaw = p.head.rotation.y - rest;
    expect(yaw).toBeGreaterThan(0.6);
    expect(yaw).toBeLessThanOrEqual(0.8 + 1e-6);
  });

  it("blinks within 6 s", () => {
    const g = buildPet(sampleReading("rabbit").spec);
    const p = petData(g).pivots;
    const anim = new PetAnimator(g, { rng: mulberry32(5) });
    let blinked = false;
    let t = 0;
    for (let i = 0; i < 360; i++) {
      anim.update(DT, (t += DT));
      if (p.eyeL.scale.y < 0.2) blinked = true;
    }
    expect(blinked).toBe(true);
  });
});
