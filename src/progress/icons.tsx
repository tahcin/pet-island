/** Tiny inline SVG icons for the passport (no emoji). */

export function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6z" fill="#f5c542" stroke="#b8862b" strokeWidth="1.6" />
      <circle cx="12" cy="19" r="2" fill="#b8862b" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#bfeccf" />
      <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#3f8a5a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HeartIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="#ff9fb4" stroke="#d9637f" strokeWidth="1.4" />
    </svg>
  );
}

export function StarIcon({ size = 18, color = "#ffd65c" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 2.8l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 16.8l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill={color} stroke="#c99a2e" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

export function FlameIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 2c1 4 5 5.5 5 11a5 5 0 0 1-10 0c0-3 1.5-4.5 2.5-6 .3 2 1 3 2 3.3C11 7.5 11 5 12 2z" fill="#ffb36b" stroke="#d9772e" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

const ITEM_COLORS: Record<string, [string, string]> = {
  shell: ["#ffd9e4", "#e59bb0"],
  bone: ["#fff4df", "#c9b08e"],
  yarn: ["#d9c8f5", "#9a80cf"],
  carrot: ["#ffc38f", "#e0843f"],
};

/** A simple drawn token per collectible kind; rare ones glow gold or rainbow. */
export function ItemIcon({ kind, rare = false, found = true }: { kind: string; rare?: boolean; found?: boolean }) {
  const [fill, stroke] = rare ? ["#ffe07a", "#d4a52a"] : ITEM_COLORS[kind] ?? ["#eee", "#aaa"];
  const f = found ? fill : "#efe4d2";
  const s = found ? stroke : "#d8c8b0";
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden>
      {kind === "shell" && (
        <g>
          <path d="M22 8c9 0 15 8 14 18l-14 10L8 26C7 16 13 8 22 8z" fill={f} stroke={s} strokeWidth="2" />
          <path d="M22 12v22M15 14l5 20M29 14l-5 20" stroke={s} strokeWidth="1.6" fill="none" />
        </g>
      )}
      {kind === "bone" && (
        <g>
          <path d="M12 16a4 4 0 1 1 5-3l12 12a4 4 0 1 1 3 5 4 4 0 1 1-5-3L15 15a4 4 0 0 1-3 1z" fill={f} stroke={s} strokeWidth="2" strokeLinejoin="round" />
        </g>
      )}
      {kind === "yarn" && (
        <g>
          <circle cx="22" cy="22" r="13" fill={f} stroke={s} strokeWidth="2" />
          <path d="M11 18c7 0 15 4 20 12M13 28c5-6 12-9 19-9M18 10c2 8 2 16-2 24" stroke={s} strokeWidth="1.6" fill="none" />
        </g>
      )}
      {kind === "carrot" && (
        <g>
          <path d="M28 14L10 34l4-14c2-5 8-9 14-6z" fill={f} stroke={s} strokeWidth="2" strokeLinejoin="round" />
          <path d="M28 14l6-6M28 14l8-1M28 14l2-8" stroke={found ? "#6fbf73" : s} strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )}
      {rare && found && (
        <g fill="#fff">
          <path d="M34 6l1.2 2.8L38 10l-2.8 1.2L34 14l-1.2-2.8L30 10l2.8-1.2z" />
          <path d="M9 30l.8 1.8 1.8.8-1.8.8L9 35.2l-.8-1.8-1.8-.8 1.8-.8z" />
        </g>
      )}
    </svg>
  );
}
