import type { Species } from "../schema/petReading";
import type { ItemKind, QuestState } from "../store";
import { speciesItem } from "./collectibles";

export const QUEST_COUNT = 3;

export interface QuestDef {
  /** Villager index that holds the quest. */
  villager: number;
  kind: ItemKind;
  count: number;
  reward: "bandana" | "hat";
}

/** PRD 9.6: villager 0 wants shells (bandana), villager 1 wants the species item (hat). */
export function questDefs(species: Species): QuestDef[] {
  return [
    { villager: 0, kind: "shell", count: QUEST_COUNT, reward: "bandana" },
    { villager: 1, kind: speciesItem(species), count: QUEST_COUNT, reward: "hat" },
  ];
}

export function questFor(villager: number, species: Species): QuestDef | null {
  return questDefs(species).find((q) => q.villager === villager) ?? null;
}

export function canTurnIn(state: QuestState, have: number, def: QuestDef): boolean {
  return state === "active" && have >= def.count;
}
