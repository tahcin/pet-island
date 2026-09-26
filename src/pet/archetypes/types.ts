import type { EarType, TailType } from "../../schema/petReading";

/** Per-species proportions. All lengths are in meters for a medium pet (group scale 1). */
export interface Archetype {
  id: "dog" | "cat" | "rabbit";
  /** Body capsule radius and cylinder length (the capsule runs along +Z). */
  bodyRadius: number;
  bodyLength: number;
  /** Vertical squash of the torso so the body reads as a soft bean. */
  bodyScaleY: number;
  /** Visible leg below the torso, and leg capsule radius. */
  legVisible: number;
  legRadius: number;
  /** Rabbits get big haunches and long back feet. */
  haunches: boolean;
  headRadius: number;
  headScale: [number, number, number];
  /** Head centre relative to the neck pivot, in head radii. */
  headLift: number;
  headForward: number;
  /** Forward tilt of the head in radians (positive looks down a little). */
  headTilt: number;
  muzzle: "long" | "pads";
  /** Muzzle size in head radii. */
  muzzleSize: number;
  muzzleLength: number;
  noseSize: number;
  noseDefaultPink: boolean;
  whiskers: boolean;
  irisRing: boolean;
  teeth: boolean;
  tongue: boolean;
  /** Eye radius in head radii, and placement on the head (radians). */
  eyeSize: number;
  eyeAzimuth: number;
  eyeElevation: number;
  earScale: number;
  defaultEar: EarType;
  defaultTail: TailType;
}
