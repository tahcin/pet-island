import { describe, expect, it } from "vitest";
import { canWalk, generateWorld } from "../../src/world/generateWorld";
import { RES, gridX, gridZ, heightAt, isWater, levelAt, LEVEL_HEIGHTS } from "../../src/world/heightmap";
import { riverDistanceAt } from "../../src/world/river";
import { stepBody } from "../../src/control/movement";
import { makeBody } from "../../src/game/runtime";

const SEEDS = [12345, 1, 777, 424242, 99];

describe("heightmap", () => {
  it("is deterministic for a seed", () => {
    const a = generateWorld(12345);
    const b = generateWorld(12345);
    expect(Buffer.from(a.heightmap.heights.buffer).equals(Buffer.from(b.heightmap.heights.buffer))).toBe(true);
    expect(a.river.points).toEqual(b.river.points);
    expect(a.ramps).toEqual(b.ramps);
    expect(a.spawn).toEqual(b.spawn);
  });

  it("differs between seeds", () => {
    const a = generateWorld(1);
    const b = generateWorld(2);
    expect(Buffer.from(a.heightmap.heights.buffer).equals(Buffer.from(b.heightmap.heights.buffer))).toBe(false);
  });

  it("has no NaN heights and heightAt matches grid vertices", () => {
    for (const seed of SEEDS) {
      const w = generateWorld(seed);
      const h = w.heightmap.heights;
      for (let k = 0; k < h.length; k++) expect(Number.isFinite(h[k])).toBe(true);
      for (let n = 0; n < 200; n++) {
        const i = (n * 37) % RES;
        const j = (n * 91) % RES;
        expect(heightAt(w.heightmap, gridX(i), gridZ(j))).toBeCloseTo(h[j * RES + i], 4);
      }
    }
  });

  it("has a beach ring, three terraces, and water around the edge", () => {
    const w = generateWorld(12345);
    const seen = new Set<number>();
    for (let z = -78; z <= 78; z += 2) for (let x = -78; x <= 78; x += 2) seen.add(levelAt(w.heightmap, x, z));
    expect([...seen].sort()).toEqual([-1, 0, 1, 2, 3]);
    for (const [x, z] of [
      [-79, -79],
      [79, 79],
      [0, 79],
      [-79, 0],
    ]) {
      expect(isWater(w.heightmap, x, z)).toBe(true);
    }
  });

  it("generates in under 500 ms", () => {
    const t = performance.now();
    generateWorld(4242);
    expect(performance.now() - t).toBeLessThan(500);
  });
});

describe("river", () => {
  it("runs from the top level to the sea and is carved below sea level", () => {
    for (const seed of SEEDS) {
      const w = generateWorld(seed);
      const pts = w.river.points;
      expect(pts.length).toBeGreaterThan(15);
      const [ex, ez] = pts[pts.length - 1];
      expect(isWater(w.heightmap, ex, ez)).toBe(true);
      let below = 0;
      for (const [x, z] of pts) if (heightAt(w.heightmap, x, z) < 0) below++;
      expect(below / pts.length).toBeGreaterThan(0.9);
      expect(riverDistanceAt(w.river, pts[5][0], pts[5][1])).toBeLessThan(0.8);
    }
  });
});

describe("ramps", () => {
  it("two ramps per level boundary connect the levels", () => {
    for (const seed of SEEDS) {
      const w = generateWorld(seed);
      expect(w.ramps.filter((r) => r.fromLevel === 1).length).toBe(2);
      expect(w.ramps.filter((r) => r.fromLevel === 2).length).toBe(2);
      for (const r of w.ramps) {
        expect(levelAt(w.heightmap, r.ax, r.az)).toBe(r.fromLevel);
        expect(levelAt(w.heightmap, r.bx, r.bz)).toBe(r.toLevel);
        // Walk the centerline: every small step must be allowed.
        const steps = 60;
        for (let s = 0; s < steps; s++) {
          const t0 = s / steps;
          const t1 = (s + 1) / steps;
          const x0 = r.ax + (r.bx - r.ax) * t0;
          const z0 = r.az + (r.bz - r.az) * t0;
          const x1 = r.ax + (r.bx - r.ax) * t1;
          const z1 = r.az + (r.bz - r.az) * t1;
          expect(canWalk(w, x0, z0, x1, z1)).toBe(true);
        }
      }
    }
  });

  it("a character can walk up a ramp and scramble up a cliff", () => {
    const w = generateWorld(12345);
    const r = w.ramps.find((q) => q.fromLevel === 1)!;
    const body = makeBody(1.3, 0.35);
    body.pos.set(r.ax - r.dx * 1.5, heightAt(w.heightmap, r.ax, r.az), r.az - r.dz * 1.5);
    for (let i = 0; i < 240; i++) stepBody(body, r.dx * 4.8, r.dz * 4.8, 1 / 60, w);
    expect(body.pos.y).toBeGreaterThan(LEVEL_HEIGHTS[1] - 0.2);

    // Beside the ramp the whole island is walkable too: walking at the cliff climbs it.
    const side = 9;
    const sx = r.ax - r.dx * 1.5 - r.dz * side;
    const sz = r.az - r.dz * 1.5 + r.dx * side;
    if (levelAt(w.heightmap, sx, sz) === 1 && levelAt(w.heightmap, sx + r.dx * 12, sz + r.dz * 12) === 2) {
      const b2 = makeBody(1.3, 0.35);
      b2.pos.set(sx, heightAt(w.heightmap, sx, sz), sz);
      for (let i = 0; i < 60 * 8; i++) stepBody(b2, r.dx * 4.8, r.dz * 4.8, 1 / 60, w);
      expect(b2.pos.y).toBeGreaterThan(LEVEL_HEIGHTS[1] - 0.2);
    }
  });

  it("water blocks movement", () => {
    const w = generateWorld(12345);
    const body = makeBody(1.3, 0.35);
    const s = w.spawn;
    body.pos.set(s.x, heightAt(w.heightmap, s.x, s.z), s.z);
    // Walk straight away from the island center for 30 s.
    const len = Math.hypot(s.x, s.z) || 1;
    for (let i = 0; i < 1800; i++) stepBody(body, (s.x / len) * 8, (s.z / len) * 8, 1 / 60, w);
    expect(isWater(w.heightmap, body.pos.x, body.pos.z)).toBe(false);
    expect(body.pos.y).toBeGreaterThan(0);
  });

  it("spawn is on a dry beach", () => {
    for (const seed of SEEDS) {
      const w = generateWorld(seed);
      expect(levelAt(w.heightmap, w.spawn.x, w.spawn.z)).toBe(0);
      expect(isWater(w.heightmap, w.petSpawn.x, w.petSpawn.z)).toBe(false);
    }
  });
});
