import type { Body } from "../game/runtime";
import type { PetAnimState } from "./petAnimator";
import type { PetAct, PetMood } from "../schema/petReading";

/** Mood glyphs shown above the pet for 2.2 s when its mood changes (PRD 9.2). */
export type Glyph = "heart" | "!" | "?" | "note" | "z" | "star";

export type BrainState =
  | "follow"
  | "idle"
  | "sit"
  | "sniff"
  | "dig"
  | "play"
  | "happy"
  | "stay"
  | "come"
  | "trick"
  | "sleep"
  | "go_to";

/** How long each talk act lasts before the pet goes back to following (PRD 9.9 Acting). */
export const ACT_SECONDS: Record<PetAct, number> = {
  follow: 120,
  come: 25,
  stay: 40,
  sit: 40,
  play: 12,
  sniff: 15,
  dig: 6,
  trick: 3,
  sleep: 60,
  go_to: 30,
};

/** Mood glyphs for talk replies (PRD 9.2 glyph set). */
export const MOOD_GLYPH: Record<PetMood, Glyph> = {
  happy: "heart",
  curious: "?",
  excited: "!",
  calm: "note",
  sleepy: "z",
  playful: "note",
  shy: "?",
  proud: "star",
  loving: "heart",
  grumpy: "!",
};

export interface BrainInput {
  pet: Body;
  player: Body;
  /** Seconds the player has had no movement input. */
  playerIdle: number;
  /** Candidate sniff spots in world XZ. */
  interest: readonly { x: number; z: number }[];
}

export interface BrainOutput {
  desiredX: number;
  desiredZ: number;
  anim: PetAnimState;
  /** 0 to 1 for the animator's stride. */
  move: number;
  /** Look at the player's head (true) or glance on its own (false). */
  lookAtPlayer: boolean;
  /** Extra yaw in radians on top of the body's facing (the trick spin). */
  spin: number;
}

export interface BrainEvents {
  glyph?: (g: Glyph) => void;
  /** The pet dug at this spot (M5 turns 30 percent of digs into a collectible). */
  dug?: (x: number, z: number) => void;
  hop?: (strength: number) => void;
}

export const PET_BASE_SPEED = 4.2;
const SNIFF_COOLDOWN = 8;
const SNIFF_RANGE = 6;
const BLOCKED_LIMIT = 2.2;
const BLOCKED_REST = 8;

const MOOD: Partial<Record<BrainState, Glyph>> = { happy: "heart", sniff: "?", play: "note", dig: "!" };

