/**
 * Pure numbers for the retention loop: bond XP curve, level titles and rewards,
 * daily streaks, date seeded daily tasks, rare variant rolls, stamps and the shop.
 * No React, no store, no side effects.
 */

export const MAX_LEVEL = 10;

/** Total XP needed to reach each level (index 0 is level 1). */
export const LEVEL_XP = [0, 60, 150, 280, 450, 670, 950, 1300, 1720, 2220] as const;

export const LEVEL_TITLES = [
  "New friends",
  "Buddies",
  "Playmates",
  "Good pals",
  "Best pals",
  "Adventure pals",
  "Partners in crime",
  "Heart friends",
  "Kindred spirits",
  "Soulmates",
] as const;

export type RewardKind = "trick" | "sticker" | "title" | "bells";
export interface LevelReward {
  kind: RewardKind;
  id: string;
  label: string;
  bells?: number;
}

/** What each level unlocks (key is the level reached). */
export const LEVEL_REWARDS: Record<number, LevelReward> = {
  2: { kind: "sticker", id: "sticker-paw", label: "Paw print sticker" },
  3: { kind: "trick", id: "trick-hop", label: "Trick: Happy hop" },
  4: { kind: "bells", id: "bells-200", label: "A pouch of 200 bells", bells: 200 },
  5: { kind: "title", id: "title-regular", label: "Title: Island regular" },
  6: { kind: "trick", id: "trick-twirl", label: "Trick: Twirl" },
  7: { kind: "sticker", id: "sticker-star", label: "Shooting star sticker" },
  8: { kind: "bells", id: "bells-500", label: "A pouch of 500 bells", bells: 500 },
  9: { kind: "trick", id: "trick-bow", label: "Trick: Take a bow" },
  10: { kind: "title", id: "title-soulmates", label: "Title: Soulmates forever" },
};

export function levelForXp(xp: number): number {
  let level = 1;
  for (let i = 0; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]) level = i + 1;
  return level;
}

export function titleForLevel(level: number): string {
  return LEVEL_TITLES[Math.min(MAX_LEVEL, Math.max(1, level)) - 1];
}

/** Progress within the current level in [0, 1], plus XP left to the next one (0 at max). */
export function levelProgress(xp: number): { level: number; into: number; span: number; toNext: number; frac: number } {
  const level = levelForXp(xp);
  if (level >= MAX_LEVEL) return { level, into: 0, span: 0, toNext: 0, frac: 1 };
  const base = LEVEL_XP[level - 1];
  const span = LEVEL_XP[level] - base;
  const into = xp - base;
  return { level, into, span, toNext: span - into, frac: into / span };
}

/** Levels newly reached when XP goes from `before` to `after`. */
export function levelsGained(before: number, after: number): number[] {
  const out: number[] = [];
  for (let l = levelForXp(before) + 1; l <= levelForXp(after); l++) out.push(l);
  return out;
}

export const XP = {
  collect: 10,
  rare: 25,
  dig: 6,
  quest: 60,
  talk: 4,
  photo: 8,
  villager: 5,
} as const;

// ---------- dates and streaks ----------

/** Local calendar date as YYYY-MM-DD. */
export function localDateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Whole days from date key a to date key b (b later gives a positive number). */
export function daysBetween(a: string, b: string): number {
  const pa = a.split("-").map(Number);
  const pb = b.split("-").map(Number);
  const ta = Date.UTC(pa[0], pa[1] - 1, pa[2]);
  const tb = Date.UTC(pb[0], pb[1] - 1, pb[2]);
  return Math.round((tb - ta) / 86_400_000);
}

export interface VisitResult {
  streak: number;
  /** True on the first visit of a new calendar day. */
  newDay: boolean;
  /** Days since the last visit (0 on the same day, -1 on a first ever visit). */
  daysAway: number;
}

