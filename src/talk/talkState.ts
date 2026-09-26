import { create } from "zustand";

/** UI state for talking (DOM overlay and 3D bubbles). Not saved. */
interface TalkUi {
  open: boolean;
  /** The player's last line, shown over the avatar. */
  playerLine: string | null;
  /** The pet's bubble: thinking shows dots, otherwise text types out. */
  petThinking: boolean;
  petLine: string | null;
  /** Bumped on every new pet line so the bubble restarts its typewriter. */
  petLineId: number;
  toast: string | null;
  setOpen: (open: boolean) => void;
}

export const useTalk = create<TalkUi>()((set) => ({
  open: false,
  playerLine: null,
  petThinking: false,
  petLine: null,
  petLineId: 0,
  toast: null,
  setOpen: (open) => set({ open }),
}));
