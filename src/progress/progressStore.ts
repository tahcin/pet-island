import { create } from "zustand";
import { useGame } from "../store";
import { petControl } from "../game/petControl";
import { showGlyph } from "../game/Effects";
import {
  EMPTY_COUNTERS,
  LEVEL_REWARDS,
  RARE_NAMES,
  SHOP,
  STAMPS,
  canBuy,
  dailyGift,
  dailyTasks,
  levelForXp,
  levelsGained,
  localDateKey,
  newStamps,
  nextStreak,
  titleForLevel,
  type CatalogKind,
  type Counters,
  type LevelReward,
  type TaskKind,
} from "./progression";

export const PROGRESS_KEY = "petIsland.progress.v1";
const VERSION = 1;

export interface DailyState {
  date: string;
  /** Progress per task, same order as dailyTasks(date). */
  progress: number[];
  done: boolean[];
}

/** Everything that survives a reload. */
export interface ProgressData {
  v: number;
  xp: number;
  streak: number;
  bestStreak: number;
  lastVisit: string | null;
  daily: DailyState;
  counters: Counters;
  /** Pickups per kind, and rare pickups per kind. */
  catalog: Record<CatalogKind, number>;
  rares: Record<CatalogKind, number>;
  stamps: string[];
  /** Shop items bought plus level rewards unlocked (ids). */
  owned: string[];
  title: string | null;
  /** Top of the island reached today (so the task counts once). */
  topToday: string | null;
}

export interface WelcomeCard {
  streak: number;
  gift: number;
  daysAway: number;
  firstEver: boolean;
}

export interface Celebration {
  id: number;
  level: number;
  title: string;
  reward: LevelReward | null;
}

export type PassportTab = "bond" | "today" | "collection" | "stamps" | "shop";

interface ProgressState extends ProgressData {
  open: boolean;
  tab: PassportTab;
  welcome: WelcomeCard | null;
  celebration: Celebration | null;
  notice: { id: number; text: string; rare: boolean } | null;
  setOpen: (open: boolean) => void;
  setTab: (tab: PassportTab) => void;
  dismissWelcome: () => void;
  dismissCelebration: () => void;
  visit: (now?: Date) => void;
  addXp: (amount: number) => void;
  /** Counts an action: bumps counters, daily tasks, stamps. */
  track: (counter: keyof Counters | null, task: TaskKind | null, n?: number) => void;
  recordFind: (kind: CatalogKind, rare: boolean) => void;
  buy: (id: string) => boolean;
  setTitle: (title: string | null) => void;
  notify: (text: string, rare?: boolean) => void;
}

const zeroKinds = (): Record<CatalogKind, number> => ({ shell: 0, bone: 0, yarn: 0, carrot: 0 });

function freshDaily(date: string): DailyState {
  return { date, progress: [0, 0, 0], done: [false, false, false] };
}

export function freshData(): ProgressData {
  return {
    v: VERSION,
    xp: 0,
    streak: 0,
    bestStreak: 0,
    lastVisit: null,
    daily: freshDaily(localDateKey(new Date())),
    counters: { ...EMPTY_COUNTERS },
    catalog: zeroKinds(),
    rares: zeroKinds(),
    stamps: [],
    owned: [],
    title: null,
    topToday: null,
  };
}

const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function kinds(v: unknown): Record<CatalogKind, number> {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { shell: num(o.shell), bone: num(o.bone), yarn: num(o.yarn), carrot: num(o.carrot) };
}

/** Parses saved JSON, tolerating missing fields and junk. Returns fresh data on anything unusable. */
export function parseProgress(raw: string | null): ProgressData {
  const base = freshData();
  if (!raw) return base;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== "object" || o.v !== VERSION) return base;
    const c = (o.counters && typeof o.counters === "object" ? o.counters : {}) as Record<string, unknown>;
    const counters = { ...EMPTY_COUNTERS };
    for (const k of Object.keys(counters) as (keyof Counters)[]) counters[k] = num(c[k]);
    const d = (o.daily && typeof o.daily === "object" ? o.daily : {}) as Record<string, unknown>;
    const daily: DailyState =
      typeof d.date === "string" && Array.isArray(d.progress) && Array.isArray(d.done)
        ? {
            date: d.date,
            progress: [0, 1, 2].map((i) => num((d.progress as unknown[])[i])),
            done: [0, 1, 2].map((i) => (d.done as unknown[])[i] === true),
          }
        : base.daily;
    return {
      v: VERSION,
      xp: Math.max(0, num(o.xp)),
      streak: num(o.streak),
      bestStreak: num(o.bestStreak),
      lastVisit: typeof o.lastVisit === "string" ? o.lastVisit : null,
      daily,
      counters,
      catalog: kinds(o.catalog),
      rares: kinds(o.rares),
      stamps: strs(o.stamps),
      owned: strs(o.owned),
      title: typeof o.title === "string" ? o.title : null,
      topToday: typeof o.topToday === "string" ? o.topToday : null,
    };
  } catch {
    return base;
  }
}

function load(): ProgressData {
  try {
    return parseProgress(window.localStorage.getItem(PROGRESS_KEY));
  } catch {
    return freshData();
  }
}

