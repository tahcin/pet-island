import type * as THREE from "three";
import { avatarData, type AvatarPivot } from "./buildAvatar";

export const AVATAR_STATES = ["idle", "walk", "run", "wave"] as const;
export type AvatarState = (typeof AVATAR_STATES)[number];

const BLEND = 0.2;

interface Pose {
  legSwing: number;
  armSwing: number;
  bob: number;
  lean: number;
  wave: number;
}

const ZERO: Pose = { legSwing: 0, armSwing: 0, bob: 0, lean: 0, wave: 0 };

/**
 * Procedural villager animation: idle breathing and blinks, walk and run cycles, and a wave with
 * the right arm. State weights cross-fade over 0.2 s so switches never pop.
 */
export class AvatarAnimator {
  state: AvatarState = "idle";
  private weights: Record<AvatarState, number> = { idle: 1, walk: 0, run: 0, wave: 0 };
  private stride = 0;
  private t = 0;
  private blinkIn = 3;
  private blinkLeft = 0;
  private p: Record<AvatarPivot, THREE.Object3D>;
  private base: Record<AvatarPivot, { rx: number; ry: number; rz: number; y: number }>;

  constructor(root: THREE.Object3D) {
    this.p = avatarData(root).pivots;
    this.base = Object.fromEntries(
      Object.entries(this.p).map(([k, o]) => [k, { rx: o.rotation.x, ry: o.rotation.y, rz: o.rotation.z, y: o.position.y }]),
    ) as AvatarAnimator["base"];
  }

  setState(s: AvatarState): void {
    this.state = s;
  }

  update(dt: number, speed: number): void {
    this.t += dt;
    const k = Math.min(1, dt / BLEND);
    for (const s of Object.keys(this.weights) as AvatarState[]) {
      const target = s === this.state ? 1 : 0;
      this.weights[s] += (target - this.weights[s]) * k;
    }
    this.stride += dt * (2.6 + 1.5 * speed) * 2.2;

    const w = this.weights;
    const sn = Math.sin(this.stride);
    const pose: Pose = { ...ZERO };
    const add = (weight: number, legSwing: number, armSwing: number, bob: number, lean: number, wave: number) => {
      pose.legSwing += weight * legSwing;
      pose.armSwing += weight * armSwing;
      pose.bob += weight * bob;
      pose.lean += weight * lean;
      pose.wave += weight * wave;
    };
    add(w.walk, 0.55, 0.5, 0.035, 0.05, 0);
    add(w.run, 0.9, 0.9, 0.07, 0.18, 0);
    add(w.wave, 0, 0, 0, 0, 1);

    const { hips, torso, head, armL, armR, legL, legR, eyeL, eyeR } = this.p;
    const b = this.base;
    legL.rotation.x = b.legL.rx + sn * pose.legSwing;
    legR.rotation.x = b.legR.rx - sn * pose.legSwing;
    armL.rotation.x = b.armL.rx - sn * pose.armSwing;
    armR.rotation.x = b.armR.rx + sn * pose.armSwing * (1 - pose.wave);
    // Wave: right arm up and out, hand swinging side to side.
    armR.rotation.z = b.armR.rz + pose.wave * (2.5 + Math.sin(this.t * 10) * 0.35);
    hips.position.y = b.hips.y + Math.abs(Math.cos(this.stride)) * pose.bob;
    torso.rotation.x = b.torso.rx + pose.lean;
    const breathe = 1 + 0.02 * Math.sin(this.t * 2.2) * (w.idle + w.wave);
    torso.scale.set(1, breathe, 1);
    head.rotation.z = b.head.rz + pose.wave * Math.sin(this.t * 5) * 0.08;
    head.rotation.x = b.head.rx - pose.lean * 0.5;

    // Blink every 2.5 to 6 s for 0.13 s.
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkLeft = 0.13;
      this.blinkIn = 2.5 + Math.random() * 3.5;
    }
    this.blinkLeft -= dt;
    const eyeY = this.blinkLeft > 0 ? 0.12 : 1;
    eyeL.scale.y = eyeY;
    eyeR.scale.y = eyeY;
  }
}
