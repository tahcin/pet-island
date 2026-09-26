import type { Species } from "../schema/petReading";

/** Seeded townsfolk (villagers 3 to 5). Pure and deterministic. */
export interface Townsfolk {
  name: string;
  species: Species;
  persona: string;
  lines: string[];
}

const NAMES = ["Peaches", "Mochi", "Clover", "Biscuit", "Pudding", "Maple", "Sprout", "Honey", "Tofu", "Pip", "Juniper", "Marshmallow"];
const SPECIES: readonly Species[] = ["dog", "cat", "rabbit", "small_rodent"];
const PERSONAS: { persona: string; lines: string[] }[] = [
  { persona: "Runs the tiny post office and knows everyone's business.", lines: ["Mail comes twice a day. Sometimes thrice.", "I stamp every letter with a little heart.", "Have you met everyone in town yet?"] },
  { persona: "A sleepy baker who naps between batches.", lines: ["The bread is rising. So am I, slowly.", "Smell that? Cinnamon swirls.", "I dreamt of a giant muffin again."] },
  { persona: "An eager explorer who maps every hill.", lines: ["The view from the top is the best on the island!", "I counted every step to the high cliffs.", "Maps are just love letters to places."] },
  { persona: "A gardener who talks to the flowers.", lines: ["These tulips told me it would be sunny.", "Water, sunshine, and a little song.", "Mind the petunias, please."] },
  { persona: "A cheerful musician who hums all day.", lines: ["La la la. Oh, hello!", "The fountain keeps the best rhythm.", "Want to hear my new tune later?"] },
  { persona: "A retired sailor who collects seashells.", lines: ["The tide brings treasures every morning.", "I once sailed past a whale. It waved.", "Sea breeze is good for the whiskers."] },
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Three townsfolk for a seed, with names that avoid the reading villagers' names. */
export function townsfolk(seed: number, avoid: readonly string[] = []): Townsfolk[] {
  const rng = mulberry32((seed ^ 0x7a11f0) >>> 0);
  const names = NAMES.filter((n) => !avoid.includes(n));
  const personas = [...PERSONAS];
  const out: Townsfolk[] = [];
  for (let i = 0; i < 3; i++) {
    const name = names.splice(Math.floor(rng() * names.length), 1)[0] ?? `Friend ${i + 1}`;
    const p = personas.splice(Math.floor(rng() * personas.length), 1)[0];
    out.push({ name, species: SPECIES[Math.floor(rng() * SPECIES.length)], persona: p.persona, lines: [...p.lines] });
  }
  return out;
}
