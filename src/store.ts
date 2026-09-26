import { create } from "zustand";
import { DEFAULT_READING, type Accessory, type PetReading } from "./schema/petReading";

export type Screen = "landing" | "reading" | "reveal" | "play";
export type Mode = "companion" | "pet";

export const DEFAULT_SEED = 12345;

export function seedFromLocation(): number | null {
  if (typeof window === "undefined") return null;
  const m = /seed=(\d+)/.exec(window.location.hash);
  if (m) return Number(m[1]) >>> 0;
  const env = import.meta.env?.VITE_DEFAULT_SEED;
  return env ? Number(env) >>> 0 : null;
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

/** Collectible kinds (PRD 9.4). */
export type ItemKind = "bone" | "yarn" | "carrot" | "shell";
export type QuestState = "notStarted" | "active" | "done";
export type ChatLine = { who: "person" | "pet"; say: string };

interface GameState {
  screen: Screen;
  reading: PetReading;
  fallback: boolean;
  fallbackMessage: string | null;
  seed: number;
  mode: Mode;
  /** Preview of the uploaded photo (a data URL). Never saved. */
  photoUrl: string | null;
  /** True once the mind and villagers have arrived (or fallen back). */
  detailsReady: boolean;

  // ---- M5 play (owned by the play systems) ----
  /** Count per item kind the player is carrying. */
  inventory: Record<ItemKind, number>;
  /** Ids of collectibles already picked up on this island. */
  collected: string[];
  /** Quest state per villager index (0, 1, 2); only two villagers hold quests. */
  quests: QuestState[];
  /** Friendship hearts per townsperson index (0 to 5). */
  friendship: number[];
  /** Bells earned from town quests. */
  bells: number;
  /** Accessories the pet has earned and wears (quest rewards). */
  equipped: Accessory[];

  // ---- M6 living island ----
  /** Facts the pet remembers (cap 8). */
  petMemory: string[];
  /** Last lines of talk between the person and the pet (cap 16). */
  chatLog: ChatLine[];
  /** Memories per villager name (cap 6 each). */
  villagerMemories: Record<string, string[]>;
  /** Recent player events for Claude prompts, newest last (cap 8). */
  events: string[];

  // ---- M7 juice ----
  /** Sound is off until the player turns it on. */
  muted: boolean;
  photoMode: boolean;
  /** Time of day in [0, 1): 0.25 sunrise-ish morning, 0.5 noon, 0.75 dusk. */
  timeOfDay: number;
  dayPaused: boolean;

  setPhoto: (url: string | null) => void;
  setDetails: (details: Pick<PetReading, "mind" | "villagers">) => void;
  setScreen: (screen: Screen) => void;
  setReading: (reading: PetReading, fallback?: boolean, message?: string | null) => void;
  setSeed: (seed: number) => void;
  setMode: (mode: Mode) => void;
  toggleMode: () => void;

  collect: (id: string, kind: ItemKind) => void;
  spend: (kind: ItemKind, count: number) => void;
  setQuest: (index: number, state: QuestState) => void;
  equip: (accessory: Accessory) => void;
  addFriendship: (index: number, hearts: number) => void;
  addBells: (bells: number) => void;
  remember: (fact: string) => void;
  addChat: (line: ChatLine) => void;
  rememberVillager: (name: string, fact: string) => void;
  logEvent: (event: string) => void;
  /** N: new seed, keep the pet, reset collectibles and quests (PRD F17). */
  newIsland: (seed?: number) => void;
  setMuted: (muted: boolean) => void;
  setPhotoMode: (on: boolean) => void;
  setTimeOfDay: (t: number) => void;
  setDayPaused: (paused: boolean) => void;
}

const EMPTY_INVENTORY: Record<ItemKind, number> = { bone: 0, yarn: 0, carrot: 0, shell: 0 };
/** One quest slot per townsperson (three reading villagers plus three townsfolk). */
const FRESH_QUESTS: QuestState[] = ["notStarted", "notStarted", "notStarted", "notStarted", "notStarted", "notStarted"];
const FRESH_FRIENDSHIP = [0, 0, 0, 0, 0, 0];

const capPush = <T,>(list: T[], item: T, cap: number): T[] => [...list, item].slice(-cap);

export const useGame = create<GameState>()((set) => ({
  screen: "landing",
  reading: DEFAULT_READING,
  fallback: false,
  fallbackMessage: null,
  seed: seedFromLocation() ?? DEFAULT_SEED,
  mode: "companion",
  photoUrl: null,
  detailsReady: false,

  inventory: { ...EMPTY_INVENTORY },
  collected: [],
  quests: [...FRESH_QUESTS],
  friendship: [...FRESH_FRIENDSHIP],
  bells: 0,
  equipped: [],

  petMemory: [],
  chatLog: [],
  villagerMemories: {},
  events: [],

  muted: true,
  photoMode: false,
  timeOfDay: 0.4,
  dayPaused: false,

  setPhoto: (photoUrl) => set({ photoUrl }),
  setDetails: (details) => set((s) => ({ reading: { ...s.reading, ...details }, detailsReady: true })),
  setScreen: (screen) => set({ screen }),
  setReading: (reading, fallback = false, message = null) => set({ reading, fallback, fallbackMessage: message }),
  setSeed: (seed) => set({ seed }),
  setMode: (mode) => set({ mode }),
  toggleMode: () => set((s) => ({ mode: s.mode === "companion" ? "pet" : "companion" })),

  collect: (id, kind) =>
    set((s) =>
      s.collected.includes(id)
        ? s
        : { collected: [...s.collected, id], inventory: { ...s.inventory, [kind]: s.inventory[kind] + 1 } },
    ),
  spend: (kind, count) => set((s) => ({ inventory: { ...s.inventory, [kind]: Math.max(0, s.inventory[kind] - count) } })),
  setQuest: (index, state) => set((s) => ({ quests: s.quests.map((q, i) => (i === index ? state : q)) })),
  equip: (accessory) => set((s) => (s.equipped.includes(accessory) ? s : { equipped: [...s.equipped, accessory] })),
  addFriendship: (index, hearts) =>
    set((s) => ({ friendship: s.friendship.map((h, i) => (i === index ? Math.min(10, h + hearts) : h)) })),
  addBells: (bells) => set((s) => ({ bells: s.bells + bells })),
  remember: (fact) => set((s) => ({ petMemory: capPush(s.petMemory, fact, 8) })),
  addChat: (line) => set((s) => ({ chatLog: capPush(s.chatLog, line, 16) })),
  rememberVillager: (name, fact) =>
    set((s) => ({
      villagerMemories: { ...s.villagerMemories, [name]: capPush(s.villagerMemories[name] ?? [], fact, 6) },
    })),
  logEvent: (event) => set((s) => ({ events: capPush(s.events, event, 8) })),
  newIsland: (seed) =>
    set({
      seed: seed ?? randomSeed(),
      inventory: { ...EMPTY_INVENTORY },
      collected: [],
      quests: [...FRESH_QUESTS],
      friendship: [...FRESH_FRIENDSHIP],
      events: [],
      mode: "companion",
    }),
  setMuted: (muted) => set({ muted }),
  setPhotoMode: (photoMode) => set({ photoMode }),
  setTimeOfDay: (timeOfDay) => set({ timeOfDay }),
  setDayPaused: (dayPaused) => set({ dayPaused }),
}));
