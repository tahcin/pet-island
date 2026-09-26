import type { Collide } from "../control/movement";
import type { PropInstance } from "./placement";

/** Circle collider with a top height so jumpers can land on low rocks. */
export interface Collider {
  x: number;
  z: number;
  r: number;
  top: number;
}

const CELL = 8;
/** Feet must be below the collider top minus this margin to be pushed out. */
const TOP_MARGIN = 0.25;

function key(i: number, j: number): number {
  return (i + 512) * 1024 + (j + 512);
}

const PROP_HEIGHT: Record<PropInstance["type"], number> = {
  tree: 3.4,
  fruitTree: 3.4,
  pine: 3.8,
  palm: 4,
  rock: 0.75,
  bush: 0.9,
  flower: 0.4,
  mushroom: 0.4,
};

/** Colliders for solid props (radius above zero). */
export function propColliders(props: PropInstance[]): Collider[] {
  const out: Collider[] = [];
  for (const p of props) {
    if (p.radius <= 0) continue;
    out.push({ x: p.x, z: p.z, r: p.radius, top: p.y + PROP_HEIGHT[p.type] * p.scale });
  }
  return out;
}

/** Spatial hash (8 m cells) over circle colliders; returns a Collide for stepBody. */
export function buildCollide(colliders: Collider[]): Collide {
  const grid = new Map<number, Collider[]>();
  for (const c of colliders) {
    const i0 = Math.floor((c.x - c.r) / CELL);
    const i1 = Math.floor((c.x + c.r) / CELL);
    const j0 = Math.floor((c.z - c.r) / CELL);
    const j1 = Math.floor((c.z + c.r) / CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = key(i, j);
        let cell = grid.get(k);
        if (!cell) grid.set(k, (cell = []));
        cell.push(c);
      }
    }
  }
  return (x, z, r, feetY) => {
    let px = x;
    let pz = z;
    let hit = false;
    const i0 = Math.floor((x - r) / CELL);
    const i1 = Math.floor((x + r) / CELL);
    const j0 = Math.floor((z - r) / CELL);
    const j1 = Math.floor((z + r) / CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const cell = grid.get(key(i, j));
        if (!cell) continue;
        for (const c of cell) {
          if (feetY >= c.top - TOP_MARGIN) continue;
          const dx = px - c.x;
          const dz = pz - c.z;
          const min = r + c.r;
          const d2 = dx * dx + dz * dz;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2);
          if (d < 1e-5) {
            px = c.x + min;
          } else {
            px = c.x + (dx / d) * min;
            pz = c.z + (dz / d) * min;
          }
          hit = true;
        }
      }
    }
    return hit ? { x: px, z: pz } : null;
  };
}
