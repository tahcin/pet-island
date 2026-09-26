import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { toonMaterial } from "../render/toon";
import { bendDepthMaterial } from "../render/bend";
import { buildTerrainGeometry, TERRAIN_COLORS } from "./terrainGeometry";
import { RES, SEA_FLOOR, gridX, gridZ } from "./heightmap";
import { RIVER_CLEARANCE } from "./river";
import { rampLocal } from "./ramps";
import type { WorldData } from "./generateWorld";

const terrainMaterial = toonMaterial({ vertexColors: true });
const seabedMaterial = toonMaterial({ color: TERRAIN_COLORS.seabed });
const seabedGeometry = (() => {
  const g = new THREE.PlaneGeometry(900, 900, 90, 90);
  g.rotateX(-Math.PI / 2);
  return g;
})();

export default function Terrain({ world }: { world: WorldData }) {
  const geometry = useMemo(() => {
    // Keep real heights on ramps and river banks so their slopes render truthfully.
    const keep = (k: number) => {
      if (world.river.distance[k] < RIVER_CLEARANCE + 1.5) return true;
      const x = gridX(k % RES);
      const z = gridZ(Math.floor(k / RES));
      return world.ramps.some((r) => {
        const { along, lateral } = rampLocal(r, x, z);
        return along > -0.3 && along < 1.3 && lateral < r.halfWidth + 1.6;
      });
    };
    return buildTerrainGeometry(world.heightmap, keep);
  }, [world]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group>
      <mesh
        name="terrain"
        geometry={geometry}
        material={terrainMaterial}
        receiveShadow
        castShadow
        frustumCulled={false}
        customDepthMaterial={bendDepthMaterial()}
      />
      <mesh
        name="seabed"
        geometry={seabedGeometry}
        material={seabedMaterial}
        position={[0, SEA_FLOOR - 0.05, 0]}
        frustumCulled={false}
      />
    </group>
  );
}
