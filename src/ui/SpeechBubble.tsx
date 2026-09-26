import { useEffect, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import "../game/play.css";

export interface SpeechBubbleProps {
  text: string;
  /** Speaker name shown as a little label on the bubble. */
  name?: string;
  /** Label color (defaults to peach). */
  accent?: string;
  /** Characters per second for the typewriter reveal. */
  cps?: number;
  testId?: string;
  /** Keep the bubble mounted but invisible (stable DOM inside drei Html). */
  hidden?: boolean;
}

/** Typewriter reveal at 38 chars/s by default; restarts when the text changes. */
function useTypewriter(text: string, cps: number): string {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    const start = performance.now();
    const id = window.setInterval(() => {
      const n = Math.min(
        text.length,
        Math.floor(((performance.now() - start) / 1000) * cps),
      );
      setShown(n);
      if (n >= text.length) window.clearInterval(id);
    }, 30);
    return () => window.clearInterval(id);
  }, [text, cps]);
  return text.slice(0, shown);
}

/**
 * A cream speech bubble anchored in 3D (drei Html). Place it inside a group positioned above
 * the speaker's head; the bubble's tail points down at that spot.
 */
export default function SpeechBubble(props: SpeechBubbleProps) {
  return (
    <Html
      center={false}
      zIndexRange={[20, 10]}
      style={{ pointerEvents: "none" }}
    >
      <SpeechBubbleCard {...props} />
    </Html>
  );
}

/** The bubble itself as plain DOM, for use inside an existing Html or overlay. */
export function SpeechBubbleCard({ text, name, accent, cps = 38, testId = "speech-bubble", hidden = false }: SpeechBubbleProps) {
  const shown = useTypewriter(text, cps);
  const card = useRef<HTMLDivElement>(null);
  // Replay the 150 ms pop whenever the text changes, without remounting the node.
  useEffect(() => {
    const el = card.current;
    if (!el || !text) return;
    el.classList.remove("pi-bubble-in");
    void el.offsetWidth;
    el.classList.add("pi-bubble-in");
  }, [text]);
  return (
    <div className={`pi-bubble-anchor${hidden ? " pi-hidden" : ""}`}>
      <div
        ref={card}
        className="pi-bubble"
        data-testid={testId}
        data-full={text}
      >
        {name && (
          <span
            className="pi-bubble-name"
            style={accent ? { background: accent } : undefined}
          >
            {name}
          </span>
        )}
        <span className="pi-bubble-text">
          {shown}
          <span className="pi-bubble-ghost">{text.slice(shown.length)}</span>
        </span>
      </div>
    </div>
  );
}
