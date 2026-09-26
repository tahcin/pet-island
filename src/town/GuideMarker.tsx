import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { toonMaterial } from "../render/toon";
import { bendUniforms } from "../render/bend";
import { heightAt, type WorldData } from "../world/generateWorld";
import { waypoint } from "../game/runtime";
import { controlledBody } from "../game/interactions";
import { guideEls, updateGuide } from "./guide";

const GEM_MAT = toonMaterial({ color: "#ffcf3f", emissive: "#ffb020", emissiveIntensity: 0.35 });
const RING_MAT = toonMaterial({ color: "#fff8ea", transparent: true, opacity: 0.85 });
const GEM_GEO = new THREE.OctahedronGeometry(0.45, 0);
const POINT_GEO = new THREE.ConeGeometry(0.28, 0.6, 12);
POINT_GEO.rotateX(Math.PI);
const RING_GEO = new THREE.TorusGeometry(0.9, 0.08, 8, 32);
RING_GEO.rotateX(Math.PI / 2);

const tmp = new THREE.Vector3();

/** Bouncing waypoint above the guided target, plus the screen-edge arrow for the DOM layer. */
export default function GuideMarker({ world }: { world: WorldData }) {
  const group = useRef<THREE.Group>(null);
  const gem = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const hidden = useMemo(() => ({ arrow: true }), []);

  useFrame((s) => {
    updateGuide();
    const w = waypoint.current;
    const g = group.current;
    const arrow = guideEls.arrow;
    if (!g) return;
    if (!w) {
      g.visible = false;
      if (arrow && !hidden.arrow) {
        arrow.style.display = "none";
        hidden.arrow = true;
      }
      return;
    }
    const t = s.clock.elapsedTime;
    const y = heightAt(world.heightmap, w.x, w.z);
    g.visible = true;
    g.position.set(w.x, y, w.z);
    if (gem.current) {
      gem.current.position.y = 3.1 + Math.abs(Math.sin(t * 3)) * 0.6;
      gem.current.rotation.y = t * 2;
    }
    if (ring.current) ring.current.scale.setScalar(1 + (t % 1.2) * 0.4);

    // Screen-edge arrow when the target is off screen.
    if (!arrow) return;
    const b = controlledBody();
    const dist = Math.hypot(w.x - b.pos.x, w.z - b.pos.z);
    if (guideEls.dist) guideEls.dist.textContent = `${w.label}: ${Math.round(dist)} m`;
    // The curved world drops far points; project the lowered position (see bendDrop in Effects).
    tmp.set(w.x, y + 3 - bendDropAt(w.x, w.z), w.z).project(s.camera);
    const behind = tmp.z > 1;
    let sx = tmp.x;
    let sy = tmp.y;
    if (behind) {
      sx = -sx;
      sy = -sy;
    }
    const off = behind || Math.abs(sx) > 0.92 || Math.abs(sy) > 0.88;
    let rot = 0;
    if (off) {
      const m = Math.max(Math.abs(sx) / 0.88, Math.abs(sy) / 0.8, 1e-3);
      sx /= m;
      sy /= m;
      rot = Math.atan2(sx, sy);
    }
    const px = ((sx + 1) / 2) * s.size.width;
    const py = ((1 - sy) / 2) * s.size.height;
    arrow.style.display = "block";
    hidden.arrow = false;
    arrow.dataset.off = off ? "1" : "0";
    arrow.style.transform = `translate(${px}px, ${py}px)`;
    arrow.style.setProperty("--rot", `${rot}rad`);
  });

  return (
    <group ref={group} visible={false} name="guide-marker">
      <group ref={gem}>
        <mesh geometry={GEM_GEO} material={GEM_MAT} frustumCulled={false} castShadow />
        <mesh geometry={POINT_GEO} material={GEM_MAT} position={[0, -0.75, 0]} frustumCulled={false} />
      </group>
      <mesh ref={ring} geometry={RING_GEO} material={RING_MAT} position={[0, 0.08, 0]} frustumCulled={false} />
    </group>
  );
}

/** Curved-world drop at (x, z), matching bendDrop in src/game/Effects.tsx. */
function bendDropAt(x: number, z: number): number {
  const o = bendUniforms.uBendOrigin.value;
  const dx = x - o.x;
  const dz = z - o.z;
  return bendUniforms.uCurve.value * (dx * dx + dz * dz);
}
