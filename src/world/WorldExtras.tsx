import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { collision } from "../control/movement";
import { toonMaterial } from "../render/toon";
import { bendDepthMaterial } from "../render/bend";
import { heightAt, type WorldData } from "./generateWorld";
import { buildCollide, propColliders } from "./collision";
import { DOOR_COLOR, HOUSE_PARTS, ROOF_COLORS, TRIM_COLOR, WALL_COLOR, WINDOW_COLOR, houseColliders, houseYaw } from "./house";
import Props from "./Props";

const HOUSE_MATS = {
  walls: toonMaterial({ color: WALL_COLOR }),
  roof: toonMaterial({ color: "#ffffff" }),
  door: toonMaterial({ color: DOOR_COLOR }),
  windows: toonMaterial({ color: WINDOW_COLOR }),
  trim: toonMaterial({ color: TRIM_COLOR }),
};
const HOUSE_KEYS = ["walls", "roof", "door", "windows", "trim"] as const;

function Houses({ world }: { world: WorldData }) {
  const meshes = useMemo(() => {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    const color = new THREE.Color();
    return HOUSE_KEYS.map((k) => {
      const mesh = new THREE.InstancedMesh(HOUSE_PARTS[k], HOUSE_MATS[k], Math.max(1, world.homes.length));
      mesh.count = world.homes.length;
      mesh.name = `house-${k}`;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.customDepthMaterial = bendDepthMaterial();
      world.homes.forEach((h, i) => {
        q.setFromAxisAngle(up, houseYaw(h.x, h.z));
        m4.compose(new THREE.Vector3(h.x, heightAt(world.heightmap, h.x, h.z) - 0.02, h.z), q, one);
        mesh.setMatrixAt(i, m4);
        if (k === "roof") mesh.setColorAt(i, color.set(ROOF_COLORS[i % ROOF_COLORS.length]));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      return mesh;
    });
  }, [world]);
  useEffect(() => () => meshes.forEach((m) => m.dispose()), [meshes]);
  return (
    <group name="houses">
      {meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </group>
  );
}

/** M4 world extras: instanced props, villager cottages, and scenery collision. */
export default function WorldExtras({ world }: { world: WorldData }) {
  useEffect(() => {
    const colliders = propColliders(world.props).concat(houseColliders(world.homes, (x, z) => heightAt(world.heightmap, x, z)));
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
    </group>
  );
}
