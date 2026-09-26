import { collectibles, runtime, villagers } from "../game/runtime";
import { speciesLabel } from "../pet/mascot";
import { petControl } from "../game/petControl";
import { showGlyph } from "../game/Effects";
import { useGame } from "../store";
import { PET_ACTS, PET_MOODS, clip, type PetAct, type PetMood, type PetTalk } from "../schema/petReading";
import { isWater, levelAt, type WorldData } from "../world/generateWorld";
import { describe, findThing, type PerceptionInput, type Thing } from "./perception";
import { offlineIntent } from "./offlineIntent";
import { enqueueTalk } from "./claudeQueue";
import { useTalk } from "./talkState";

/** The island the talk system reads from; set by TalkExtras while the island is mounted. */
export const talkWorld: { world: WorldData | null } = { world: null };

const INPUT_CAP = 200;
const CLIENT_TIMEOUT_MS = 13_000;
let lastMood: PetMood = "happy";
let lastAct: PetAct = "follow";

const KIND_LABEL: Record<string, string> = { bone: "a bone", yarn: "a ball of yarn", carrot: "a carrot", shell: "a shell" };

function nearestPlace(world: WorldData, x: number, z: number, test: (px: number, pz: number) => boolean): { x: number; z: number } | null {
  for (let r = 0; r <= 30; r += 2) {
    const steps = r === 0 ? 1 : 16;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (test(px, pz)) return { x: px, z: pz };
    }
  }
  void world;
  return null;
}

/** Villagers, loose collectibles, the beach, and the river near the pet. */
export function gatherThings(world: WorldData | null): Thing[] {
  const pet = runtime.pet;
  const out: Thing[] = [];
  for (const v of villagers) {
    out.push({
      name: v.name,
      label: `${v.name} the ${v.species.replace("_", " ")} (villager`,
      kind: "villager",
      x: v.body.pos.x,
      z: v.body.pos.z,
    });
  }
  for (const c of collectibles) {
    if (c.taken) continue;
    out.push({ name: KIND_LABEL[c.kind] ?? c.kind, label: KIND_LABEL[c.kind] ?? c.kind, kind: "item", x: c.x, z: c.z });
  }
  if (world) {
    const hm = world.heightmap;
    const beach = nearestPlace(world, pet.pos.x, pet.pos.z, (x, z) => !isWater(hm, x, z) && levelAt(hm, x, z) === 0);
    if (beach) out.push({ name: "the beach", label: "the beach", kind: "place", ...beach });
    let best: { x: number; z: number } | null = null;
    let bestD = Infinity;
    for (const [x, z] of world.river.points) {
      const d = Math.hypot(x - pet.pos.x, z - pet.pos.z);
      if (d < bestD && !isWater(hm, x, z)) {
        bestD = d;
        best = { x, z };
      }
    }
    if (!best) {
      for (const [x, z] of world.river.points) {
        const d = Math.hypot(x - pet.pos.x, z - pet.pos.z);
        if (d < bestD) {
          bestD = d;
          best = { x, z };
        }
      }
    }
    if (best) out.push({ name: "the river", label: "the river", kind: "place", ...best });
  }
  return out;
}

function questLines(): string[] {
  const g = useGame.getState();
  return g.quests
    .map((q, i) => {
      const v = g.reading.villagers[i];
      if (!v || q !== "active") return "";
      return `Quest: ${v.name} asked: "${clip(v.questAsk, 100)}"`;
    })
    .filter(Boolean);
}

export function buildPerception(
  why: "spoken" | "return",
  line?: string,
  extra?: { news?: string[]; duration?: string },
): { text: string; things: Thing[] } {
  const g = useGame.getState();
  const things = gatherThings(talkWorld.world);
  const input: PerceptionInput = {
    pet: {
      name: g.reading.nameSuggestions[0],
      species: speciesLabel(g.reading.spec),
      build: g.reading.spec.build,
      mood: lastMood,
      act: petControl.brain?.state ?? lastAct,
      x: runtime.pet.pos.x,
      z: runtime.pet.pos.z,
      yaw: runtime.pet.yaw,
    },
    person: { x: runtime.avatar.pos.x, z: runtime.avatar.pos.z, yaw: runtime.avatar.yaw, moving: runtime.avatar.moving },
    things,
    islandName: g.reading.islandName,
    timeOfDay: g.timeOfDay,
    inventory: g.inventory,
    quests: questLines(),
    memory: g.petMemory,
    log: g.chatLog,
    events: g.events,
    why,
    line,
    news: extra?.news,
    duration: extra?.duration,
  };
  return { text: describe(input), things };
}

