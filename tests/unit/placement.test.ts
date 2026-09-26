import { describe, expect, it } from "vitest";
import { generateWorld } from "../../src/world/generateWorld";
import { isWater, levelAt, slopeAt } from "../../src/world/heightmap";
import { RIVER_CLEARANCE, riverDistanceAt } from "../../src/world/river";
import { isOnRamp } from "../../src/world/ramps";
import { HOME_MIN_SPACING, PROP_HOME_CLEARANCE, PROP_MAX_SLOPE, PROP_SPAWN_CLEARANCE } from "../../src/world/placement";
import { buildCollide, propColliders } from "../../src/world/collision";

const SEEDS = [12345, 1, 777, 424242, 99];

describe("placement", () => {
  it("is deterministic for a seed", () => {
    const a = generateWorld(12345);
    const b = generateWorld(12345);
    expect(a.homes).toEqual(b.homes);
    expect(a.props).toEqual(b.props);
    expect(a.interest).toEqual(b.interest);
  });

  it("places six town homes around the plaza, clear of spawn and water", () => {
    for (const seed of SEEDS) {
      const w = generateWorld(seed);
      expect(w.homes.length).toBe(6);
      for (const h of w.homes) {
        expect(levelAt(w.heightmap, h.x, h.z)).toBeGreaterThanOrEqual(0);
        expect(Math.hypot(h.x - w.town.x, h.z - w.town.z)).toBeLessThanOrEqual(w.town.radius);
        expect(isWater(w.heightmap, h.x, h.z)).toBe(false);
        expect(riverDistanceAt(w.river, h.x, h.z)).toBeGreaterThanOrEqual(4);
        expect(Math.hypot(h.x - w.spawn.x, h.z - w.spawn.z)).toBeGreaterThanOrEqual(8);
      }
      for (let i = 0; i < w.homes.length; i++) {
        for (let j = i + 1; j < w.homes.length; j++) {
          const d = Math.hypot(w.homes[i].x - w.homes[j].x, w.homes[i].z - w.homes[j].z);
          expect(d).toBeGreaterThanOrEqual(HOME_MIN_SPACING / 4);
        }
      }
    }
  });

  it("keeps props out of water, river, ramps, slopes, homes, and spawn", () => {
    for (const seed of SEEDS) {
      const w = generateWorld(seed);
      expect(w.props.length).toBeGreaterThan(200);
      expect(w.props.length).toBeLessThan(700);
      for (const p of w.props) {
        expect(isWater(w.heightmap, p.x, p.z)).toBe(false);
        expect(riverDistanceAt(w.river, p.x, p.z)).toBeGreaterThanOrEqual(RIVER_CLEARANCE);
        expect(slopeAt(w.heightmap, p.x, p.z)).toBeLessThanOrEqual(PROP_MAX_SLOPE);
        expect(isOnRamp(w.ramps, p.x, p.z)).toBe(false);
        expect(Math.hypot(p.x - w.spawn.x, p.z - w.spawn.z)).toBeGreaterThanOrEqual(PROP_SPAWN_CLEARANCE);
        for (const h of w.homes) expect(Math.hypot(p.x - h.x, p.z - h.z)).toBeGreaterThanOrEqual(PROP_HOME_CLEARANCE);
      }
      const types = new Set(w.props.map((p) => p.type));
      for (const t of ["tree", "pine", "fruitTree", "bush", "rock", "flower"]) expect(types.has(t as never)).toBe(true);
    }
  });

  it("adds prop sniff spots to interest", () => {
    const w = generateWorld(12345);
    expect(w.interest.length).toBeGreaterThan(90);
    expect(w.interest.length).toBeLessThanOrEqual(150);
  });

  it("generates in under 500 ms", () => {
    generateWorld(5);
    const t = performance.now();
    generateWorld(31337);
    expect(performance.now() - t).toBeLessThan(500);
  });
});

describe("collision", () => {
  it("pushes a body out of a tree and ignores it when standing above", () => {
    const w = generateWorld(12345);
    const tree = w.props.find((p) => p.type === "tree");
    expect(tree).toBeDefined();
    if (!tree) return;
    const collide = buildCollide(propColliders(w.props));
    const pushed = collide(tree.x + 0.1, tree.z, 0.4, tree.y);
    expect(pushed).not.toBeNull();
    if (pushed) expect(Math.hypot(pushed.x - tree.x, pushed.z - tree.z)).toBeGreaterThanOrEqual(tree.radius + 0.4 - 1e-6);
    expect(collide(tree.x + 0.1, tree.z, 0.4, tree.y + 10)).toBeNull();
    expect(collide(tree.x + 5, tree.z + 5, 0.1, tree.y)).toBeNull();
  });
});
