import * as THREE from "three";
import { toonColor } from "../render/toon";
import { applyBend } from "../render/bend";

/** Colors for the player villager. Seeded variety can come later; the default reads well on grass and sand. */
export interface AvatarLook {
  skin: string;
  hair: string;
  shirt: string;
  shorts: string;
  shoes: string;
}

export const DEFAULT_LOOK: AvatarLook = {
  skin: "#ffdcbf",
  hair: "#8a5a3c",
  shirt: "#8cc8f0",
  shorts: "#f2b872",
  shoes: "#d9725f",
};

export const AVATAR_HEIGHT = 1.3;

export const AVATAR_PIVOTS = ["hips", "torso", "head", "armL", "armR", "legL", "legR", "eyeL", "eyeR"] as const;
export type AvatarPivot = (typeof AVATAR_PIVOTS)[number];

export interface AvatarData {
  height: number;
  radius: number;
  pivots: Record<AvatarPivot, THREE.Object3D>;
  geometries: THREE.BufferGeometry[];
}

function pivot(name: string, parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/**
 * An Animal Crossing style villager from rounded primitives: big head, short body, stubby limbs,
 * limbs hinged at shoulders and hips. Faces +Z, feet at y = 0. Pure: same look, same model.
 */
export function buildAvatar(look: AvatarLook = DEFAULT_LOOK): THREE.Group {
  const geos: THREE.BufferGeometry[] = [];
  const geo = <G extends THREE.BufferGeometry>(g: G): G => {
    geos.push(g);
    return g;
  };
  const mesh = (g: THREE.BufferGeometry, color: string, parent: THREE.Object3D, name: string) => {
    const m = new THREE.Mesh(g, toonColor(color));
    m.name = name;
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  const root = new THREE.Group();
  root.name = "avatar";
  const hips = pivot("hips", root, 0, 0.36, 0);

  // Legs hang from the hips; shoes at the bottom.
  const legs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = pivot(side < 0 ? "legL" : "legR", hips, side * 0.1, 0, 0);
    mesh(geo(new THREE.CapsuleGeometry(0.065, 0.16, 6, 12)), look.skin, leg, "leg").position.y = -0.14;
    const shoe = mesh(geo(new THREE.SphereGeometry(0.09, 16, 12)), look.shoes, leg, "shoe");
    shoe.scale.set(1, 0.62, 1.35);
    shoe.position.set(0, -0.3, 0.03);
    legs.push(leg);
  }

  const torso = pivot("torso", hips, 0, 0.02, 0);
  const shorts = mesh(geo(new THREE.CylinderGeometry(0.2, 0.22, 0.14, 20)), look.shorts, torso, "shorts");
  shorts.position.y = 0.02;
  const shirt = mesh(geo(new THREE.CapsuleGeometry(0.2, 0.14, 8, 20)), look.shirt, torso, "shirt");
  shirt.position.y = 0.2;
  shirt.scale.set(1, 1, 0.85);

  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = pivot(side < 0 ? "armL" : "armR", torso, side * 0.22, 0.3, 0);
    const sleeve = mesh(geo(new THREE.SphereGeometry(0.075, 14, 10)), look.shirt, arm, "sleeve");
    sleeve.scale.set(1, 1.1, 1);
    const limb = mesh(geo(new THREE.CapsuleGeometry(0.052, 0.14, 6, 10)), look.skin, arm, "arm");
    limb.position.y = -0.13;
    arm.rotation.z = side * 0.18;
    arms.push(arm);
  }

  // Oversized head on a short neck.
  const head = pivot("head", torso, 0, 0.44, 0);
  const skull = mesh(geo(new THREE.SphereGeometry(0.3, 32, 24)), look.skin, head, "skull");
  skull.position.y = 0.24;
  skull.scale.set(1.05, 0.98, 1);
  const hair = mesh(
    geo(new THREE.SphereGeometry(0.315, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.52)),
    look.hair,
    head,
    "hair",
  );
  hair.position.set(0, 0.27, -0.02);
  hair.rotation.x = -0.35;
  hair.scale.set(1.06, 1, 1.04);
  const fringe = mesh(geo(new THREE.SphereGeometry(0.12, 16, 12)), look.hair, head, "fringe");
  fringe.position.set(0.1, 0.45, 0.2);
  fringe.scale.set(1.3, 0.55, 0.7);

  const eyes: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const eye = pivot(side < 0 ? "eyeL" : "eyeR", head, side * 0.11, 0.24, 0.27);
    const e = mesh(geo(new THREE.SphereGeometry(0.045, 16, 12)), "#2b2230", eye, "eye");
    e.scale.set(0.8, 1.15, 0.5);
    const shine = mesh(geo(new THREE.SphereGeometry(0.014, 8, 6)), "#ffffff", eye, "shine");
    shine.position.set(0.012, 0.02, 0.02);
    const cheek = mesh(geo(new THREE.SphereGeometry(0.05, 12, 8)), "#ffa7a0", head, "cheek");
    cheek.position.set(side * 0.19, 0.15, 0.23);
    cheek.scale.set(1, 0.55, 0.4);
    eyes.push(eye);
  }
  const nose = mesh(geo(new THREE.SphereGeometry(0.025, 10, 8)), "#f5b99a", head, "nose");
  nose.position.set(0, 0.17, 0.3);

  applyBend(root);
  const pivots = Object.fromEntries(
    AVATAR_PIVOTS.map((n) => [n, root.getObjectByName(n) as THREE.Object3D]),
  ) as Record<AvatarPivot, THREE.Object3D>;
  const data: AvatarData = { height: AVATAR_HEIGHT, radius: 0.3, pivots, geometries: geos };
  root.userData = data;
  return root;
}

export function avatarData(root: THREE.Object3D): AvatarData {
  return root.userData as AvatarData;
}

export function disposeAvatar(root: THREE.Object3D): void {
  for (const g of avatarData(root).geometries) g.dispose();
}
