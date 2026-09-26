import { describe, expect, it } from "vitest";
import {
  LEVEL_XP,
  MAX_LEVEL,
  SHOP,
  canBuy,
  dailyGift,
  dailyTasks,
  daysBetween,
  levelForXp,
  levelProgress,
  levelsGained,
  localDateKey,
  newStamps,
  nextGoal,
  nextStreak,
  rollRare,
  titleForLevel,
  EMPTY_COUNTERS,
} from "../../src/progress/progression";
import { parseProgress } from "../../src/progress/progressStore";

describe("bond levels", () => {
  it("maps xp to levels 1 to 10 with titles", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(59)).toBe(1);
    expect(levelForXp(60)).toBe(2);
    expect(levelForXp(99999)).toBe(MAX_LEVEL);
    expect(titleForLevel(1)).toBe("New friends");
    expect(titleForLevel(5)).toBe("Best pals");
    expect(titleForLevel(10)).toBe("Soulmates");
  });
  it("curve is strictly increasing", () => {
    for (let i = 1; i < LEVEL_XP.length; i++) expect(LEVEL_XP[i]).toBeGreaterThan(LEVEL_XP[i - 1]);
  });
  it("reports progress and gained levels", () => {
    const p = levelProgress(90);
    expect(p.level).toBe(2);
    expect(p.toNext).toBe(60);
    expect(p.frac).toBeCloseTo(1 / 3);
    expect(levelProgress(5000).frac).toBe(1);
    expect(levelsGained(50, 160)).toEqual([2, 3]);
    expect(levelsGained(10, 20)).toEqual([]);
  });
});

describe("streaks", () => {
  it("counts consecutive days and resets after a gap", () => {
    expect(nextStreak(null, 0, "2026-09-26")).toEqual({ streak: 1, newDay: true, daysAway: -1 });
    expect(nextStreak("2026-09-26", 3, "2026-09-26")).toEqual({ streak: 3, newDay: false, daysAway: 0 });
    expect(nextStreak("2026-09-25", 3, "2026-09-26")).toEqual({ streak: 4, newDay: true, daysAway: 1 });
    expect(nextStreak("2026-09-20", 9, "2026-09-26")).toEqual({ streak: 1, newDay: true, daysAway: 6 });
  });
  it("handles month and year boundaries", () => {
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
    expect(localDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
  it("gift grows gently and caps", () => {
    expect(dailyGift(1)).toBe(100);
    expect(dailyGift(3)).toBe(150);
    expect(dailyGift(50)).toBe(dailyGift(7));
  });
});

describe("daily tasks", () => {
  it("are three distinct tasks, stable per date", () => {
    const a = dailyTasks("2026-09-26");
    expect(a).toHaveLength(3);
    expect(new Set(a.map((t) => t.kind)).size).toBe(3);
    expect(dailyTasks("2026-09-26")).toEqual(a);
  });
  it("change across days", () => {
    const days = ["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29"].map((d) => dailyTasks(d).map((t) => t.kind).join());
    expect(new Set(days).size).toBeGreaterThan(1);
  });
  it("next goal names the closest task, then the next title", () => {
    const defs = dailyTasks("2026-09-26");
    const line = nextGoal(0, [{ progress: 0, done: false }, { progress: 0, done: true }, { progress: 0, done: true }], defs);
    expect(line).toContain(defs[0].label);
    expect(line).toContain("60 XP to Buddies");
    expect(nextGoal(0, defs.map(() => ({ progress: 0, done: true })), defs)).toContain("All daily tasks done");
  });
});

describe("rares, stamps, shop", () => {
  it("rare roll is deterministic and near the chance", () => {
    expect(rollRare(1, "shell-3", "2026-09-26")).toBe(rollRare(1, "shell-3", "2026-09-26"));
    let hits = 0;
    for (let i = 0; i < 2000; i++) if (rollRare(12345, `item-${i}`, "2026-09-26")) hits++;
    expect(hits / 2000).toBeGreaterThan(0.04);
    expect(hits / 2000).toBeLessThan(0.12);
    expect(rollRare(1, "x", "d", 1)).toBe(true);
    expect(rollRare(1, "x", "d", 0)).toBe(false);
  });
  it("awards stamps once", () => {
    const c = { ...EMPTY_COUNTERS, collected: 1, dug: 1 };
    expect(newStamps([], c, 1, 1)).toEqual(["first-find", "first-dig"]);
    expect(newStamps(["first-find"], c, 5, 3)).toEqual(["first-dig", "streak-3", "bond-5"]);
  });
  it("shop checks bells and ownership", () => {
    const bow = SHOP.find((s) => s.id === "acc-bow")!;
    expect(canBuy(100, [], bow)).toBe(false);
    expect(canBuy(1000, [], bow)).toBe(true);
    expect(canBuy(1000, ["acc-bow"], bow)).toBe(false);
    expect(SHOP.length).toBeGreaterThanOrEqual(5);
    expect(SHOP.length).toBeLessThanOrEqual(8);
  });
});

describe("saved progress", () => {
  it("tolerates junk and wrong versions", () => {
    expect(parseProgress(null).xp).toBe(0);
    expect(parseProgress("{not json").xp).toBe(0);
    expect(parseProgress(JSON.stringify({ v: 99, xp: 500 })).xp).toBe(0);
    const p = parseProgress(JSON.stringify({ v: 1, xp: 120, stamps: ["a", 3], counters: { shells: "x", dug: 2 } }));
    expect(p.xp).toBe(120);
    expect(p.stamps).toEqual(["a"]);
    expect(p.counters.shells).toBe(0);
    expect(p.counters.dug).toBe(2);
  });
});
