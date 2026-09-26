import type { ChatLine, ItemKind } from "../store";

/** Something near the pet, in world XZ. */
export interface Thing {
  /** Name Claude can use as a go_to target: "Mallow", "a shell", "the beach". */
  name: string;
  /** How it reads in the list: "Mallow the rabbit (villager", "a shell", "the beach". */
  label: string;
  kind: "villager" | "item" | "place";
  x: number;
  z: number;
}

export interface PerceptionInput {
  pet: {
    name: string;
    species: string;
    build: string;
    mood: string;
    act: string;
    x: number;
    z: number;
    yaw: number;
  };
  person: { x: number; z: number; yaw: number; moving: boolean };
  things: readonly Thing[];
  islandName: string;
  timeOfDay: number;
  inventory: Record<ItemKind, number>;
  quests: readonly string[];
  memory: readonly string[];
  log: readonly ChatLine[];
  events: readonly string[];
  why: "spoken" | "return";
  line?: string;
  news?: readonly string[];
  duration?: string;
}

export const PERCEPTION_RANGE = 25;
export const PERCEPTION_MAX_THINGS = 6;

const ACT_WORDS: Record<string, string> = {
  follow: "following the person",
  come: "coming to the person",
  stay: "staying put",
  sit: "sitting",
  play: "playing",
  sniff: "sniffing around",
  dig: "digging",
  trick: "doing a trick",
  sleep: "napping",
  go_to: "walking somewhere",
  idle: "standing around",
  happy: "hopping happily",
};

/** Direction of (x, z) relative to a body at (ox, oz) facing yaw; forward is (sin yaw, cos yaw). */
export function direction(ox: number, oz: number, yaw: number, x: number, z: number): string {
  const dx = x - ox;
  const dz = z - oz;
  const fwd = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  // Right of a body facing +z is -x in this world.
  const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
  const a = (Math.atan2(right, fwd) * 180) / Math.PI;
  if (Math.abs(a) <= 35) return "ahead";
  if (Math.abs(a) >= 145) return "behind you";
  return a > 0 ? "to your right" : "to your left";
}

function personDirection(ox: number, oz: number, yaw: number, x: number, z: number): string {
  const dx = x - ox;
  const dz = z - oz;
  const fwd = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
  const ahead = fwd >= 0 ? "in front of you" : "behind you";
  if (Math.abs(right) < Math.abs(fwd) * 0.35) return ahead;
  return `${ahead}, to the ${right > 0 ? "right" : "left"}`;
}

function timeWords(t: number): string {
  if (t < 0.22 || t >= 0.85) return "night";
  if (t < 0.32) return "early morning";
  if (t < 0.7) return "daytime";
  return "evening";
}

export function timeOfDayWords(t: number): string {
  return timeWords(t);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Durations in words (PRD 9.11): "a few minutes", "about an hour", "3 hours", "2 days". */
export function durationWords(ms: number): string {
  const min = ms / 60_000;
  if (min < 45) return "a few minutes";
  const hours = min / 60;
  if (hours < 1.5) return "about an hour";
  if (hours < 36) return `${Math.round(hours)} hours`;
  const days = Math.round(hours / 24);
  return days === 1 ? "a day" : `${days} days`;
}

/** The talk user message, in the exact PRD 9.9 shape. Pure and deterministic. */
export function describe(p: PerceptionInput): string {
  const pet = p.pet;
  const species = pet.species.replace("_", " ");
  const lines: string[] = [];
  lines.push(
    `You: ${pet.name}, a small ${pet.build} ${species}, feeling ${pet.mood}, currently ${ACT_WORDS[pet.act] ?? pet.act}.`,
  );
  const pd = Math.round(Math.hypot(p.person.x - pet.x, p.person.z - pet.z));
  const looking = direction(p.person.x, p.person.z, p.person.yaw, pet.x, pet.z) === "ahead";
  lines.push(
    `The person: ${pd} m away, ${personDirection(pet.x, pet.z, pet.yaw, p.person.x, p.person.z)}; ${
      p.person.moving ? "walking" : "standing still"
    }; ${looking ? "looking at you" : "looking away"}.`,
  );
  const near = p.things
    .map((t) => ({ t, d: Math.hypot(t.x - pet.x, t.z - pet.z) }))
    .filter((e) => e.d <= PERCEPTION_RANGE)
    .sort((a, b) => a.d - b.d || a.t.name.localeCompare(b.t.name))
    .slice(0, PERCEPTION_MAX_THINGS)
    .map(({ t, d }) => {
      const where = `${Math.round(d)} m ${direction(pet.x, pet.z, pet.yaw, t.x, t.z)}`;
      return t.kind === "villager" ? `${t.label}, ${where})` : `${t.label} (${where})`;
    });
  lines.push(`Around you: ${near.length ? near.join("; ") : "nothing much"}.`);
  const inv = (["bone", "yarn", "carrot", "shell"] as ItemKind[])
    .filter((k) => p.inventory[k] > 0)
    .map((k) => plural(p.inventory[k], k));
  const invText = inv.length ? `The person has ${inv.join(" and ")}.` : "The person is not carrying anything.";
  const quests = p.quests.filter(Boolean);
  lines.push(
    `The island: ${p.islandName}, ${timeWords(p.timeOfDay)}. ${invText}${quests.length ? ` ${quests.join(" ")}` : ""}`,
  );
  lines.push(`You remember: ${p.memory.length ? p.memory.join("; ") : "nothing yet"}.`);
  const log = p.log.slice(-12).map((l) => `${l.who === "pet" ? "You" : "The person"}: "${l.say}"`);
  lines.push(`Your conversation so far (oldest first): ${log.length ? log.join(" ") : "nothing yet"}`);
  lines.push(`What just happened: ${p.events.length ? p.events.slice(-4).join(" ") : "Nothing special."}`);
  if (p.why === "return") {
    lines.push(
      `The person has just come back after ${p.duration ?? "a while"}. Greet them warmly and mention something from this news if it matters to you: ${
        p.news && p.news.length ? p.news.join("; ") : "nothing new"
      }.`,
    );
  } else {
    lines.push("Answer what they actually said, and act on it if you want to.");
    lines.push(`The person just said: "${p.line ?? ""}"`);
  }
  return lines.join("\n");
}

/** Resolves a go_to target name from Claude against the perception list. */
export function findThing(things: readonly Thing[], target: string, fromX: number, fromZ: number): Thing | null {
  const t = target.trim().toLowerCase().replace(/^(the|a|an)\s+/, "");
  if (!t) return null;
  const matches = things.filter((th) => {
    const n = th.name.toLowerCase().replace(/^(the|a|an)\s+/, "");
    return n === t || n.includes(t) || t.includes(n);
  });
  let best: Thing | null = null;
  let bestD = Infinity;
  for (const m of matches) {
    const d = Math.hypot(m.x - fromX, m.z - fromZ);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}
