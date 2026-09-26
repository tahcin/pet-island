import { useGame } from "../store";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Base pitch for a speaker of a given height in metres (PRD 9.9). */
export function animalesePitch(height: number): number {
  return 430 / Math.sqrt(Math.max(0.2, height));
}

/** One tiny blip for a letter. Silent when sound is off or for spaces and punctuation. */
export function blip(ch: string, height: number): void {
  if (useGame.getState().muted) return;
  if (!/[a-z0-9]/i.test(ch)) return;
  const a = audio();
  if (!a) return;
  try {
    const t = a.currentTime;
    const osc = a.createOscillator();
    const gain = a.createGain();
    const vowel = /[aeiou]/i.test(ch) ? 1.12 : 1;
    osc.type = "triangle";
    osc.frequency.value = animalesePitch(height) * vowel * (0.9 + Math.random() * 0.2);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.07, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  } catch {
    // Audio is decoration only.
  }
}
