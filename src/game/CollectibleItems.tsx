import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { toonMaterial } from "../render/toon";
import { useGame, type ItemKind } from "../store";
import { heightAt, type WorldData } from "../world/generateWorld";
import { isGoodSpot, placeCollectibles, speciesItem } from "./collectibles";
import { on } from "./events";
import { collectibles, runtime, type CollectibleRuntime } from "./runtime";
import { collectItem, controlledBody, pickupListeners, WALK_PICK_RANGE } from "./interactions";
import { spawnPuff } from "./Effects";

// ---------- Shared geometry and materials (created once) ----------

const MAT = {
  bone: toonMaterial({ color: "#fff4dc" }),
  yarn: toonMaterial({ color: "#f29ab0" }),
  yarnWrap: toonMaterial({ color: "#e0708f" }),
  carrot: toonMaterial({ color: "#ff9a4a" }),
  leaf: toonMaterial({ color: "#6bc45f" }),
  shell: toonMaterial({ color: "#ffd9c8" }),
  shellRib: toonMaterial({ color: "#f5b8a6" }),
  sparkle: new THREE.MeshBasicMaterial({ color: "#fffbe0", transparent: true, opacity: 0.9, depthWrite: false }),
};

const GEO = {
  boneShaft: new THREE.CapsuleGeometry(0.06, 0.32, 4, 10),
  boneKnob: new THREE.SphereGeometry(0.075, 12, 10),
  yarn: new THREE.SphereGeometry(0.17, 16, 12),
  yarnWrap: new THREE.TorusGeometry(0.17, 0.018, 6, 24),
  carrot: new THREE.ConeGeometry(0.09, 0.4, 12),
  leaf: new THREE.ConeGeometry(0.03, 0.16, 6),
  shell: new THREE.SphereGeometry(0.17, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  shellRib: new THREE.TorusGeometry(0.12, 0.012, 5, 16, Math.PI),
  sparkle: new THREE.OctahedronGeometry(0.045, 0),
};

function Bone() {
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      <mesh geometry={GEO.boneShaft} material={MAT.bone} castShadow />
      {[
        [0.05, 0.22],
        [-0.05, 0.22],
        [0.05, -0.22],
        [-0.05, -0.22],
      ].map(([x, y], i) => (
        <mesh key={i} geometry={GEO.boneKnob} material={MAT.bone} position={[x, y, 0]} castShadow />
      ))}
    </group>
  );
}

function Yarn() {
  return (
    <group>
      <mesh geometry={GEO.yarn} material={MAT.yarn} castShadow />
      <mesh geometry={GEO.yarnWrap} material={MAT.yarnWrap} rotation={[0.4, 0, 0.2]} />
      <mesh geometry={GEO.yarnWrap} material={MAT.yarnWrap} rotation={[1.5, 0.6, 0]} />
      <mesh geometry={GEO.yarnWrap} material={MAT.yarnWrap} rotation={[0.9, -0.8, 1.2]} />
    </group>
  );
}

function Carrot() {
  return (
    <group rotation={[0, 0, 0.5]}>
      <mesh geometry={GEO.carrot} material={MAT.carrot} rotation={[Math.PI, 0, 0]} castShadow />
      {[-0.4, 0, 0.4].map((r, i) => (
        <mesh key={i} geometry={GEO.leaf} material={MAT.leaf} position={[Math.sin(r) * 0.03, 0.26, 0]} rotation={[0, 0, r]} />
      ))}
    </group>
  );
}

function Shell() {
  return (
    <group scale={[1, 0.55, 1.1]}>
      <mesh geometry={GEO.shell} material={MAT.shell} castShadow />
      {[-0.6, -0.2, 0.2, 0.6].map((r, i) => (
        <mesh key={i} geometry={GEO.shellRib} material={MAT.shellRib} rotation={[0, r + Math.PI / 2, 0]} scale={1.35} />
      ))}
    </group>
  );
}

const MODEL: Record<ItemKind, () => React.JSX.Element> = { bone: Bone, yarn: Yarn, carrot: Carrot, shell: Shell };

// ---------- One collectible ----------

interface Anim {
  /** Pickup tween time (s), -1 when not flying. */
  fly: number;
  /** Pop out of the ground for dug items (s since spawn). */
  pop: number;
}

