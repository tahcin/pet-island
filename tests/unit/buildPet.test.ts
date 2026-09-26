import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  ACCESSORIES,
  BUILDS,
  DEFAULT_READING,
  EAR_TYPES,
  FUR_LENGTHS,
  MARKING_PATTERNS,
  SIZES,
  SPECIES,
  TAIL_TYPES,
  type PetSpec,
} from "../../src/schema/petReading";
import { buildPet, disposePet, partsForReveal, petData, PIVOT_NAMES, setAccessory } from "../../src/pet/buildPet";
import { sampleReading } from "../../src/pet/samples";

const base: PetSpec = { ...DEFAULT_READING.spec, secondaryColor: "#f6f1e7", baseColor: "#c8955a" };

function names(group: THREE.Object3D): Set<string> {
  const out = new Set<string>();
  group.traverse((o) => out.add(o.name));
  return out;
}

function serialize(group: THREE.Object3D): string {
  const rows: string[] = [];
  const f = (n: number) => n.toFixed(5);
  group.traverse((o) => {
    rows.push(
      [
        o.name,
        f(o.position.x),
        f(o.position.y),
        f(o.position.z),
        f(o.scale.x),
        f(o.scale.y),
        f(o.scale.z),
        f(o.rotation.x),
        f(o.rotation.y),
        f(o.rotation.z),
      ].join(","),
    );
  });
  return rows.join("\n");
}

function expectPivots(group: THREE.Object3D, spec: PetSpec): void {
  const n = names(group);
  for (const p of PIVOT_NAMES) expect(n.has(p), `${p} missing for ${JSON.stringify(spec)}`).toBe(true);
  const data = petData(group);
  for (const p of PIVOT_NAMES) expect(data.pivots[p]).toBeInstanceOf(THREE.Object3D);
  if (spec.collar.present) expect(n.has("collar")).toBe(true);
  if (spec.accessory !== "none") expect(n.has("accessory")).toBe(true);
  expect(data.height).toBeGreaterThan(0.2);
  expect(data.radius).toBeGreaterThan(0.1);
  expect(Number.isFinite(data.eyeHeight)).toBe(true);
  expect(data.headTopY).toBeGreaterThan(data.eyeHeight);
}

describe("buildPet", () => {
  it("builds every species x ear x tail x build with all named pivots", () => {
    let count = 0;
    for (const species of SPECIES)
      for (const earType of EAR_TYPES)
        for (const tailType of TAIL_TYPES)
          for (const build of BUILDS) {
            const spec: PetSpec = { ...base, species, earType, tailType, build };
            const g = buildPet(spec);
            expectPivots(g, spec);
            disposePet(g);
            count++;
          }
    expect(count).toBe(4 * 6 * 6 * 4);
  });

  it("builds a sweep over sizes, fur, markings, accessories and collars", () => {
    for (const size of SIZES)
      for (const furLength of FUR_LENGTHS)
        for (const markingPattern of MARKING_PATTERNS)
          for (const accessory of ACCESSORIES) {
            const spec: PetSpec = {
              ...base,
              size,
              furLength,
              markingPattern,
              accessory,
              collar: { present: accessory !== "hat", color: "#e86a6a" },
            };
            const g = buildPet(spec);
            expectPivots(g, spec);
            disposePet(g);
          }
  });

  it("is deterministic: the same spec gives an identical structure", () => {
    for (const s of ["dog", "cat", "rabbit"] as const) {
      const spec = sampleReading(s).spec;
      expect(serialize(buildPet(spec))).toBe(serialize(buildPet(structuredClone(spec))));
    }
  });

  it("size scales the whole pet between 0.7 and 1.3", () => {
    const tiny = petData(buildPet({ ...base, size: "tiny" })).height;
    const large = petData(buildPet({ ...base, size: "large" })).height;
    expect(large / tiny).toBeCloseTo(1.3 / 0.7, 3);
  });

  it("build and fur visibly change proportions", () => {
    const avg = petData(buildPet({ ...base, build: "average" })).dims;
    const long = petData(buildPet({ ...base, build: "long" })).dims;
    const stocky = petData(buildPet({ ...base, build: "stocky" })).dims;
    const fluffy = petData(buildPet({ ...base, furLength: "long" })).dims;
    expect(long.bodyLength).toBeGreaterThan(avg.bodyLength * 1.5);
    expect(stocky.bodyRadius * stocky.bodyScaleX).toBeGreaterThan(avg.bodyRadius * 1.15);
    expect(fluffy.headRadius).toBeCloseTo(avg.headRadius * 1.1, 5);
    expect(fluffy.soft).toBe(true);
  });

  it("the head is oversized: about 0.9 of body length or more", () => {
    for (const s of ["dog", "cat", "rabbit"] as const) {
      const d = petData(buildPet(sampleReading(s).spec)).dims;
      const bodyLen = d.bodyLength + 2 * d.bodyRadius;
      expect((2 * d.headRadius) / bodyLen).toBeGreaterThan(0.85);
    }
  });

  it("setAccessory swaps accessories without leaving old ones behind", () => {
    const g = buildPet({ ...base, accessory: "none" });
    const count = () => {
      let n = 0;
      g.traverse((o) => {
        if (o.name === "accessory") n++;
      });
      return n;
    };
    expect(count()).toBe(0);
    setAccessory(g, "bandana");
    expect(count()).toBe(1);
    expect(petData(g).pivots.accessory?.parent?.name).toBe("body");
    setAccessory(g, "hat");
    expect(count()).toBe(1);
    expect(petData(g).pivots.accessory?.parent?.name).toBe("head");
    setAccessory(g, "none");
    expect(count()).toBe(0);
    expect(petData(g).pivots.accessory).toBeUndefined();
  });

  it("every mesh is toon shaded, bend-ready, and tagged with a reveal part", () => {
    const g = buildPet(sampleReading("dog").spec);
    let meshes = 0;
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      meshes++;
      expect(m.frustumCulled).toBe(false);
      expect(typeof m.userData.part).toBe("string");
      expect((m.material as THREE.Material).type).toBe("MeshToonMaterial");
    });
    const parts = partsForReveal(g);
    expect(parts.flat().length).toBe(meshes);
    expect(parts.length).toBeGreaterThan(10);
  });
});
