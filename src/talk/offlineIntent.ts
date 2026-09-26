import type { PetAct, PetMood, PetTalk, Species } from "../schema/petReading";

const RULES: { words: string[]; act: PetAct; mood: PetMood }[] = [
  { words: ["follow", "come"], act: "follow", mood: "happy" },
  { words: ["sit"], act: "sit", mood: "calm" },
  { words: ["stay", "wait"], act: "stay", mood: "calm" },
  { words: ["play", "fetch"], act: "play", mood: "playful" },
  { words: ["trick", "dance", "spin"], act: "trick", mood: "proud" },
  { words: ["sleep", "nap"], act: "sleep", mood: "sleepy" },
  { words: ["find", "dig", "sniff"], act: "sniff", mood: "curious" },
];

/** A short species sound for offline replies (PRD 9.9 fallback). */
export function speciesLine(species: Species | string): string {
  switch (species) {
    case "dog":
      return "Woof!";
    case "cat":
      return "Mrrp!";
    case "rabbit":
      return "*happy nose wiggle*";
    case "Claude mascot":
      return "Ooh!";
    default:
      return "Squeak!";
  }
}

/** Keyword matcher used when Claude is unavailable. "come" maps to come, the rest per PRD 9.9. */
export function offlineIntent(line: string, species: Species | string): PetTalk {
  const text = line.toLowerCase();
  let act: PetAct = "follow";
  let mood: PetMood = "happy";
  let hit = false;
  for (const r of RULES) {
    if (r.words.some((w) => new RegExp(`\\b${w}`).test(text))) {
      act = r.act;
      mood = r.mood;
      hit = true;
      break;
    }
  }
  if (hit && /\bcome\b/.test(text) && act === "follow") act = "come";
  return { say: speciesLine(species), act, target: "", mood, remember: "" };
}
