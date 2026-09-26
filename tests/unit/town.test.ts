import { describe, expect, it } from "vitest";
import { generateWorld } from "../../src/world/generateWorld";
import { heightAt, isWater, levelAt } from "../../src/world/heightmap";
import { riverDistanceAt } from "../../src/world/river";
import { compass, whereWords } from "../../src/world/town";
import { canTurnIn, deliveryTo, questDefs, questProgress, visitDone, type QuestContext } from "../../src/game/quests";
import { townsfolk } from "../../src/town/townsfolk";
import type { QuestState } from "../../src/store";

const SEEDS = [12345, 1, 777, 424242, 99, 5, 31337, 2024, 8, 60000];

describe("town", () => {
  it("is deterministic", () => {
    expect(generateWorld(777).town).toEqual(generateWorld(777).town);
  });

  it("puts a dry, flat plaza near spawn with six homes around it and no props inside", () => {
    for (const seed of SEEDS) {
      const w = generateWorld(seed);
      const t = w.town;
      const d = Math.hypot(t.x - w.spawn.x, t.z - w.spawn.z);
      expect(d).toBeGreaterThanOrEqual(10);
      expect(d).toBeLessThanOrEqual(75);
      expect(t.level).toBeGreaterThanOrEqual(0);
      expect(riverDistanceAt(w.river, t.x, t.z)).toBeGreaterThanOrEqual(8);
      for (let a = 0; a < 16; a++) {
        const x = t.x + Math.sin((a / 16) * Math.PI * 2) * t.plaza * 0.8;
        const z = t.z + Math.cos((a / 16) * Math.PI * 2) * t.plaza * 0.8;
        expect(isWater(w.heightmap, x, z)).toBe(false);
        expect(Math.abs(heightAt(w.heightmap, x, z) - t.y)).toBeLessThan(0.7);
      }
      expect(w.homes).toHaveLength(6);
      for (const h of w.homes) {
        expect(isWater(w.heightmap, h.x, h.z)).toBe(false);
        expect(levelAt(w.heightmap, h.x, h.z)).toBeGreaterThanOrEqual(0);
        expect(riverDistanceAt(w.river, h.x, h.z)).toBeGreaterThanOrEqual(4);
        expect(Math.hypot(h.x - t.x, h.z - t.z)).toBeLessThanOrEqual(t.radius);
      }
      for (const p of w.props) expect(Math.hypot(p.x - t.x, p.z - t.z)).toBeGreaterThanOrEqual(t.radius);
    }
  });

  it("describes places in words", () => {
    expect(compass(0, 0, 0, -10)).toBe("north");
    expect(compass(0, 0, 10, 0)).toBe("east");
    expect(whereWords({ x: 0, z: 0, radius: 16 }, 0, -10)).toBe("In town, north side");
    expect(whereWords({ x: 0, z: 0, radius: 16 }, 0, 50, { x: 0, z: 0 })).toBe("50 m south");
  });

  it("seeds three townsfolk with unique names", () => {
    const a = townsfolk(5, ["Mochi"]);
    expect(a).toEqual(townsfolk(5, ["Mochi"]));
    expect(a).toHaveLength(3);
    expect(new Set(a.map((p) => p.name)).size).toBe(3);
    expect(a.some((p) => p.name === "Mochi")).toBe(false);
    for (const p of a) expect(p.lines).toHaveLength(3);
  });
});

describe("quest steps", () => {
  const defs = questDefs("cat", 3);
  const ctx = (o: Partial<QuestContext> = {}): QuestContext => ({
    inventory: { bone: 0, yarn: 0, carrot: 0, shell: 0 },
    petToGiver: 99,
    playerLevel: 0,
    ...o,
  });

  it("has six quests including the two reward quests", () => {
    expect(defs.map((d) => d.villager)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(defs[0].reward.accessory).toBe("bandana");
    expect(defs[1].reward.accessory).toBe("hat");
    expect(new Set(defs.map((d) => d.type))).toEqual(new Set(["fetch", "deliver", "showPet", "visit"]));
  });

  it("checks fetch, show pet, visit, and delivery steps", () => {
    const fetch = defs[0];
    expect(canTurnIn("active", fetch, ctx({ inventory: { bone: 0, yarn: 0, carrot: 0, shell: 2 } }))).toBe(false);
    expect(canTurnIn("active", fetch, ctx({ inventory: { bone: 0, yarn: 0, carrot: 0, shell: 3 } }))).toBe(true);
    expect(canTurnIn("notStarted", fetch, ctx({ inventory: { bone: 0, yarn: 0, carrot: 0, shell: 3 } }))).toBe(false);
    expect(questProgress(fetch, "active", ctx({ inventory: { bone: 0, yarn: 0, carrot: 0, shell: 2 } }))).toEqual([2, 3]);
    const show = defs[2];
    expect(canTurnIn("active", show, ctx({ petToGiver: 2.5 }))).toBe(true);
    expect(canTurnIn("active", show, ctx({ petToGiver: 4 }))).toBe(false);
    const visit = defs[4];
    expect(visitDone("active", visit, ctx({ playerLevel: 2 }))).toBe(false);
    expect(visitDone("active", visit, ctx({ playerLevel: 3 }))).toBe(true);
    expect(visitDone("done", visit, ctx({ playerLevel: 3 }))).toBe(false);
    const quests: QuestState[] = ["notStarted", "notStarted", "notStarted", "active", "notStarted", "notStarted"];
    expect(deliveryTo(0, quests, defs)?.villager).toBe(3);
    expect(deliveryTo(1, quests, defs)).toBeNull();
    expect(deliveryTo(0, ["notStarted", "notStarted", "notStarted", "done", "notStarted", "notStarted"], defs)).toBeNull();
  });
});
