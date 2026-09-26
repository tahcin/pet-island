import type { Body } from "../game/runtime";
import { canWalk, heightAt, type WorldData } from "../world/generateWorld";

export const WALK_SPEED = 4.8;
export const RUN_MULT = 1.75;
const GRAVITY = 30;
const TERMINAL = -60;
const STEP_UP = 1.2;
const STEP_DOWN = 0.6;

/** Circle obstacle test hook; returns a pushed-out position or null. Filled in by props (M4). */
export type Collide = (x: number, z: number, r: number, feetY: number) => { x: number; z: number } | null;

export function dampAngle(from: number, to: number, rate: number, dt: number): number {
  let d = to - from;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return from + d * (1 - Math.exp(-rate * dt));
}

/**
 * Moves a body toward a desired world-space velocity with the PRD 9.7 rules: velocity damped
 * at rate 10, yaw turns toward the move direction at rate 10, water and cliffs block (sliding
 * along them), grounding on heightAt with gravity and step snaps.
 */
export function stepBody(
  body: Body,
  desiredX: number,
  desiredZ: number,
  dt: number,
  world: WorldData,
  collide?: Collide,
  turnRate = 10,
): void {
  const k = 1 - Math.exp(-10 * dt);
  body.vel.x += (desiredX - body.vel.x) * k;
  body.vel.z += (desiredZ - body.vel.z) * k;
  const p = body.pos;
  let nx = p.x + body.vel.x * dt;
  let nz = p.z + body.vel.z * dt;
  if (!canWalk(world, p.x, p.z, nx, nz)) {
    if (canWalk(world, p.x, p.z, nx, p.z)) {
      nz = p.z;
      body.vel.z = 0;
    } else if (canWalk(world, p.x, p.z, p.x, nz)) {
      nx = p.x;
      body.vel.x = 0;
    } else {
      nx = p.x;
      nz = p.z;
      body.vel.x = 0;
      body.vel.z = 0;
    }
  }
  if (collide) {
    const pushed = collide(nx, nz, body.radius, p.y);
    if (pushed && canWalk(world, p.x, p.z, pushed.x, pushed.z)) {
      nx = pushed.x;
      nz = pushed.z;
    }
  }
  const moved = Math.hypot(nx - p.x, nz - p.z);
  body.speed = dt > 0 ? moved / dt : 0;
  p.x = nx;
  p.z = nz;
  const speed2 = desiredX * desiredX + desiredZ * desiredZ;
  if (speed2 > 0.01) body.yaw = dampAngle(body.yaw, Math.atan2(desiredX, desiredZ), turnRate, dt);

  const ground = heightAt(world.heightmap, p.x, p.z);
  if (p.y <= ground || (ground > p.y && ground - p.y < STEP_UP)) {
    p.y = ground;
    body.vy = 0;
  } else if (p.y - ground < STEP_DOWN && body.vy <= 0) {
    p.y = ground;
    body.vy = 0;
  } else {
    body.vy = Math.max(TERMINAL, body.vy - GRAVITY * dt);
    p.y = Math.max(ground, p.y + body.vy * dt);
  }
}
