import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import Pet from "./Pet";
import { petData } from "./buildPet";
import { PetBrain } from "./petBrain";
import type { PetAnimator, PetAnimState } from "./petAnimator";
import { runtime } from "../game/runtime";
import { petControl } from "../game/petControl";
import { GlyphSprite, showGlyph, spawnPuff } from "../game/Effects";
import { stepBody } from "../control/movement";
import { useGame } from "../store";
import { heightAt, type WorldData } from "../world/generateWorld";

const lookTarget = new THREE.Vector3();
const anchor = new THREE.Vector3();

/** How long a player-started action (Space in pet mode) plays. */
export const PET_ACTION_SECONDS = { dig: 1.3, sniff: 1.5 } as const;

/**
 * The pet on the island. In companion mode PetBrain drives it (PRD 9.2); in pet mode the
 * CharacterController moves runtime.pet and this component only picks the animation.
 */
export default function IslandPet({ world }: { world: WorldData }) {
  const spec = useGame((s) => s.reading.spec);
  const ref = useRef<THREE.Group>(null);
  const animator = useRef<PetAnimator | null>(null);
  const brain = useMemo(
    () =>
      new PetBrain(Math.random, {
        glyph: showGlyph,
        hop: (s) => animator.current?.hop(s),
        dug: (x, z) => spawnPuff(x, heightAt(world.heightmap, x, z), z),
      }),
    [world],
  );
  petControl.brain = brain;

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const pet = runtime.pet;
    const player = runtime.avatar;
    const a = animator.current;
    const mode = useGame.getState().mode;
    let anim: PetAnimState = "idle";
    let move = 0;
    let lookAtPlayer = false;
    if (mode === "companion") {
      const out = brain.update(dt, { pet, player, playerIdle: runtime.idleTime, interest: world.interest });
      stepBody(pet, out.desiredX, out.desiredZ, dt, world);
      anim = out.anim;
      move = out.move;
      lookAtPlayer = out.lookAtPlayer;
    } else {
      // Controlled by the player: animation from speed, plus Space actions while standing.
      const act = runtime.petAction;
      if (act.kind && (pet.moving || act.time <= 0)) act.kind = null;
      if (act.kind) {
        act.time -= dt;
        anim = act.kind;
      } else if (pet.speed > 0.3) {
        anim = pet.speed > 6 ? "run" : "walk";
        move = Math.min(1, pet.speed / 9);
      }
      lookAtPlayer = Math.hypot(player.pos.x - pet.pos.x, player.pos.z - pet.pos.z) < 5;
    }
    if (a) {
      a.setState(anim);
      a.setMove(anim === "walk" || anim === "run" ? move : -1);
      if (lookAtPlayer) a.lookAt(lookTarget.set(player.pos.x, player.pos.y + player.height * 0.85, player.pos.z));
      else a.lookAt(null);
    }
    const g = ref.current;
    if (g) {
      g.position.copy(pet.pos);
      g.rotation.y = pet.yaw;
    }
  });

  return (
    <>
      <Pet
        ref={ref}
        spec={spec}
        animatorRef={(an) => {
          animator.current = an;
          petControl.animator = an;
        }}
        onBuilt={(group) => {
          const d = petData(group);
          runtime.pet.height = d.height;
          runtime.pet.radius = d.radius;
        }}
      />
      <GlyphSprite
        getAnchor={() => anchor.set(runtime.pet.pos.x, runtime.pet.pos.y + runtime.pet.height + 0.45, runtime.pet.pos.z)}
      />
    </>
  );
}
