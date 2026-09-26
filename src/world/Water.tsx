import * as THREE from "three";
import { toonMaterial } from "../render/toon";

const waterMaterial = toonMaterial({ color: "#7ed3e6", transparent: true, opacity: 0.85 });
waterMaterial.depthWrite = false;

// Subdivided so the curved-world bend has vertices to move.
const waterGeometry = (() => {
  const g = new THREE.PlaneGeometry(900, 900, 150, 150);
  g.rotateX(-Math.PI / 2);
  return g;
})();

export default function Water() {
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
