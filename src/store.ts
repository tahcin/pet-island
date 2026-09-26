import { create } from "zustand";
import { DEFAULT_READING, type PetReading } from "./schema/petReading";

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
  setPhoto: (url: string | null) => void;
  setDetails: (details: Pick<PetReading, "mind" | "villagers">) => void;
  setScreen: (screen: Screen) => void;
  setReading: (reading: PetReading, fallback?: boolean, message?: string | null) => void;
  setSeed: (seed: number) => void;
  setMode: (mode: Mode) => void;
  toggleMode: () => void;
}

export const useGame = create<GameState>()((set) => ({
  screen: "landing",
  reading: DEFAULT_READING,
  fallback: false,
  fallbackMessage: null,
  seed: seedFromLocation() ?? DEFAULT_SEED,
  mode: "companion",
  photoUrl: null,
  detailsReady: false,
  setPhoto: (photoUrl) => set({ photoUrl }),
  setDetails: (details) => set((s) => ({ reading: { ...s.reading, ...details }, detailsReady: true })),
  setScreen: (screen) => set({ screen }),
  setReading: (reading, fallback = false, message = null) =>
    set({ reading, fallback, fallbackMessage: message }),
  setSeed: (seed) => set({ seed }),
  setMode: (mode) => set({ mode }),
  toggleMode: () => set((s) => ({ mode: s.mode === "companion" ? "pet" : "companion" })),
}));
