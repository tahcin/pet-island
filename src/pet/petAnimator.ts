import * as THREE from "three";
import { petData, type PetPivots } from "./buildPet";
import type { PetDims } from "./dims";
import { updateMascotExpression } from "./mascot";

/**
 * Procedural pet animation (PRD 6.5, constants from docs/inspiration.md section 1).
 *
 * Every state writes a pose into a small channel array. States cross-fade with eased
 * weights over 0.2 s, so switching never snaps a pivot. Overlays on top of the blended pose:
 * breathing, blinks, ear twitches, tail wag (phase accumulated, so frequency changes never
 * pop), head look-at or idle glances, and a squash-and-stretch spring driven by hops.
 * update() allocates nothing.
 */

export const PET_STATES = ["idle", "walk", "run", "sit", "dig", "sniff", "happy"] as const;
export type PetAnimState = (typeof PET_STATES)[number];

// Pose channels.
const BODY_Y = 0;
const BODY_Z = 1;
const PITCH = 2;
const ROLL = 3;
const HEAD_PITCH = 4;
const HEAD_YAW = 5;
const HEAD_ROLL = 6;
const LEG_FL = 7;
const LEG_FR = 8;
const LEG_BL = 9;
const LEG_BR = 10;
const FRONT_SCALE = 11;
const BACK_SCALE = 12;
const TAIL_PITCH = 13;
const WAG_AMP = 14;
const WAG_FREQ = 15;
const EAR_BACK = 16;
const N_CH = 17;
const LEG_KEYS = [LEG_FL, LEG_FR, LEG_BL, LEG_BR] as const;

const BLEND_TIME = 0.2;
const LOOK_RANGE = 12;
const LOOK_YAW_MAX = 0.8;
const LOOK_PITCH_MIN = -0.55;
const LOOK_PITCH_MAX = 0.6;
const SPRING_STEP = 0.008;
const HOP_SPEED = 3.0;
const GRAVITY = 20;

export interface PetAnimatorOptions {
  /** Random source for blinks, glances, and twitches. Defaults to Math.random. */
  rng?: () => number;
}

interface Rest {
  bodyPos: THREE.Vector3;
  bodyRot: THREE.Euler;
  headRot: THREE.Euler;
  earLRot: THREE.Euler;
  earRRot: THREE.Euler;
  tailRot: THREE.Euler;
  torsoScale: THREE.Vector3;
  eyeScaleY: number;
  legRotX: number[];
}

