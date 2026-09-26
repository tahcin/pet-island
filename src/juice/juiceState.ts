import { create } from "zustand";
import { useGame } from "../store";

/** Transient UI state for M7 juice (countdown, flash, toast). Never saved. */
interface JuiceState {
  /** Countdown digit shown while photo mode waits to capture, or null. */
  countdown: number | null;
  /** Bumped on each capture so the flash animation restarts. */
  flash: number;
  toast: { id: number; text: string } | null;
  /** Set by the HUD photo button; the in-canvas photo system picks it up next frame. */
  photoRequest: boolean;
  setCountdown: (n: number | null) => void;
  bumpFlash: () => void;
  showToast: (text: string) => void;
  clearToast: (id: number) => void;
  requestPhoto: () => void;
  takeRequest: () => boolean;
}

let toastId = 0;

export const useJuice = create<JuiceState>()((set, get) => ({
  countdown: null,
  flash: 0,
  toast: null,
  photoRequest: false,
  setCountdown: (countdown) => set({ countdown }),
  bumpFlash: () => set((s) => ({ flash: s.flash + 1 })),
  showToast: (text) => set({ toast: { id: ++toastId, text } }),
  clearToast: (id) => set((s) => (s.toast?.id === id ? { toast: null } : s)),
  requestPhoto: () => set({ photoRequest: true }),
  takeRequest: () => {
    if (!get().photoRequest) return false;
    set({ photoRequest: false });
    return true;
  },
}));

/** N or the HUD button: a fresh island, same pet (F17). */
export function goNewIsland(): void {
  useGame.getState().newIsland();
  useJuice.getState().showToast("Welcome to a new island");
}
