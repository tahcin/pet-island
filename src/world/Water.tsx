import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { toonMaterial } from "../render/toon";
import { HALF, RES, WORLD_SIZE } from "./heightmap";
import type { WorldData } from "./generateWorld";

// Gentle rolling swell in world space (the plane's local XZ is world XZ). Bases stay near y = 0.
const WAVE_VERTEX = /* glsl */ `
  float wA = sin(transformed.x * 0.23 + uTime * 1.1) * 0.07;
  float wB = sin(transformed.z * 0.19 - uTime * 0.9) * 0.06;
  float wC = sin((transformed.x - transformed.z) * 0.41 + uTime * 1.7) * 0.03;
  transformed.y += wA + wB + wC;
  vWaterXZ = transformed.xz;
`;

const WAVE_PARS_VERTEX = /* glsl */ `
varying vec2 vWaterXZ;
`;

const WAVE_PARS_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform sampler2D uTerrain;
varying vec2 vWaterXZ;
`;

// AC-style water: deeper tint away from shore, drifting white highlight squiggles, and a
// foam band that breathes along every shoreline (from the terrain height texture).
const WAVE_FRAGMENT = /* glsl */ `
  vec2 tuv = (vWaterXZ + ${HALF.toFixed(1)}) / ${WORLD_SIZE.toFixed(1)};
  float inside = step(0.0, tuv.x) * step(tuv.x, 1.0) * step(0.0, tuv.y) * step(tuv.y, 1.0);
  float ground = mix(-2.5, texture2D(uTerrain, clamp(tuv, 0.0, 1.0)).r, inside);
  float depth = max(0.0, -ground);
  // Shallow water is lighter and more turquoise.
  vec3 shallow = vec3(0.62, 0.93, 0.93);
  diffuseColor.rgb = mix(shallow, diffuseColor.rgb, smoothstep(0.05, 1.6, depth));
  // Shoreline foam that swells in and out.
  float swell = 0.18 + 0.1 * sin(uTime * 1.6 + vWaterXZ.x * 0.15 + vWaterXZ.y * 0.12);
  float foam = 1.0 - smoothstep(swell * 0.6, swell, depth);
  foam *= step(0.001, inside);
  // Drifting highlight squiggles.
  float s1 = sin(vWaterXZ.x * 0.55 + sin(vWaterXZ.y * 0.35 + uTime * 0.6) * 1.8 + uTime * 0.8);
  float s2 = sin(vWaterXZ.y * 0.62 + sin(vWaterXZ.x * 0.3 - uTime * 0.5) * 1.6 - uTime * 0.7);
  float glint = smoothstep(0.965, 0.995, s1 * s2) * smoothstep(0.3, 1.2, depth);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.99, 0.96), max(foam * 0.9, glint * 0.75));
  diffuseColor.a = mix(diffuseColor.a, 1.0, foam * 0.8);
`;

/** Height texture of the terrain so the water shader knows where the shore is. */
function terrainTexture(world: WorldData): THREE.DataTexture {
  const tex = new THREE.DataTexture(Float32Array.from(world.heightmap.heights), RES, RES, THREE.RedFormat, THREE.FloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

const terrainUniform = { value: null as THREE.DataTexture | null };

const waterMaterial = toonMaterial({
  color: "#6fc6e0",
  transparent: true,
  opacity: 0.86,
  bend: { vertexHook: WAVE_VERTEX, key: "water" },
});
waterMaterial.depthWrite = false;
{
  // Chain after the bend patch: add the varying, the terrain sampler, and the color pass.
  const bent = waterMaterial.onBeforeCompile.bind(waterMaterial);
  waterMaterial.onBeforeCompile = (shader, renderer) => {
    bent(shader, renderer);
    shader.uniforms.uTerrain = terrainUniform;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${WAVE_PARS_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${WAVE_PARS_FRAGMENT}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${WAVE_FRAGMENT}`);
  };
}

// Finer subdivision near the island so the swell reads; the bend also needs the vertices.
const waterGeometry = (() => {
  const g = new THREE.PlaneGeometry(900, 900, 360, 360);
  g.rotateX(-Math.PI / 2);
  return g;
})();

export default function Water({ world }: { world: WorldData }) {
  const tex = useMemo(() => terrainTexture(world), [world]);
  useEffect(() => {
    terrainUniform.value = tex;
    return () => tex.dispose();
  }, [tex]);
  terrainUniform.value = tex;
  return (
    <mesh
      name="water"
      geometry={waterGeometry}
      material={waterMaterial}
      position={[0, 0.02, 0]}
      receiveShadow
      frustumCulled={false}
      renderOrder={1}
    />
  );
}
