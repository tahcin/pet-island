import { describe, expect, it } from "vitest";
import Alea from "alea";
import { PetBrain, type Glyph } from "../../src/pet/petBrain";
import { makeBody, type Body } from "../../src/game/runtime";
import { stepBody } from "../../src/control/movement";
import { generateWorld, heightAt, isWater } from "../../src/world/generateWorld";
import { buildAvatar, avatarData, AVATAR_PIVOTS } from "../../src/avatar/buildAvatar";
import { AvatarAnimator, AVATAR_STATES } from "../../src/avatar/avatarAnimator";

const world = generateWorld(12345);
const DT = 1 / 60;

function setup() {
  const player = makeBody(1.3, 0.35);
  const pet = makeBody(0.7, 0.35);
  const s = world.spawn;
  player.pos.set(s.x, heightAt(world.heightmap, s.x, s.z), s.z);
  player.yaw = s.yaw;
  pet.pos.set(world.petSpawn.x, heightAt(world.heightmap, world.petSpawn.x, world.petSpawn.z), world.petSpawn.z);
  const glyphs: Glyph[] = [];
  const brain = new PetBrain(Alea(7), { glyph: (g) => glyphs.push(g) });
  return { player, pet, brain, glyphs };
}

/** Advances both bodies; the player walks with the given velocity. */
function tick(brain: PetBrain, pet: Body, player: Body, vx: number, vz: number, idle: { t: number }) {
  const moving = vx !== 0 || vz !== 0;
  idle.t = moving ? 0 : idle.t + DT;
  stepBody(player, vx, vz, DT, world);
  const out = brain.update(DT, { pet, player, playerIdle: idle.t, interest: [] });
  stepBody(pet, out.desiredX, out.desiredZ, DT, world);
  return out;
}

const dist = (a: Body, b: Body) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);

describe("PetBrain", () => {
  it("follows the player and settles 1.5 to 3.5 m away", () => {
    const { player, pet, brain } = setup();
    const idle = { t: 0 };
    const fx = Math.sin(world.spawn.yaw) * 4.8;
    const fz = Math.cos(world.spawn.yaw) * 4.8;
    for (let i = 0; i < 60 * 3; i++) tick(brain, pet, player, fx, fz, idle);
    for (let i = 0; i < 60 * 2; i++) tick(brain, pet, player, 0, 0, idle);
    const d = dist(pet, player);
    expect(d).toBeGreaterThan(1.5);
    expect(d).toBeLessThan(3.5);
  });

  it("goes idle when the player stops, then sits after 6 s", () => {
    const { player, pet, brain } = setup();
    const idle = { t: 0 };
    for (let i = 0; i < 60 * 3; i++) tick(brain, pet, player, 0, 0, idle);
    expect(brain.state).toBe("idle");
    for (let i = 0; i < 60 * 6.5; i++) tick(brain, pet, player, 0, 0, idle);
    expect(["sit", "play"]).toContain(brain.state);
  });

  it("runs to catch up beyond 8 m", () => {
    const { player, pet, brain } = setup();
    pet.pos.set(player.pos.x + 10, player.pos.y, player.pos.z);
    if (isWater(world.heightmap, pet.pos.x, pet.pos.z)) pet.pos.set(player.pos.x - 10, player.pos.y, player.pos.z);
    const out = brain.update(DT, { pet, player, playerIdle: 0, interest: [] });
    expect(out.anim).toBe("run");
  });

  it("sniffs a nearby interest point with a ? glyph", () => {
    const { player, pet, brain, glyphs } = setup();
    const spot = { x: pet.pos.x + 2, z: pet.pos.z };
    for (let i = 0; i < 60 * 4; i++) {
      const out = brain.update(DT, { pet, player, playerIdle: 0, interest: [spot] });
      stepBody(pet, out.desiredX, out.desiredZ, DT, world);
    }
    expect(glyphs).toContain("?");
  });

  it("celebrates with a heart and returns to follow", () => {
    const { player, pet, brain, glyphs } = setup();
    brain.celebrate();
    expect(glyphs).toContain("heart");
    for (let i = 0; i < 90; i++) brain.update(DT, { pet, player, playerIdle: 0, interest: [] });
    expect(brain.state).not.toBe("happy");
  });

  it("never walks into water over a long random walk", () => {
    const { player, pet, brain } = setup();
    const rng = Alea(3);
    const idle = { t: 0 };
    let vx = 0;
    let vz = 0;
    for (let i = 0; i < 60 * 60; i++) {
      if (i % 120 === 0) {
        const a = rng() * Math.PI * 2;
        const moving = rng() > 0.3;
        vx = moving ? Math.cos(a) * 8 : 0;
        vz = moving ? Math.sin(a) * 8 : 0;
      }
      tick(brain, pet, player, vx, vz, idle);
      expect(isWater(world.heightmap, pet.pos.x, pet.pos.z)).toBe(false);
    }
  });
});

describe("avatar", () => {
  it("builds with all pivots and animates every state without NaN", () => {
    const root = buildAvatar();
    const data = avatarData(root);
    for (const n of AVATAR_PIVOTS) expect(data.pivots[n]).toBeTruthy();
    const anim = new AvatarAnimator(root);
    for (const s of AVATAR_STATES) {
      anim.setState(s);
      for (let i = 0; i < 60; i++) anim.update(DT, 0.5);
      root.traverse((o) => {
        expect(Number.isFinite(o.rotation.x + o.rotation.z + o.position.y + o.scale.y)).toBe(true);
      });
    }
  });
});
