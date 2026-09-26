import * as THREE from "three";

/**
 * Curved world (PRD section 8). Every material is patched through onBeforeCompile so the
 * horizon rolls away: worldPos.y -= uCurve * |worldPos.xz - origin.xz|^2.
 *
 * The origin is a uniform (the main camera position, updated each frame) rather than the
 * built-in cameraPosition, because the shadow pass renders from the light and would bend
 * around the wrong point. The same offset is applied to worldPosition so shadow lookups
 * on receivers match the bent shadow map. Gameplay math never sees the bend.
 */
export const bendUniforms = {
  uCurve: { value: 0.004 },
  uBendOrigin: { value: new THREE.Vector3() },
  uTime: { value: 0 },
};

export const BEND_CURVE_DEFAULT = 0.004;

const BEND_PARS = /* glsl */ `
uniform float uCurve;
uniform vec3 uBendOrigin;
uniform float uTime;
vec3 bendWorld(vec3 wp) {
  vec2 d = wp.xz - uBendOrigin.xz;
  wp.y -= uCurve * dot(d, d);
  return wp;
}
`;

// Replacement for <project_vertex>: same steps, with the bend applied in world space.
// mvPosition stays defined for the fog and shadow chunks that follow.
const PROJECT_BENT = /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
vec4 bentWorld = modelMatrix * mvPosition;
bentWorld.xyz = bendWorld( bentWorld.xyz );
mvPosition = viewMatrix * bentWorld;
gl_Position = projectionMatrix * mvPosition;
`;

const WORLDPOS_BENT = /* glsl */ `
#include <worldpos_vertex>
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
  worldPosition.xyz = bendWorld( worldPosition.xyz );
#endif
`;

export interface BendOptions {
  /** Extra vertex code run after <begin_vertex>, with `transformed` in local space (wind sway). */
  vertexHook?: string;
  /** Cache key suffix, required when vertexHook differs between materials. */
  key?: string;
}

type ShaderLike = Parameters<THREE.Material["onBeforeCompile"]>[0];

function patchShader(shader: ShaderLike, opts: BendOptions): void {
  Object.assign(shader.uniforms, bendUniforms);
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${BEND_PARS}`)
    .replace("#include <project_vertex>", PROJECT_BENT)
    .replace("#include <worldpos_vertex>", WORLDPOS_BENT);
  if (opts.vertexHook) {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\n${opts.vertexHook}`,
    );
  }
}

/** Patches a material in place with the curved world bend. Call once per material. */
export function bendMaterial<M extends THREE.Material>(material: M, opts: BendOptions = {}): M {
  const prev = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    patchShader(shader, opts);
  };
  const key = `bend:${opts.key ?? ""}`;
  material.customProgramCacheKey = () => key;
  material.userData.bent = true;
  return material;
}

const depthMaterials = new Map<string, THREE.MeshDepthMaterial>();

/** Shared shadow depth material with the same bend (and optional vertex hook). */
export function bendDepthMaterial(opts: BendOptions = {}): THREE.MeshDepthMaterial {
  const key = opts.key ?? "";
  let mat = depthMaterials.get(key);
  if (!mat) {
    mat = bendMaterial(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), opts);
    depthMaterials.set(key, mat);
  }
  return mat;
}

/**
 * Prepares every mesh under `root` for the bend: disables frustum culling (the bend moves
 * vertices outside their bounding sphere) and assigns the bent shadow depth material.
 * Materials themselves must already be bent (toon factory does this).
 */
export function applyBend(root: THREE.Object3D, opts: BendOptions = {}): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    mesh.customDepthMaterial = bendDepthMaterial(opts);
  });
}
