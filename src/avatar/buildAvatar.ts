import * as THREE from "three";
import { toonColor } from "../render/toon";
import { applyBend } from "../render/bend";

/** Colors for the player villager. Pastel sets that read well on grass and sand. */
export interface AvatarLook {
  skin: string;
  hair: string;
  shirt: string;
  shorts: string;
  shoes: string;
}

export const DEFAULT_LOOK: AvatarLook = {
  skin: "#ffdcc2",
  hair: "#9a6246",
  shirt: "#9fd6f2",
  shorts: "#f7bd8c",
  shoes: "#ea7b6c",
};

/** Seeded outfits: every island dresses its villager a little differently. */
export const LOOKS: readonly AvatarLook[] = [
  DEFAULT_LOOK,
  { skin: "#ffdcc2", hair: "#5a3b2e", shirt: "#b5e8c4", shorts: "#8fa8e0", shoes: "#f2a65a" },
  { skin: "#f6cfae", hair: "#e0a458", shirt: "#ffc2d4", shorts: "#a7d8ea", shoes: "#8d7bd6" },
  { skin: "#ffe3cc", hair: "#3f3542", shirt: "#fff0a8", shorts: "#e88f8f", shoes: "#6cb7c9" },
  { skin: "#eec1a0", hair: "#c46a4a", shirt: "#d4c4f5", shorts: "#9dd4a4", shoes: "#e86f86" },
  { skin: "#ffd8bd", hair: "#7a5c9e", shirt: "#ffd0a1", shorts: "#7fb5d9", shoes: "#f0826a" },
];

