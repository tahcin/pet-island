/** Inline SVG art and decorative bits for the landing page. */

const LOGO_COLORS = ["#ff9b73", "#ffb85c", "#f5c64a", "#8fd07a", "#6fc7c4", "#8fb3f0", "#b69be8", "#f29bc3", "#ff9b73"];

/** "Pet Island" in chunky toy letters that bob in a wave, with a leaf on the i and a paw badge. */
export function LandingLogo() {
  const words = ["Pet", "Island"];
  let n = 0;
  return (
    <h1 className="title lp-logo" aria-label="Pet Island">
      {words.map((w) => (
        <span className="lp-logo-word" key={w} aria-hidden="true">
          {w.split("").map((ch) => {
            const i = n++;
            const c = LOGO_COLORS[i % LOGO_COLORS.length];
            return (
              <span
                key={i}
                className={`lp-letter${ch === "I" ? " lp-letter-i" : ""}`}
                style={{ ["--c" as string]: c, ["--i" as string]: String(i) }}
              >
                {ch}
                {ch === "I" && (
                  <svg className="lp-leaf" viewBox="0 0 40 30">
                    <path d="M4 26C6 12 18 3 36 4c-2 15-14 23-32 22z" fill="#8fd07a" />
                    <path d="M6 24C14 17 22 12 32 8" stroke="#6eb35c" strokeWidth="2.4" fill="none" strokeLinecap="round" />
                  </svg>
                )}
              </span>
            );
          })}
        </span>
      ))}
      <svg className="lp-paw" viewBox="0 0 40 40" aria-hidden="true">
        <ellipse cx="20" cy="26" rx="9" ry="7.5" fill="#d97757" />
        <circle cx="10" cy="16" r="4" fill="#d97757" />
        <circle cx="17" cy="10" r="4" fill="#d97757" />
        <circle cx="25" cy="10" r="4" fill="#d97757" />
        <circle cx="31" cy="17" r="4" fill="#d97757" />
      </svg>
    </h1>
  );
}

const SPARKLES = [
  { x: 8, y: 14, s: 16, d: 0 },
  { x: 46, y: 8, s: 11, d: 1.2 },
  { x: 62, y: 22, s: 14, d: 0.6 },
  { x: 91, y: 12, s: 12, d: 2.1 },
  { x: 84, y: 64, s: 16, d: 1.6 },
  { x: 54, y: 78, s: 10, d: 0.3 },
  { x: 4, y: 72, s: 12, d: 2.6 },
  { x: 70, y: 46, s: 9, d: 1.9 },
];

/** Floating twinkles over the whole screen. */
export function LandingSparkles() {
  return (
    <div className="lp-sparkles" aria-hidden="true">
      {SPARKLES.map((p, i) => (
        <span
          key={i}
          className="lp-spark"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.s,
            height: p.s,
            animationDelay: `${p.d}s, ${p.d}s`,
          }}
        />
      ))}
    </div>
  );
}

/** Clawd in block art: body, arms, four legs, two slot eyes. */
export function MascotArt() {
  return (
    <svg className="lp-art lp-art-claude" viewBox="0 0 88 70" aria-hidden="true">
      <ellipse cx="44" cy="66" rx="30" ry="3.5" fill="#5b4636" opacity="0.12" />
      <g className="lp-art-bob">
        <rect x="4" y="22" width="12" height="11" rx="4" fill="#d97757" />
        <rect x="72" y="22" width="12" height="11" rx="4" fill="#d97757" />
        <rect x="22" y="44" width="8" height="16" rx="3" fill="#c96a4b" />
        <rect x="33" y="44" width="8" height="16" rx="3" fill="#c96a4b" />
        <rect x="47" y="44" width="8" height="16" rx="3" fill="#c96a4b" />
        <rect x="58" y="44" width="8" height="16" rx="3" fill="#c96a4b" />
        <rect x="12" y="6" width="64" height="42" rx="9" fill="#d97757" />
        <rect x="16" y="9" width="56" height="8" rx="4" fill="#e89274" opacity="0.7" />
        <g className="lp-blink">
          <rect x="27" y="17" width="7" height="13" rx="3" fill="#2b2226" />
          <rect x="54" y="17" width="7" height="13" rx="3" fill="#2b2226" />
        </g>
        <circle cx="29.5" cy="20" r="1.4" fill="#fffdf8" />
        <circle cx="56.5" cy="20" r="1.4" fill="#fffdf8" />
        <ellipse cx="22" cy="36" rx="4" ry="2.4" fill="#f4a58a" opacity="0.8" />
        <ellipse cx="66" cy="36" rx="4" ry="2.4" fill="#f4a58a" opacity="0.8" />
      </g>
    </svg>
  );
}

