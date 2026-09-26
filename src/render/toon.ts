import * as THREE from "three";
import { bendMaterial, type BendOptions } from "./bend";

function makeGradient(steps: number[]): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array(steps), steps.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** 3-step gradient from PRD section 8: the darkest band is still pastel. */
export const toonGradient = makeGradient([120, 190, 255]);
/** Softer 4-step gradient for long-fur pets. */
export const softToonGradient = makeGradient([135, 175, 215, 255]);

export interface ToonOptions {
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  vertexColors?: boolean;
  soft?: boolean;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  /** Skip the curved-world patch (UI previews that are not in the world). */
  flat?: boolean;
  bend?: BendOptions;
}

/**
 * The one material factory for the whole game. Returns a MeshToonMaterial with the shared
 * gradient map and the curved-world bend already applied. Create materials once (module
 * scope or useMemo), never inline in JSX.
 */
export function toonMaterial(opts: ToonOptions = {}): THREE.MeshToonMaterial {
  const mat = new THREE.MeshToonMaterial({
    color: opts.color ?? 0xffffff,
    map: opts.map ?? null,
    vertexColors: opts.vertexColors ?? false,
    gradientMap: opts.soft ? softToonGradient : toonGradient,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
  });
  if (!opts.flat) bendMaterial(mat, opts.bend);
  return mat;
}

/** Cache for plain single-color toon materials, keyed by color and softness. */
const colorCache = new Map<string, THREE.MeshToonMaterial>();

export function toonColor(color: string, soft = false): THREE.MeshToonMaterial {
  const key = `${color}|${soft ? 1 : 0}`;
  let mat = colorCache.get(key);
  if (!mat) {
    mat = toonMaterial({ color, soft });
    colorCache.set(key, mat);
  }
  return mat;
}
