import type { Archetype } from "./types";

/**
 * Hamster and guinea pig (F19): a squashed round loaf body, a big wide head that sits right on
 * the body with chubby cheeks (wide head scale), tiny round ears, stubby legs, and at most a
 * tiny bob of a tail. Reuses the rabbit id for shared face rules (pads muzzle, pink nose).
 */
export const rodent: Archetype = {
  id: "rabbit",
  bodyRadius: 0.27,
  bodyLength: 0.14,
  bodyScaleY: 0.8,
  legVisible: 0.012,
  legRadius: 0.06,
  haunches: false,
  headRadius: 0.27,
  headScale: [1.2, 0.94, 1.02],
  headLift: 0.35,
  headForward: 0.02,
  headTilt: 0.08,
  muzzle: "pads",
  muzzleSize: 0.19,
  muzzleLength: 0.7,
  noseSize: 0.07,
  noseDefaultPink: true,
  whiskers: true,
  irisRing: false,
  teeth: false,
  tongue: false,
  eyeSize: 0.19,
  eyeAzimuth: 0.52,
  eyeElevation: 0.08,
  earScale: 0.72,
  defaultEar: "rounded",
  defaultTail: "bob",
};
