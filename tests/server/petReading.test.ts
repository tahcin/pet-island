import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../server/app";
import { readPet, readPetDetails, type ParseClient } from "../../server/petReading";
import { DEFAULT_READING, PetReadingSchema } from "../../src/schema/petReading";

const IMG = Buffer.from("fake-jpeg-bytes").toString("base64");

function fake(impl: (body: unknown, opts: { signal?: AbortSignal }) => Promise<unknown>): ParseClient {
  return { messages: { parse: vi.fn(impl) } } as unknown as ParseClient;
}

const goodCore = {
  spec: { ...DEFAULT_READING.spec, species: "cat", baseColor: "#000000", markingCoverage: 7 },
  nameSuggestions: ["Domino", "Oreo", "Pip", "Extra"],
  personality: ["Curious", "gentle"],
  greeting: "Hello island!",
  islandName: "Tuxedo Cove",
};

describe("readPet", () => {
  it("returns a normalized reading on success", async () => {
    const r = await readPet(IMG, "image/jpeg", fake(async () => ({ stop_reason: "end_turn", parsed_output: goodCore })));
    expect(r.fallback).toBe(false);
    expect(r.reading.spec.species).toBe("cat");
    expect(r.reading.nameSuggestions).toEqual(["Domino", "Oreo", "Pip"]);
    expect(r.reading.personality).toEqual(["curious", "gentle", "loyal"]);
    expect(r.reading.spec.markingCoverage).toBe(1);
    expect(r.reading.spec.baseColor).not.toBe("#000000");
    expect(() => PetReadingSchema.parse(r.reading)).not.toThrow();
  });

  it("falls back on refusal", async () => {
    const r = await readPet(IMG, "image/jpeg", fake(async () => ({ stop_reason: "refusal", parsed_output: null })));
    expect(r).toMatchObject({ fallback: true, reason: "refusal", reading: DEFAULT_READING });
  });

  it("falls back when parsed_output is null", async () => {
    const r = await readPet(IMG, "image/jpeg", fake(async () => ({ stop_reason: "end_turn", parsed_output: null })));
    expect(r).toMatchObject({ fallback: true, reason: "parse", reading: DEFAULT_READING });
  });

  it("falls back on bad JSON thrown by parse", async () => {
    const r = await readPet(
      IMG,
      "image/jpeg",
      fake(async () => {
        throw new SyntaxError("Unexpected token } in JSON");
      }),
    );
    expect(r).toMatchObject({ fallback: true, reason: "parse", reading: DEFAULT_READING });
  });

  it("falls back on timeout", async () => {
    const hang = fake(
      (_body, opts) =>
        new Promise((_resolve, reject) => {
          opts.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const r = await readPet(IMG, "image/jpeg", hang, 50);
    expect(r).toMatchObject({ fallback: true, reason: "timeout", reading: DEFAULT_READING });
  });

  it("falls back without a key", async () => {
    const r = await readPet(IMG, "image/jpeg", null);
    expect(r).toMatchObject({ fallback: true, reason: "no_key" });
  });

  it("details fall back on refusal and pad villagers otherwise", async () => {
    const refused = await readPetDetails(IMG, "image/jpeg", fake(async () => ({ stop_reason: "refusal", parsed_output: null })));
    expect(refused.fallback).toBe(true);
    expect(refused.value.villagers).toHaveLength(3);
    const ok = await readPetDetails(
      IMG,
      "image/jpeg",
      fake(async () => ({
        stop_reason: "end_turn",
        parsed_output: { mind: { persona: "A napper.", voice: "Slow.", goal: "Nap." }, villagers: [] },
      })),
    );
    expect(ok.fallback).toBe(false);
    expect(ok.value.mind.persona).toBe("A napper.");
    expect(ok.value.villagers).toHaveLength(3);
  });
});

describe("POST /api/pet", () => {
  const app = createApp({ claude: fake(async () => ({ stop_reason: "end_turn", parsed_output: goodCore })) });
  const post = (path: string, body: unknown) =>
    app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("returns 413 on oversized images", async () => {
    const big = "A".repeat(7 * 1024 * 1024);
    const res = await post("/api/pet", { imageBase64: big, mediaType: "image/jpeg" });
    expect(res.status).toBe(413);
  });

  it("returns 400 without an image and 415 for other types", async () => {
    expect((await post("/api/pet", {})).status).toBe(400);
    expect((await post("/api/pet", { imageBase64: IMG, mediaType: "image/heic" })).status).toBe(415);
  });

  it("returns the reading", async () => {
    const res = await post("/api/pet", { imageBase64: `data:image/jpeg;base64,${IMG}`, mediaType: "image/jpeg" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { reading: { islandName: string }; fallback: boolean };
    expect(json.fallback).toBe(false);
    expect(json.reading.islandName).toBe("Tuxedo Cove");
  });

  it("returns 200 with the fallback reading when Claude refuses", async () => {
    const refusing = createApp({ claude: fake(async () => ({ stop_reason: "refusal", parsed_output: null })) });
    const res = await refusing.request("/api/pet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageBase64: IMG, mediaType: "image/jpeg" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { fallback: boolean }).fallback).toBe(true);
  });
});

describe("no pet in the photo", () => {
  it("uses the stand-in pet when confidence is near zero", async () => {
    const noPet = { ...goodCore, spec: { ...goodCore.spec, confidence: 0 } };
    const r = await readPet(IMG, "image/jpeg", fake(async () => ({ stop_reason: "end_turn", parsed_output: noPet })));
    expect(r).toMatchObject({ fallback: true, reason: "no_pet", reading: DEFAULT_READING });
  });
});
