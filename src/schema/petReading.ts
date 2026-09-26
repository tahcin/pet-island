import { z } from "zod";

export const SPECIES = ["dog", "cat", "rabbit", "small_rodent"] as const;
export const BUILDS = ["slim", "average", "stocky", "long"] as const;
export const SIZES = ["tiny", "small", "medium", "large"] as const;
export const FUR_LENGTHS = ["short", "medium", "long"] as const;
export const MARKING_PATTERNS = [
  "solid",
  "patches",
  "spots",
  "tabby",
  "tuxedo",
  "mask",
  "blaze",
  "socks",
  "brindle_approx",
] as const;
export const EAR_TYPES = ["pointy", "floppy", "folded", "long_upright", "rounded", "long_floppy"] as const;
export const TAIL_TYPES = ["curly", "long", "bob", "fluffy", "thin", "puff"] as const;
export const ACCESSORIES = ["none", "bandana", "bow", "hat"] as const;
export const PET_ACTS = ["follow", "come", "stay", "sit", "play", "sniff", "dig", "trick", "sleep", "go_to"] as const;
export const PET_MOODS = [
  "happy",
  "curious",
  "excited",
  "calm",
  "sleepy",
  "playful",
  "shy",
  "proud",
  "loving",
  "grumpy",
] as const;

export const PetSpecSchema = z.object({
  species: z.enum(SPECIES),
  build: z.enum(BUILDS),
  size: z.enum(SIZES),
  furLength: z.enum(FUR_LENGTHS),
  baseColor: z.string(),
  secondaryColor: z.string(),
  markingPattern: z.enum(MARKING_PATTERNS),
  markingCoverage: z.number().min(0).max(1),
  earType: z.enum(EAR_TYPES),
  tailType: z.enum(TAIL_TYPES),
  eyeColor: z.string(),
  noseColor: z.string(),
  collar: z.object({ present: z.boolean(), color: z.string() }),
  accessory: z.enum(ACCESSORIES),
  confidence: z.number().min(0).max(1),
});

export const VillagerSchema = z.object({
  name: z.string(),
  species: z.enum(SPECIES),
  persona: z.string(),
  lines: z.array(z.string()).length(3),
  questAsk: z.string(),
  questThanks: z.string(),
});

export const PetMindSchema = z.object({
  persona: z.string(),
  voice: z.string(),
  goal: z.string(),
});

export const PetReadingSchema = z.object({
  spec: PetSpecSchema,
  nameSuggestions: z.array(z.string()).length(3),
  personality: z.array(z.string()).length(3),
  greeting: z.string(),
  islandName: z.string(),
  mind: PetMindSchema,
  villagers: z.array(VillagerSchema).length(3),
});

export type Species = (typeof SPECIES)[number];
export type Build = (typeof BUILDS)[number];
export type PetSize = (typeof SIZES)[number];
export type FurLength = (typeof FUR_LENGTHS)[number];
export type MarkingPattern = (typeof MARKING_PATTERNS)[number];
export type EarType = (typeof EAR_TYPES)[number];
export type TailType = (typeof TAIL_TYPES)[number];
export type Accessory = (typeof ACCESSORIES)[number];
export type PetSpec = z.infer<typeof PetSpecSchema>;
export type Villager = z.infer<typeof VillagerSchema>;
export type PetMind = z.infer<typeof PetMindSchema>;
export type PetReading = z.infer<typeof PetReadingSchema>;

/**
 * Wire schema sent to Claude through structured outputs. Structured outputs reject array
 * length and number range constraints, so those are enforced in normalizeReading instead.
 */
export const PetReadingWireSchema = z.object({
  spec: PetSpecSchema.extend({
    markingCoverage: z.number(),
    confidence: z.number(),
  }),
  nameSuggestions: z.array(z.string()),
  personality: z.array(z.string()),
  greeting: z.string(),
  islandName: z.string(),
  mind: PetMindSchema,
  villagers: z.array(VillagerSchema.extend({ lines: z.array(z.string()) })),
});
export type PetReadingWire = z.infer<typeof PetReadingWireSchema>;

/**
 * The reading is fetched as two parallel calls so the reveal never waits on the long part:
 * the core (what the reveal shows) and the details (mind and villagers, used on the island).
 */
export const PetCoreWireSchema = PetReadingWireSchema.pick({
  spec: true,
  nameSuggestions: true,
  personality: true,
  greeting: true,
  islandName: true,
});
export const PetDetailsWireSchema = PetReadingWireSchema.pick({ mind: true, villagers: true });
export type PetCoreWire = z.infer<typeof PetCoreWireSchema>;
export type PetDetailsWire = z.infer<typeof PetDetailsWireSchema>;
export type PetDetails = Pick<PetReading, "mind" | "villagers">;

