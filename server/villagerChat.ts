import { z } from "zod";
import { VillagerChatSchema, clip, type VillagerChat } from "../src/schema/petReading";
import { type CallResult, type ParseClient } from "./petReading";
import { TALK_TIMEOUT_MS, defaultTalkClient, parseText } from "./petTalk";

const Side = z.object({
  name: z.string(),
  species: z.string(),
  persona: z.string(),
  memory: z.array(z.string()),
});

/** Request body for POST /api/villagers/chat (PRD 9.10). */
export const ChatRequestSchema = z.object({
  a: Side,
  b: Side,
  islandName: z.string(),
  timeOfDay: z.string(),
  petName: z.string(),
  recent: z.array(z.string()),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const CHAT_SYSTEM = `You write short overheard conversations between two villagers on a cozy Animal Crossing style island.
The player can overhear them. Write 2 to 4 lines, taking turns, starting with A. Each line is at most 16 words,
warm and in character, about their day, the island, the player's pet by name, or something they remember.
No emoji. memoryA and memoryB are one short thing each villager will remember from this chat, or "".`;

function side(label: string, v: ChatRequest["a"]): string {
  const mem = v.memory
    .slice(-6)
    .map((m) => clip(m, 120))
    .filter(Boolean);
  return `${label}: ${clip(v.name, 24)} the ${clip(v.species, 24)}. ${clip(v.persona, 200)}${
    mem.length ? ` Remembers: ${mem.join("; ")}.` : ""
  }`;
}

export function chatUser(req: ChatRequest): string {
  const recent = req.recent
    .slice(-6)
    .map((r) => clip(r, 120))
    .filter(Boolean);
  return [
    side("A", req.a),
    side("B", req.b),
    `The island: ${clip(req.islandName, 40)}, ${clip(req.timeOfDay, 20)}. The player's pet is ${clip(req.petName, 24)}.`,
    recent.length ? `Recently: ${recent.join("; ")}.` : "",
    "Write their conversation.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function normalizeChat(raw: VillagerChat): VillagerChat {
  const lines = raw.lines
    .map((l) => clip(l.say, 120))
    .filter(Boolean)
    .slice(0, 4)
    .map((say, i) => ({ who: (i % 2 === 0 ? "A" : "B") as "A" | "B", say: say.split(/\s+/).slice(0, 16).join(" ") }));
  return { lines, memoryA: clip(raw.memoryA, 120), memoryB: clip(raw.memoryB, 120) };
}

export const CHAT_FALLBACK: VillagerChat = { lines: [], memoryA: "", memoryB: "" };

export async function villagerChat(
  req: ChatRequest,
  client: ParseClient | null = defaultTalkClient(),
  timeoutMs = TALK_TIMEOUT_MS,
): Promise<CallResult<VillagerChat>> {
  const r = await parseText(
    "villager chat",
    VillagerChatSchema,
    CHAT_SYSTEM,
    chatUser(req),
    normalizeChat,
    CHAT_FALLBACK,
    client,
    timeoutMs,
  );
  if (!r.fallback && r.value.lines.length < 2) return { ...r, value: CHAT_FALLBACK, fallback: true, reason: "parse" };
  return r;
}