function Item({ c, world, phase }: { c: CollectibleRuntime; world: WorldData; phase: number }) {
  const group = useRef<THREE.Group>(null);
  const sparkle = useRef<THREE.Mesh>(null);
  const anim = useRef<Anim>({ fly: -1, pop: c.id.includes("-dug-") ? 0 : 99 });
  const ground = useMemo(() => heightAt(world.heightmap, c.x, c.z), [world, c]);
  const Model = MODEL[c.kind];

  useEffect(() => {
    const fn = (hit: CollectibleRuntime) => {
      if (hit === c) anim.current.fly = 0;
    };
    pickupListeners.add(fn);
    return () => {
      pickupListeners.delete(fn);
    };
  }, [c]);

  useFrame((s, dt) => {
    const g = group.current;
    if (!g) return;
    const t = s.clock.elapsedTime + phase;
    const a = anim.current;
    if (c.taken && a.fly < 0) {
      g.visible = false;
      return;
    }
    let y = ground + 0.35 + Math.sin(t * 2.2) * 0.07;
    let scale = 1;
    if (a.pop < 0.6) {
      a.pop += dt;
      const k = Math.min(1, a.pop / 0.6);
      y = ground + 0.35 + Math.sin(k * Math.PI) * 0.7 - (1 - k) * 0.35;
      scale = 0.3 + 0.7 * k;
    }
    if (a.fly >= 0) {
      a.fly += dt;
      const k = Math.min(1, a.fly / 0.5);
      y += k * 1.6 - k * k * 0.2;
      scale = Math.max(0.01, 1 + 0.4 * Math.sin(k * Math.PI) - k);
      if (k >= 1) {
        a.fly = -1;
        g.visible = false;
        return;
      }
    }
    g.visible = true;
    g.position.set(c.x, y, c.z);
    g.rotation.y = t * 1.1;
    g.scale.setScalar(scale);
    const sp = sparkle.current;
    if (sp) {
      const k = (t * 0.7) % 1;
      sp.position.set(Math.cos(t * 3) * 0.25, 0.1 + k * 0.35, Math.sin(t * 3) * 0.25);
      sp.scale.setScalar(Math.sin(k * Math.PI) * 1.2);
      sp.rotation.y = t * 4;
    }

    // Walk-over pickup by the controlled character.
    if (!c.taken && a.pop >= 0.6) {
      const b = controlledBody();
      if (Math.hypot(b.pos.x - c.x, b.pos.z - c.z) < WALK_PICK_RANGE + b.radius * 0.5) {
        const i = collectibles.indexOf(c);
        if (i >= 0) collectItem(i);
      }
    }
  });

  return (
    <group ref={group} position={[c.x, ground + 0.35, c.z]} name={`collectible-${c.id}`}>
      <Model />
      <mesh ref={sparkle} geometry={GEO.sparkle} material={MAT.sparkle} />
    </group>
  );
}

/** Seeded collectibles plus dug-up treasure (PRD F11 and 9.4). */
export default function Collectibles({ world }: { world: WorldData }) {
  const species = useGame((s) => s.reading.spec.species);
  const [items, setItems] = useState<CollectibleRuntime[]>([]);

  useEffect(() => {
    const collected = new Set(useGame.getState().collected);
    const list = placeCollectibles(world, species).map((c) => ({ ...c, taken: collected.has(c.id) }));
    collectibles.length = 0;
    collectibles.push(...list);
    setItems([...collectibles]);
    let dug = 0;
    const off = on("dug", (spot) => {
      if (Math.random() >= 0.3) return;
      // Pop the treasure out just ahead of the digger so it is not grabbed instantly.
      const dx = spot.x - runtime.pet.pos.x;
      const dz = spot.z - runtime.pet.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      let x = spot.x + (dx / d) * 0.9;
      let z = spot.z + (dz / d) * 0.9;
      if (!isGoodSpot(world, x, z)) {
        x = spot.x;
        z = spot.z;
      }
      const c: CollectibleRuntime = { id: `${speciesItem(species)}-${world.seed}-dug-${Date.now()}-${dug++}`, kind: speciesItem(species), x, z, taken: false };
      collectibles.push(c);
      spawnPuff(x, heightAt(world.heightmap, x, z), z);
      setItems([...collectibles]);
    });
    return () => {
      off();
      collectibles.length = 0;
    };
  }, [world, species]);

  return (
    <>
      {items.map((c, i) => (
        <Item key={c.id} c={c} world={world} phase={i * 0.73} />
      ))}
    </>
  );
}
