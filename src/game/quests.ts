import type { Accessory, Species } from "../schema/petReading";
import type { ItemKind, QuestState } from "../store";
import { itemName, speciesItem } from "./collectibles";

export const QUEST_COUNT = 3;
/** One quest slot per townsperson. */
export const TOWN_QUESTS = 6;

export interface QuestReward {
  accessory?: Accessory;
  bells: number;
  hearts: number;
}

interface QuestBase {
  /** Villager index that holds the quest. */
  villager: number;
  reward: QuestReward;
}

export type QuestDef =
  | (QuestBase & { type: "fetch"; kind: ItemKind; count: number })
  | (QuestBase & { type: "deliver"; to: number })
  | (QuestBase & { type: "showPet" })
  | (QuestBase & { type: "visit"; level: number });

/**
 * PRD 9.6 plus the town: villager 0 wants shells (bandana), villager 1 wants the species item
 * (hat), villager 2 wants to meet the pet (bow), 3 sends a letter to 0, 4 wants you to see the
 * view from the top level, 5 wants two species items.
 */
export function questDefs(species: Species, topLevel = 3): QuestDef[] {
  const item = speciesItem(species);
  return [
    { villager: 0, type: "fetch", kind: "shell", count: QUEST_COUNT, reward: { accessory: "bandana", bells: 100, hearts: 2 } },
    { villager: 1, type: "fetch", kind: item, count: QUEST_COUNT, reward: { accessory: "hat", bells: 100, hearts: 2 } },
    { villager: 2, type: "showPet", reward: { accessory: "bow", bells: 50, hearts: 2 } },
    { villager: 3, type: "deliver", to: 0, reward: { bells: 80, hearts: 2 } },
    { villager: 4, type: "visit", level: topLevel, reward: { bells: 120, hearts: 2 } },
    { villager: 5, type: "fetch", kind: item, count: 2, reward: { bells: 60, hearts: 2 } },
  ];
}

export function questFor(villager: number, species: Species, topLevel = 3): QuestDef | null {
  return questDefs(species, topLevel).find((q) => q.villager === villager) ?? null;
}

/** Live facts a quest step can depend on (pure inputs so the checks are testable). */
export interface QuestContext {
  inventory: Record<ItemKind, number>;
  /** Distance from the pet to the quest giver. */
  petToGiver: number;
  /** Terrace level the controlled character stands on. */
  playerLevel: number;
}

export const SHOW_PET_RANGE = 3;

/** True when the giver can be handed the quest (fetch has the items, pet is close). */
export function canTurnIn(state: QuestState, def: QuestDef, ctx: QuestContext): boolean {
  if (state !== "active") return false;
  if (def.type === "fetch") return ctx.inventory[def.kind] >= def.count;
  if (def.type === "showPet") return ctx.petToGiver <= SHOW_PET_RANGE;
  return false;
}

/** Visit quests complete on arrival. */
export function visitDone(state: QuestState, def: QuestDef, ctx: QuestContext): boolean {
  return state === "active" && def.type === "visit" && ctx.playerLevel >= def.level;
}

/** The active delivery that ends at `recipient`, if any. */
export function deliveryTo(recipient: number, quests: readonly QuestState[], defs: readonly QuestDef[]): QuestDef | null {
  return defs.find((d) => d.type === "deliver" && d.to === recipient && quests[d.villager] === "active") ?? null;
}

/** Progress as [have, need] for the journal. */
export function questProgress(def: QuestDef, state: QuestState, ctx: QuestContext): [number, number] {
  if (state === "done") return [1, 1];
  if (def.type === "fetch") return [Math.min(def.count, ctx.inventory[def.kind]), def.count];
  if (def.type === "showPet") return [ctx.petToGiver <= SHOW_PET_RANGE ? 1 : 0, 1];
  if (def.type === "visit") return [ctx.playerLevel >= def.level ? 1 : 0, 1];
  return [0, 1];
}

/** Objective text for the journal and tracker. */
export function objectiveText(def: QuestDef, names: readonly string[], petName: string): string {
  if (def.type === "fetch") return `Bring ${def.count} ${itemName(def.kind, def.count)}`;
  if (def.type === "deliver") return `Take a letter to ${names[def.to] ?? "a friend"}`;
  if (def.type === "showPet") return `Bring ${petName} within ${SHOW_PET_RANGE} m`;
  return "See the view from the top level";
}

/** What the giver says when handing out a new-kind quest. */
export function askText(def: QuestDef, names: readonly string[], petName: string): string {
  if (def.type === "fetch") return `Could you find me ${def.count} ${itemName(def.kind, def.count)}? I would be so grateful.`;
  if (def.type === "deliver") return `Would you take this letter to ${names[def.to] ?? "my friend"} for me?`;
  if (def.type === "showPet") return `Is that ${petName}? Bring them over so I can say hello!`;
  return "Have you seen the view from the very top of the island? Go look, then tell me.";
}

export function rewardText(r: QuestReward): string {
  const parts = [`${r.bells} bells`, `${r.hearts} hearts`];
  if (r.accessory) parts.unshift(`a ${r.accessory}`);
  return parts.join(", ");
}
