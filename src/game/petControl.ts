import type { PetBrain } from "../pet/petBrain";
import type { PetAnimator } from "../pet/petAnimator";

/** Handles to the live pet so input handlers can poke it without React state. */
export const petControl: { brain: PetBrain | null; animator: PetAnimator | null } = {
  brain: null,
  animator: null,
};
