import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { PIVOT_NAMES, buildPet, disposePet, partsForReveal, petData, setAccessory } from "../../src/pet/buildPet";
import { PET_STATES, PetAnimator } from "../../src/pet/petAnimator";
import { CLAUDE_READING, buildClaudeMascot, speciesLabel } from "../../src/pet/mascot";
import { PetCoreWireSchema, PetReadingWireSchema, normalizeSpec } from "../../src/schema/petReading";

function finite(group: THREE.Object3D): boolean {
  let ok = true;
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    for (const v of o.matrixWorld.elements) if (!Number.isFinite(v)) ok = false;
  });
  return ok;
}

describe("Claude mascot", () => {
  const spec = CLAUDE_READING.spec;

  it("buildPet routes the mascot spec and exposes every pivot", () => {
    const g = buildPet(spec);
    const d = petData(g);
    for (const n of PIVOT_NAMES) {
      expect(d.pivots[n], n).toBeInstanceOf(THREE.Object3D);
      expect(g.getObjectByName(n), n).toBeTruthy();
    }
    expect(d.pivots.rig).toBeTruthy();
    expect(d.pivots.torso).toBeTruthy();
    expect(d.height).toBeGreaterThan(0.4);
    expect(d.radius).toBeGreaterThan(0.3);
    expect(d.eyeHeight).toBeGreaterThan(0.3);
    expect(d.headTopY).toBeGreaterThan(d.eyeHeight);
    expect(partsForReveal(g).length).toBeGreaterThan(3);
    disposePet(g);
  });

  it("is deterministic", () => {
    const a = buildClaudeMascot(spec);
    const b = buildClaudeMascot(spec);
    const names = (g: THREE.Object3D) => {
      const out: string[] = [];
      g.traverse((o) => out.push(`${o.name}:${o.position.toArray().map((v) => v.toFixed(4)).join(",")}`));
      return out;
    };
    expect(names(a)).toEqual(names(b));
  });

  it("animates every state for 2 s without NaN", () => {
    const g = buildPet(spec);
    let seed = 1;
    const anim = new PetAnimator(g, { rng: () => ((seed = (seed * 16807) % 2147483647) / 2147483647) });
    anim.lookAt(new THREE.Vector3(1, 0.5, 2));
    let t = 0;
    for (const s of PET_STATES) {
      anim.setState(s);
      for (let i = 0; i < 120; i++) {
        t += 1 / 60;
        anim.update(1 / 60, t);
      }
      expect(finite(g), s).toBe(true);
    }
  });

  it("wears the quest reward hat and bandana", () => {
    const g = buildPet(spec);
    setAccessory(g, "bandana");
    expect(petData(g).pivots.accessory?.getObjectByName("bandanaCloth")).toBeTruthy();
    setAccessory(g, "hat");
    const hat = petData(g).pivots.accessory;
    expect(hat?.getObjectByName("hatBrim")).toBeTruthy();
    // The brim sits on top of the block.
    g.updateMatrixWorld(true);
    const y = hat!.getWorldPosition(new THREE.Vector3()).y;
    expect(Math.abs(y - petData(g).headTopY)).toBeLessThan(0.05);
    setAccessory(g, "none");
    expect(petData(g).pivots.accessory).toBeUndefined();
    disposePet(g);
  });

  it("keeps the mascot flag through normalizeSpec and drops unknown values", () => {
    expect(normalizeSpec(spec).mascot).toBe("claude");
    expect(normalizeSpec(JSON.parse(JSON.stringify(spec))).baseColor).toBe(spec.baseColor);
    expect(normalizeSpec({ ...spec, mascot: "robot" }).mascot).toBeUndefined();
    expect(normalizeSpec({ species: "cat" }).mascot).toBeUndefined();
  });

  it("never sends the mascot field to Claude", () => {
    const core = PetCoreWireSchema.shape.spec.shape as Record<string, unknown>;
    const full = PetReadingWireSchema.shape.spec.shape as Record<string, unknown>;
    expect("mascot" in core).toBe(false);
    expect("mascot" in full).toBe(false);
  });

  it("labels the species for prompts", () => {
    expect(speciesLabel(spec)).toBe("Claude mascot");
    expect(speciesLabel({ ...spec, mascot: undefined, species: "cat" })).toBe("cat");
    expect(CLAUDE_READING.nameSuggestions[0]).toBe("Claude");
  });
});
