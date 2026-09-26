import type { PetBrain } from "../pet/petBrain";
import type { PetAnimator } from "../pet/petAnimator";
import type * as THREE from "three";

/** Handles to the live pet so input handlers can poke it without React state. */
export const petControl: {
  brain: PetBrain | null;
  animator: PetAnimator | null;
  /** The built pet model, hidden while the camera is inside it (pet-cam). */
  group: THREE.Object3D | null;
} = {
  brain: null,
  animator: null,
  group: null,
};