function angleDiff(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

/**
 * Companion AI state machine (PRD 9.2), ticked once per frame. Pure apart from the injected
 * random source and event callbacks: it never touches three.js or React.
 */
export class PetBrain {
  state: BrainState = "follow";
  /** Seconds in the current state. */
  time = 0;
  private sniffCooldown = 3;
  private target: { x: number; z: number } | null = null;
  private blockedFor = 0;
  private restFor = 0;
  private moving = false;
  private sitAnchor = { x: 0, z: 0 };
  private playedThisStill = false;
  private playHopIn = 0;
  private hopsLeft = 0;
  /** Seconds spent at the sniff spot. */
  private dwell = 0;
  private visited: { x: number; z: number }[] = [];
  /** A talk act in progress: seconds left, after which the pet follows again. */
  plan: { act: PetAct; left: number } | null = null;
  private mood: PetMood | null = null;
  private zIn = 0;
  private trickHops = 0;

  constructor(
    private rng: () => number = Math.random,
    private events: BrainEvents = {},
  ) {}

  /** Keep distance from the player, from the pet's size (PRD 9.2). */
  static keepDistance(petRadius: number): number {
    return 2.4 + 1.3 * petRadius;
  }

  private enter(s: BrainState): void {
    if (s !== this.state && MOOD[s]) this.events.glyph?.(MOOD[s]);
    this.state = s;
    this.time = 0;
    this.dwell = 0;
    this.target = null;
  }

  /** Space with the pet nearby and nothing else to do (PRD 9.7). */
  startPlay(): void {
    this.enter("play");
    this.playHopIn = 0;
  }

  /** The player collected something: two hops and a heart. */
  celebrate(): void {
    this.enter("happy");
    this.hopsLeft = 2;
  }

  /**
   * Starts a talk act (PRD 9.9). `target` is where go_to walks and where sniff looks,
   * already resolved from the perception list by the caller.
   */
  act(act: PetAct, target: { x: number; z: number } | null = null): void {
    const dur = ACT_SECONDS[act];
    this.plan = { act, left: dur };
    switch (act) {
      case "follow":
        this.enter("follow");
        break;
      case "sit":
        this.enter("sit");
        break;
      case "stay":
        this.enter("stay");
        break;
      case "come":
        this.enter("come");
        break;
      case "play":
        this.startPlay();
        break;
      case "sniff":
        this.enter("sniff");
        this.target = target;
        break;
      case "dig":
        this.enter("dig");
        this.target = null;
        break;
      case "trick":
        this.enter("trick");
        this.trickHops = 2;
        this.events.glyph?.("star");
        break;
      case "sleep":
        this.enter("sleep");
        this.zIn = 0;
        break;
      case "go_to":
        this.enter("go_to");
        this.target = target;
        break;
    }
  }

  /** Shows the mood glyph when the mood changes. */
  setMood(mood: PetMood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    this.events.glyph?.(MOOD_GLYPH[mood]);
  }

  /** Resets to following, for example after the player hands control back with Tab. */
  reset(): void {
    this.plan = null;
    this.enter("follow");
    this.blockedFor = 0;
    this.restFor = 0;
  }

  update(dt: number, input: BrainInput): BrainOutput {
    const { pet, player } = input;
    this.time += dt;
    this.sniffCooldown -= dt;
    const dx = player.pos.x - pet.pos.x;
    const dz = player.pos.z - pet.pos.z;
    const dist = Math.hypot(dx, dz);
    const keep = PetBrain.keepDistance(pet.radius);
    const playerMoving = player.speed > 0.4;
    if (playerMoving) this.playedThisStill = false;

    const out: BrainOutput = { desiredX: 0, desiredZ: 0, anim: "idle", move: 0, lookAtPlayer: dist < 12, spin: 0 };
    if (this.plan) {
      this.plan.left -= dt;
      if (this.plan.left <= 0) {
        this.plan = null;
        if (this.state !== "follow") this.enter("follow");
      }
    }
    const held = this.plan !== null && this.plan.act !== "follow";
    const walkTo = (tx: number, tz: number, speed: number, stopAt: number): boolean => {
      const vx = tx - pet.pos.x;
      const vz = tz - pet.pos.z;
      const d = Math.hypot(vx, vz);
      if (d <= stopAt) return true;
      let s = speed;
      if (angleDiff(pet.yaw, Math.atan2(vx, vz)) > 1.2) s *= 0.25;
      out.desiredX = (vx / d) * s;
      out.desiredZ = (vz / d) * s;
      out.anim = speed > PET_BASE_SPEED * 1.3 ? "run" : "walk";
      out.move = Math.min(1, speed / (PET_BASE_SPEED * 2));
      return false;
    };

    // Stuck against something: stand still for a while (Worldpen's rule).
    if (this.restFor > 0) {
      this.restFor -= dt;
      if (dist > keep + 10) this.restFor = 0;
      return out;
    }

    switch (this.state) {
      case "follow": {
        // Speed tiers by gap, and never slower than the player so it keeps up while they walk.
        let speed = PET_BASE_SPEED * (dist > 14 ? 2 : dist > 7 ? 1.4 : 1);
        speed = Math.min(PET_BASE_SPEED * 2.8, Math.max(speed, player.speed * 1.05));
        if (this.moving ? dist > keep - 0.4 : dist > keep) {
          this.moving = true;
          walkTo(player.pos.x, player.pos.z, speed, keep - 0.4);
          // Blocked: wants to move but is not getting anywhere.
          this.blockedFor = pet.speed < 0.3 && this.time > 0.5 ? this.blockedFor + dt : 0;
          if (this.blockedFor > BLOCKED_LIMIT) {
            this.blockedFor = 0;
            this.restFor = BLOCKED_REST;
          }
        } else {
          this.moving = false;
          this.blockedFor = 0;
        }
        if (!this.moving && input.playerIdle > 2) this.enter("idle");
        else if (this.sniffCooldown <= 0 && dist < 8) {
          const spot = this.pickSniffSpot(pet, input.interest);
          if (spot) {
            this.enter("sniff");
            this.target = spot;
          } else this.sniffCooldown = 2;
        }
        break;
      }
      case "idle": {
        if (playerMoving || dist > keep + 1) {
          this.enter("follow");
          break;
        }
        if (input.playerIdle > 10 && !this.playedThisStill) {
          this.playedThisStill = true;
          if (this.rng() < 0.5) {
            this.startPlay();
            break;
          }
        }
        if (this.time > 6) {
          this.sitAnchor = { x: player.pos.x, z: player.pos.z };
          this.enter("sit");
        }
        break;
      }
      case "sit": {
        out.anim = "sit";
        if (held) break;
        if (Math.hypot(player.pos.x - this.sitAnchor.x, player.pos.z - this.sitAnchor.z) > 3) this.enter("follow");
        else if (input.playerIdle > 10 && !this.playedThisStill) {
          this.playedThisStill = true;
          if (this.rng() < 0.5) this.startPlay();
        }
        break;
      }
      case "sniff": {
        if (!this.target && held) this.target = this.nearestInterest(pet, input.interest);
        const t = this.target;
        if (!t || this.time > (held ? 15 : 10) || dist > (held ? 30 : 16)) {
          if (held) this.plan = null;
          this.sniffCooldown = SNIFF_COOLDOWN;
          this.enter("follow");
          break;
        }
        const arrived = walkTo(t.x, t.z, PET_BASE_SPEED, 0.6);
        if (arrived) {
          out.anim = "sniff";
          out.lookAtPlayer = false;
          // Sniff 1.5 s from arrival, then 30 percent of the time dig.
          this.dwell += dt;
          if (this.dwell > 1.5) {
            this.sniffCooldown = SNIFF_COOLDOWN;
            if (this.plan?.act === "sniff") this.plan = null;
            this.visited.push(t);
            if (this.visited.length > 12) this.visited.shift();
            if (this.rng() < 0.3) {
              this.enter("dig");
              this.target = t;
            } else this.enter("follow");
          }
        }
        break;
      }
      case "dig": {
        out.anim = "dig";
        out.lookAtPlayer = false;
        if (this.time > 1.4) {
          const t = this.target ?? { x: pet.pos.x, z: pet.pos.z };
          this.events.dug?.(t.x, t.z);
          if (this.plan?.act === "dig") this.plan = null;
          this.enter("follow");
        }
        break;
      }
      case "play": {
        if (this.time > 12 || dist > 14) {
          if (this.plan?.act === "play") this.plan = null;
          this.enter("follow");
          break;
        }
        this.playHopIn -= dt;
        if (!this.target || this.playHopIn <= 0) {
          const a = this.rng() * Math.PI * 2;
          const r = 2.5 + this.rng() * 3.5;
          this.target = { x: player.pos.x + Math.cos(a) * r, z: player.pos.z + Math.sin(a) * r };
          this.playHopIn = 4;
        }
        if (walkTo(this.target.x, this.target.z, PET_BASE_SPEED * 1.7, 0.5)) {
          out.anim = "happy";
          if (this.playHopIn < 3.2 && this.playHopIn > 3.2 - dt * 1.5) this.events.hop?.(1);
        }
        break;
      }
      case "happy": {
        out.anim = "happy";
        if (this.hopsLeft > 0 && this.time > (2 - this.hopsLeft) * 0.45) {
          this.hopsLeft--;
          this.events.hop?.(1);
        }
        if (this.time > 1) this.enter("follow");
        break;
      }
      case "stay": {
        if (!held) this.enter("follow");
        break;
      }
      case "come": {
        if (!held) {
          this.enter("follow");
          break;
        }
        // Walk right up to the person, then stay put.
        walkTo(player.pos.x, player.pos.z, PET_BASE_SPEED * (dist > 7 ? 1.6 : 1.1), 1.4 + pet.radius);
        break;
      }
      case "trick": {
        out.anim = "happy";
        out.spin = Math.min(1, this.time / 1.2) * Math.PI * 2;
        if (this.trickHops > 0 && this.time > 1.2 + (2 - this.trickHops) * 0.5) {
          this.trickHops--;
          this.events.hop?.(1.2);
        }
        if (this.time > 3) {
          this.plan = null;
          this.enter("follow");
        }
        break;
      }
      case "sleep": {
        out.anim = "sit";
        out.lookAtPlayer = false;
        this.zIn -= dt;
        if (this.zIn <= 0) {
          this.zIn = 3;
          this.events.glyph?.("z");
        }
        if (!held) this.enter("follow");
        break;
      }
      case "go_to": {
        const t = this.target;
        if (!held || !t) {
          this.plan = null;
          this.enter("follow");
          break;
        }
        if (walkTo(t.x, t.z, PET_BASE_SPEED * 1.3, 1.5)) {
          out.anim = "sniff";
          out.lookAtPlayer = false;
        }
        break;
      }
    }
    return out;
  }

  private nearestInterest(pet: Body, interest: BrainInput["interest"]): { x: number; z: number } | null {
    let best: { x: number; z: number } | null = null;
    let bestD = 25;
    for (const p of interest) {
      const d = Math.hypot(p.x - pet.pos.x, p.z - pet.pos.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  private pickSniffSpot(pet: Body, interest: BrainInput["interest"]): { x: number; z: number } | null {
    let best: { x: number; z: number } | null = null;
    let bestD = SNIFF_RANGE;
    for (const p of interest) {
      const d = Math.hypot(p.x - pet.pos.x, p.z - pet.pos.z);
      if (d < bestD && d > 1 && !this.visited.some((v) => v.x === p.x && v.z === p.z)) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }
}
