import { describe, expect, it } from "vitest";
import { describe as describePerception, direction, durationWords, findThing, type PerceptionInput } from "../../src/talk/perception";
import { offlineIntent } from "../../src/talk/offlineIntent";
import { enqueueTalk, resetQueue, tryChat, claudeBusy } from "../../src/talk/claudeQueue";
import {
  SAVE_KEY,
  SAVE_VERSION,
  clearSave,
  loadSave,
  returnNews,
  writeSave,
  type SaveData,
  type SaveStore,
} from "../../src/save/save";
import { DEFAULT_READING } from "../../src/schema/petReading";
import { PetBrain } from "../../src/pet/petBrain";
import { makeBody } from "../../src/game/runtime";

const base: PerceptionInput = {
  pet: { name: "Domino", species: "cat", build: "average", mood: "happy", act: "follow", x: 0, z: 0, yaw: 0 },
  person: { x: 0.4, z: 3, yaw: Math.PI, moving: true },
  things: [
    { name: "Mallow", label: "Mallow the rabbit (villager", kind: "villager", x: -12, z: 0.2 },
    { name: "a shell", label: "a shell", kind: "item", x: 0, z: -4.2 },
    { name: "the beach", label: "the beach", kind: "place", x: 0.2, z: 6 },
    { name: "the river", label: "the river", kind: "place", x: 20, z: 1 },
    { name: "far", label: "a bone", kind: "item", x: 90, z: 0 },
  ],
  islandName: "Tuxedo Cove",
  timeOfDay: 0.4,
  inventory: { shell: 2, bone: 1, yarn: 0, carrot: 0 },
  quests: ['Quest: Mallow asked: "Bring me 3 shells"'],
  memory: ["the person likes the beach"],
  log: [{ who: "person", say: "hi" }],
  events: ["The person picked up a shell."],
  why: "spoken",
  line: "sit",
};

describe("perception", () => {
  it("builds stable prose in the PRD 9.9 shape", () => {
    expect(describePerception(base)).toBe(
      [
        "You: Domino, a small average cat, feeling happy, currently following the person.",
        "The person: 3 m away, in front of you; walking; looking at you.",
        "Around you: a shell (4 m behind you); the beach (6 m ahead); Mallow the rabbit (villager, 12 m to your right); the river (20 m to your left).",
        'The island: Tuxedo Cove, daytime. The person has 1 bone and 2 shells. Quest: Mallow asked: "Bring me 3 shells"',
        "You remember: the person likes the beach.",
        'Your conversation so far (oldest first): The person: "hi"',
        "What just happened: The person picked up a shell.",
        "Answer what they actually said, and act on it if you want to.",
        'The person just said: "sit"',
      ].join("\n"),
    );
  });

  it("lists at most 6 things within 25 m", () => {
    const things = Array.from({ length: 10 }, (_, i) => ({
      name: `t${i}`,
      label: `thing ${i}`,
      kind: "item" as const,
      x: i * 3,
      z: 1,
    }));
    const around = describePerception({ ...base, things }).split("\n")[2];
    expect(around.split(";").length).toBe(6);
  });

  it("uses the return why line with news", () => {
    const text = describePerception({ ...base, why: "return", news: ["New shells washed up on the beach"], duration: "3 hours" });
    expect(text).toContain("The person has just come back after 3 hours.");
    expect(text).toContain("New shells washed up on the beach");
    expect(text).not.toContain("The person just said");
  });

  it("direction is relative to facing", () => {
    expect(direction(0, 0, 0, 0, 5)).toBe("ahead");
    expect(direction(0, 0, 0, 0, -5)).toBe("behind you");
    expect(direction(0, 0, Math.PI, 0, -5)).toBe("ahead");
  });

  it("finds go_to targets by name", () => {
    expect(findThing(base.things, "Mallow", 0, 0)?.x).toBe(-12);
    expect(findThing(base.things, "beach", 0, 0)?.name).toBe("the beach");
    expect(findThing(base.things, "", 0, 0)).toBeNull();
  });

  it("durations in words", () => {
    expect(durationWords(5 * 60_000)).toBe("a few minutes");
    expect(durationWords(60 * 60_000)).toBe("about an hour");
    expect(durationWords(3 * 3_600_000)).toBe("3 hours");
    expect(durationWords(2 * 86_400_000)).toBe("2 days");
  });
});

describe("offlineIntent", () => {
  const cases: [string, string][] = [
    ["Follow me", "follow"],
    ["come here", "come"],
    ["sit!", "sit"],
    ["Wait here", "stay"],
    ["stay", "stay"],
    ["Let's play", "play"],
    ["fetch the ball", "play"],
    ["Show me a trick", "trick"],
    ["dance for me", "trick"],
    ["time for a nap", "sleep"],
    ["Find something!", "sniff"],
    ["dig here", "sniff"],
    ["hello there", "follow"],
  ];
  it.each(cases)("%s -> %s", (line, act) => {
    expect(offlineIntent(line, "dog").act).toBe(act);
  });
  it("says a species line", () => {
    expect(offlineIntent("sit", "dog").say).toBe("Woof!");
    expect(offlineIntent("sit", "cat").say).toBe("Mrrp!");
  });
});

