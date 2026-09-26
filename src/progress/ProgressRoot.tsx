import { useEffect } from "react";
import { useGame } from "../store";
import { pauseMenu } from "../ui/PauseMenu";
import { on } from "../game/events";
import { runtime, villagers } from "../game/runtime";
import { useJuice } from "../juice/juiceState";
import type { WorldData } from "../world/generateWorld";
import { XP, isCatalogKind, localDateKey, rollRare } from "./progression";
import { useProgress } from "./progressStore";
import ProgressHud from "./ProgressHud";
import Passport from "./Passport";
import { CelebrationCard, NoticeToast, WelcomeBack } from "./Cards";
import { speciesAccent } from "../juice/photo";
import "./progress.css";

function maxHeight(world: WorldData): number {
  let m = -Infinity;
  const h = world.heightmap.heights;
  for (let i = 0; i < h.length; i++) if (h[i] > m) m = h[i];
  return m;
}

/** Wires game events into the bond, daily, and collection loop, and mounts its UI. */
export default function ProgressRoot({ world }: { world: WorldData }) {
  const species = useGame((s) => s.reading.spec.species);
  useEffect(() => {
    const p = () => useProgress.getState();
    p().visit();

    const offs = [
      on("collected", ({ id, kind }) => {
        p().addXp(XP.collect);
        p().track("collected", "collect");
        if (kind === "shell") p().track("shells", "shell");
        if (isCatalogKind(kind)) {
          const rare = rollRare(useGame.getState().seed, id, localDateKey(new Date()));
          p().recordFind(kind, rare);
          if (rare) {
            p().track("rares", null);
            p().addXp(XP.rare);
          }
        }
      }),
      on("dug", () => {
        p().addXp(XP.dig);
        p().track("dug", "dig");
      }),
      on("questDone", () => {
        p().addXp(XP.quest);
        p().track("quests", "quest");
      }),
    ];

    // Talking to the pet and hopping islands show up as store changes.
    const offGame = useGame.subscribe((s, prev) => {
      const last = s.chatLog[s.chatLog.length - 1];
      if (last && last !== prev.chatLog[prev.chatLog.length - 1] && last.who === "person") {
        p().addXp(XP.talk);
        p().track("talks", "talk");
      }
      if (s.seed !== prev.seed) p().track("islands", null);
    });
    const offJuice = useJuice.subscribe((s, prev) => {
      if (s.flash > prev.flash) {
        p().addXp(XP.photo);
        p().track("photos", "photo");
      }
    });

    // Cheap polling for things with no event: the island summit and greeting townsfolk.
    const top = maxHeight(world);
    const lastSay = new Map<number, string | null>();
    const greeted = new Set<string>();
    const timer = window.setInterval(() => {
      const today = localDateKey(new Date());
      const body = useGame.getState().mode === "pet" ? runtime.pet : runtime.avatar;
      if (body.pos.y >= top - 1.2 && p().topToday !== today) {
        useProgress.setState({ topToday: today });
        p().notify("What a view from the top of the island!");
        p().track(null, "top");
      }
      for (const v of villagers) {
        const before = lastSay.get(v.index) ?? null;
        lastSay.set(v.index, v.say);
        if (!v.say || v.say === before) continue;
        const dx = v.body.pos.x - runtime.avatar.pos.x;
        const dz = v.body.pos.z - runtime.avatar.pos.z;
        const key = `${today}:${v.index}`;
        if (dx * dx + dz * dz < 36 && !greeted.has(key)) {
          greeted.add(key);
          p().addXp(XP.villager);
          p().track("villagers", "villager");
        }
      }
    }, 400);

    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable)) return;
      if (pauseMenu.isOpen) return;
      if (e.code === "KeyK" || e.code === "KeyB") {
        p().setOpen(!p().open);
      } else if (e.code === "Escape" && p().open) {
        // Close the passport first so the pause menu does not also open.
        e.stopImmediatePropagation();
        p().setOpen(false);
      } else if (e.code === "Escape" && p().welcome && !document.querySelector(".jn-panel, .minimap-backdrop, .talk-bar")) {
        // Esc dismisses the welcome card; otherwise the pause menu defers to it and Esc does nothing.
        e.stopImmediatePropagation();
        p().dismissWelcome();
      }
    };
    window.addEventListener("keydown", onKey, true);

    return () => {
      offs.forEach((off) => off());
      offGame();
      offJuice();
      window.clearInterval(timer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [world]);

  return (
    <div className="pg-root" style={{ ["--pg-accent" as string]: speciesAccent(species) }}>
      <ProgressHud />
      <Passport />
      <WelcomeBack />
      <CelebrationCard />
      <NoticeToast />
    </div>
  );
}
