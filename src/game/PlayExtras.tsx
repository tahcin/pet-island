import { useEffect } from "react";
import type { WorldData } from "../world/generateWorld";
import { heightAt } from "../world/generateWorld";
import Collectibles from "./CollectibleItems";
import Villagers from "./Villagers";
import { collectibles, runtime, villagers, waypoint, type CollectibleRuntime, type VillagerRuntime, type Waypoint } from "./runtime";
import GuideMarker from "../town/GuideMarker";
import { controlledBody, resetTalk } from "./interactions";

export interface PlayDevHook {
  teleport: (x: number, z: number) => void;
  collectibles: CollectibleRuntime[];
  villagers: VillagerRuntime[];
  /** The journal's active waypoint, or null. */
  readonly waypoint: Waypoint | null;
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
      get waypoint() {
        return waypoint.current;
      },
    };
    return () => {
      delete window.__pi;
    };
  }, [world]);

  return (
    <>
      <Collectibles world={world} />
      <Villagers world={world} />
      <GuideMarker world={world} />
    </>
  );
}
