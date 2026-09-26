import { useEffect, useRef, type ReactNode } from "react";
import { useGame } from "../store";
import { enableAudio } from "../juice/audio";
import { goNewIsland, useJuice } from "../juice/juiceState";
import { speciesAccent } from "../juice/photo";
import "../juice/juice.css";

const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const ICONS = {
  soundOn: svg(
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
      <path d="M15.5 9a4 4 0 0 1 0 6" />
      <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>,
  ),
  soundOff: svg(
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>,
  ),
  sun: svg(
    <>
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>,
  ),
  pause: svg(
    <>
      <rect x="6.5" y="5" width="3.6" height="14" rx="1.4" fill="currentColor" stroke="none" />
      <rect x="13.9" y="5" width="3.6" height="14" rx="1.4" fill="currentColor" stroke="none" />
    </>,
  ),
  camera: svg(
    <>
      <path d="M4 8.5a2 2 0 0 1 2-2h2l1.5-2h5l1.5 2h2a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="12.5" r="3.4" />
    </>,
  ),
  island: svg(
    <>
      <path d="M3 18.5c3-1.6 6-1.6 9 0s6 1.6 9 0" />
      <path d="M6 15.5c1.6-2.6 10.4-2.6 12 0" />
      <path d="M12 14V6.5" />
      <path d="M12 6.5c-1.8-1.6-4.2-1.4-5.5 0M12 6.5c1.8-1.6 4.2-1.4 5.5 0M12 6.5c-.6-1.8.2-3.2 1.8-3.8" />
    </>,
  ),
};

function HudButton(props: { label: string; keyHint?: string; onClick: () => void; active?: boolean; testId: string; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`hud-btn${props.active ? " on" : ""}`}
      title={props.keyHint ? `${props.label} (${props.keyHint})` : props.label}
      aria-label={props.label}
      data-testid={props.testId}
      onClick={(e) => {
        props.onClick();
        e.currentTarget.blur();
      }}
    >
      {props.children}
      {props.keyHint && <span className="hud-btn-key">{props.keyHint}</span>}
    </button>
  );
}

/** Pastel HUD: pet card, mode pill, control hints, seed, and the M7 buttons (PRD F13, section 8). */
export default function Hud() {
  const reading = useGame((s) => s.reading);
  const mode = useGame((s) => s.mode);
  const seed = useGame((s) => s.seed);
  const muted = useGame((s) => s.muted);
  const dayPaused = useGame((s) => s.dayPaused);
  const setMuted = useGame((s) => s.setMuted);
  const setDayPaused = useGame((s) => s.setDayPaused);
  const requestPhoto = useJuice((s) => s.requestPhoto);
  const buttons = useRef<HTMLDivElement>(null);
  // The play wrapper captures the pointer on pointerdown for mouse look, which would steal the
  // click. A native listener here stops the event before it bubbles to the wrapper.
  useEffect(() => {
    const el = buttons.current;
    if (!el) return;
    const stop = (e: PointerEvent) => e.stopPropagation();
    el.addEventListener("pointerdown", stop);
    return () => el.removeEventListener("pointerdown", stop);
  }, []);
  const name = reading.nameSuggestions[0];
  const hints =
    mode === "companion"
      ? ["WASD move", "Shift run", "Space play", "T talk", "Tab be the pet", "P photo", "N new island"]
      : ["WASD move", "Shift run", "Space dig or sniff", "C pet-cam", "Tab back", "P photo", "N new island"];
  const accent = speciesAccent(reading.spec.species);
  return (
    <div className="hud" style={{ ["--hud-accent" as string]: accent }}>
      <div className="hud-card panel" data-testid="hud-pet">
        <div className="hud-name title">{name}</div>
        <div className="hud-traits">
          {reading.personality.map((p) => (
            <span key={p} className="hud-trait">
              {p}
            </span>
          ))}
        </div>
      </div>
      <div className={`hud-mode panel mode-${mode}`} data-testid="mode">
        {mode === "companion" ? `Exploring with ${name}` : `Playing as ${name}`}
      </div>
      <div className="hud-buttons" ref={buttons}>
        <HudButton
          label={muted ? "Sound off" : "Sound on"}
          testId="sound-toggle"
          active={!muted}
          onClick={() => {
            if (muted) enableAudio();
            setMuted(!muted);
          }}
        >
          {muted ? ICONS.soundOff : ICONS.soundOn}
        </HudButton>
        <HudButton
          label={dayPaused ? "Resume the day" : "Pause the day"}
          testId="day-toggle"
          active={dayPaused}
          onClick={() => setDayPaused(!dayPaused)}
        >
          {dayPaused ? ICONS.sun : ICONS.pause}
        </HudButton>
        <HudButton label="Photo" keyHint="P" testId="photo-button" onClick={requestPhoto}>
          {ICONS.camera}
        </HudButton>
        <HudButton label="New island" keyHint="N" testId="new-island-button" onClick={goNewIsland}>
          {ICONS.island}
        </HudButton>
      </div>
      <div className="hud-hints">
        {hints.map((h) => (
          <span key={h} className="hud-hint">
            {h}
          </span>
        ))}
      </div>
      <div className="hud-seed" data-testid="seed">
        {reading.islandName} · seed {seed}
      </div>
    </div>
  );
}
