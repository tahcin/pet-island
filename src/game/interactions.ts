import { create } from "zustand";
import { collectibles, runtime, villagers, waypoint, type Body, type CollectibleRuntime } from "./runtime";
import { emit } from "./events";
import { petControl } from "./petControl";
import { useGame } from "../store";
import { itemName } from "./collectibles";
import { askText, canTurnIn, deliveryTo, questDefs, visitDone, type QuestContext, type QuestDef } from "./quests";
import { townPeople, type Person } from "../town/people";
import { levelAt, type WorldData } from "../world/generateWorld";

/** The island the quest system runs on (set by the villager system). */
export const questWorld: { current: WorldData | null } = { current: null };

export function people(): Person[] {
  const g = useGame.getState();
  return townPeople(g.reading, g.seed);
}

export function currentDefs(): QuestDef[] {
  const g = useGame.getState();
  return questDefs(g.reading.spec.species, questWorld.current?.town.lookout.level ?? 3);
}

export function questContext(giver: number): QuestContext {
  const g = useGame.getState();
  const v = villagers[giver];
  const b = controlledBody();
  const hm = questWorld.current?.heightmap;
  return {
    inventory: g.inventory,
    petToGiver: v ? Math.hypot(runtime.pet.pos.x - v.body.pos.x, runtime.pet.pos.z - v.body.pos.z) : Infinity,
    playerLevel: hm ? levelAt(hm, b.pos.x, b.pos.z) : 0,
  };
}

export const TALK_RANGE = 3;
export const PICK_RANGE = 1.5;
export const WALK_PICK_RANGE = 0.8;
const BUBBLE_SECONDS = 6;

export type Target =
  | { type: "quest"; villager: number }
  | { type: "deliver"; villager: number; from: number }
  | { type: "talk"; villager: number }
  | { type: "collect"; index: number };

/** DOM label state per villager (changes rarely; positions are written straight to the DOM). */
export interface LabelState {
  bubble: string | null;
  glyph: string | null;
  near: boolean;
}

/** Label elements registered by the overlay; the villager system moves them every frame. */
export const labelEls: (HTMLDivElement | null)[] = [];

/** Small UI store for the DOM overlay: the current Space hint and pop counters. */
interface PlayUi {
  hint: string | null;
  labels: LabelState[];
  /** Bumped per item kind on pickup so the HUD pill can pop. */
  pops: Record<string, number>;
  setHint: (hint: string | null) => void;
  pop: (kind: string) => void;
}

const EMPTY_LABEL: LabelState = { bubble: null, glyph: null, near: false };

export function setLabel(i: number, patch: Partial<LabelState>): void {
  usePlayUi.setState((s) => {
    const labels = [...s.labels];
    labels[i] = { ...(labels[i] ?? EMPTY_LABEL), ...patch };
    return { labels };
  });
}

export const usePlayUi = create<PlayUi>()((set) => ({
  hint: null,
  labels: [],
  pops: {},
  setHint: (hint) => set((s) => (s.hint === hint ? s : { hint })),
  pop: (kind) => set((s) => ({ pops: { ...s.pops, [kind]: (s.pops[kind] ?? 0) + 1 } })),
}));

/** Talk state per villager: next line to show and when the bubble we set expires. */
const talk: { next: number; until: number; text: string | null }[] = [];
/** Pickup tween hook: the collectible renderer listens so it can animate the item away. */
export const pickupListeners = new Set<(c: CollectibleRuntime) => void>();

export function resetTalk(): void {
  talk.length = 0;
}

function talkState(i: number) {
  return (talk[i] ??= { next: 0, until: 0, text: null });
}

export function controlledBody(): Body {
  return useGame.getState().mode === "pet" ? runtime.pet : runtime.avatar;
}

const dist = (b: Body, x: number, z: number) => Math.hypot(b.pos.x - x, b.pos.z - z);

/** Space resolves to the first match (PRD 9.7): quest turn-in, talk, collect. */
export function findTarget(): Target | null {
  const b = controlledBody();
  const g = useGame.getState();
  let best: { i: number; d: number } | null = null;
  for (const v of villagers) {
    const d = dist(b, v.body.pos.x, v.body.pos.z);
    if (d < TALK_RANGE + v.body.radius && (!best || d < best.d)) best = { i: v.index, d };
  }
  if (best) {
    const bi = best.i;
    const defs = currentDefs();
    const letter = deliveryTo(bi, g.quests, defs);
    if (letter) return { type: "deliver", villager: bi, from: letter.villager };
    const def = defs.find((d) => d.villager === bi);
    if (def && canTurnIn(g.quests[bi], def, questContext(bi))) return { type: "quest", villager: bi };
    return { type: "talk", villager: best.i };
  }
  let near: { i: number; d: number } | null = null;
  collectibles.forEach((c, i) => {
    if (c.taken) return;
    const d = dist(b, c.x, c.z);
    if (d < PICK_RANGE && (!near || d < near.d)) near = { i, d };
  });
  const n = near as { i: number; d: number } | null;
  return n ? { type: "collect", index: n.i } : null;
}

