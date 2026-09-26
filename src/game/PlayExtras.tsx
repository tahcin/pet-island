import { useEffect } from "react";
import type { WorldData } from "../world/generateWorld";
import { heightAt } from "../world/generateWorld";
import Collectibles from "./CollectibleItems";
import Villagers from "./Villagers";
import { collectibles, runtime, villagers, type CollectibleRuntime, type VillagerRuntime } from "./runtime";
import { controlledBody, resetTalk } from "./interactions";

export interface PlayDevHook {
  teleport: (x: number, z: number) => void;
  collectibles: CollectibleRuntime[];
  villagers: VillagerRuntime[];
}

declare global {
  interface Window {
    __pi?: PlayDevHook;
  }
}

/** M5 play: collectibles, villagers, quests. Mounted inside the island Canvas by Play.tsx. */
export default function PlayExtras({ world }: { world: WorldData }) {
  useEffect(() => {
    resetTalk();
    if (!import.meta.env.DEV) return;
    window.__pi = {
      teleport(x, z) {
        const b = controlledBody();
        b.pos.set(x, heightAt(world.heightmap, x, z), z);
        b.vel.set(0, 0, 0);
        runtime.camera.snap = true;
      },
      collectibles,
      villagers,
    };
    return () => {
      delete window.__pi;
    };
  }, [world]);

  return (
    <>
      <Collectibles world={world} />
      <Villagers world={world} />
    </>
  );
}