/** Normalizes the details half on its own (pads villagers, truncates strings). */
export function normalizeDetails(raw: unknown): PetDetails {
  const r = normalizeReading(raw);
  return { mind: r.mind, villagers: r.villagers };
}

export const PetTalkSchema = z.object({
  say: z.string(),
  act: z.enum(PET_ACTS),
  target: z.string(),
  mood: z.enum(PET_MOODS),
  remember: z.string(),
});
export type PetTalk = z.infer<typeof PetTalkSchema>;
export type PetAct = (typeof PET_ACTS)[number];
export type PetMood = (typeof PET_MOODS)[number];

export const VillagerChatSchema = z.object({
  lines: z.array(z.object({ who: z.enum(["A", "B"]), say: z.string() })),
  memoryA: z.string(),
  memoryB: z.string(),
});
export type VillagerChat = z.infer<typeof VillagerChatSchema>;

export const LIMITS = {
  persona: 420,
  voice: 180,
  goal: 200,
  line: 160,
  name: 24,
  trait: 20,
  islandName: 32,
  villagerPersona: 200,
} as const;

export const DEFAULT_READING: PetReading = {
  spec: {
    species: "dog",
    build: "average",
    size: "medium",
    furLength: "short",
    baseColor: "#e0a86a",
    secondaryColor: "#f6f1e7",
    markingPattern: "blaze",
    markingCoverage: 0.4,
    earType: "floppy",
    tailType: "curly",
    eyeColor: "#3a2a20",
    noseColor: "#4a3434",
    collar: { present: true, color: "#e86a6a" },
    accessory: "none",
    confidence: 0.5,
  },
  nameSuggestions: ["Biscuit", "Maple", "Pip"],
  personality: ["curious", "cheerful", "loyal"],
  greeting: "Hi hi! I already love this island, and I love you more!",
  islandName: "Biscuit Bay",
  mind: {
    persona:
      "Biscuit is a sunny, curious pup who believes every stick is a gift and every stranger is a friend. Loves digging, belly rubs and the sound of waves, and is a little scared of crabs. Thinks their person is the best person in the whole world.",
    voice: 'Bouncy and quick, short happy sentences, says "woof woof!" when excited.',
    goal: "Find the best digging spot on the island and show it to their person.",
  },
  villagers: [
    {
      name: "Mallow",
      species: "rabbit",
      persona: "A gentle rabbit who collects shells and hums while she works.",
      lines: [
        "Oh! A new face on the island. Welcome!",
        "The beach is extra sparkly today, have you noticed?",
        "I hum to the waves. They hum back, I think.",
      ],
      questAsk: "Could you find me 3 shells? My collection is missing a few.",
      questThanks: "They are perfect! Here, take this bandana for your little friend.",
    },
    {
      name: "Pepper",
      species: "cat",
      persona: "A proud cat who pretends not to care but secretly loves company.",
      lines: [
        "Hmph. I suppose you can visit my side of the island.",
        "I was not waiting for you. I was simply sitting here.",
        "Your pet has good taste in friends. Me, I mean.",
      ],
      questAsk: "Bring me 3 treasures from the island. If you have time. No rush.",
      questThanks: "Fine, fine, these are lovely. Take this hat. It suits your pet.",
    },
    {
      name: "Nutmeg",
      species: "dog",
      persona: "An energetic pup who is always halfway through a new hobby.",
      lines: [
        "Today I am learning to juggle! Tomorrow, maybe kites!",
        "Did you see the river? It sparkles like soda pop.",
        "Your pet is so fast! We should race sometime.",
      ],
      questAsk: "Could you bring me 3 shells? I am building a sand castle.",
      questThanks: "Wow, thank you! My castle will be the best one ever.",
    },
  ],
};

const HEX_RE = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

/** Returns a normalized "#rrggbb" or the fallback. */
export function normalizeHex(input: unknown, fallback: string): string {
  if (typeof input !== "string") return fallback;
  const m = HEX_RE.exec(input.trim());
  if (!m) return fallback;
  let hex = m[1].toLowerCase();
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  return `#${hex}`;
}

/** Relative luminance in [0, 1] of a "#rrggbb" color. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

function toHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Lifts a color evenly until its luminance is at least `min` (PRD section 8: never pure black). */
export function liftColor(hex: string, min = 0.12): string {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  for (let i = 0; i < 64 && luminance(toHex(r, g, b)) < min; i++) {
    r = Math.min(255, r + 3);
    g = Math.min(255, g + 3);
    b = Math.min(255, b + 3);
  }
  return toHex(r, g, b);
}

