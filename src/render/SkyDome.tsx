import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { dayClock, isShot } from "../juice/dayCycle";

export const SKY_COLOR = "#cfeaff";
export const SKY_TOP = "#8ccbf5";

const skyMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTop: { value: new THREE.Color(SKY_TOP) },
    uHorizon: { value: new THREE.Color(SKY_COLOR) },
    uSun: { value: new THREE.Color("#fff4dc") },
    uSunDir: { value: new THREE.Vector3(28, 55, 22).normalize() },
  },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uTop;
    uniform vec3 uHorizon;
    uniform vec3 uSun;
    uniform vec3 uSunDir;
    varying vec3 vDir;
    void main() {
      vec3 dir = normalize(vDir);
      float t = smoothstep(0.0, 0.55, dir.y);
      vec3 col = mix(uHorizon, uTop, t);
      // Soft milky haze hugging the horizon.
      float haze = 1.0 - smoothstep(-0.02, 0.16, abs(dir.y - 0.02));
      col = mix(col, mix(uHorizon, vec3(1.0), 0.35), haze * 0.45);
      // Gentle sun glow: a wide warm bloom and a soft brighter core, no hard disc.
      float s = max(dot(dir, normalize(uSunDir)), 0.0);
      col += uSun * (pow(s, 6.0) * 0.16 + pow(s, 48.0) * 0.28 + smoothstep(0.9975, 0.999, s) * 0.25);
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }
  `,
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
});

const skyGeometry = new THREE.SphereGeometry(450, 32, 16);
const uTop = skyMaterial.uniforms.uTop.value as THREE.Color;
const uHorizon = skyMaterial.uniforms.uHorizon.value as THREE.Color;
const uSun = skyMaterial.uniforms.uSun.value as THREE.Color;
const uSunDir = skyMaterial.uniforms.uSunDir.value as THREE.Vector3;
const SHOT_SUN = new THREE.Vector3(28, 55, 22).normalize();

/**
 * Two-color gradient sky that follows the camera (PRD section 8: no HDRI). Its colors track
 * the day clock, which Lights advances earlier in the same frame.
 */
export default function SkyDome() {
  const ref = useRef<THREE.Mesh>(null);
  const shot = useMemo(() => isShot(), []);
  useFrame(({ camera }) => {
    ref.current?.position.copy(camera.position);
    uTop.copy(dayClock.look.skyTop);
    uHorizon.copy(dayClock.look.horizon);
    uSun.copy(dayClock.look.sun);
    uSunDir.copy(shot ? SHOT_SUN : dayClock.look.sunDir);
  });
  return (
    <mesh ref={ref} geometry={skyGeometry} material={skyMaterial} renderOrder={-10} frustumCulled={false} />
  );
}
