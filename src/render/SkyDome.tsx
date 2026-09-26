import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export const SKY_COLOR = "#cfeaff";
export const SKY_TOP = "#8ccbf5";

const skyMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTop: { value: new THREE.Color(SKY_TOP) },
    uHorizon: { value: new THREE.Color(SKY_COLOR) },
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
    varying vec3 vDir;
    void main() {
      float t = smoothstep(0.0, 0.55, vDir.y);
      gl_FragColor = vec4(mix(uHorizon, uTop, t), 1.0);
      #include <colorspace_fragment>
    }
  `,
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
});

const skyGeometry = new THREE.SphereGeometry(450, 32, 16);

/** Two-color gradient sky that follows the camera (PRD section 8: no HDRI). */
export default function SkyDome() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => {
    ref.current?.position.copy(camera.position);
  });
  return (
    <mesh ref={ref} geometry={skyGeometry} material={skyMaterial} renderOrder={-10} frustumCulled={false} />
  );
}
