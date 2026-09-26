import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { HOUSE_PARTS, HOUSE_RADIUS, HOUSE_VARIANTS, buildHouse, createHouses, houseGeometries, houseStyle } from "../../src/world/house";

function finiteBox(g: THREE.BufferGeometry): THREE.Box3 {
  g.computeBoundingBox();
  const b = g.boundingBox;
  if (!b) throw new Error("no bounds");
  for (const v of [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]) expect(Number.isFinite(v)).toBe(true);
  return b;
}

describe("houses", () => {
  it("builds every variant with finite bounds that fit the collider", () => {
    for (let v = 0; v < HOUSE_VARIANTS; v++) {
      const g = houseGeometries(v);
      for (const part of [g.walls, g.roof, g.detail]) {
        const b = finiteBox(part);
        expect(b.min.y).toBeGreaterThan(-0.2);
        expect(b.max.y).toBeLessThan(5);
      }
      // Walls and roof stay inside roughly the old footprint.
      const w = finiteBox(g.walls);
      expect(Math.max(-w.min.x, w.max.x, -w.min.z, w.max.z)).toBeLessThan(HOUSE_RADIUS);
      expect(g.detail.getAttribute("color")).toBeTruthy();
    }
  });

  it("keeps the legacy parts", () => {
    for (const k of ["walls", "roof", "door", "windows", "trim"] as const) finiteBox(HOUSE_PARTS[k]);
  });

  it("styles are deterministic and neighbours differ", () => {
    expect(houseStyle(3, 12345)).toEqual(houseStyle(3, 12345));
    for (let i = 0; i < 10; i++) {
      expect(houseStyle(i, 7).roof).not.toBe(houseStyle(i + 1, 7).roof);
      expect(houseStyle(i, 7).variant).not.toBe(houseStyle(i + 1, 7).variant);
    }
  });

  it("instances homes with few draw calls", () => {
    const homes = Array.from({ length: 9 }, (_, i) => ({ x: i * 6, z: 3 }));
    const root = createHouses(homes, () => 1, { seed: 12345 });
    let meshes = 0;
    let count = 0;
    root.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) {
        meshes++;
        count += o.count;
        expect(o.frustumCulled).toBe(false);
      }
    });
    expect(meshes).toBeLessThanOrEqual(HOUSE_VARIANTS * 3);
    expect(count).toBe(homes.length * 3);
    expect(buildHouse({ variant: 2 }).children.length).toBe(3);
  });
});
