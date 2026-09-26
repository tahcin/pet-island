import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { input, moveIntent } from "./useInput";
import { runtime, type Body } from "../game/runtime";
import { bendUniforms } from "../render/bend";
import { heightAt, type WorldData } from "../world/generateWorld";

const PITCH_MIN = -0.35;
const PITCH_MAX = 1.2;
const ZOOM_MIN = 0.45;
const ZOOM_MAX = 2.6;
/** The PRD boom constants come from a realistic-scale game; AC frames wider, so the boom is stretched. */
const BOOM_SCALE = 1.6;
const SWOOP_SECONDS = 1.7;

const target = new THREE.Vector3();
const desired = new THREE.Vector3();
const sample = new THREE.Vector3();
const thirdPos = new THREE.Vector3();
const thirdLook = new THREE.Vector3();
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const lookNow = new THREE.Vector3();

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Damped third-person camera (PRD 9.7): mouse-drag orbit, wheel zoom, boom pulled in before
 * terrain, floor at ground + 0.4, position follow 1 - exp(-16 dt), look target copied. Blends
 * into pet-cam (eye height 0.9 h + 0.05, 0.15 m forward) with a 1.7 s swoop over a 4 m arc.
 * Also drives the curved-world bend origin, so it must be mounted once per scene.
 */
export default function FollowCamera({
  world,
  getBody,
  getPet,
}: {
  world: WorldData;
  /** The controlled character. */
  getBody: () => Body;
  /** The pet, for pet-cam. */
  getPet: () => Body;
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

    // In pet-cam the view follows the pet's heading while it walks forward (not while backing up).
    if (rig.petCam && !input.dragging && getPet().moving && moveIntent().y >= 0) {
      const want = getPet().yaw + Math.PI;
      const d = Math.atan2(Math.sin(want - rig.yaw), Math.cos(want - rig.yaw));
      rig.yaw += d * (1 - Math.exp(-5 * dt));
    }

    const body = getBody();
    const h = body.height;
    const portrait = size.height > size.width;
    const shoulder = THREE.MathUtils.clamp(0.45 * h, 0.5, 3.5) * (portrait ? 0.3 : 1) * 0.35;
    const boom = (4.6 + 1.3 * h) * rig.zoom * BOOM_SCALE;
    const cp = Math.cos(rig.pitch);
    const sx = Math.sin(rig.yaw);
    const sz = Math.cos(rig.yaw);
    const dirY = Math.sin(rig.pitch);
    target.set(body.pos.x + sz * shoulder, body.pos.y + 0.85 * h, body.pos.z - sx * shoulder);
    desired.set(target.x + sx * cp * boom, target.y + dirY * boom, target.z + sz * cp * boom);

    // Pull the camera in before it enters terrain.
    let reach = 1;
    for (let i = 1; i <= 10; i++) {
      sample.lerpVectors(target, desired, i / 10);
      if (sample.y < heightAt(world.heightmap, sample.x, sample.z) + 0.4) {
        reach = (i - 1) / 10;
        break;
      }
    }
    if (reach < 1) desired.lerpVectors(target, desired, Math.max(0.15, reach));
    desired.y = Math.max(desired.y, heightAt(world.heightmap, desired.x, desired.z) + 0.4);

    if (rig.snap) {
      thirdPos.copy(desired);
      rig.snap = false;
    } else {
      thirdPos.lerp(desired, 1 - Math.exp(-16 * dt));
    }
    thirdLook.copy(target);

    // Pet-cam blend.
    const goal = rig.petCam ? 1 : 0;
    if (rig.petCamBlend !== goal) {
      const step = dt / SWOOP_SECONDS;
      rig.petCamBlend = goal > rig.petCamBlend ? Math.min(1, rig.petCamBlend + step) : Math.max(0, rig.petCamBlend - step);
    }
    const b = ease(rig.petCamBlend);
    if (b > 0) {
      const pet = getPet();
      const eye = 0.9 * pet.height + 0.05;
      const fx = Math.sin(pet.yaw);
      const fz = Math.cos(pet.yaw);
      camPos.set(pet.pos.x + fx * (pet.radius + 0.15), pet.pos.y + eye, pet.pos.z + fz * (pet.radius + 0.15));
      camLook.set(camPos.x - sx * cp, camPos.y - dirY, camPos.z - sz * cp);
      camera.position.lerpVectors(thirdPos, camPos, b);
      camera.position.y += 4 * Math.sin(Math.PI * b) * (b < 1 ? 1 : 0);
      lookNow.lerpVectors(thirdLook, camLook, b);
      camera.lookAt(lookNow);
    } else {
      camera.position.copy(thirdPos);
      camera.lookAt(thirdLook);
    }
    runtime.focus.copy(body.pos);
    bendUniforms.uBendOrigin.value.copy(camera.position);
  });
  return null;
}
