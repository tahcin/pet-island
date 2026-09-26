import { runtime, villagers, type VillagerRuntime } from "../game/runtime";
import { input } from "../control/useInput";
import { useGame } from "../store";
import { clip, type VillagerChat } from "../schema/petReading";
import { canWalk, type WorldData } from "../world/generateWorld";
import { tryChat } from "../talk/claudeQueue";
import { timeOfDayWords } from "../talk/perception";
import { blip } from "../talk/animalese";

export const CHAT_EVERY_S = 75;
export const CHAT_RETRY_S = 150;
const NEAR_PLAYER = 35;

/** Hold time for one line (PRD 9.10). */
export function lineHold(say: string): number {
  return 1.4 + say.length * 0.055;
}

let nextAt = CHAT_EVERY_S;
let running = false;
let clock = 0;

/** Test and remount helper. */
export function resetChatClock(): void {
  nextAt = CHAT_EVERY_S;
  clock = 0;
}

function pickPair(): [VillagerRuntime, VillagerRuntime] | null {
  const p = runtime.avatar.pos;
  const sorted = [...villagers]
    .map((v) => ({ v, d: Math.hypot(v.body.pos.x - p.x, v.body.pos.z - p.z) }))
    .sort((a, b) => a.d - b.d);
  if (sorted.length < 2 || sorted[1].d > NEAR_PLAYER) return null;
  return [sorted[0].v, sorted[1].v];
}

function meetingPoint(world: WorldData, a: VillagerRuntime, b: VillagerRuntime): { x: number; z: number } | null {
  const mx = (a.body.pos.x + b.body.pos.x) / 2;
  const mz = (a.body.pos.z + b.body.pos.z) / 2;
  for (let r = 0; r <= 8; r += 2) {
    for (let i = 0; i < (r === 0 ? 1 : 8); i++) {
      const ang = (i / 8) * Math.PI * 2;
      const x = mx + Math.cos(ang) * r;
      const z = mz + Math.sin(ang) * r;
      if (canWalk(world, x, z, x + 0.5, z) && canWalk(world, x, z, x, z + 0.5)) return { x, z };
    }
  }
  return null;
}

const wait = (s: number) => new Promise<void>((r) => setTimeout(r, s * 1000));

async function typeLine(v: VillagerRuntime, say: string): Promise<void> {
  // The bubble types the line itself; this only plays the matching blips.
  v.say = say;
  for (let i = 0; i < say.length; i++) {
    blip(say[i], v.body.height);
    await wait(1 / 38);
  }
}

async function playChat(chat: VillagerChat, a: VillagerRuntime, b: VillagerRuntime, meet: { x: number; z: number }) {
  // Stand a little apart on either side of the meeting point and face each other.
  const dx = b.body.pos.x - a.body.pos.x;
  const dz = b.body.pos.z - a.body.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  a.goto = { x: meet.x - (dx / len) * 0.9, z: meet.z - (dz / len) * 0.9 };
  b.goto = { x: meet.x + (dx / len) * 0.9, z: meet.z + (dz / len) * 0.9 };
  for (let t = 0; t < 12; t += 0.25) {
    const ra = Math.hypot(a.body.pos.x - a.goto.x, a.body.pos.z - a.goto.z);
    const rb = Math.hypot(b.body.pos.x - b.goto.x, b.body.pos.z - b.goto.z);
    if (ra < 1 && rb < 1) break;
    await wait(0.25);
  }
  a.face = { x: b.body.pos.x, z: b.body.pos.z };
  b.face = { x: a.body.pos.x, z: a.body.pos.z };
  for (const line of chat.lines) {
    const v = line.who === "A" ? a : b;
    const other = v === a ? b : a;
    other.say = null;
    await typeLine(v, line.say);
    await wait(lineHold(line.say));
  }
  for (const v of [a, b]) {
    v.say = null;
    v.goto = null;
    v.face = null;
  }
  const g = useGame.getState();
  if (chat.memoryA) g.rememberVillager(a.name, clip(chat.memoryA, 120));
  if (chat.memoryB) g.rememberVillager(b.name, clip(chat.memoryB, 120));
}

/** Called every frame from TalkExtras; starts a chat about every 75 s when conditions hold. */
export function tickVillagerChat(dt: number, world: WorldData): void {
  clock += dt;
  if (running || clock < nextAt) return;
  const g = useGame.getState();
  const keyRecently = performance.now() - input.lastKeyAt < 60_000;
  const visible = typeof document === "undefined" || document.visibilityState === "visible";
  if (!visible || !keyRecently || g.photoMode) {
    nextAt = clock + 5;
    return;
  }
  const pair = pickPair();
  const meet = pair ? meetingPoint(world, pair[0], pair[1]) : null;
  if (!pair || !meet) {
    nextAt = clock + 10;
    return;
  }
  const [a, b] = pair;
  const persona = (name: string) => g.reading.villagers.find((v) => v.name === name)?.persona ?? "";
  const started = tryChat(async () => {
    running = true;
    let played = false;
    try {
      const res = await fetch("/api/villagers/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          a: { name: a.name, species: a.species, persona: persona(a.name), memory: g.villagerMemories[a.name] ?? [] },
          b: { name: b.name, species: b.species, persona: persona(b.name), memory: g.villagerMemories[b.name] ?? [] },
          islandName: g.reading.islandName,
          timeOfDay: timeOfDayWords(g.timeOfDay),
          petName: g.reading.nameSuggestions[0],
          recent: g.events,
        }),
        signal: AbortSignal.timeout(13_000),
      });
      const json = (await res.json()) as { chat: VillagerChat | null; fallback: boolean };
      if (!res.ok || json.fallback || !json.chat || json.chat.lines.length < 2) {
        nextAt = clock + CHAT_RETRY_S;
        return;
      }
      nextAt = clock + CHAT_EVERY_S;
      // Playback runs outside the call slot so talk is never blocked by a long chat.
      played = true;
      void playChat(json.chat, a, b, meet).finally(() => {
        running = false;
      });
    } catch {
      nextAt = clock + CHAT_RETRY_S;
    } finally {
      if (!played) running = false;
    }
  });
  if (!started) nextAt = clock + 5;
}
