import { useGame } from "../store";
import {
  ACCESSORIES,
  BUILDS,
  EAR_TYPES,
  FUR_LENGTHS,
  MARKING_PATTERNS,
  SIZES,
  SPECIES,
  TAIL_TYPES,
  type PetSpec,
} from "../schema/petReading";
import { isSampleSpecies, sampleReading } from "../pet/samples";

declare global {
  interface Window {
    /** Set by the reveal screen once the draw-in has finished (screenshot scripts wait on it). */
    __petReady?: boolean;
  }
}

function pick<T extends string>(value: string | null, options: readonly T[]): T | undefined {
  return value !== null && (options as readonly string[]).includes(value) ? (value as T) : undefined;
}

function hex(value: string | null): string | undefined {
  if (!value) return undefined;
  const v = value.startsWith("#") ? value : `#${value}`;
  return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : undefined;
}

/**
 * Dev and screenshot hook. `?reveal=dog|cat|rabbit` jumps straight to the reveal screen with a
 * sample reading. Optional overrides: species, ear, tail, build, size, fur, pattern, coverage,
 * base, second, acc, collar (0 or 1). Example: `?reveal=dog&ear=long_floppy&pattern=tuxedo`.
 */
export function applyDevRoute(): void {
  if (typeof window === "undefined") return;
  const q = new URLSearchParams(window.location.search);
  // `?shot=N` (screenshots) and `?play` jump straight onto the island with the default pet.
  if (q.has("shot") || q.has("play")) {
    useGame.getState().setScreen("play");
    return;
  }
  const which = q.get("reveal");
  if (!which || !isSampleSpecies(which)) return;
  const reading = sampleReading(which);
  const s: PetSpec = reading.spec;
  s.species = pick(q.get("species"), SPECIES) ?? s.species;
  s.earType = pick(q.get("ear"), EAR_TYPES) ?? s.earType;
  s.tailType = pick(q.get("tail"), TAIL_TYPES) ?? s.tailType;
  s.build = pick(q.get("build"), BUILDS) ?? s.build;
  s.size = pick(q.get("size"), SIZES) ?? s.size;
  s.furLength = pick(q.get("fur"), FUR_LENGTHS) ?? s.furLength;
  s.markingPattern = pick(q.get("pattern"), MARKING_PATTERNS) ?? s.markingPattern;
  s.accessory = pick(q.get("acc"), ACCESSORIES) ?? s.accessory;
  s.baseColor = hex(q.get("base")) ?? s.baseColor;
  s.secondaryColor = hex(q.get("second")) ?? s.secondaryColor;
  const cov = Number(q.get("coverage"));
  if (q.has("coverage") && Number.isFinite(cov)) s.markingCoverage = Math.min(1, Math.max(0, cov));
  const collar = q.get("collar");
  if (collar !== null) s.collar = { ...s.collar, present: collar === "1" };
  const conf = Number(q.get("confidence"));
  if (q.has("confidence") && Number.isFinite(conf)) s.confidence = Math.min(1, Math.max(0, conf));
  window.__petReady = false;
  const game = useGame.getState();
  game.setReading(reading);
  game.setScreen("reveal");
}
