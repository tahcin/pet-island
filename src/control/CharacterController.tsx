import { useFrame } from "@react-three/fiber";
import { input, isRunning, moveIntent } from "./useInput";
import { RUN_MULT, WALK_SPEED, stepBody, type Collide } from "./movement";
import { runtime, type Body } from "../game/runtime";
import type { WorldData } from "../world/generateWorld";

/**
 * Reads WASD/arrows and Shift for the controlled body and moves it camera-relative.
 * `speedScale` lets the pet run at its own pace in pet mode.
 */
export default function CharacterController({
  world,
  getBody,
  collide,
  speedScale = 1,
  enabled = true,
}: {
  world: WorldData;
  getBody: () => Body;
  collide?: Collide;
  speedScale?: number;
  enabled?: boolean;
}) {
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const body = getBody();
    const intent = enabled ? { ...moveIntent() } : { x: 0, y: 0 };
    const run = enabled && isRunning();
    // Pet-cam (first person): A and D turn the view, W and S walk along it; the pet faces the view.
    const firstPerson = body === runtime.pet && runtime.camera.petCam && runtime.camera.petCamBlend > 0.5;
    if (firstPerson && !input.dragging) runtime.camera.yaw -= intent.x * 2.3 * dt;
    if (firstPerson) intent.x = 0;
    const yaw = runtime.camera.yaw;
    // Camera forward on the ground is -(sin yaw, cos yaw); right is (cos yaw, -sin yaw).
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const speed = WALK_SPEED * speedScale * (run ? RUN_MULT : 1);
    const dx = (fx * intent.y + rx * intent.x) * speed;
    const dz = (fz * intent.y + rz * intent.x) * speed;
    body.moving = intent.x !== 0 || intent.y !== 0;
    body.running = run && body.moving;
    runtime.idleTime = body.moving ? 0 : runtime.idleTime + dt;
    stepBody(body, dx, dz, dt, world, collide);
    if (firstPerson) body.yaw = yaw + Math.PI;
  });
  return null;
}