// Built from the char code so this source file never contains the character itself.
const EM_DASH = new RegExp(`\\s*${String.fromCharCode(0x2014)}\\s*`, "g");

/** Collapses whitespace, strips em dashes, and truncates a string Claude wrote. */
export function clip(input: unknown, max: number, fallback = ""): string {
  if (typeof input !== "string") return fallback;
  const s = input.replace(/\s+/g, " ").replace(EM_DASH, ", ").trim();
  if (!s) return fallback;
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function clamp01(n: unknown, fallback: number): number {
  return typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

function pickEnum<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return (options as readonly string[]).includes(value as string) ? (value as T) : fallback;
}

function fixedList(input: unknown, n: number, max: number, fallback: readonly string[]): string[] {
  const src = Array.isArray(input) ? input : [];
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(clip(src[i], max, fallback[i % fallback.length]));
  return out;
}

export function normalizeSpec(raw: unknown, base: PetSpec = DEFAULT_READING.spec): PetSpec {
  const s = (raw ?? {}) as Record<string, unknown>;
  const collar = (s.collar ?? {}) as Record<string, unknown>;
  let baseColor = liftColor(normalizeHex(s.baseColor, base.baseColor));
  let secondaryColor = liftColor(normalizeHex(s.secondaryColor, baseColor));
  // Tuxedo paints chest, belly, and paws in the secondary color, which must be the light one.
  if (s.markingPattern === "tuxedo" && luminance(secondaryColor) < luminance(baseColor)) {
    [baseColor, secondaryColor] = [secondaryColor, baseColor];
  }
  return {
    species: pickEnum(s.species, SPECIES, base.species),
    build: pickEnum(s.build, BUILDS, base.build),
    size: pickEnum(s.size, SIZES, base.size),
    furLength: pickEnum(s.furLength, FUR_LENGTHS, base.furLength),
    baseColor,
    secondaryColor,
    markingPattern: pickEnum(s.markingPattern, MARKING_PATTERNS, base.markingPattern),
    markingCoverage: clamp01(s.markingCoverage, base.markingCoverage),
    earType: pickEnum(s.earType, EAR_TYPES, base.earType),
    tailType: pickEnum(s.tailType, TAIL_TYPES, base.tailType),
    eyeColor: normalizeHex(s.eyeColor, base.eyeColor),
    noseColor: liftColor(normalizeHex(s.noseColor, base.noseColor), 0.03),
    collar: {
      present: typeof collar.present === "boolean" ? collar.present : base.collar.present,
      color: normalizeHex(collar.color, base.collar.color),
    },
    accessory: pickEnum(s.accessory, ACCESSORIES, base.accessory),
    confidence: clamp01(s.confidence, base.confidence),
  };
}

/**
 * Turns anything Claude wrote into a valid PetReading: clamps numbers, pads or truncates
 * arrays from the default reading, and truncates every string before it reaches the UI.
 */
export function normalizeReading(raw: unknown): PetReading {
  const r = (raw ?? {}) as Record<string, unknown>;
  const d = DEFAULT_READING;
  const mind = (r.mind ?? {}) as Record<string, unknown>;
  const vRaw = Array.isArray(r.villagers) ? (r.villagers as unknown[]) : [];
  const villagers = d.villagers.map((dv, i) => {
    const v = (vRaw[i] ?? {}) as Record<string, unknown>;
    return {
      name: clip(v.name, LIMITS.name, dv.name),
      species: pickEnum(v.species, SPECIES, dv.species),
      persona: clip(v.persona, LIMITS.villagerPersona, dv.persona),
      lines: fixedList(v.lines, 3, LIMITS.line, dv.lines),
      questAsk: clip(v.questAsk, LIMITS.line, dv.questAsk),
      questThanks: clip(v.questThanks, LIMITS.line, dv.questThanks),
    };
  });
  const reading: PetReading = {
    spec: normalizeSpec(r.spec),
    nameSuggestions: fixedList(r.nameSuggestions, 3, LIMITS.name, d.nameSuggestions),
    personality: fixedList(r.personality, 3, LIMITS.trait, d.personality).map((t) => t.toLowerCase()),
    greeting: clip(r.greeting, LIMITS.line, d.greeting),
    islandName: clip(r.islandName, LIMITS.islandName, d.islandName),
    mind: {
      persona: clip(mind.persona, LIMITS.persona, d.mind.persona),
      voice: clip(mind.voice, LIMITS.voice, d.mind.voice),
      goal: clip(mind.goal, LIMITS.goal, d.mind.goal),
    },
    villagers,
  };
  return PetReadingSchema.parse(reading);
}

/** Stable 32-bit hash of any JSON value (FNV-1a over the JSON string). */
export function hashJson(value: unknown): number {
  const s = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
