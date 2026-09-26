import type { Archetype } from "./types";
import { rabbit } from "./rabbit";

/** Small rodents render with the rabbit archetype until F19 lands (PRD 6.3). */
export const rodent: Archetype = { ...rabbit, defaultEar: "rounded", defaultTail: "bob" };
