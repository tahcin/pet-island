import type * as THREE from "three";
import { avatarData, type AvatarPivot } from "./buildAvatar";

export const AVATAR_STATES = ["idle", "walk", "run", "wave"] as const;
export type AvatarState = (typeof AVATAR_STATES)[number];

const BLEND = 0.2;

interface Pose {
  legSwing: number;
  armSwing: number;
  bob: number;
  headBob: number;
  lean: number;
  sway: number;
  wave: number;
}

const ZERO: Pose = { legSwing: 0, armSwing: 0, bob: 0, headBob: 0, lean: 0, sway: 0, wave: 0 };

/** Where an idle villager glances, cycled with pauses in between. */
const LOOKS = [0, 0.45, 0, -0.4, 0.15, -0.2];

interface Base {
  rx: number;
  ry: number;
  rz: number;
  x: number;
  y: number;
}

/**
 * Procedural villager animation: idle breathing, glances and weight shifts, bouncy walk and run
 * cycles with opposite arm swing and body sway, a wave with the right mitten and an open mouth,
 * and blinks. State weights cross-fade over 0.2 s so switches never pop.
 */
export class AvatarAnimator {
  state: AvatarState = "idle";
  private weights: Record<AvatarState, number> = { idle: 1, walk: 0, run: 0, wave: 0 };
  private stride = 0;
  private t = 0;
  private blinkIn = 3;
  private blinkLeft = 0;
  private lookIdx = 0;
  private lookIn = 3.5;
  private lookYaw = 0;
  private p: Record<AvatarPivot, THREE.Object3D>;
  private base: Record<AvatarPivot, Base>;

  constructor(root: THREE.Object3D) {
    this.p = avatarData(root).pivots;
    this.base = Object.fromEntries(
      Object.entries(this.p).map(([k, o]) => [
        k,
        { rx: o.rotation.x, ry: o.rotation.y, rz: o.rotation.z, x: o.position.x, y: o.position.y },
      ]),
    ) as Record<AvatarPivot, Base>;
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
    const t = this.t;
    const sn = Math.sin(this.stride);
    const pose: Pose = { ...ZERO };
    const add = (weight: number, p: Partial<Pose>) => {
      for (const key of Object.keys(p) as (keyof Pose)[]) pose[key] += weight * (p[key] ?? 0);
    };
    add(w.walk, { legSwing: 0.6, armSwing: 0.55, bob: 0.03, headBob: 0.04, lean: 0.06, sway: 0.05 });
    add(w.run, { legSwing: 0.95, armSwing: 1.05, bob: 0.06, headBob: 0.07, lean: 0.24, sway: 0.08 });
    add(w.wave, { wave: 1 });
    const still = w.idle + w.wave;

    const { hips, torso, head, armL, armR, legL, legR, eyeL, eyeR, handL, handR, smile, mouthOpen } = this.p;
    const b = this.base;

    // Legs and arms swing in opposition.
    legL.rotation.x = b.legL.rx + sn * pose.legSwing;
    legR.rotation.x = b.legR.rx - sn * pose.legSwing;
    armL.rotation.x = b.armL.rx - sn * pose.armSwing;
    armR.rotation.x = b.armR.rx + sn * pose.armSwing * (1 - pose.wave) - pose.wave * 0.25;
    const runOut = w.run * 0.12;
    armL.rotation.z = b.armL.rz - runOut;
    // Wave: right arm up and out, the mitten waving side to side.
    armR.rotation.z = b.armR.rz + runOut + pose.wave * (2.45 + Math.sin(t * 9) * 0.22);
    handR.rotation.z = b.handR.rz + pose.wave * Math.sin(t * 12) * 0.45;
    handL.rotation.x = b.handL.rx - sn * pose.armSwing * 0.3;
    handR.rotation.x = b.handR.rx + sn * pose.armSwing * 0.3 * (1 - pose.wave);

    // Bounce twice per stride; idle shifts weight slowly from foot to foot.
    const shift = Math.sin(t * 0.7) * still;
    hips.position.y = b.hips.y + Math.abs(Math.cos(this.stride)) * pose.bob;
    hips.position.x = b.hips.x + shift * 0.012;
    hips.rotation.z = shift * 0.03 + Math.sin(this.stride) * pose.sway * 0.4;
    torso.rotation.x = b.torso.rx + pose.lean;
    torso.rotation.z = b.torso.rz + Math.sin(this.stride) * pose.sway - shift * 0.025;
    torso.rotation.y = b.torso.ry + Math.sin(this.stride) * pose.sway * 1.4;
    const breathe = 1 + 0.022 * Math.sin(t * 2.2) * still;
    torso.scale.set(1 + (breathe - 1) * 0.4, breathe, 1 + (breathe - 1) * 0.4);

    // Idle glances around every few seconds.
    this.lookIn -= dt;
    if (this.lookIn <= 0) {
      this.lookIdx = (this.lookIdx + 1) % LOOKS.length;
      this.lookIn = 2.2 + ((this.lookIdx * 1.7) % 2.5);
    }
    const lookTarget = LOOKS[this.lookIdx] * w.idle;
    this.lookYaw += (lookTarget - this.lookYaw) * Math.min(1, dt * 4);

    head.position.y = b.head.y - Math.abs(Math.cos(this.stride + 0.4)) * pose.headBob * 0.3;
    head.rotation.x = b.head.rx - pose.lean * 0.55 + Math.cos(this.stride * 2) * pose.headBob * 0.5 + 0.03 * Math.sin(t * 2.2) * w.idle;
    head.rotation.y = b.head.ry + this.lookYaw - torso.rotation.y * 0.6;
    head.rotation.z =
      b.head.rz - torso.rotation.z * 0.5 + pose.wave * (0.14 + Math.sin(t * 4) * 0.06) + shift * 0.03;

    // Happy open mouth while waving.
    const happy = pose.wave > 0.5;
    mouthOpen.visible = happy;
    smile.visible = !happy;

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
