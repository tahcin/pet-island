import * as THREE from "three";

/**
 * Per-frame game state that must never live in React state. Components read and write
 * these objects inside useFrame.
 */
export interface Body {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  /** Vertical velocity for gravity. */
  vy: number;
  /** Horizontal speed in m/s after damping, used by animators. */
  speed: number;
  /** True when the last frame had movement input. */
  moving: boolean;
  running: boolean;
  height: number;
  radius: number;
}

export function makeBody(height: number, radius: number): Body {
  return {
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    yaw: 0,
    vy: 0,
    speed: 0,
    moving: false,
    running: false,
    height,
    radius,
  };
}

export interface CameraRig {
  yaw: number;
  pitch: number;
  zoom: number;
  /** Set to snap the camera to its target on the next frame. */
  snap: boolean;
  /** Pet-cam wanted (C in pet mode). */
  petCam: boolean;
  /** 0 = third person, 1 = pet-cam; eased over the 1.7 s swoop. */
  petCamBlend: number;
}

/** A timed pet action started by the player in pet mode (Space digs or sniffs). */
export interface PetAction {
  kind: "dig" | "sniff" | null;
  time: number;
}

export const runtime = {
  avatar: makeBody(1.3, 0.35),
  pet: makeBody(0.7, 0.35),
  camera: { yaw: 0, pitch: 0.62, zoom: 1.35, snap: true, petCam: false, petCamBlend: 0 } as CameraRig,
  /** Seconds since the controlled character last had movement input. */
  idleTime: 0,
  /** Where the camera looks; the shadow frustum follows it. */
  focus: new THREE.Vector3(),
  petAction: { kind: null, time: 0 } as PetAction,
};

export function resetBody(b: Body, x: number, y: number, z: number, yaw: number): void {
  b.pos.set(x, y, z);
  b.vel.set(0, 0, 0);
  b.vy = 0;
  b.yaw = yaw;
  b.speed = 0;
  b.moving = false;
  b.running = false;
}

/** Live villager state (written by the villager system, read by perception, chats, and save). */
export interface VillagerRuntime {
  index: number;
  name: string;
  species: string;
  body: Body;
  home: { x: number; z: number };
  /** Speech bubble text, shown while set. */
  say: string | null;
  /** When set, the villager walks here and holds (overheard chats set this). */
  goto: { x: number; z: number } | null;
  /** When set, the villager turns to face this point. */
  face: { x: number; z: number } | null;
}

/** Live collectible state (written by the collectible system, read by perception and save). */
export interface CollectibleRuntime {
  id: string;
  kind: "bone" | "yarn" | "carrot" | "shell";
  x: number;
  z: number;
  taken: boolean;
}

export const villagers: VillagerRuntime[] = [];
export const collectibles: CollectibleRuntime[] = [];