/** Streak rule: same day keeps it, the next day adds one, a gap or a first visit starts at 1. */
export function nextStreak(lastVisit: string | null, streak: number, today: string): VisitResult {
  if (!lastVisit) return { streak: 1, newDay: true, daysAway: -1 };
  const gap = daysBetween(lastVisit, today);
  if (gap <= 0) return { streak: Math.max(1, streak), newDay: false, daysAway: 0 };
  if (gap === 1) return { streak: streak + 1, newDay: true, daysAway: 1 };
  return { streak: 1, newDay: true, daysAway: gap };
}

/** Daily gift in bells: grows gently with the streak, capped so missing a day never hurts much. */
export function dailyGift(streak: number): number {
  return 100 + Math.min(6, Math.max(0, streak - 1)) * 25;
}

// ---------- seeded helpers ----------

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- daily tasks ----------

export type TaskKind = "collect" | "shell" | "dig" | "talk" | "quest" | "top" | "villager" | "photo";

export interface TaskDef {
  kind: TaskKind;
  goal: number;
  label: string;
  bells: number;
  xp: number;
}

export const TASK_POOL: TaskDef[] = [
  { kind: "shell", goal: 5, label: "Collect 5 shells", bells: 150, xp: 40 },
  { kind: "collect", goal: 8, label: "Pick up 8 treasures", bells: 150, xp: 40 },
  { kind: "dig", goal: 2, label: "Dig up 2 things", bells: 120, xp: 35 },
  { kind: "talk", goal: 3, label: "Talk to your pet 3 times", bells: 100, xp: 40 },
  { kind: "quest", goal: 1, label: "Finish a quest", bells: 200, xp: 50 },
  { kind: "top", goal: 1, label: "Visit the top of the island", bells: 120, xp: 35 },
  { kind: "villager", goal: 3, label: "Say hi to 3 townsfolk", bells: 120, xp: 35 },
  { kind: "photo", goal: 1, label: "Take a photo together", bells: 100, xp: 30 },
];

