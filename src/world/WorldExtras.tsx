import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { collision } from "../control/movement";
import { heightAt, type WorldData } from "./generateWorld";
import { buildCollide, propColliders } from "./collision";
import { createHouses, houseColliders } from "./house";
import Props from "./Props";
import Town, { townColliders } from "../town/Town";

function Houses({ world }: { world: WorldData }) {
  // Seeded cottage variants (roof shapes, colors, greenery), instanced: at most 12 draw calls.
  const group = useMemo(
    () => createHouses(world.homes, (x, z) => heightAt(world.heightmap, x, z) - 0.02, { seed: world.seed }),
    [world],
  );
  useEffect(
    () => () =>
      group.traverse((o) => {
        const m = o as THREE.InstancedMesh;
        if (m.isInstancedMesh) m.dispose();
      }),
    [group],
  );
  return <primitive object={group} />;
}

/** M4 world extras: instanced props, villager cottages, and scenery collision. */
export default function WorldExtras({ world }: { world: WorldData }) {
  useEffect(() => {
    const colliders = propColliders(world.props).concat(houseColliders(world.homes, (x, z) => heightAt(world.heightmap, x, z)), townColliders(world));
    const fn = buildCollide(colliders);
    collision.fn = fn;
    return () => {
      if (collision.fn === fn) collision.fn = null;
    };
  }, [world]);

  return (
    <group name="world-extras">
      <Props world={world} />
      <Houses world={world} />
      <Town world={world} />
    </group>
  );
}