describe("claudeQueue", () => {
  it("keeps one call in flight, latest talk wins, chats skip while busy", async () => {
    resetQueue();
    const ran: string[] = [];
    let release!: () => void;
    enqueueTalk(() => new Promise<void>((r) => ((release = r), ran.push("a"))));
    enqueueTalk(async () => void ran.push("b"));
    enqueueTalk(async () => void ran.push("c"));
    expect(tryChat(async () => void ran.push("chat"))).toBe(false);
    expect(claudeBusy()).toBe(true);
    release();
    await new Promise((r) => setTimeout(r, 10));
    expect(ran).toEqual(["a", "c"]);
    expect(claudeBusy()).toBe(false);
  });
});

function memStore(): SaveStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const SAVE: SaveData = {
  version: SAVE_VERSION,
  savedAt: 1_700_000_000_000,
  reading: DEFAULT_READING,
  seed: 12345,
  mode: "companion",
  player: { x: 1, y: 2, z: 3, yaw: 0.5 },
  pet: { x: 2, y: 2, z: 4, yaw: 1 },
  inventory: { bone: 1, yarn: 0, carrot: 2, shell: 3 },
  collected: ["shell-12345-0", "bone-12345-1", "shell-12345-2"],
  quests: ["done", "active", "notStarted"],
  equipped: ["bandana"],
  petMemory: ["likes shells"],
  chatLog: [{ who: "person", say: "hi" }],
  villagerMemories: { Mallow: ["met Domino"] },
};

describe("save", () => {
  it("round-trips", () => {
    const store = memStore();
    expect(writeSave(SAVE, store)).toBe(true);
    expect(loadSave(store)).toEqual(SAVE);
    clearSave(store);
    expect(loadSave(store)).toBeNull();
  });

  it("ignores a corrupt save", () => {
    const store = memStore();
    store.map.set(SAVE_KEY, "{not json");
    expect(loadSave(store)).toBeNull();
    store.map.set(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, seed: 1 }));
    expect(loadSave(store)).toBeNull();
  });

  it("ignores a save with another version", () => {
    const store = memStore();
    store.map.set(SAVE_KEY, JSON.stringify({ ...SAVE, version: 99 }));
    expect(loadSave(store)).toBeNull();
  });

  it("survives a throwing storage", () => {
    const bad: SaveStore = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadSave(bad)).toBeNull();
    expect(writeSave(SAVE, bad)).toBe(false);
    expect(() => clearSave(bad)).not.toThrow();
  });
});

describe("returnNews", () => {
  const isShell = (id: string) => id.startsWith("shell-");
  it("is deterministic for the same time away", () => {
    const a = returnNews(3 * 3_600_000, "Domino", SAVE.collected, isShell);
    const b = returnNews(3 * 3_600_000, "Domino", SAVE.collected, isShell);
    expect(a).toEqual(b);
    expect(a.news).toEqual(["New shells washed up on the beach"]);
    expect(a.respawnShells).toEqual(["shell-12345-0", "shell-12345-2"]);
    expect(a.villagerMemory).toBe("Domino and their person were away for 3 hours.");
  });
  it("has no news under 2 minutes", () => {
    const r = returnNews(60_000, "Domino", SAVE.collected, isShell);
    expect(r.news).toEqual([]);
    expect(r.villagerMemory).toBeNull();
  });
});

describe("PetBrain talk acts", () => {
  it("sit holds for its duration, then follows", () => {
    const brain = new PetBrain(() => 0.9);
    const pet = makeBody(0.7, 0.35);
    const player = makeBody(1.3, 0.35);
    player.pos.set(20, 0, 0);
    brain.act("sit");
    for (let t = 0; t < 30; t += 0.1) brain.update(0.1, { pet, player, playerIdle: 0, interest: [] });
    expect(brain.state).toBe("sit");
    for (let t = 0; t < 12; t += 0.1) brain.update(0.1, { pet, player, playerIdle: 0, interest: [] });
    expect(brain.state).toBe("follow");
  });
  it("trick spins and ends after 3 s", () => {
    const glyphs: string[] = [];
    const brain = new PetBrain(() => 0.9, { glyph: (g) => glyphs.push(g) });
    const pet = makeBody(0.7, 0.35);
    const player = makeBody(1.3, 0.35);
    player.pos.set(3, 0, 0);
    brain.act("trick");
    const out = brain.update(0.6, { pet, player, playerIdle: 0, interest: [] });
    expect(out.spin).toBeGreaterThan(0);
    for (let t = 0; t < 3; t += 0.1) brain.update(0.1, { pet, player, playerIdle: 0, interest: [] });
    expect(brain.state).not.toBe("trick");
    expect(glyphs).toContain("star");
  });
});