function pick(s: ProgressData): ProgressData {
  return {
    v: VERSION,
    xp: s.xp,
    streak: s.streak,
    bestStreak: s.bestStreak,
    lastVisit: s.lastVisit,
    daily: s.daily,
    counters: s.counters,
    catalog: s.catalog,
    rares: s.rares,
    stamps: s.stamps,
    owned: s.owned,
    title: s.title,
    topToday: s.topToday,
  };
}

let noticeId = 0;
let celebrateId = 0;

export const useProgress = create<ProgressState>()((set, get) => ({
  ...(typeof window === "undefined" ? freshData() : load()),
  open: false,
  tab: "today",
  welcome: null,
  celebration: null,
  notice: null,

  setOpen: (open) => set({ open }),
  setTab: (tab) => set({ tab, open: true }),
  dismissWelcome: () => set({ welcome: null }),
  dismissCelebration: () => set({ celebration: null }),
  notify: (text, rare = false) => set({ notice: { id: ++noticeId, text, rare } }),

  visit: (now = new Date()) => {
    const today = localDateKey(now);
    const s = get();
    const r = nextStreak(s.lastVisit, s.streak, today);
    const daily = s.daily.date === today ? s.daily : freshDaily(today);
    if (!r.newDay) {
      set({ daily, streak: r.streak, lastVisit: today });
      return;
    }
    const gift = dailyGift(r.streak);
    useGame.getState().addBells(gift);
    set({
      daily,
      streak: r.streak,
      bestStreak: Math.max(s.bestStreak, r.streak),
      lastVisit: today,
      welcome: { streak: r.streak, gift, daysAway: r.daysAway, firstEver: r.daysAway < 0 },
    });
    checkStamps();
  },

  addXp: (amount) => {
    const before = get().xp;
    const after = before + amount;
    set({ xp: after });
    const gained = levelsGained(before, after);
    if (!gained.length) return;
    const owned = [...get().owned];
    let last: Celebration | null = null;
    for (const level of gained) {
      const reward = LEVEL_REWARDS[level] ?? null;
      if (reward && !owned.includes(reward.id)) {
        owned.push(reward.id);
        if (reward.bells) useGame.getState().addBells(reward.bells);
      }
      last = { id: ++celebrateId, level, title: titleForLevel(level), reward };
    }
    set({ owned, celebration: last });
    petControl.brain?.celebrate();
    showGlyph("heart");
    checkStamps();
  },

  track: (counter, task, n = 1) => {
    const s = get();
    if (counter) set({ counters: { ...s.counters, [counter]: s.counters[counter] + n } });
    if (task) {
      const today = localDateKey(new Date());
      const daily = s.daily.date === today ? s.daily : freshDaily(today);
      const defs = dailyTasks(daily.date);
      const progress = [...daily.progress];
      const done = [...daily.done];
      let payXp = 0;
      defs.forEach((def, i) => {
        if (def.kind !== task || done[i]) return;
        progress[i] = Math.min(def.goal, progress[i] + n);
        if (progress[i] >= def.goal) {
          done[i] = true;
          payXp += def.xp;
          useGame.getState().addBells(def.bells);
          get().notify(`Daily task done: ${def.label}. +${def.bells} bells`);
        }
      });
      set({ daily: { date: daily.date, progress, done } });
      if (payXp) get().addXp(payXp);
    }
    checkStamps();
  },

  recordFind: (kind, rare) => {
    const s = get();
    set({
      catalog: { ...s.catalog, [kind]: s.catalog[kind] + 1 },
      rares: rare ? { ...s.rares, [kind]: s.rares[kind] + 1 } : s.rares,
    });
    if (rare) {
      get().notify(`Wow, a ${RARE_NAMES[kind]}! It sparkles in the sun.`, true);
      showGlyph("star");
    }
  },

  buy: (id) => {
    const item = SHOP.find((x) => x.id === id);
    const g = useGame.getState();
    if (!item || !canBuy(g.bells, get().owned, item)) return false;
    g.addBells(-item.price);
    set({ owned: [...get().owned, item.id] });
    if (item.accessory) {
      g.equip(item.accessory);
      showGlyph("heart");
    }
    if (item.kind === "title") set({ title: item.label.replace(/^Title: /, "") });
    get().notify(`Bought ${item.label}!`);
    return true;
  },

  setTitle: (title) => set({ title }),
}));

function checkStamps(): void {
  const s = useProgress.getState();
  const fresh = newStamps(s.stamps, s.counters, levelForXp(s.xp), s.bestStreak);
  if (!fresh.length) return;
  useProgress.setState({ stamps: [...s.stamps, ...fresh] });
  const label = STAMPS.find((x) => x.id === fresh[0])?.label ?? "";
  if (!s.celebration) s.notify(`New passport stamp: ${label}`);
}

// Persist on every change (only the saved fields).
if (typeof window !== "undefined") {
  useProgress.subscribe((s) => {
    try {
      window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(pick(s)));
    } catch {
      // Storage full or blocked: progress stays in memory for this session.
    }
  });
}
