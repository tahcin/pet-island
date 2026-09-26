import type { PetSpec, PetSize } from "../schema/petReading";
import { archetypeFor, type Archetype } from "./archetypes";

export const SIZE_SCALE: Record<PetSize, number> = {
  tiny: 0.7,
  small: 0.85,
  medium: 1,
  large: 1.3,
};

/** Resolved proportions for one spec, in unscaled (medium) units. Pure. */
export interface PetDims {
  arch: Archetype;
  scale: number;
  soft: boolean;
  bodyRadius: number;
  bodyLength: number;
  bodyScaleX: number;
  bodyScaleY: number;
  /** Height of the torso centre above the ground. */
  bodyY: number;
  hipY: number;
  hipX: number;
  frontHipZ: number;
  backHipZ: number;
  legRadius: number;
  headRadius: number;
  headScale: [number, number, number];
  neckY: number;
  neckZ: number;
  tailY: number;
  tailZ: number;
}

export function petDims(spec: PetSpec): PetDims {
  const arch = archetypeFor(spec.species);
  let rb = arch.bodyRadius;
  let len = arch.bodyLength;
  let sx = 1;
  let legVis = arch.legVisible;
  let legR = arch.legRadius;
  let headX = 1;
  switch (spec.build) {
    case "slim":
      rb *= 0.88;
      len *= 1.1;
      legVis *= 1.2;
      legR *= 0.85;
      break;
    case "stocky":
      rb *= 1.1;
      sx = 1.12;
      legVis *= 0.85;
      legR *= 1.2;
      headX = 1.04;
      break;
    case "long":
      len = len * 2.4 + 0.12;
      legVis *= 0.7;
      break;
    case "average":
      break;
  }
  const fur = spec.furLength === "long" ? 1.1 : spec.furLength === "medium" ? 1.03 : 1;
  rb *= fur;
  const R = arch.headRadius * fur;
  const bodyScaleY = arch.bodyScaleY;
  const bodyY = rb * bodyScaleY + legVis;
  const hipY = bodyY - rb * 0.4;
  const halfLen = len / 2;
  const frontHipZ = halfLen + rb * 0.35;
  const backHipZ = -(halfLen + rb * 0.35);
  const neckY = bodyY + rb * bodyScaleY * 0.55;
  const neckZ = halfLen + rb * 0.45;
  return {
    arch,
    scale: SIZE_SCALE[spec.size],
    soft: spec.furLength === "long",
    bodyRadius: rb,
    bodyLength: len,
    bodyScaleX: sx,
    bodyScaleY,
    bodyY,
    hipY,
    hipX: rb * sx * 0.55,
    frontHipZ,
    backHipZ,
    legRadius: legR,
    headRadius: R,
    headScale: [arch.headScale[0] * headX, arch.headScale[1], arch.headScale[2]],
    neckY,
    neckZ,
    tailY: bodyY + rb * bodyScaleY * 0.25,
    tailZ: -(halfLen + rb * 0.85),
  };
}
