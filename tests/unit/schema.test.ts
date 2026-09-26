import { describe, expect, it } from "vitest";
import {
  DEFAULT_READING,
  PetReadingSchema,
  clip,
  luminance,
  normalizeReading,
  normalizeSpec,
} from "../../src/schema/petReading";
import { dedupeVillagerNames } from "../../src/ui/readingFlow";

describe("normalizeReading", () => {
  it("turns garbage into a valid reading", () => {
    expect(() => PetReadingSchema.parse(normalizeReading(null))).not.toThrow();
    expect(() => PetReadingSchema.parse(normalizeReading({ spec: { species: "dragon" }, villagers: "x" }))).not.toThrow();
    expect(normalizeReading({ spec: { species: "dragon" } }).spec.species).toBe(DEFAULT_READING.spec.species);
  });

  it("rejects bad Claude output in the strict schema", () => {
    expect(PetReadingSchema.safeParse({ ...DEFAULT_READING, nameSuggestions: ["a"] }).success).toBe(false);
    expect(
      PetReadingSchema.safeParse({ ...DEFAULT_READING, spec: { ...DEFAULT_READING.spec, markingCoverage: 3 } }).success,
    ).toBe(false);
  });

  it("truncates long strings and strips em dashes", () => {
    const long = "word ".repeat(200);
    const r = normalizeReading({ greeting: long, mind: { persona: long, voice: long, goal: long } });
    expect(r.greeting.length).toBeLessThanOrEqual(160);
    expect(r.mind.persona.length).toBeLessThanOrEqual(420);
    expect(clip(`a ${String.fromCharCode(0x2014)} b`, 50)).toBe("a, b");
  });

  it("lifts pure black coats and normalizes hex", () => {
    const s = normalizeSpec({ baseColor: "#000", secondaryColor: "zzz" });
    expect(luminance(s.baseColor)).toBeGreaterThanOrEqual(0.12);
    expect(s.secondaryColor).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("keeps the tuxedo marking color light", () => {
    const s = normalizeSpec({ markingPattern: "tuxedo", baseColor: "#f6f1e7", secondaryColor: "#3a3238" });
    expect(luminance(s.secondaryColor)).toBeGreaterThan(luminance(s.baseColor));
  });
});

describe("dedupeVillagerNames", () => {
  it("renames villagers who share the pet's name or each other's", () => {
    const v = DEFAULT_READING.villagers;
    const out = dedupeVillagerNames(
      [
        { ...v[0], name: "Biscuit" },
        { ...v[1], name: "Pip" },
        { ...v[2], name: "pip" },
      ],
      "Biscuit",
    );
    const names = out.map((x) => x.name.toLowerCase());
    expect(names).not.toContain("biscuit");
    expect(new Set(names).size).toBe(3);
    expect(out[1].name).toBe("Pip");
  });
});
