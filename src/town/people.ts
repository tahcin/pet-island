import type { PetReading, Species } from "../schema/petReading";
import { townsfolk } from "./townsfolk";

/** One of the six townspeople: reading villagers 0 to 2, seeded townsfolk 3 to 5. */
export interface Person {
  name: string;
  species: Species;
  persona: string;
  lines: string[];
  /** Reading villagers bring their own quest lines. */
  questAsk: string | null;
  questThanks: string | null;
}

const cache = new Map<string, Person[]>();

/** All six townspeople for a reading and seed. Pure; memoized by names and seed. */
export function townPeople(reading: Pick<PetReading, "villagers">, seed: number): Person[] {
  const base = reading.villagers.slice(0, 3);
  const key = `${seed}|${base.map((v) => v.name).join(",")}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const out: Person[] = base.map((v) => ({
    name: v.name,
    species: v.species,
    persona: v.persona,
    lines: v.lines,
    questAsk: v.questAsk,
    questThanks: v.questThanks,
  }));
  for (const t of townsfolk(seed, out.map((p) => p.name))) out.push({ ...t, questAsk: null, questThanks: null });
  if (cache.size > 20) cache.clear();
  cache.set(key, out);
  return out;
}