function smooth01(x: number): number {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export class PetAnimator {
  readonly group: THREE.Object3D;
  private readonly p: PetPivots;
  private readonly dims: PetDims;
  private readonly rest: Rest;
  private readonly legs: THREE.Object3D[];
  private readonly rng: () => number;

  private current: PetAnimState = "idle";
  private readonly weights = new Float32Array(PET_STATES.length);
  private readonly poses: Float32Array[] = PET_STATES.map(() => new Float32Array(N_CH));
  private readonly pose = new Float32Array(N_CH);

  private moveTarget = -1;
  private moveAmt = 0;
  private stride = 0;
  private wagPhase = 0;

  // Hop and squash.
  private hopY = 0;
  private hopV = 0;
  private airborne = false;
  private springX = 0;
  private springV = 0;
  private springAcc = 0;
  private happyTimer = 0;

  // Blink and ear twitch.
  private blinkIn: number;
  private blinkLeft = 0;
  private twitchIn: number;
  private twitchT = -1;
  private twitchSide = 1;

  // Look.
  private readonly target = new THREE.Vector3();
  private hasTarget = false;
  private glanceIn: number;
  private glanceYaw = 0;
  private glancePitch = 0;
  private lookYaw = 0;
  private lookPitch = 0;

  // Scratch objects, reused every frame.
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly q1 = new THREE.Quaternion();

  // Precomputed ground fits for pitched poses.
  private readonly sitDrop: number;
  private readonly fit: { sitFront: number; digFront: number; digBack: number; sniffFront: number; sniffBack: number };

  constructor(group: THREE.Object3D, opts: PetAnimatorOptions = {}) {
    this.group = group;
    const data = petData(group);
    this.p = data.pivots;
    this.dims = data.dims;
    this.rng = opts.rng ?? Math.random;
    const p = this.p;
    this.legs = [p.legFL, p.legFR, p.legBL, p.legBR];
    this.rest = {
      bodyPos: p.body.position.clone(),
      bodyRot: p.body.rotation.clone(),
      headRot: p.head.rotation.clone(),
      earLRot: p.earL.rotation.clone(),
      earRRot: p.earR.rotation.clone(),
      tailRot: p.tail.rotation.clone(),
      torsoScale: p.torso.scale.clone(),
      eyeScaleY: p.eyeL.scale.y,
      legRotX: this.legs.map((l) => l.rotation.x),
    };
    this.weights[0] = 1;
    this.blinkIn = 1 + this.rng() * 3;
    this.twitchIn = 2 + this.rng() * 3;
    this.glanceIn = 1.5 + this.rng() * 3;

    // Sit: pitch nose up and drop the body until the rump touches the ground.
    const d = this.dims;
    const sitPitch = -0.45;
    const rearZ = -(d.bodyLength / 2 + d.bodyRadius * 0.3);
    const rearY = -d.bodyRadius * d.bodyScaleY * 0.92;
    const rumpY = d.bodyY + rearY * Math.cos(sitPitch) - rearZ * Math.sin(sitPitch);
    this.sitDrop = -Math.max(0, rumpY - 0.01);
    this.fit = {
      sitFront: this.legFit(sitPitch, this.sitDrop, d.frontHipZ),
      digFront: this.legFit(0.22, -0.02, d.frontHipZ),
      digBack: this.legFit(0.22, -0.02, d.backHipZ),
      sniffFront: this.legFit(0.12, -0.01, d.frontHipZ),
      sniffBack: this.legFit(0.12, -0.01, d.backHipZ),
    };
  }

  /** Leg Y scale that keeps a vertical leg on the ground when the body is pitched and dropped. */
  private legFit(pitch: number, drop: number, hipZ: number): number {
    const d = this.dims;
    const hipLocalY = d.hipY - d.bodyY;
    const hipWorld = d.bodyY + drop + hipLocalY * Math.cos(pitch) - hipZ * Math.sin(pitch);
    return clamp(hipWorld / d.hipY, 0.7, 1.25);
  }

  get state(): PetAnimState {
    return this.current;
  }

  get grounded(): boolean {
    return !this.airborne;
  }

  setState(s: PetAnimState): void {
    if (s === this.current) return;
    this.current = s;
    if (s === "happy") this.happyTimer = 0;
  }

  /** Movement speed from 0 (standing) to 1 (full run). Negative restores the state default. */
  setMove(speed01: number): void {
    this.moveTarget = speed01 < 0 ? -1 : clamp(speed01, 0, 1);
  }

  /** Head turns toward a world point within 12 m. Null returns to idle glances. */
  lookAt(worldPoint: THREE.Vector3 | null): void {
    if (worldPoint) {
      this.target.copy(worldPoint);
      this.hasTarget = true;
    } else {
      this.hasTarget = false;
    }
  }

  /** A small hop with stretch on take-off and squash on landing. */
  hop(strength = 1): void {
    if (this.airborne) return;
    this.airborne = true;
    this.hopV = HOP_SPEED * strength;
    this.springX = -0.16;
    this.springV = 0;
  }

  private moveFor(s: PetAnimState): number {
    if (s === "walk") return this.moveTarget >= 0 ? this.moveTarget : 0.4;
    if (s === "run") return this.moveTarget >= 0 ? this.moveTarget : 1;
    return 0;
  }

  update(dt: number, elapsed: number): void {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    const T = elapsed;

    // Cross-fade weights.
    let sum = 0;
    const step = dt / BLEND_TIME;
    for (let i = 0; i < PET_STATES.length; i++) {
      const on = PET_STATES[i] === this.current;
      this.weights[i] = clamp(this.weights[i] + (on ? step : -step), 0, 1);
      sum += smooth01(this.weights[i]);
    }

    // Movement amount and phases.
    const moveGoal = this.moveFor(this.current);
    this.moveAmt += (moveGoal - this.moveAmt) * (1 - Math.exp(-8 * dt));
    const m = this.moveAmt;
    this.stride += dt * (2.6 + 1.5 * m * 6);

    // Blend the pose.
    const pose = this.pose;
    pose.fill(0);
    for (let i = 0; i < PET_STATES.length; i++) {
      const w = smooth01(this.weights[i]);
      if (w <= 0) continue;
      const out = this.poses[i];
      this.computePose(PET_STATES[i], out, T, m);
      const k = w / sum;
      for (let c = 0; c < N_CH; c++) pose[c] += out[c] * k;
    }

    this.wagPhase += dt * (3 + 3 * m + pose[WAG_FREQ]);
    const wag = Math.sin(this.wagPhase) * 0.35 * pose[WAG_AMP];

    // Happy hops.
    if (this.current === "happy") {
      this.happyTimer -= dt;
      if (this.happyTimer <= 0 && !this.airborne) {
        this.hop(0.9);
        this.happyTimer = 0.6;
      }
    }

    this.stepHop(dt);
    this.stepSpring(dt);
    this.stepLook(dt);
    this.stepBlinkTwitch(dt);
    this.apply(pose, wag, T);
    if (this.p.eyeL.getObjectByName("eyeLHappy")) updateMascotExpression(this.group, this.current, dt, T);
  }

  private computePose(s: PetAnimState, o: Float32Array, T: number, m: number): void {
    o.fill(0);
    o[FRONT_SCALE] = 1;
    o[BACK_SCALE] = 1;
    o[WAG_AMP] = 1;
    const st = this.stride;
    switch (s) {
      case "idle":
        o[HEAD_PITCH] = Math.sin(T * 1.1) * 0.025;
        o[WAG_AMP] = 0.7;
        break;
      case "walk":
      case "run": {
        const run = s === "run" ? 1 : 0;
        const amp = 0.6 * clamp(0.55 + 0.45 * m, 0, 1) * (1 + 0.3 * run);
        const a = Math.sin(st) * amp;
        const b = Math.sin(st + Math.PI) * amp;
        o[LEG_FL] = a;
        o[LEG_BR] = a;
        o[LEG_FR] = b;
        o[LEG_BL] = b;
        o[BODY_Y] = Math.abs(Math.sin(st)) * (0.012 + 0.03 * run);
        o[PITCH] = run * (0.06 + Math.sin(st * 2) * 0.05);
        o[ROLL] = Math.sin(st) * 0.035;
        o[HEAD_PITCH] = Math.sin(st * 2) * 0.03 - run * 0.05;
        o[TAIL_PITCH] = -0.15 * run;
        o[WAG_AMP] = 1;
        o[EAR_BACK] = -0.3 * run;
        break;
      }
      case "sit":
        o[PITCH] = -0.45;
        o[BODY_Y] = this.sitDrop;
        o[BODY_Z] = -0.02;
        o[HEAD_PITCH] = 0.38 + Math.sin(T * 1.1) * 0.02;
        o[LEG_FL] = 0.45;
        o[LEG_FR] = 0.45;
        o[LEG_BL] = -0.95;
        o[LEG_BR] = -0.95;
        o[FRONT_SCALE] = this.fit.sitFront;
        o[TAIL_PITCH] = 0.5;
        o[WAG_AMP] = 0.5;
        break;
      case "dig": {
        const k = Math.sin(T * 16) * 0.6;
        o[PITCH] = 0.22;
        o[BODY_Y] = -0.02;
        o[HEAD_PITCH] = 0.3 + Math.sin(T * 16) * 0.03;
        o[LEG_FL] = -0.22 - 0.2 + k;
        o[LEG_FR] = -0.22 - 0.2 - k;
        o[LEG_BL] = -0.22;
        o[LEG_BR] = -0.22;
        o[FRONT_SCALE] = this.fit.digFront;
        o[BACK_SCALE] = this.fit.digBack;
        o[TAIL_PITCH] = -0.25;
        o[WAG_AMP] = 1.3;
        o[WAG_FREQ] = 5;
        break;
      }
      case "sniff":
        o[PITCH] = 0.12;
        o[BODY_Y] = -0.01;
        o[HEAD_PITCH] = 0.42 + Math.sin(T * 10) * 0.06;
        o[HEAD_YAW] = Math.sin(T * 1.3) * 0.3;
        o[LEG_FL] = -0.12;
        o[LEG_FR] = -0.12;
        o[LEG_BL] = -0.12;
        o[LEG_BR] = -0.12;
        o[FRONT_SCALE] = this.fit.sniffFront;
        o[BACK_SCALE] = this.fit.sniffBack;
        o[WAG_AMP] = 0.8;
        break;
      case "happy":
        o[HEAD_ROLL] = Math.sin(T * 5) * 0.14;
        o[HEAD_PITCH] = -0.12;
        o[TAIL_PITCH] = -0.2;
        o[WAG_AMP] = 1.5;
        o[WAG_FREQ] = 9;
        o[EAR_BACK] = 0.15;
        break;
    }
  }

  private stepHop(dt: number): void {
    if (!this.airborne) return;
    this.hopV -= GRAVITY * dt;
    this.hopY += this.hopV * dt;
    if (this.hopY <= 0) {
      const impact = Math.abs(this.hopV);
      this.hopY = 0;
      this.hopV = 0;
      this.airborne = false;
      this.springX = clamp(impact * 0.06, 0.06, 0.26);
      this.springV = 0;
    }
  }

  private stepSpring(dt: number): void {
    this.springAcc += dt;
    while (this.springAcc >= SPRING_STEP) {
      this.springAcc -= SPRING_STEP;
      this.springV += (-190 * this.springX - 16 * this.springV) * SPRING_STEP;
      this.springX += this.springV * SPRING_STEP;
    }
  }

  private stepLook(dt: number): void {
    let yaw = 0;
    let pitch = 0;
    let tracking = false;
    if (this.hasTarget) {
      const head = this.p.head;
      head.updateWorldMatrix(true, false);
      const headPos = this.v1.setFromMatrixPosition(head.matrixWorld);
      const dir = this.v2.copy(this.target).sub(headPos);
      if (dir.lengthSq() < LOOK_RANGE * LOOK_RANGE) {
        this.p.rig.getWorldQuaternion(this.q1).invert();
        dir.applyQuaternion(this.q1);
        yaw = clamp(Math.atan2(dir.x, dir.z), -LOOK_YAW_MAX, LOOK_YAW_MAX);
        pitch = clamp(Math.atan2(-dir.y, Math.hypot(dir.x, dir.z)), LOOK_PITCH_MIN, LOOK_PITCH_MAX);
        tracking = true;
      }
    }
    if (!tracking) {
      this.glanceIn -= dt;
      if (this.glanceIn <= 0) {
        this.glanceIn = 2.5 + this.rng() * 4;
        if (this.rng() < 0.55) {
          this.glanceYaw = 0;
          this.glancePitch = 0;
        } else {
          this.glanceYaw = (this.rng() * 2 - 1) * LOOK_YAW_MAX;
          this.glancePitch = -0.25 + this.rng() * 0.5;
        }
      }
      yaw = this.glanceYaw;
      pitch = this.glancePitch;
    }
    const k = 1 - Math.exp(-4 * dt);
    this.lookYaw += (yaw - this.lookYaw) * k;
    this.lookPitch += (pitch - this.lookPitch) * k;
  }

  private stepBlinkTwitch(dt: number): void {
    if (this.blinkLeft > 0) {
      this.blinkLeft -= dt;
    } else {
      this.blinkIn -= dt;
      if (this.blinkIn <= 0) {
        this.blinkLeft = 0.13;
        this.blinkIn = 2.5 + this.rng() * 3.5;
      }
    }
    if (this.twitchT >= 0) {
      this.twitchT += dt / 0.3;
      if (this.twitchT >= 1) this.twitchT = -1;
    } else {
      this.twitchIn -= dt;
      if (this.twitchIn <= 0) {
        this.twitchT = 0;
        this.twitchSide = this.rng() < 0.5 ? 1 : -1;
        this.twitchIn = 2.5 + this.rng() * 3.5;
      }
    }
  }

  private apply(pose: Float32Array, wag: number, T: number): void {
    const p = this.p;
    const r = this.rest;

    p.rig.position.y = this.hopY;
    const k = this.springX;
    p.rig.scale.set(1 + 0.55 * k, 1 - k, 1 + 0.55 * k);

    p.body.position.set(r.bodyPos.x, r.bodyPos.y + pose[BODY_Y], r.bodyPos.z + pose[BODY_Z]);
    p.body.rotation.set(r.bodyRot.x + pose[PITCH], r.bodyRot.y, r.bodyRot.z + pose[ROLL]);

    const breath = 0.018 * Math.sin(2.2 * T);
    p.torso.scale.set(r.torsoScale.x * (1 + breath), r.torsoScale.y * (1 + breath), r.torsoScale.z);

    p.head.rotation.set(
      r.headRot.x + pose[HEAD_PITCH] + this.lookPitch,
      r.headRot.y + pose[HEAD_YAW] + this.lookYaw,
      r.headRot.z + pose[HEAD_ROLL],
    );

    for (let i = 0; i < 4; i++) {
      const leg = this.legs[i];
      leg.rotation.x = r.legRotX[i] + pose[LEG_KEYS[i]];
      leg.scale.y = i < 2 ? pose[FRONT_SCALE] : pose[BACK_SCALE];
    }

    p.tail.rotation.set(r.tailRot.x + pose[TAIL_PITCH], r.tailRot.y + wag, r.tailRot.z);

    const tw = this.twitchT >= 0 ? Math.sin(Math.PI * this.twitchT) * 0.4 : 0;
    const flutter = Math.sin(T * 1.7) * 0.03;
    p.earL.rotation.set(
      r.earLRot.x + pose[EAR_BACK],
      r.earLRot.y,
      r.earLRot.z - (this.twitchSide > 0 ? tw : 0) - flutter,
    );
    p.earR.rotation.set(
      r.earRRot.x + pose[EAR_BACK],
      r.earRRot.y,
      r.earRRot.z + (this.twitchSide < 0 ? tw : 0) + flutter,
    );

    const eyeY = r.eyeScaleY * (this.blinkLeft > 0 ? 0.12 : 1);
    p.eyeL.scale.y = eyeY;
    p.eyeR.scale.y = eyeY;
  }
}
