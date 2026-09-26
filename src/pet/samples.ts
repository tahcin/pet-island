import { DEFAULT_READING, type PetReading, type PetSpec } from "../schema/petReading";

/** Three hand-tuned sample readings for the reveal screenshots and dev routes. */

const DOG: PetSpec = {
  ...DEFAULT_READING.spec,
  species: "dog",
  build: "average",
  size: "medium",
  furLength: "short",
  baseColor: "#e8b173",
  secondaryColor: "#fff6e8",
  markingPattern: "blaze",
  markingCoverage: 0.5,
  earType: "floppy",
  tailType: "curly",
  eyeColor: "#3a2a20",
  noseColor: "#5a3c3a",
  collar: { present: true, color: "#ef7f86" },
  accessory: "none",
  confidence: 0.85,
};

const CAT: PetSpec = {
  ...DEFAULT_READING.spec,
  species: "cat",
  build: "average",
  size: "medium",
  furLength: "short",
  baseColor: "#b9b6c4",
  secondaryColor: "#7e7a8e",
  markingPattern: "tabby",
  markingCoverage: 0.55,
  earType: "pointy",
  tailType: "long",
  eyeColor: "#9fd07a",
  noseColor: "#f4a3b0",
  collar: { present: true, color: "#8fb8f0" },
  accessory: "none",
  confidence: 0.8,
};

const RABBIT: PetSpec = {
  ...DEFAULT_READING.spec,
  species: "rabbit",
  build: "average",
  size: "small",
  furLength: "medium",
  baseColor: "#fbf1e2",
  secondaryColor: "#ebbd92",
  markingPattern: "patches",
  markingCoverage: 0.45,
  earType: "long_upright",
  tailType: "puff",
  eyeColor: "#4a3030",
  noseColor: "#f5a0ae",
  collar: { present: false, color: "#ffffff" },
  accessory: "bow",
  confidence: 0.75,
};

const SAMPLES: Record<"dog" | "cat" | "rabbit", PetReading> = {
  dog: {
    ...DEFAULT_READING,
    spec: DOG,
    nameSuggestions: ["Biscuit", "Maple", "Pip"],
    personality: ["curious", "cheerful", "loyal"],
    greeting: "Hi hi! I already love this island, and I love you more!",
    islandName: "Biscuit Bay",
  },
  cat: {
    ...DEFAULT_READING,
    spec: CAT,
    nameSuggestions: ["Pebble", "Smudge", "Juniper"],
    personality: ["dignified", "sleepy", "secretly sweet"],
    greeting: "I suppose this island will do. Wake me when there are sunbeams.",
    islandName: "Pebble Cove",
    mind: {
      persona:
        "Pebble is a dignified gray tabby who acts aloof but follows their person from room to room. Loves sunbeams, cardboard boxes and quiet mornings, and is wary of loud birds.",
      voice: 'Slow and a little smug, short sentences, says "mrrp" when pleased.',
      goal: "Find the warmest napping rock on the island.",
    },
  },
  rabbit: {
    ...DEFAULT_READING,
    spec: RABBIT,
    nameSuggestions: ["Mochi", "Clover", "Bun"],
    personality: ["gentle", "bouncy", "snacky"],
    greeting: "Oh! Soft grass everywhere! Can we hop around all day?",
    islandName: "Clover Isle",
    mind: {
      persona:
        "Mochi is a gentle, bouncy bunny who does happy zoomies after every snack. Loves clover, cozy corners and nose boops, and is a little shy with big dogs.",
      voice: "Soft and quick, lots of tiny excited gasps.",
      goal: "Taste every kind of clover on the island.",
    },
  },
};

export type SampleSpecies = keyof typeof SAMPLES;

export function sampleReading(species: SampleSpecies): PetReading {
  return structuredClone(SAMPLES[species]);
}

export function isSampleSpecies(s: string): s is SampleSpecies {
  return s === "dog" || s === "cat" || s === "rabbit";
}
