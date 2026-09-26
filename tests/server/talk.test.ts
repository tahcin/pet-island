import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../server/app";
import { petTalk, type TalkRequest } from "../../server/petTalk";
import { villagerChat, type ChatRequest } from "../../server/villagerChat";
import type { ParseClient } from "../../server/petReading";
import { DEFAULT_READING } from "../../src/schema/petReading";

function fake(impl: (body: unknown, opts: { signal?: AbortSignal }) => Promise<unknown>): ParseClient {
  return { messages: { parse: vi.fn(impl) } } as unknown as ParseClient;
}
const hang = () =>
  fake(
    (_b, opts) =>
      new Promise((_resolve, reject) => {
        opts.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
  );

const TALK: TalkRequest = {
  pet: { name: "Domino", species: "cat", islandName: "Tuxedo Cove", mind: DEFAULT_READING.mind },
  perception: 'You: Domino.\nThe person just said: "sit"',
};
const CHAT: ChatRequest = {
  a: { name: "Mallow", species: "rabbit", persona: "Shy.", memory: [] },
  b: { name: "Fennel", species: "cat", persona: "Bold.", memory: ["likes naps"] },
  islandName: "Tuxedo Cove",
  timeOfDay: "daytime",
  petName: "Domino",
  recent: [],
};

describe("petTalk", () => {
  it("returns a normalized reply", async () => {
    const client = fake(async () => ({
      stop_reason: "end_turn",
      parsed_output: { say: "Mrrp! Sitting now.", act: "sit", target: "", mood: "calm", remember: "" },
    }));
    const r = await petTalk(TALK, client);
    expect(r.fallback).toBe(false);
    expect(r.value.act).toBe("sit");
    const body = (client.messages.parse as unknown as { mock: { calls: [Record<string, unknown>][] } }).mock.calls[0][0];
    expect(body.model).toBe("claude-opus-5");
    expect(body.max_tokens).toBe(1024);
  });
  it("falls back on refusal", async () => {
    const r = await petTalk(TALK, fake(async () => ({ stop_reason: "refusal", parsed_output: null })));
    expect(r).toMatchObject({ fallback: true, reason: "refusal" });
  });
  it("falls back on timeout", async () => {
    const r = await petTalk(TALK, hang(), 50);
    expect(r).toMatchObject({ fallback: true, reason: "timeout" });
  });
  it("falls back without a key", async () => {
    const r = await petTalk(TALK, null);
    expect(r).toMatchObject({ fallback: true, reason: "no_key" });
  });
});

describe("villagerChat", () => {
  it("returns turn-taking lines", async () => {
    const r = await villagerChat(
      CHAT,
      fake(async () => ({
        stop_reason: "end_turn",
        parsed_output: { lines: [{ who: "A", say: "Hi Fennel." }, { who: "A", say: "Hello Mallow." }], memoryA: "", memoryB: "x" },
      })),
    );
    expect(r.fallback).toBe(false);
    expect(r.value.lines.map((l) => l.who)).toEqual(["A", "B"]);
  });
  it("falls back on refusal and timeout", async () => {
    expect(await villagerChat(CHAT, fake(async () => ({ stop_reason: "refusal", parsed_output: null })))).toMatchObject({
      fallback: true,
      reason: "refusal",
    });
    expect(await villagerChat(CHAT, hang(), 50)).toMatchObject({ fallback: true, reason: "timeout" });
  });
});

describe("routes", () => {
  it("POST /api/pet/talk falls back on refusal", async () => {
    const app = createApp({ claude: fake(async () => ({ stop_reason: "refusal", parsed_output: null })) });
    const res = await app.request("/api/pet/talk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(TALK),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ talk: null, fallback: true, reason: "refusal" });
  });
  it("POST /api/pet/talk rejects a bad body", async () => {
    const app = createApp({ claude: null });
    const res = await app.request("/api/pet/talk", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
    expect(res.status).toBe(400);
  });
  it("POST /api/villagers/chat falls back without a key", async () => {
    const app = createApp({ claude: null });
    const res = await app.request("/api/villagers/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(CHAT),
    });
    expect(await res.json()).toMatchObject({ chat: null, fallback: true, reason: "no_key" });
  });
});