type TalkReply = { talk: PetTalk | null; fallback: boolean; reason?: string };

async function callTalk(perception: string): Promise<TalkReply> {
  const g = useGame.getState();
  const res = await fetch("/api/pet/talk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      pet: {
        name: g.reading.nameSuggestions[0],
        species: speciesLabel(g.reading.spec),
        islandName: g.reading.islandName,
        mind: g.reading.mind,
      },
      perception,
    }),
    signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as TalkReply;
}

function isTalk(t: unknown): t is PetTalk {
  if (!t || typeof t !== "object") return false;
  const r = t as Record<string, unknown>;
  return (
    typeof r.say === "string" &&
    (PET_ACTS as readonly string[]).includes(String(r.act)) &&
    (PET_MOODS as readonly string[]).includes(String(r.mood))
  );
}

/** Applies a reply: bubble, act on the brain, mood glyph, memory, log. */
export function applyTalk(t: PetTalk, things: Thing[]): void {
  const g = useGame.getState();
  const brain = petControl.brain;
  const say = clip(t.say, 240);
  if (brain) {
    let target: { x: number; z: number } | null = null;
    if (t.act === "go_to") {
      const th = findThing(things, t.target, runtime.pet.pos.x, runtime.pet.pos.z);
      target = th ? { x: th.x, z: th.z } : null;
    }
    if (t.act === "go_to" && !target) brain.act("sniff");
    else brain.act(t.act, target);
    brain.setMood(t.mood);
  }
  lastAct = t.act;
  lastMood = t.mood;
  if (t.remember && t.remember.trim()) g.remember(clip(t.remember, 120));
  if (say) g.addChat({ who: "pet", say });
  useTalk.setState((s) => ({ petThinking: false, petLine: say || null, petLineId: s.petLineId + 1 }));
}

function toast(msg: string): void {
  useTalk.setState({ toast: msg });
  setTimeout(() => {
    if (useTalk.getState().toast === msg) useTalk.setState({ toast: null });
  }, 3200);
}

/** The player said something to the pet (F25). */
export function sayToPet(raw: string): void {
  const line = raw.trim().slice(0, INPUT_CAP);
  if (!line) return;
  const g = useGame.getState();
  g.addChat({ who: "person", say: line });
  useTalk.setState({ playerLine: line, petThinking: true });
  enqueueTalk(async () => {
    const { text, things } = buildPerception("spoken", line);
    let reply: TalkReply | null = null;
    try {
      reply = await callTalk(text);
    } catch {
      reply = null;
    }
    if (reply && !reply.fallback && isTalk(reply.talk)) {
      applyTalk(reply.talk, things);
      return;
    }
    const species = speciesLabel(useGame.getState().reading.spec);
    applyTalk(offlineIntent(line, species), things);
    if (!reply || reply.reason !== "no_key") {
      toast(`${useGame.getState().reading.nameSuggestions[0]} didn't quite catch that. Try again.`);
    }
  });
}

/** One greeting per visit after Continue (PRD 9.11). */
export function greetOnReturn(news: string[], duration: string): void {
  useTalk.setState({ petThinking: true });
  enqueueTalk(async () => {
    const { text, things } = buildPerception("return", undefined, { news, duration });
    let reply: TalkReply | null = null;
    try {
      reply = await callTalk(text);
    } catch {
      reply = null;
    }
    if (reply && !reply.fallback && isTalk(reply.talk)) {
      applyTalk(reply.talk, things);
      return;
    }
    applyTalk({ say: "You're back!", act: "follow", target: "", mood: "happy", remember: "" }, things);
    petControl.brain?.celebrate();
    showGlyph("heart");
  });
}
