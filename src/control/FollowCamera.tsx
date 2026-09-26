import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { input } from "./useInput";
import { runtime, type Body } from "../game/runtime";
import { bendUniforms } from "../render/bend";
import { heightAt, type WorldData } from "../world/generateWorld";

const PITCH_MIN = -0.35;
const PITCH_MAX = 1.2;
const ZOOM_MIN = 0.45;
const ZOOM_MAX = 2.6;

const target = new THREE.Vector3();
const desired = new THREE.Vector3();
const sample = new THREE.Vector3();

/**
 * Damped third-person camera (PRD 9.7): mouse-drag orbit, wheel zoom, boom pulled in before
 * terrain, floor at ground + 0.4, position follow 1 - exp(-16 dt), look target copied.
 * Also drives the curved-world bend origin, so it must be mounted once per scene.
 */
export default function FollowCamera({
  world,
  getBody,
  heightScale = 1,
}: {
  world: WorldData;
  getBody: () => Body;
  /** Multiplier on the character height used for the boom (lower follow height in pet mode). */
  heightScale?: number;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const rig = runtime.camera;
    rig.yaw -= input.mouseDX * 0.0055;
    rig.pitch = THREE.MathUtils.clamp(rig.pitch + input.mouseDY * 0.0045, PITCH_MIN, PITCH_MAX);
    input.mouseDX = 0;
    input.mouseDY = 0;
    if (input.wheel !== 0) {
      rig.zoom = THREE.MathUtils.clamp(rig.zoom * Math.pow(1.1, input.wheel), ZOOM_MIN, ZOOM_MAX);
      input.wheel = 0;
    }

    const body = getBody();
    const h = body.height * heightScale;
    const portrait = size.height > size.width;
    const shoulder = THREE.MathUtils.clamp(0.45 * h, 0.5, 3.5) * (portrait ? 0.3 : 1) * 0.35;
    const boom = (4.6 + 1.3 * h) * rig.zoom * 1.6;
    const cp = Math.cos(rig.pitch);
    const sx = Math.sin(rig.yaw);
    const sz = Math.cos(rig.yaw);
    // Right vector for the shoulder offset.
    const rx = sz;
    const rz = -sx;
    target.set(body.pos.x + rx * shoulder, body.pos.y + 0.85 * h, body.pos.z + rz * shoulder);
    desired.set(target.x + sx * cp * boom, target.y + Math.sin(rig.pitch) * boom, target.z + sz * cp * boom);

    // Pull the camera in before it enters terrain.
    let reach = 1;
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      sample.lerpVectors(target, desired, t);
      if (sample.y < heightAt(world.heightmap, sample.x, sample.z) + 0.4) {
        reach = (i - 1) / 10;
        break;
      }
    }
    if (reach < 1) desired.lerpVectors(target, desired, Math.max(0.15, reach));
    desired.y = Math.max(desired.y, heightAt(world.heightmap, desired.x, desired.z) + 0.4);

    if (rig.snap) {
      camera.position.copy(desired);
      rig.snap = false;
    } else {
      camera.position.lerp(desired, 1 - Math.exp(-16 * dt));
    }
    camera.lookAt(target);
    bendUniforms.uBendOrigin.value.copy(camera.position);
  });
  return null;
}