export function hintFor(t: Target | null): string | null {
  if (!t) return null;
  const g = useGame.getState();
  if (t.type === "collect") return `Space: pick up ${itemName(collectibles[t.index].kind)}`;
  const v = villagers[t.villager];
  if (!v) return null;
  if (t.type === "deliver") return `Space: give ${v.name} the letter`;
  if (t.type === "quest") {
    const def = currentDefs().find((d) => d.villager === t.villager);
    if (!def) return null;
    if (def.type === "fetch") return `Space: give ${def.count} ${itemName(def.kind, def.count)}`;
    return `Space: show ${g.reading.nameSuggestions[0]} to ${v.name}`;
  }
  return `Space: talk to ${v.name}`;
}

function say(i: number, text: string): void {
  const v = villagers[i];
  if (!v) return;
  const t = talkState(i);
  v.say = text;
  t.text = text;
  t.until = performance.now() + BUBBLE_SECONDS * 1000;
  const b = controlledBody();
  v.face = { x: b.pos.x, z: b.pos.z };
}

/** Clears talk bubbles we set once they time out (overheard chats manage their own). */
export function tickTalk(): void {
  const now = performance.now();
  villagers.forEach((v, i) => {
    const t = talk[i];
    if (!t || !t.text || now < t.until) return;
    if (v.say === t.text) {
      v.say = null;
      v.face = null;
    }
    t.text = null;
  });
}

export function collectItem(index: number): void {
  const c = collectibles[index];
  if (!c || c.taken) return;
  const g = useGame.getState();
  c.taken = true;
  g.collect(c.id, c.kind);
  emit("collected", { id: c.id, kind: c.kind });
  if (g.mode === "companion") petControl.brain?.celebrate();
  g.logEvent(`The ${g.mode === "pet" ? "pet" : "person"} picked up a ${itemName(c.kind)}.`);
  usePlayUi.getState().pop(c.kind);
  for (const fn of pickupListeners) fn(c);
}

function talkTo(i: number): void {
  const g = useGame.getState();
  const person = people()[i];
  if (!person) return;
  const def = currentDefs().find((d) => d.villager === i);
  if (def && g.quests[i] === "notStarted") {
    g.setQuest(i, "active");
    const names = people().map((p) => p.name);
    const petName = g.reading.nameSuggestions[0];
    say(i, def.type === "fetch" && person.questAsk ? person.questAsk : askText(def, names, petName));
    g.logEvent(`${person.name} asked for help: ${askText(def, names, petName)}`);
    return;
  }
  const t = talkState(i);
  const line = person.lines[t.next % person.lines.length];
  t.next++;
  say(i, line);
}

/** Pays out a finished quest: bells, hearts, accessory, thanks, and events. */
export function completeQuest(i: number, speaker = i): void {
  const g = useGame.getState();
  const person = people()[i];
  const def = currentDefs().find((d) => d.villager === i);
  if (!person || !def || g.quests[i] !== "active") return;
  const petName = g.reading.nameSuggestions[0];
  if (def.type === "fetch") g.spend(def.kind, def.count);
  g.setQuest(i, "done");
  if (def.reward.accessory) g.equip(def.reward.accessory);
  g.addBells(def.reward.bells);
  g.addFriendship(i, def.reward.hearts);
  if (speaker !== i) g.addFriendship(speaker, 1);
  const thanks = def.type === "fetch" && person.questThanks ? person.questThanks : "Thank you so much! You are a true friend.";
  say(speaker, speaker === i ? thanks : `A letter from ${person.name}? How lovely, thank you!`);
  emit("questDone", { index: i, villager: person.name });
  g.rememberVillager(person.name, `${petName}'s person helped me out.`);
  g.logEvent(`The person finished a favor for ${person.name}.`);
  petControl.brain?.celebrate();
}

function turnIn(i: number): void {
  completeQuest(i);
}

/** Visit quests finish on arrival and a finished quest drops its waypoint; call a few times a second. */
export function tickQuests(): void {
  const g = useGame.getState();
  for (const def of currentDefs()) {
    if (visitDone(g.quests[def.villager], def, questContext(def.villager))) completeQuest(def.villager);
  }
  const w = waypoint.current;
  if (w && g.quests[w.quest] === "done") waypoint.current = null;
}

/** Runs the Space interaction; returns false when nothing was in range. */
export function interact(): boolean {
  const t = findTarget();
  if (!t) return false;
  if (t.type === "quest") turnIn(t.villager);
  else if (t.type === "deliver") completeQuest(t.from, t.villager);
  else if (t.type === "talk") talkTo(t.villager);
  else collectItem(t.index);
  return true;
}
