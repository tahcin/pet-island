import { useGame } from "../store";
import { collectibles, villagers, waypoint } from "../game/runtime";
import { controlledBody, currentDefs, people, questWorld } from "../game/interactions";
import { itemName } from "../game/collectibles";

/** Where "Guide me" should point for quest i right now (follows moving villagers). */
export function guideTarget(i: number): { x: number; z: number; label: string } | null {
  const g = useGame.getState();
  const def = currentDefs().find((d) => d.villager === i);
  const who = people();
  const giver = villagers[i];
  if (!def || !giver) return null;
  const state = g.quests[i];
  if (state === "done") return null;
  const atGiver = { x: giver.body.pos.x, z: giver.body.pos.z, label: `Talk to ${who[i]?.name ?? "them"}` };
  if (state === "notStarted") return atGiver;
  if (def.type === "fetch" && g.inventory[def.kind] < def.count) {
    const b = controlledBody();
    let best: { x: number; z: number; d: number } | null = null;
    for (const c of collectibles) {
      if (c.taken || c.kind !== def.kind) continue;
      const d = Math.hypot(c.x - b.pos.x, c.z - b.pos.z);
      if (!best || d < best.d) best = { x: c.x, z: c.z, d };
    }
    if (best) return { x: best.x, z: best.z, label: `Find a ${itemName(def.kind)}` };
    return atGiver;
  }
  if (def.type === "deliver") {
    const to = villagers[def.to];
    if (to) return { x: to.body.pos.x, z: to.body.pos.z, label: `Letter for ${who[def.to]?.name ?? "a friend"}` };
  }
  if (def.type === "visit") {
    const l = questWorld.current?.town.lookout;
    if (l) return { x: l.x, z: l.z, label: "The view from the top" };
  }
  if (def.type === "showPet") return { ...atGiver, label: `Show your pet to ${who[i]?.name ?? "them"}` };
  return atGiver;
}

/** Quest state when guiding started; a change means the step completed. */
let guidedState: string | null = null;

export function guideMe(i: number): void {
  const t = guideTarget(i);
  if (!t) return;
  waypoint.current = { ...t, quest: i };
  guidedState = useGame.getState().quests[i];
}

export function clearGuide(): void {
  waypoint.current = null;
  guidedState = null;
}

/** Per frame: follow the target and clear when the guided quest's step completes. */
export function updateGuide(): void {
  const w = waypoint.current;
  if (!w) return;
  const state = useGame.getState().quests[w.quest];
  if (state !== guidedState || state === "done") {
    clearGuide();
    return;
  }
  const t = guideTarget(w.quest);
  if (!t) {
    clearGuide();
    return;
  }
  w.x = t.x;
  w.z = t.z;
  w.label = t.label;
}

/** DOM elements the 3D side writes into each frame (screen-edge arrow and distance). */
export const guideEls: { arrow: HTMLDivElement | null; dist: HTMLSpanElement | null } = { arrow: null, dist: null };
