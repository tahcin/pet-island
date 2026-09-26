import type { Species } from "../../schema/petReading";
import type { Archetype } from "./types";
import { dog } from "./dog";
import { cat } from "./cat";
import { rabbit } from "./rabbit";
import { rodent } from "./rodent";

export type { Archetype } from "./types";

export function archetypeFor(species: Species): Archetype {
  switch (species) {
    case "dog":
      return dog;
    case "cat":
      return cat;
    case "rabbit":
      return rabbit;
    case "small_rodent":
      return rodent;
  }
}
