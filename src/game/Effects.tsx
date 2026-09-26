import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { bendUniforms } from "../render/bend";
import { toonMaterial } from "../render/toon";
import type { Glyph } from "../pet/petBrain";

/** Apply the curved-world drop to an unbent object (sprites) at world position p. */
function bendDrop(p: THREE.Vector3): number {
  const o = bendUniforms.uBendOrigin.value;
  const dx = p.x - o.x;
  const dz = p.z - o.z;
  return bendUniforms.uCurve.value * (dx * dx + dz * dz);
}

// ---------- Mood glyphs ----------

const GLYPH_TEXT: Record<Glyph, string> = { heart: "♥", "!": "!", "?": "?", note: "♪", z: "z", star: "★" };
const GLYPH_COLOR: Record<Glyph, string> = {
  heart: "#ff7a90",
  "!": "#f2a33a",
  "?": "#7aa7e8",
  note: "#9a7ae0",
  z: "#7aa7e8",
  star: "#f2c23a",
};

const glyphTextures = new Map<Glyph, THREE.CanvasTexture>();
function glyphTexture(g: Glyph): THREE.CanvasTexture {
  let tex = glyphTextures.get(g);
  if (tex) return tex;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff8ea";
  ctx.beginPath();
  ctx.arc(64, 60, 48, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(52, 100);
  ctx.lineTo(64, 122);
  ctx.lineTo(76, 100);
  ctx.fill();
  ctx.fillStyle = GLYPH_COLOR[g];
  ctx.font = "700 64px Fredoka, Nunito, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(GLYPH_TEXT[g], 64, 64);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  glyphTextures.set(g, tex);
  return tex;
}

const glyphQueue: { glyph: Glyph; at: number }[] = [];

/** Pops a glyph above the pet for 2.2 s. Safe to call from anywhere. */
export function showGlyph(glyph: Glyph): void {
  glyphQueue.push({ glyph, at: performance.now() });
}

/** One sprite that shows the latest glyph above whatever `getAnchor` returns. */
export function GlyphSprite({ getAnchor }: { getAnchor: () => THREE.Vector3 }) {
  const sprite = useRef<THREE.Sprite>(null);
  const material = useMemo(() => new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false }), []);
  const state = useRef({ life: 0 });
  const pos = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const s = sprite.current;
    if (!s) return;
    const next = glyphQueue.pop();
    glyphQueue.length = 0;
    if (next) {
      material.map = glyphTexture(next.glyph);
      material.needsUpdate = true;
      state.current.life = 2.2;
    }
    state.current.life -= dt;
    const life = state.current.life;
    s.visible = life > 0;
    if (!s.visible) return;
    const age = 2.2 - life;
    // 150 ms scale-in with a little overshoot, then fade out over the last 0.3 s.
    const pop = age < 0.15 ? (age / 0.15) * 1.15 : age < 0.25 ? 1.15 - ((age - 0.15) / 0.1) * 0.15 : 1;
    s.scale.setScalar(0.55 * pop);
    material.opacity = Math.min(1, life / 0.3);
    pos.copy(getAnchor());
    pos.y += Math.sin(age * 4) * 0.03 - bendDrop(pos);
    s.position.copy(pos);
  });
  return <sprite ref={sprite} material={material} visible={false} renderOrder={5} />;
}

// ---------- Dust puffs ----------

const PUFFS = 14;
const puffGeo = new THREE.SphereGeometry(0.12, 10, 8);
const puffQueue: THREE.Vector3[] = [];

/** A small dust puff at a world position (digging, landing). */
export function spawnPuff(x: number, y: number, z: number): void {
  puffQueue.push(new THREE.Vector3(x, y, z));
}

export function Puffs() {
  const parts = useMemo(
    () =>
      Array.from({ length: PUFFS }, () => {
        const mat = toonMaterial({ color: "#f3e3c3", transparent: true, opacity: 0.9 });
        mat.depthWrite = false;
        const mesh = new THREE.Mesh(puffGeo, mat);
        mesh.visible = false;
        mesh.frustumCulled = false;
        return { mesh, mat, life: 0, vel: new THREE.Vector3() };
      }),
    [],
  );
  const group = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    while (puffQueue.length) {
      const at = puffQueue.shift()!;
      for (let i = 0; i < 6; i++) {
        const p = parts.find((q) => q.life <= 0);
        if (!p) break;
        const a = Math.random() * Math.PI * 2;
        p.mesh.position.set(at.x + Math.cos(a) * 0.15, at.y + 0.08, at.z + Math.sin(a) * 0.15);
        p.vel.set(Math.cos(a) * 0.9, 0.7 + Math.random() * 0.5, Math.sin(a) * 0.9);
        p.life = 0.6;
        p.mesh.visible = true;
      }
    }
    for (const p of parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vel.multiplyScalar(1 - 3 * dt);
      p.mesh.position.addScaledVector(p.vel, dt);
      const k = 1 - p.life / 0.6;
      p.mesh.scale.setScalar(0.6 + k * 1.2);
      p.mat.opacity = 0.9 * (1 - k);
      if (p.life <= 0) p.mesh.visible = false;
    }
  });
  return (
    <group ref={group}>
      {parts.map((p, i) => (
        <primitive key={i} object={p.mesh} />
      ))}
    </group>
  );
}