/** Three distinct tasks picked from the pool, seeded by the date key so every player shares the day. */
export function dailyTasks(dateKey: string): TaskDef[] {
  const rand = mulberry32(hashString(`daily:${dateKey}`));
  const pool = [...TASK_POOL];
  const out: TaskDef[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

// ---------- collection and rares ----------

export const ITEM_KINDS = ["shell", "bone", "yarn", "carrot"] as const;
export type CatalogKind = (typeof ITEM_KINDS)[number];

export const RARE_NAMES: Record<CatalogKind, string> = {
  shell: "Golden shell",
  bone: "Sparkly bone",
  yarn: "Rainbow yarn",
  carrot: "Giant carrot",
};

export const ITEM_NAMES: Record<CatalogKind, string> = {
  shell: "Seashell",
  bone: "Bone",
  yarn: "Ball of yarn",
  carrot: "Carrot",
};

export const RARE_CHANCE = 0.08;

export function isCatalogKind(kind: string): kind is CatalogKind {
  return (ITEM_KINDS as readonly string[]).includes(kind);
}

/** Deterministic rare roll for one pickup on one island on one day. */
export function rollRare(seed: number, itemId: string, dateKey: string, chance = RARE_CHANCE): boolean {
  return mulberry32(hashString(`${seed}:${itemId}:${dateKey}`))() < chance;
}

// ---------- stamps ----------

export interface Counters {
  collected: number;
  shells: number;
  dug: number;
  quests: number;
  talks: number;
  photos: number;
  islands: number;
  rares: number;
  villagers: number;
}

export const EMPTY_COUNTERS: Counters = {
  collected: 0,
  shells: 0,
  dug: 0,
  quests: 0,
  talks: 0,
  photos: 0,
  islands: 0,
  rares: 0,
  villagers: 0,
};

export interface StampDef {
  id: string;
  label: string;
  hint: string;
  test: (c: Counters, level: number, bestStreak: number) => boolean;
}

export const STAMPS: StampDef[] = [
  { id: "first-find", label: "First find", hint: "Pick up anything", test: (c) => c.collected >= 1 },
  { id: "first-dig", label: "Little digger", hint: "Dig something up", test: (c) => c.dug >= 1 },
  { id: "shells-10", label: "Beachcomber", hint: "Collect 10 shells", test: (c) => c.shells >= 10 },
  { id: "first-quest", label: "Helping paw", hint: "Finish a quest", test: (c) => c.quests >= 1 },
  { id: "quests-5", label: "Town hero", hint: "Finish 5 quests", test: (c) => c.quests >= 5 },
  { id: "chatty", label: "Chatterbox", hint: "Talk to your pet 10 times", test: (c) => c.talks >= 10 },
  { id: "photo", label: "Say cheese", hint: "Take a photo", test: (c) => c.photos >= 1 },
  { id: "rare", label: "Lucky find", hint: "Find a rare treasure", test: (c) => c.rares >= 1 },
  { id: "new-island", label: "Explorer", hint: "Visit a new island", test: (c) => c.islands >= 1 },
  { id: "streak-3", label: "Three in a row", hint: "Visit 3 days in a row", test: (_c, _l, s) => s >= 3 },
  { id: "streak-7", label: "Week of fun", hint: "Visit 7 days in a row", test: (_c, _l, s) => s >= 7 },
  { id: "bond-5", label: "Best pals", hint: "Reach bond level 5", test: (_c, l) => l >= 5 },
  { id: "bond-10", label: "Soulmates", hint: "Reach bond level 10", test: (_c, l) => l >= 10 },
];

/** Stamp ids earned by these numbers that are not already in `have`. */
export function newStamps(have: string[], c: Counters, level: number, bestStreak: number): string[] {
  return STAMPS.filter((s) => !have.includes(s.id) && s.test(c, level, bestStreak)).map((s) => s.id);
}

// ---------- shop ----------

export type ShopKind = "accessory" | "title" | "sticker";
export interface ShopItem {
  id: string;
  kind: ShopKind;
  label: string;
  price: number;
  /** Accessory name for store.equip. */
  accessory?: "bandana" | "bow" | "hat";
}

export const SHOP: ShopItem[] = [
  { id: "acc-bandana", kind: "accessory", label: "Comfy bandana", price: 300, accessory: "bandana" },
  { id: "acc-bow", kind: "accessory", label: "Ribbon bow", price: 450, accessory: "bow" },
  { id: "acc-hat", kind: "accessory", label: "Sun hat", price: 700, accessory: "hat" },
  { id: "title-beach", kind: "title", label: "Title: Beach bum", price: 250 },
  { id: "title-sleepy", kind: "title", label: "Title: Nap champion", price: 250 },
  { id: "sticker-shell", kind: "sticker", label: "Shell sticker", price: 120 },
  { id: "sticker-heart", kind: "sticker", label: "Heart sticker", price: 150 },
];

export function canBuy(bells: number, owned: string[], item: ShopItem): boolean {
  return !owned.includes(item.id) && bells >= item.price;
}

// ---------- next goal ----------

export interface TaskProgress {
  progress: number;
  done: boolean;
}

/** One friendly line that tells the player what to do next. */
export function nextGoal(xp: number, tasks: TaskProgress[], defs: TaskDef[]): string {
  let bestLeft = Infinity;
  let bestIdx = -1;
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (!defs[i] || t.done) continue;
    const left = defs[i].goal - t.progress;
    if (left < bestLeft) {
      bestLeft = left;
      bestIdx = i;
    }
  }
  const lp = levelProgress(xp);
  const toTitle = lp.level < MAX_LEVEL ? `${lp.toNext} XP to ${titleForLevel(lp.level + 1)}` : "You two are Soulmates";
  const def = bestIdx >= 0 ? defs[bestIdx] : null;
  if (def) return `${bestLeft} more for "${def.label}". ${toTitle}.`;
  return `All daily tasks done! ${toTitle}.`;
}
