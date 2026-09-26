import { useEffect, useRef, type ReactNode } from "react";
import { useGame } from "../store";
import { input, TOUCH_RUN_THRESHOLD } from "../control/useInput";
import { runtime } from "../game/runtime";
import { IS_TOUCH } from "./device";
import { useTalk } from "../talk/talkState";
import "./mobile.css";

/** Stick travel in px from the centre to full deflection. */
const STICK_RADIUS = 48;

declare global {
  interface Window {
    /** DEV only: the controlled body position, for the mobile e2e test. */
    __touchPos?: () => { x: number; z: number };
  }
}

/** Presses a key through the same window listeners the keyboard uses. */
function pressKey(code: string): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { code, key: code, bubbles: true }));
  window.dispatchEvent(new KeyboardEvent("keyup", { code, key: code, bubbles: true }));
}

function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = base.current;
    if (!el) return;
    let id: number | null = null;
    let cx = 0;
    let cy = 0;
    const set = (dx: number, dy: number) => {
      const len = Math.hypot(dx, dy);
      const k = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
      const px = dx * k;
      const py = dy * k;
      if (knob.current) knob.current.style.transform = `translate(${px}px, ${py}px)`;
      const mag = Math.min(len / STICK_RADIUS, 1);
      // A small dead zone so a resting thumb does not creep.
      const live = mag < 0.12 ? 0 : 1;
      input.touchX = (px / STICK_RADIUS) * live;
      input.touchY = (-py / STICK_RADIUS) * live;
      input.touchRun = mag >= TOUCH_RUN_THRESHOLD;
      el.classList.toggle("running", input.touchRun);
    };
    const down = (e: PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (id !== null) return;
      id = e.pointerId;
      el.setPointerCapture(e.pointerId);
      const r = el.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      el.classList.add("active");
      set(e.clientX - cx, e.clientY - cy);
      input.lastKeyAt = performance.now();
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      set(e.clientX - cx, e.clientY - cy);
      input.lastKeyAt = performance.now();
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      el.classList.remove("active", "running");
      set(0, 0);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      input.touchX = 0;
      input.touchY = 0;
      input.touchRun = false;
    };
  }, []);
  return (
    <div className="tc-stick" ref={base} data-no-orbit data-testid="touch-stick" aria-label="Move">
      <div className="tc-knob" ref={knob} />
    </div>
  );
}

function ActionButton(props: { code: string; label: string; testId: string; big?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`tc-btn${props.big ? " big" : ""}`}
      aria-label={props.label}
      data-testid={props.testId}
      onPointerDown={(e) => {
        // Fire on touch-down for snappy controls; stop the play wrapper from starting an orbit.
        e.stopPropagation();
        e.preventDefault();
        pressKey(props.code);
      }}
      onClick={(e) => e.preventDefault()}
    >
      {props.children}
      <span className="tc-label">{props.label}</span>
    </button>
  );
}

const icon = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

/** PRD F23: virtual joystick and round action buttons, shown on touch devices only. */
export default function TouchControls() {
  const mode = useGame((s) => s.mode);
  const photo = useGame((s) => s.photoMode);
  const talking = useTalk((s) => s.open);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__touchPos = () => {
      const b = useGame.getState().mode === "pet" ? runtime.pet : runtime.avatar;
      return { x: b.pos.x, z: b.pos.z };
    };
    return () => {
      delete window.__touchPos;
    };
  }, []);
  if (!IS_TOUCH) return null;
  return (
    <div className={`tc-root${talking || photo ? " hidden" : ""}`} data-testid="touch-controls">
      <Joystick />
      <div className="tc-actions" data-no-orbit>
        <ActionButton code="Space" label={mode === "pet" ? "Sniff" : "Use"} testId="touch-interact" big>
          {icon(<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V14c0 3.5-2.5 6-6 6s-5-2-6.5-4.5L3 12.5a1.5 1.5 0 0 1 2.5-1.5L8 13" />)}
        </ActionButton>
        {mode === "companion" ? (
          <ActionButton code="KeyT" label="Talk" testId="touch-talk">
            {icon(<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-4 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />)}
          </ActionButton>
        ) : (
          <ActionButton code="KeyC" label="Pet cam" testId="touch-petcam">
            {icon(
              <>
                <circle cx="12" cy="12" r="3" />
                <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
              </>,
            )}
          </ActionButton>
        )}
        <ActionButton code="Tab" label="Swap" testId="touch-swap">
          {icon(<path d="M4 8h13l-3-3M20 16H7l3 3" />)}
        </ActionButton>
      </div>
    </div>
  );
}