const DOG_PATH =
  "M30 64c-4 0-6-3-5-8l3-14c1-5 4-8 8-9-3-3-4-7-3-11 1-5 5-8 10-8s9 3 10 8c1 4 0 8-3 11 4 1 7 4 8 9l3 14c1 5-1 8-5 8z";

/** A friendly sitting pet silhouette that fills with a shimmer on hover. */
export function PetArt() {
  return (
    <svg className="lp-art lp-art-pet" viewBox="0 0 88 70" aria-hidden="true">
      <defs>
        <clipPath id="lp-dog-clip">
          <path d={DOG_PATH} />
          <path d="M34 18c-5-2-9 1-9 7 0 4 2 6 5 6z" />
          <path d="M54 18c5-2 9 1 9 7 0 4-2 6-5 6z" />
        </clipPath>
        <linearGradient id="lp-shimmer" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse cx="44" cy="66" rx="26" ry="3.5" fill="#5b4636" opacity="0.12" />
      <path d="M66 58c6 0 10-4 10-9" fill="none" stroke="#b9a6d6" strokeWidth="3.4" strokeLinecap="round" className="lp-tail" />
      <g clipPath="url(#lp-dog-clip)">
        <rect x="0" y="0" width="88" height="70" fill="#e9ddf7" />
        <rect className="lp-fill" x="0" y="0" width="88" height="70" fill="#ffd2b3" />
        <rect className="lp-shine-bar" x="-40" y="0" width="30" height="70" fill="url(#lp-shimmer)" transform="skewX(-18)" />
      </g>
      <path d={DOG_PATH} fill="none" stroke="#b9a6d6" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="39" cy="23" r="2" fill="#8d7aa8" />
      <circle cx="49" cy="23" r="2" fill="#8d7aa8" />
      <ellipse cx="44" cy="28" rx="2.6" ry="1.8" fill="#8d7aa8" />
      <text x="44" y="52" textAnchor="middle" fontSize="13" fontFamily="Fredoka, sans-serif" fontWeight="700" fill="#b9a6d6" className="lp-q">
        ?
      </text>
    </svg>
  );
}

/** Tiny illustrations for the three how-it-works steps. */
export function StepArt({ kind }: { kind: "upload" | "claude" | "island" }) {
  if (kind === "upload")
    return (
      <svg className="lp-step-art" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="22" fill="#ffe3cf" />
        <rect x="11" y="14" width="26" height="22" rx="3" fill="#fffdf8" transform="rotate(-6 24 25)" />
        <rect x="14" y="17" width="20" height="13" rx="2" fill="#bfe6f7" transform="rotate(-6 24 25)" />
        <circle cx="20" cy="22" r="3" fill="#ffd66b" transform="rotate(-6 24 25)" />
        <path d="M15 30l6-5 4 3 5-5 4 5z" fill="#8fd07a" transform="rotate(-6 24 25)" />
      </svg>
    );
  if (kind === "claude")
    return (
      <svg className="lp-step-art" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="22" fill="#fbe0d5" />
        <g transform="translate(24 24)" fill="#d97757">
          {[0, 30, 60, 90, 120, 150].map((a) => (
            <rect key={a} x="-2" y="-13" width="4" height="26" rx="2" transform={`rotate(${a})`} />
          ))}
        </g>
        <circle cx="24" cy="24" r="4" fill="#fbe0d5" />
      </svg>
    );
  return (
    <svg className="lp-step-art" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="#d7f3e0" />
      <ellipse cx="24" cy="33" rx="17" ry="5" fill="#8fd6f2" />
      <ellipse cx="24" cy="31" rx="11" ry="4" fill="#f6ddab" />
      <ellipse cx="24" cy="30" rx="8" ry="2.6" fill="#8fd07a" />
      <rect x="27" y="17" width="2.4" height="13" rx="1.2" fill="#b98a66" />
      <circle cx="28" cy="16" r="5" fill="#7fcf7a" />
      <circle cx="19" cy="27" r="3" fill="#d97757" />
    </svg>
  );
}
