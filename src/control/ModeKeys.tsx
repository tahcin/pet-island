import { useFrame } from "@react-three/fiber";
import { consumePress, input } from "./useInput";
import { runtime } from "../game/runtime";
import { petControl } from "../game/petControl";
import { spawnPuff, showGlyph } from "../game/Effects";
import { PET_ACTION_SECONDS } from "../pet/IslandPet";
import { useGame } from "../store";
import { heightAt, type WorldData } from "../world/generateWorld";

let savedPitch = 0.62;

/** Tab swaps modes, C toggles pet-cam in pet mode, Space interacts (PRD 4.2 and 9.7). */
export default function ModeKeys({ world, enabled = true }: { world: WorldData; enabled?: boolean }) {
  useFrame(() => {
    if (!enabled || input.suspended) {
      input.pressed.clear();
      return;
    }
    const game = useGame.getState();
    if (consumePress("Tab")) {
      const next = game.mode === "companion" ? "pet" : "companion";
      game.setMode(next);
      if (runtime.camera.petCam) runtime.camera.pitch = savedPitch;
      runtime.camera.petCam = false;
      runtime.petAction.kind = null;
      runtime.idleTime = 0;
      if (next === "companion") petControl.brain?.reset();
      else showGlyph("!");
    }
    if (consumePress("KeyC") && game.mode === "pet") {
      const rig = runtime.camera;
      rig.petCam = !rig.petCam;
      // Look where the pet looks; on the way out, settle behind it at the old pitch.
      if (rig.petCam) {
        savedPitch = rig.pitch;
        rig.pitch = 0.08;
      } else rig.pitch = savedPitch;
      rig.yaw = runtime.pet.yaw + Math.PI;
    }
    if (consumePress("Space")) {
      const pet = runtime.pet;
      if (game.mode === "companion") {
        // Quest, villager, and collectible interactions come first (M5); then play with the pet.
        const d = Math.hypot(pet.pos.x - runtime.avatar.pos.x, pet.pos.z - runtime.avatar.pos.z);
        if (d < 2) petControl.brain?.startPlay();
      } else if (!pet.moving) {
        const kind = Math.random() < 0.5 ? "dig" : "sniff";
        runtime.petAction.kind = kind;
        runtime.petAction.time = PET_ACTION_SECONDS[kind];
        const fx = pet.pos.x + Math.sin(pet.yaw) * (pet.radius + 0.1);
        const fz = pet.pos.z + Math.cos(pet.yaw) * (pet.radius + 0.1);
        spawnPuff(fx, heightAt(world.heightmap, fx, fz), fz);
        if (kind === "sniff") showGlyph("?");
      }
    }
    // Keys with no meaning yet should not queue up for later.
    input.pressed.clear();
  });
  return null;
}
