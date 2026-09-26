import { useGame, type QuestState } from "../store";
import { resetBody, runtime, type Body } from "../game/runtime";
import { SAVE_EVERY_MS, SAVE_VERSION, loadSave, returnNews, writeSave, type BodySave, type SaveData } from "./save";

const bodySave = (b: Body): BodySave => ({ x: b.pos.x, y: b.pos.y, z: b.pos.z, yaw: b.yaw });

/** Snapshot of the live game for saving. */
export function snapshot(now = Date.now()): SaveData {
  const g = useGame.getState();
  return {
    version: SAVE_VERSION,
    savedAt: now,
    reading: g.reading,
    seed: g.seed,
    mode: g.mode,
    player: bodySave(runtime.avatar),
    pet: bodySave(runtime.pet),
    inventory: { ...g.inventory },
    collected: [...g.collected],
    quests: [...g.quests],
    friendship: [...g.friendship],
    bells: g.bells,
    equipped: [...g.equipped],
    petMemory: [...g.petMemory],
    chatLog: g.chatLog.slice(-12),
    villagerMemories: { ...g.villagerMemories },
  };
}

export function saveNow(): void {
  if (useGame.getState().screen !== "play") return;
  writeSave(snapshot());
}

/** Saves every 20 s on the island, when the tab hides, and on pagehide. Returns a stop function. */
export function startAutosave(): () => void {
  const timer = window.setInterval(saveNow, SAVE_EVERY_MS);
  const onVis = () => {
    if (document.visibilityState === "hidden") saveNow();
  };
  window.addEventListener("pagehide", saveNow);
  document.addEventListener("visibilitychange", onVis);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("pagehide", saveNow);
    document.removeEventListener("visibilitychange", onVis);
  };
}

/** What the island should do right after a Continue: restore bodies and greet. */
export const pendingReturn: {
  data: SaveData | null;
  news: string[];
  duration: string;
} = { data: null, news: [], duration: "" };

/** Continue with the saved pet: skip reading and reveal, restore state, go to the island. */
export function continueGame(now = Date.now()): boolean {
  const data = loadSave();
  if (!data) return false;
  const petName = data.reading.nameSuggestions[0];
  const news = returnNews(now - data.savedAt, petName, data.collected, (id) => id.startsWith("shell-"));
  const collected = data.collected.filter((id) => !news.respawnShells.includes(id));
  const villagerMemories = { ...data.villagerMemories };
  if (news.villagerMemory) {
    for (const v of data.reading.villagers) {
      villagerMemories[v.name] = [...(villagerMemories[v.name] ?? []), news.villagerMemory].slice(-6);
    }
  }
  useGame.setState({
    reading: data.reading,
    fallback: false,
    fallbackMessage: null,
    detailsReady: true,
    photoUrl: null,
    seed: data.seed,
    mode: data.mode,
    inventory: data.inventory,
    collected,
    // Older saves hold three quest slots; pad to the six townspeople.
    quests: [...data.quests, ...Array<QuestState>(6).fill("notStarted")].slice(0, 6),
    friendship: [...(data.friendship ?? []), 0, 0, 0, 0, 0, 0].slice(0, 6),
    bells: data.bells ?? 0,
    equipped: data.equipped,
    petMemory: data.petMemory,
    chatLog: data.chatLog,
    villagerMemories,
    events: news.news.length ? [...news.news.map((n) => `${n}.`)] : [],
  });
  pendingReturn.data = data;
  pendingReturn.news = news.news;
  pendingReturn.duration = news.duration;
  useGame.getState().setScreen("play");
  return true;
}

/** Called once the island is mounted: puts the player and pet back where they were. */
export function applyPendingBodies(): SaveData | null {
  const d = pendingReturn.data;
  if (!d) return null;
  resetBody(runtime.avatar, d.player.x, d.player.y, d.player.z, d.player.yaw);
  resetBody(runtime.pet, d.pet.x, d.pet.y, d.pet.z, d.pet.yaw);
  runtime.camera.yaw = d.player.yaw + Math.PI;
  runtime.camera.snap = true;
  return d;
}
