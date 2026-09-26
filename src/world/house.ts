import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Collider } from "./collision";

/** Primitive villager cottage (PRD 7.4 fallback): rounded walls, pastel roof, door, windows. */

export const HOUSE_RADIUS = 2.1;
export const HOUSE_HEIGHT = 4;

export const ROOF_COLORS = ["#f5a3a3", "#9cc7f0", "#b9a3e8"] as const;
export const WALL_COLOR = "#fff3dc";
export const DOOR_COLOR = "#a8744f";
export const WINDOW_COLOR = "#bfe6ff";
export const TRIM_COLOR = "#d9b98f";

function roofGeometry(): THREE.BufferGeometry {
  // Soft gable roof: a squashed rounded box rotated as a pitched prism.
  const left = new RoundedBoxGeometry(2.3, 0.28, 3.6, 3, 0.12);
  left.rotateZ(0.62);
  left.translate(-0.88, 2.95, 0);
  const right = new RoundedBoxGeometry(2.3, 0.28, 3.6, 3, 0.12);
  right.rotateZ(-0.62);
  right.translate(0.88, 2.95, 0);
  return mergeGeometries([left, right]);
}

function wallGeometry(): THREE.BufferGeometry {
  const body = new RoundedBoxGeometry(2.9, 2.2, 3, 4, 0.3);
  body.translate(0, 1.1, 0);
  // Gable fill so the roof does not float over an open triangle.
  const gable = new THREE.CylinderGeometry(0.01, 1.35, 1.0, 4, 1);
  gable.rotateY(Math.PI / 4);
  gable.scale(1.05, 1, 1.05);
  gable.translate(0, 2.65, 0);
  const g = mergeGeometries([body.toNonIndexed(), gable.toNonIndexed()]);
  g.computeVertexNormals();
  return g;
}

function doorGeometry(): THREE.BufferGeometry {
  const d = new RoundedBoxGeometry(0.8, 1.35, 0.16, 3, 0.07);
  d.translate(0, 0.68, 1.5);
  return d;
}

function windowGeometry(): THREE.BufferGeometry {
  const a = new RoundedBoxGeometry(0.6, 0.6, 0.12, 2, 0.06);
  a.translate(0.95, 1.35, 1.5);
  const b = new RoundedBoxGeometry(0.12, 0.6, 0.6, 2, 0.06);
  b.translate(1.45, 1.35, 0.3);
  const c = new RoundedBoxGeometry(0.12, 0.6, 0.6, 2, 0.06);
  c.translate(-1.45, 1.35, 0.3);
  return mergeGeometries([a, b, c]);
}

function chimneyGeometry(): THREE.BufferGeometry {
  const c = new RoundedBoxGeometry(0.4, 0.9, 0.4, 2, 0.08);
  c.translate(0.7, 3.4, -0.8);
  const step = new RoundedBoxGeometry(3.1, 0.18, 0.9, 2, 0.08);
  step.translate(0, 0.06, 1.75);
  return mergeGeometries([c, step]);
}

export interface HousePart {
  name: string;
  geometry: THREE.BufferGeometry;
}

/** Built once; shared by every house instance. */
export const HOUSE_PARTS = {
  walls: wallGeometry(),
  roof: roofGeometry(),
  door: doorGeometry(),
  windows: windowGeometry(),
  trim: chimneyGeometry(),
};

/** House faces the island center so doors are visible when walking in from the beach. */
export function houseYaw(x: number, z: number): number {
  return Math.atan2(-x, -z);
}

export function houseColliders(homes: { x: number; z: number }[], groundY: (x: number, z: number) => number): Collider[] {
  return homes.map((h) => ({ x: h.x, z: h.z, r: HOUSE_RADIUS, top: groundY(h.x, h.z) + HOUSE_HEIGHT }));
}
