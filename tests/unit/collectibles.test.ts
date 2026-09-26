import { describe, expect, it } from "vitest";
import { generateWorld, isWater, levelAt } from "../../src/world/generateWorld";
import { isGoodSpot, placeCollectibles, speciesItem } from "../../src/game/collectibles";

describe("collectibles", () => {
  const world = generateWorld(12345);

  it("maps species to items", () => {
    expect(speciesItem("dog")).toBe("bone");
    expect(speciesItem("cat")).toBe("yarn");
    expect(speciesItem("rabbit")).toBe("carrot");
    expect(speciesItem("small_rodent")).toBe("carrot");
  });

  it("places 12 to 20 items with stable ids, deterministic per seed", () => {
    const a = placeCollectibles(world, "dog");
    const b = placeCollectibles(world, "dog");
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(12);
    expect(a.length).toBeLessThanOrEqual(20);
    expect(new Set(a.map((c) => c.id)).size).toBe(a.length);
  });

  it("puts shells on the beach and species items on grass, never in water", () => {
    for (const seed of [12345, 7, 999, 424242]) {
      const w = generateWorld(seed);
      const list = placeCollectibles(w, "cat");
      expect(list.length).toBeGreaterThanOrEqual(12);
      expect(list.some((c) => c.kind === "shell")).toBe(true);
      expect(list.some((c) => c.kind === "yarn")).toBe(true);
      for (const c of list) {
        expect(isWater(w.heightmap, c.x, c.z)).toBe(false);
        expect(isGoodSpot(w, c.x, c.z)).toBe(true);
        if (c.kind === "shell") expect(levelAt(w.heightmap, c.x, c.z)).toBe(0);
        else expect(levelAt(w.heightmap, c.x, c.z)).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
