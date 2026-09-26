import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import { buildAvatar, disposeAvatar } from "./buildAvatar";
import { AvatarAnimator } from "./avatarAnimator";
import { runtime } from "../game/runtime";
import { stepBody } from "../control/movement";
import { useGame } from "../store";
import type { WorldData } from "../world/generateWorld";

const WAVE_NEAR = 4;
const WAVE_REARM = 6;

/**
 * The player villager. In companion mode it is moved by the CharacterController; in pet mode it
 * stands where it was left and waves when the pet comes within 4 m (PRD 9.3).
 */
export default function Avatar({ world }: { world: WorldData }) {
  const root = useMemo(() => buildAvatar(), []);
  const animator = useMemo(() => new AvatarAnimator(root), [root]);
  const wave = useRef({ armed: true, left: 0 });
  const ref = useRef<THREE.Group>(null);
  useEffect(() => () => disposeAvatar(root), [root]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const body = runtime.avatar;
    const mode = useGame.getState().mode;
    if (mode === "pet") {
      stepBody(body, 0, 0, dt, world);
      const pet = runtime.pet;
      const d = Math.hypot(pet.pos.x - body.pos.x, pet.pos.z - body.pos.z);
      const w = wave.current;
      if (w.armed && d < WAVE_NEAR) {
        w.armed = false;
        w.left = 2.2;
      } else if (!w.armed && d > WAVE_REARM) w.armed = true;
      // Face the pet while it is around.
      if (d < 10) {
        const want = Math.atan2(pet.pos.x - body.pos.x, pet.pos.z - body.pos.z);
        const diff = Math.atan2(Math.sin(want - body.yaw), Math.cos(want - body.yaw));
        body.yaw += diff * (1 - Math.exp(-4 * dt));
      }
      w.left -= dt;
      animator.setState(w.left > 0 ? "wave" : "idle");
    } else {
      wave.current.left = 0;
      wave.current.armed = true;
      animator.setState(body.speed > 6 ? "run" : body.speed > 0.3 ? "walk" : "idle");
    }
    animator.update(dt, Math.min(1, body.speed / 8.4));
    const g = ref.current;
    if (g) {
      g.position.copy(body.pos);
      g.rotation.y = body.yaw;
    }
  });

  return (
    <group ref={ref} name="avatar-root">
      <primitive object={root} />
    </group>
  );
}