/** Picks an outfit from the island seed. Deterministic. */
export function lookForSeed(seed: number): AvatarLook {
  let h = (Math.floor(seed) ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return LOOKS[h % LOOKS.length];
}

export const AVATAR_HEIGHT = 1.3;

export const AVATAR_PIVOTS = [
  "hips",
  "torso",
  "head",
  "armL",
  "armR",
  "legL",
  "legR",
  "eyeL",
  "eyeR",
  "handL",
  "handR",
  "smile",
  "mouthOpen",
] as const;
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

/** Mixes a color toward white (t > 0) or black (t < 0). */
function shade(color: string, t: number): string {
  const c = new THREE.Color(color);
  c.lerp(new THREE.Color(t > 0 ? "#ffffff" : "#000000"), Math.abs(t));
  return `#${c.getHexString()}`;
}

/**
 * An Animal Crossing style villager from smooth rounded primitives: a big soft head (about 45
 * percent of the height), short body in a t-shirt and flared shorts, mitten hands, chunky shoes.
 * Faces +Z, feet at y = 0, top of the hair at about 1.3. Pure: same look, same model.
 */
export function buildAvatar(look: AvatarLook = DEFAULT_LOOK): THREE.Group {
  const geos: THREE.BufferGeometry[] = [];
  const geo = <G extends THREE.BufferGeometry>(g: G): G => {
    geos.push(g);
    return g;
  };
  const mesh = (g: THREE.BufferGeometry, color: string, parent: THREE.Object3D, name: string, soft = true) => {
    const m = new THREE.Mesh(g, toonColor(color, soft));
    m.name = name;
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const sphere = (r: number, w = 24, h = 18) => geo(new THREE.SphereGeometry(r, w, h));

  const shirtLight = shade(look.shirt, 0.55);
  const shortsDark = shade(look.shorts, -0.12);
  const sole = shade(look.shoes, 0.6);
  const hairDark = shade(look.hair, -0.1);

  const root = new THREE.Group();
  root.name = "avatar";
  const hips = pivot("hips", root, 0, 0.3, 0);

  // Stubby legs with chunky two-tone shoes.
  for (const side of [-1, 1]) {
    const leg = pivot(side < 0 ? "legL" : "legR", hips, side * 0.085, 0, 0);
    mesh(geo(new THREE.CapsuleGeometry(0.05, 0.12, 8, 16)), look.skin, leg, "leg").position.y = -0.11;
    const shoe = mesh(sphere(0.085, 28, 20), look.shoes, leg, "shoe");
    shoe.scale.set(0.98, 0.7, 1.32);
    shoe.position.set(0, -0.225, 0.028);
    const soleM = mesh(geo(new THREE.CylinderGeometry(0.084, 0.08, 0.035, 28)), sole, leg, "sole");
    soleM.scale.set(1, 1, 1.36);
    soleM.position.set(0, -0.275, 0.03);
  }

  const torso = pivot("torso", hips, 0, 0.02, 0);
  // Shorts with a slightly flared hem.
  const shorts = mesh(geo(new THREE.CylinderGeometry(0.165, 0.205, 0.14, 32)), look.shorts, torso, "shorts");
  shorts.position.y = 0.03;
  shorts.scale.z = 0.88;
  const hem = mesh(geo(new THREE.TorusGeometry(0.2, 0.017, 10, 36)), shortsDark, torso, "hem");
  hem.rotation.x = Math.PI / 2;
  hem.position.y = -0.035;
  hem.scale.set(1, 0.88, 1);
  const seat = mesh(sphere(0.17, 28, 16), look.shorts, torso, "seat");
  seat.position.y = 0.02;
  seat.scale.set(1, 0.5, 0.86);

  // Rounded t-shirt with a collar and a lighter hem band.
  const shirt = mesh(geo(new THREE.CapsuleGeometry(0.168, 0.1, 12, 32)), look.shirt, torso, "shirt");
  shirt.position.y = 0.2;
  shirt.scale.set(1, 0.92, 0.86);
  const band = mesh(geo(new THREE.TorusGeometry(0.163, 0.016, 10, 36)), shirtLight, torso, "shirtBand");
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.09;
  band.scale.set(1, 0.86, 1);
  const collar = mesh(geo(new THREE.TorusGeometry(0.07, 0.022, 12, 32)), shirtLight, torso, "collar");
  collar.rotation.x = Math.PI / 2 - 0.15;
  collar.position.set(0, 0.335, 0.008);
  const neck = mesh(geo(new THREE.CylinderGeometry(0.055, 0.062, 0.1, 20)), look.skin, torso, "neck");
  neck.position.y = 0.37;

  // Arms hang from the shoulders: puffy sleeve, short skin arm, mitten hand.
  for (const side of [-1, 1]) {
    const arm = pivot(side < 0 ? "armL" : "armR", torso, side * 0.17, 0.28, 0);
    const sleeve = mesh(sphere(0.072, 24, 18), look.shirt, arm, "sleeve");
    sleeve.position.y = -0.03;
    sleeve.scale.set(1, 1.08, 1);
    const cuff = mesh(geo(new THREE.TorusGeometry(0.056, 0.014, 8, 24)), shirtLight, arm, "cuff");
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -0.085;
    mesh(geo(new THREE.CapsuleGeometry(0.042, 0.07, 8, 16)), look.skin, arm, "arm").position.y = -0.13;
    const hand = pivot(side < 0 ? "handL" : "handR", arm, 0, -0.19, 0);
    const mitten = mesh(sphere(0.056, 24, 18), look.skin, hand, "mitten");
    mitten.scale.set(0.92, 1.05, 0.82);
    const thumb = mesh(sphere(0.024, 14, 10), look.skin, hand, "thumb");
    thumb.position.set(-side * 0.012, 0.012, 0.042);
    arm.rotation.z = side * 0.22;
  }

  // Big soft head on a little neck.
  const head = pivot("head", torso, 0, 0.36, 0);
  const skull = mesh(sphere(0.29, 48, 36), look.skin, head, "skull");
  skull.position.y = 0.28;
  skull.scale.set(1.08, 0.94, 1);
  for (const side of [-1, 1]) {
    const ear = mesh(sphere(0.045, 16, 12), look.skin, head, "ear");
    ear.position.set(side * 0.305, 0.25, -0.01);
    ear.scale.set(0.5, 0.9, 0.7);
  }

  // Hair: tilted cap, a back volume, side tufts and a side-swept fringe.
  const cap = mesh(
    geo(new THREE.SphereGeometry(0.305, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.56)),
    look.hair,
    head,
    "hair",
  );
  cap.position.set(0, 0.3, -0.015);
  cap.rotation.x = -0.42;
  cap.scale.set(1.1, 1, 1.06);
  const back = mesh(sphere(0.21, 32, 24), look.hair, head, "hairBack");
  back.position.set(0, 0.2, -0.16);
  back.scale.set(1.36, 1.12, 0.92);
  const crown = mesh(sphere(0.12, 24, 18), hairDark, head, "hairCrown");
  crown.position.set(-0.06, 0.53, -0.08);
  crown.scale.set(1.3, 0.6, 1.2);
  for (const side of [-1, 1]) {
    const tuft = mesh(sphere(0.085, 20, 16), look.hair, head, "tuft");
    tuft.position.set(side * 0.27, 0.19, 0.02);
    tuft.scale.set(0.62, 1.25, 0.95);
    tuft.rotation.z = side * 0.18;
  }
  const fringeParts: [number, number, number, number, number, number, number][] = [
    // x, y, z, r, sx, sy, rz
    [0.12, 0.44, 0.19, 0.11, 1.35, 0.62, -0.45],
    [-0.03, 0.47, 0.2, 0.105, 1.3, 0.58, -0.3],
    [-0.16, 0.43, 0.17, 0.085, 1.1, 0.66, -0.15],
    [0.21, 0.38, 0.14, 0.075, 0.9, 0.9, -0.6],
  ];
  for (const [x, y, z, r, sx, sy, rz] of fringeParts) {
    const f = mesh(sphere(r, 24, 18), look.hair, head, "fringe");
    f.position.set(x, y, z);
    f.scale.set(sx, sy, 0.72);
    f.rotation.z = rz;
  }

  // Face: big oval eyes with two highlights, rosy cheeks, tiny nose, small smile.
  for (const side of [-1, 1]) {
    const eye = pivot(side < 0 ? "eyeL" : "eyeR", head, side * 0.105, 0.26, 0.262);
    const e = mesh(sphere(0.05, 24, 18), "#2e2433", eye, "eye", false);
    e.scale.set(0.72, 1, 0.42);
    const shine = mesh(sphere(0.016, 12, 10), "#ffffff", eye, "shine", false);
    shine.position.set(0.012, 0.02, 0.018);
    const shine2 = mesh(sphere(0.008, 10, 8), "#ffffff", eye, "shine", false);
    shine2.position.set(-0.01, -0.018, 0.018);
    const cheek = mesh(sphere(0.045, 20, 14), "#ff9fa0", head, "cheek");
    cheek.position.set(side * 0.172, 0.175, 0.213);
    cheek.scale.set(1.05, 0.6, 0.35);
  }
  const nose = mesh(sphere(0.019, 14, 10), "#f6b89c", head, "nose");
  nose.position.set(0, 0.2, 0.272);
  nose.scale.set(1.1, 0.8, 0.8);

  const smile = pivot("smile", head, 0, 0.14, 0.243);
  smile.rotation.x = 0.55;
  const arc = mesh(geo(new THREE.TorusGeometry(0.028, 0.0065, 8, 24, Math.PI)), "#7a3b3b", smile, "smileArc", false);
  arc.rotation.z = Math.PI;
  const open = pivot("mouthOpen", head, 0, 0.145, 0.24);
  open.rotation.x = 0.55;
  const mouth = mesh(
    geo(new THREE.SphereGeometry(0.036, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)),
    "#b8455a",
    open,
    "mouth",
    false,
  );
  mouth.scale.set(1, 0.95, 0.35);
  const tongue = mesh(sphere(0.018, 12, 10), "#ff8a9a", open, "tongue", false);
  tongue.position.set(0, -0.022, 0.006);
  tongue.scale.set(1.1, 0.6, 0.4);
  open.visible = false;

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
