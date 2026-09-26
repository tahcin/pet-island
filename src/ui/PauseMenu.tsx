import { useEffect, useRef, useState } from "react";
import { useGame } from "../store";
import { input } from "../control/useInput";
import { enableAudio } from "../juice/audio";
import { goNewIsland, useJuice } from "../juice/juiceState";
import "./pause.css";

/** Other overlays that own Esc while open; the pause menu only opens when none of them is up. */
const MODAL_SELECTOR = ".jn-panel, .pg-passport, .pg-welcome, .minimap-backdrop, .talk-bar";

function pressKey(code: string, key: string): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { code, key, bubbles: true }));
  window.dispatchEvent(new KeyboardEvent("keyup", { code, key, bubbles: true }));
}

/** Opens and closes the pause menu from anywhere (the HUD menu button uses this). */
export const pauseMenu = {
  /** True while the pause menu is up; other key handlers stay out of the way. */
  isOpen: false,
  open: () => window.dispatchEvent(new CustomEvent("pi:pause", { detail: true })),
  close: () => window.dispatchEvent(new CustomEvent("pi:pause", { detail: false })),
};

/**
 * Pause screen: Esc or the menu button. Pauses the day and gameplay input, and holds the
 * less frequent actions (sound, photo, new island) so the HUD stays uncluttered.
 */
export default function PauseMenu() {
  const [open, setOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const wasPaused = useRef(false);
  const reading = useGame((s) => s.reading);
  const seed = useGame((s) => s.seed);
  const muted = useGame((s) => s.muted);
  const requestPhoto = useJuice((s) => s.requestPhoto);

  const setPaused = (next: boolean) => {
    const g = useGame.getState();
    if (next) {
      wasPaused.current = g.dayPaused;
      g.setDayPaused(true);
      input.suspended = true;
      input.down.clear();
    } else {
      g.setDayPaused(wasPaused.current);
      input.suspended = false;
      setConfirmNew(false);
    }
    // Taps made while paused (N, P, Tab) must not fire the moment play resumes.
    input.pressed.clear();
    pauseMenu.isOpen = next;
    setOpen(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (!open && document.querySelector(MODAL_SELECTOR)) return;
      if (useGame.getState().photoMode) return;
      setPaused(!open);
    };
    const onPause = (e: Event) => setPaused(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener("keydown", onKey);
    window.addEventListener("pi:pause", onPause);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pi:pause", onPause);
    };
  });

  // Never leave input suspended if the island unmounts while paused.
  useEffect(() => () => {
    input.suspended = false;
    pauseMenu.isOpen = false;
  }, []);

  if (!open) return null;
  const name = reading.nameSuggestions[0];
  const then = (fn: () => void) => () => {
    setPaused(false);
    setTimeout(fn, 60);
  };

  return (
    <div className="pause-backdrop" data-no-orbit data-testid="pause-menu" onClick={() => setPaused(false)}>
      <div className="pause-card panel" onClick={(e) => e.stopPropagation()}>
        <div className="pause-kicker">Paused</div>
        <h2 className="title pause-title">{reading.islandName}</h2>
        <p className="pause-sub">
          {name} is waiting. The day stops while you are here.
        </p>

        <button className="btn pause-resume" data-testid="resume" onClick={() => setPaused(false)}>
          Resume
        </button>

        <div className="pause-grid">
          <button className="pause-item" onClick={then(() => pressKey("KeyJ", "j"))}>
            <span className="pause-key">J</span>Journal
          </button>
          <button className="pause-item" onClick={then(() => pressKey("KeyK", "k"))}>
            <span className="pause-key">K</span>Passport
          </button>
          <button className="pause-item" onClick={then(() => pressKey("KeyM", "m"))}>
            <span className="pause-key">M</span>Island map
          </button>
          <button className="pause-item" onClick={then(requestPhoto)}>
            <span className="pause-key">P</span>Take a photo
          </button>
          <button
            className="pause-item"
            data-testid="pause-sound"
            onClick={() => {
              if (muted) enableAudio();
              useGame.getState().setMuted(!muted);
            }}
          >
            <span className="pause-key">{muted ? "Off" : "On"}</span>Sound
          </button>
          {confirmNew ? (
            <button
              className="pause-item pause-danger"
              data-testid="pause-new-island-confirm"
              onClick={then(goNewIsland)}
            >
              <span className="pause-key">!</span>Yes, new island
            </button>
          ) : (
            <button className="pause-item" data-testid="pause-new-island" onClick={() => setConfirmNew(true)}>
              <span className="pause-key">N</span>New island
            </button>
          )}
        </div>
        {confirmNew && (
          <p className="pause-note">
            A fresh island with new townsfolk. {name} comes along; quests and items start over.
          </p>
        )}

        <div className="pause-controls">
          <span>WASD move</span>
          <span>Shift run</span>
          <span>Space interact</span>
          <span>T talk</span>
          <span>Tab be the pet</span>
          <span>C pet-cam</span>
          <span>Drag to look</span>
        </div>
        <div className="pause-seed">Seed {seed}</div>
      </div>
    </div>
  );
}
