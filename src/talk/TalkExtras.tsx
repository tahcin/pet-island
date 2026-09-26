import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { WorldData } from "../world/generateWorld";
import { runtime } from "../game/runtime";
import { petControl } from "../game/petControl";
import { on } from "../game/events";
import { useGame } from "../store";
import SpeechBubble from "../ui/SpeechBubble";
import { useTalk } from "./talkState";
import { greetOnReturn, talkWorld } from "./petMind";
import { blip } from "./animalese";
import { applyPendingBodies, pendingReturn, startAutosave } from "../save/saveRuntime";
import { resetChatClock, tickVillagerChat } from "../villagers/villagerChat";
import "./talk.css";

declare global {
  interface Window {
    __petTalk?: { brainState: () => string | null; plan: () => string | null };
  }
}

function PetBubble() {
  const thinking = useTalk((s) => s.petThinking);
  const line = useTalk((s) => s.petLine);
  const id = useTalk((s) => s.petLineId);
  const name = useGame((s) => s.reading.nameSuggestions[0]);
  const color = useGame((s) => s.reading.spec.baseColor);

  // Animalese in step with the 38 chars/s typewriter, then clear the bubble after a read.
  useEffect(() => {
    if (!line) return;
    let i = 0;
    const timer = window.setInterval(() => {
      if (i < line.length) blip(line[i], runtime.pet.height);
      i++;
      if (i > line.length + 38 * (2.5 + line.length * 0.04)) {
        window.clearInterval(timer);
        if (useTalk.getState().petLineId === id) useTalk.setState({ petLine: null, playerLine: null });
      }
    }, 1000 / 38);
    return () => window.clearInterval(timer);
  }, [line, id]);

  if (thinking) {
    return (
      <Html center={false} zIndexRange={[20, 10]} style={{ pointerEvents: "none" }}>
        <div className="pi-bubble-anchor">
          <div className="pi-bubble talk-dots" data-testid="pet-thinking">
            <span />
            <span />
            <span />
          </div>
        </div>
      </Html>
    );
  }
  if (!line) return null;
  return <SpeechBubble key={id} text={line} name={name} accent={color} testId="pet-bubble" />;
}

function PlayerBubble() {
  const line = useTalk((s) => s.playerLine);
  if (!line) return null;
  return (
    <Html center={false} zIndexRange={[20, 10]} style={{ pointerEvents: "none" }}>
      <div className="pi-bubble-anchor">
        <div className="pi-bubble talk-player" data-testid="player-bubble">
          {line}
        </div>
      </div>
    </Html>
  );
}

/** Canvas slot for M6: talk bubbles, autosave, return greeting, overheard chats. */
export default function TalkExtras({ world }: { world: WorldData }) {
  const petAnchor = useRef<THREE.Group>(null);
  const playerAnchor = useRef<THREE.Group>(null);

  useEffect(() => {
    talkWorld.world = world;
    resetChatClock();
    const restored = applyPendingBodies();
    if (restored) {
      const { news, duration } = pendingReturn;
      pendingReturn.data = null;
      // Let the island settle for a moment before the greeting.
      window.setTimeout(() => greetOnReturn(news, duration), 900);
    }
    const stopSave = startAutosave();
    const offQuest = on("questDone", ({ villager }) => {
      const g = useGame.getState();
      g.rememberVillager(villager, `${g.reading.nameSuggestions[0]}'s person brought me 3 shells.`);
    });
    if (import.meta.env.DEV) {
      window.__petTalk = {
        brainState: () => petControl.brain?.state ?? null,
        plan: () => petControl.brain?.plan?.act ?? null,
      };
    }
    return () => {
      stopSave();
      offQuest();
      talkWorld.world = null;
    };
  }, [world]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const p = runtime.pet;
    petAnchor.current?.position.set(p.pos.x, p.pos.y + p.height + 0.55, p.pos.z);
    const a = runtime.avatar;
    playerAnchor.current?.position.set(a.pos.x, a.pos.y + a.height + 0.5, a.pos.z);
    tickVillagerChat(dt, world);
  });

  return (
    <>
      <group ref={petAnchor}>
        <PetBubble />
      </group>
      <group ref={playerAnchor}>
        <PlayerBubble />
      </group>
    </>
  );
}
