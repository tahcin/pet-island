import { normalizeReading, type Accessory, type PetReading } from "../schema/petReading";
import type { ChatLine, ItemKind, Mode, QuestState } from "../store";
import { durationWords } from "../talk/perception";

export const SAVE_KEY = "petIsland.save.v1";
export const SAVE_VERSION = 1;
export const SAVE_EVERY_MS = 20_000;
/** Return news only counts when the player was away at least this long (PRD 9.11). */
export const NEWS_MIN_AWAY_MS = 2 * 60_000;

export interface BodySave {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** Everything saved (PRD 9.11). Never the photo. */
export interface SaveData {
  version: number;
  savedAt: number;
  reading: PetReading;
  seed: number;
  mode: Mode;
  player: BodySave;
  pet: BodySave;
  inventory: Record<ItemKind, number>;
  collected: string[];
  quests: QuestState[];
  /** Town fields; optional so older saves still load. */
  friendship?: number[];
  bells?: number;
  equipped: Accessory[];
  petMemory: string[];
  chatLog: ChatLine[];
  villagerMemories: Record<string, string[]>;
}

/** Minimal storage surface so tests can pass a Map-backed fake. */
export interface SaveStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStore(): SaveStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const strs = (v: unknown, cap: number): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string").slice(-cap) : [];

function body(v: unknown): BodySave | null {
  if (!v || typeof v !== "object") return null;
  const b = v as Record<string, unknown>;
  if (![b.x, b.y, b.z, b.yaw].every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  return { x: num(b.x), y: num(b.y), z: num(b.z), yaw: num(b.yaw) };
}

/** Validates parsed JSON into a SaveData, or null when it is unusable or the wrong version. */
export function parseSave(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (s.version !== SAVE_VERSION) return null;
  const player = body(s.player);
  const pet = body(s.pet);
  if (!player || !pet || typeof s.seed !== "number" || !s.reading) return null;
  const inv = (s.inventory ?? {}) as Record<string, unknown>;
  const quests = Array.isArray(s.quests)
    ? s.quests.map((q) => (q === "active" || q === "done" ? q : "notStarted") as QuestState).slice(0, 6)
    : [];
  while (quests.length < 3) quests.push("notStarted");
  const town: Pick<SaveData, "friendship" | "bells"> = {};
  if (Array.isArray(s.friendship)) town.friendship = s.friendship.slice(0, 6).map((h) => num(h));
  if (typeof s.bells === "number") town.bells = num(s.bells);
  const log = Array.isArray(s.chatLog)
    ? s.chatLog
        .filter(
          (l): l is ChatLine =>
            !!l && typeof l === "object" && ((l as ChatLine).who === "person" || (l as ChatLine).who === "pet") && typeof (l as ChatLine).say === "string",
        )
        .slice(-12)
    : [];
  const vm: Record<string, string[]> = {};
  if (s.villagerMemories && typeof s.villagerMemories === "object") {
    for (const [k, v] of Object.entries(s.villagerMemories as Record<string, unknown>)) vm[k] = strs(v, 6);
  }
  return {
    version: SAVE_VERSION,
    savedAt: num(s.savedAt, Date.now()),
    reading: normalizeReading(s.reading),
    seed: s.seed >>> 0,
    mode: s.mode === "pet" ? "pet" : "companion",
    player,
    pet,
    inventory: { bone: num(inv.bone), yarn: num(inv.yarn), carrot: num(inv.carrot), shell: num(inv.shell) },
    collected: strs(s.collected, 500),
    quests,
    ...town,
    equipped: strs(s.equipped, 4) as Accessory[],
    petMemory: strs(s.petMemory, 8),
    chatLog: log,
    villagerMemories: vm,
  };
}

export function loadSave(store: SaveStore | null = defaultStore()): SaveData | null {
  try {
    const text = store?.getItem(SAVE_KEY);
    if (!text) return null;
    return parseSave(JSON.parse(text));
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData, store: SaveStore | null = defaultStore()): boolean {
  try {
    if (!store) return false;
    store.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(store: SaveStore | null = defaultStore()): void {
  try {
    store?.removeItem(SAVE_KEY);
  } catch {
    // Nothing to do; a stale save is harmless.
  }
}

export interface ReturnNews {
  /** Lines for the pet's greeting. */
  news: string[];
  duration: string;
  /** Collected shell ids to put back on the beach (up to 3). */
  respawnShells: string[];
  /** Memory added to every villager. */
  villagerMemory: string | null;
}

/**
 * Pure: what changed while the player was away (PRD 9.11). Deterministic for the same
 * inputs: the respawned shells are the most recently collected ones.
 */
export function returnNews(
  awayMs: number,
  petName: string,
  collected: readonly string[],
  isShell: (id: string) => boolean,
): ReturnNews {
  const duration = durationWords(Math.max(0, awayMs));
  if (awayMs < NEWS_MIN_AWAY_MS) return { news: [], duration, respawnShells: [], villagerMemory: null };
  const respawnShells = collected.filter(isShell).slice(-3);
  const news: string[] = [];
  if (respawnShells.length > 0) news.push("New shells washed up on the beach");
  const villagerMemory = `${petName} and their person were away for ${duration}.`;
  return { news, duration, respawnShells, villagerMemory };
}

/** "last visited 2 hours ago" */
export function lastVisited(savedAt: number, now: number): string {
  const ms = now - savedAt;
  if (ms < 60_000) return "last visited just now";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `last visited ${min} minute${min === 1 ? "" : "s"} ago`;
  const h = Math.round(ms / 3_600_000);
  if (h < 36) return `last visited ${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(ms / 86_400_000);
  return `last visited ${d} day${d === 1 ? "" : "s"} ago`;
}
