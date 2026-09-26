import { useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "../store";
import type { WorldData } from "../world/generateWorld";
import { HALF, WORLD_SIZE, heightAt, levelOfHeight } from "../world/heightmap";
import { collectibles, runtime, villagers, waypoint } from "../game/runtime";
import "./minimap.css";

/** Base map resolution in pixels (2 px per meter). */
const BASE_RES = 320;
/** Live layer redraw interval in ms (about 10 per second). */
const TICK_MS = 100;

const WATER = "#7ed3e6";
const WATER_DEEP = "#6fc8de";
const SAND = "#f4e2b8";
const GRASS = ["#8fd17a", "#7cc46a", "#6bb85f"];
const VILLAGER_COLORS = ["#f7a9c4", "#9ec9ff", "#ffd36e"];
const PET_COLORS: Record<string, string> = { dog: "#ffb488", cat: "#c4a8f2", rabbit: "#8fe0b0" };
const MASCOT_COLOR = "#d97757";

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Renders the static island (terrain, river, cliffs, homes) once per world. */
function renderBase(world: WorldData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = BASE_RES;
  canvas.height = BASE_RES;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const hm = world.heightmap;
  const px = WORLD_SIZE / BASE_RES;
  const levels = new Int8Array(BASE_RES * BASE_RES);
  const depth = new Float32Array(BASE_RES * BASE_RES);
  for (let j = 0; j < BASE_RES; j++) {
    for (let i = 0; i < BASE_RES; i++) {
      const h = heightAt(hm, -HALF + (i + 0.5) * px, -HALF + (j + 0.5) * px);
      levels[j * BASE_RES + i] = levelOfHeight(h);
      depth[j * BASE_RES + i] = h;
    }
  }
  const img = ctx.createImageData(BASE_RES, BASE_RES);
  const water = hexToRgb(WATER);
  const deep = hexToRgb(WATER_DEEP);
  const sand = hexToRgb(SAND);
  const grass = GRASS.map(hexToRgb);
  const cliff: RGB = [84, 128, 72];
  const shore: RGB = [240, 252, 252];
  for (let j = 0; j < BASE_RES; j++) {
    for (let i = 0; i < BASE_RES; i++) {
      const k = j * BASE_RES + i;
      const lv = levels[k];
      let c: RGB;
      if (lv < 0) c = depth[k] < -1.2 ? deep : water;
      else if (lv === 0) c = sand;
      else c = grass[lv - 1];
      // Soft outline where a higher terrace meets this pixel, and a foam line at the shore.
      let edge = 0;
      for (const [di, dj] of NEIGHBORS) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= BASE_RES || nj >= BASE_RES) continue;
        const nl = levels[nj * BASE_RES + ni];
        if (lv >= 1 && nl > lv) edge = 2;
        else if (lv < 0 && nl >= 0 && edge === 0) edge = 1;
      }
      if (edge === 2) c = mix(c, cliff, 0.5);
      else if (edge === 1) c = mix(c, shore, 0.6);
      img.data[k * 4] = c[0];
      img.data[k * 4 + 1] = c[1];
      img.data[k * 4 + 2] = c[2];
      img.data[k * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const s = BASE_RES / WORLD_SIZE;
  const toMap = (x: number, z: number): [number, number] => [(x + HALF) * s, (z + HALF) * s];
  // River as a soft stroke over the carved channel.
  const pts = world.river.points;
  if (pts.length > 1) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = WATER;
    ctx.lineWidth = 2.6 * s;
    ctx.beginPath();
    pts.forEach(([x, z], n) => {
      const [mx, my] = toMap(x, z);
      if (n === 0) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    });
    ctx.stroke();
  }
  // Homes: little cream houses with a coral roof.
  for (const home of world.homes) {
    const [mx, my] = toMap(home.x, home.z);
    ctx.fillStyle = "#fff8ea";
    ctx.strokeStyle = "#8a7260";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.roundRect(mx - 5, my - 2, 10, 8, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e9967a";
    ctx.beginPath();
    ctx.moveTo(mx - 7, my - 1);
    ctx.lineTo(mx, my - 8);
    ctx.lineTo(mx + 7, my - 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  return canvas;
}

interface Palette {
  pet: string;
}

function drawLive(
  ctx: CanvasRenderingContext2D,
  base: HTMLCanvasElement,
  size: number,
  expanded: boolean,
  pal: Palette,
  time: number,
): void {
  const { quests, mode } = useGame.getState();
  const s = size / WORLD_SIZE;
  const toMap = (x: number, z: number): [number, number] => [(x + HALF) * s, (z + HALF) * s];
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(base, 0, 0, size, size);
  const k = expanded ? 1.6 : 1;

  // Collectibles: tiny cream dots.
  for (const c of collectibles) {
    if (c.taken) continue;
    const [mx, my] = toMap(c.x, c.z);
    ctx.fillStyle = "#fffdf5";
    ctx.strokeStyle = "rgba(91, 70, 54, 0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(mx, my, 2 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Journal "Guide me" waypoint: a pulsing gold star.
  const wp = waypoint.current;
  if (wp) {
    const [wx, wy] = toMap(wp.x, wp.z);
    const R = 7 * k * (1 + 0.18 * Math.sin(time * 5));
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? R : R * 0.45;
      ctx.lineTo(wx + Math.cos(a) * rr, wy + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = "#ffd257";
    ctx.strokeStyle = "#8a5a1e";
    ctx.lineWidth = 1.4;
    ctx.fill();
    ctx.stroke();
  }

  // Villagers: colored dots with initials, a pulsing "!" badge while a quest is active.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const v of villagers) {
    const [mx, my] = toMap(v.body.pos.x, v.body.pos.z);
    const r = 6 * k;
    ctx.fillStyle = VILLAGER_COLORS[v.index % VILLAGER_COLORS.length];
    ctx.strokeStyle = "#fff8ea";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#5b4636";
    ctx.font = `700 ${Math.round(8 * k)}px Fredoka, Nunito, sans-serif`;
    ctx.fillText(v.name.charAt(0).toUpperCase(), mx, my + 0.5);
    if (quests[v.index] === "active") {
      const bx = mx + r * 0.95;
      const by = my - r * 0.95;
      const pulse = 1 + 0.12 * Math.sin(time / 180);
      ctx.fillStyle = "#ffcf3f";
      ctx.strokeStyle = "#fff8ea";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(bx, by, 4.5 * k * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#5b4636";
      ctx.font = `800 ${Math.round(7 * k)}px Fredoka, Nunito, sans-serif`;
      ctx.fillText("!", bx, by + 0.5);
    }
    if (expanded) {
      ctx.font = "600 13px Fredoka, Nunito, sans-serif";
      const w = ctx.measureText(v.name).width + 14;
      const lx = mx + r + 5;
      ctx.fillStyle = "rgba(255, 248, 234, 0.94)";
      ctx.beginPath();
      ctx.roundRect(lx, my - 10, w, 20, 10);
      ctx.fill();
      ctx.fillStyle = "#5b4636";
      ctx.textAlign = "left";
      ctx.fillText(v.name, lx + 7, my + 0.5);
      ctx.textAlign = "center";
    }
  }

  // Pet dot, ringed while the player controls it.
  {
    const p = runtime.pet.pos;
    const [mx, my] = toMap(p.x, p.z);
    if (mode === "pet") {
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.beginPath();
      ctx.arc(mx, my, (9 + 2 * Math.sin(time / 200)) * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = pal.pet;
    ctx.strokeStyle = "#5b4636";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(mx, my, 4.5 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Player arrow along its yaw: forward is (sin yaw, cos yaw); +X is right, +Z is down.
  {
    const a = runtime.avatar;
    const [mx, my] = toMap(a.pos.x, a.pos.z);
    const fx = Math.sin(a.yaw);
    const fz = Math.cos(a.yaw);
    const L = 8 * k;
    const W = 5.5 * k;
    if (mode === "companion") {
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.beginPath();
      ctx.arc(mx, my, (11 + 2 * Math.sin(time / 200)) * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#5b4636";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(mx + fx * L, my + fz * L);
    ctx.lineTo(mx - fx * L * 0.6 + fz * W, my - fz * L * 0.6 - fx * W);
    ctx.lineTo(mx - fx * L * 0.25, my - fz * L * 0.25);
    ctx.lineTo(mx - fx * L * 0.6 - fz * W, my - fz * L * 0.6 + fx * W);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

export default function Minimap({ world }: { world: WorldData }) {
  const [expanded, setExpanded] = useState(false);
  const reading = useGame((s) => s.reading);
  const mode = useGame((s) => s.mode);
  const quests = useGame((s) => s.quests);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const base = useMemo(() => renderBase(world), [world]);
  const petColor =
    reading.spec.mascot === "claude" ? MASCOT_COLOR : (PET_COLORS[reading.spec.species] ?? PET_COLORS.rabbit);
  const petName = reading.nameSuggestions[0] ?? "Pet";
  const palRef = useRef<Palette>({ pet: petColor });
  palRef.current = { pet: petColor };

  // M toggles, Esc closes. Ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      if (t instanceof HTMLElement && t.isContentEditable) return;
      if (e.code === "KeyM" && !e.repeat) setExpanded((x) => !x);
      else if (e.code === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Live layer: throttled rAF redraw, no React state per frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = -Infinity;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < TICK_MS) return;
      last = t;
      const css = canvas.clientWidth;
      if (css <= 0) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const px = Math.round(css * dpr);
      if (canvas.width !== px) {
        canvas.width = px;
        canvas.height = px;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawLive(ctx, base, css, expanded, palRef.current, t);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [base, expanded]);

  return (
    <div className={`minimap-root${expanded ? " is-expanded" : ""}`} data-no-orbit data-testid="minimap-root">
      {expanded && <div className="minimap-backdrop" data-testid="minimap-backdrop" onClick={() => setExpanded(false)} />}
      <div
        className={`minimap ${expanded ? "minimap-expanded panel" : "minimap-compact"}`}
        data-testid={expanded ? "minimap-expanded" : "minimap"}
        onClick={() => {
          if (!expanded) setExpanded(true);
        }}
        title={expanded ? undefined : "Map (M)"}
      >
        {expanded && (
          <div className="minimap-head">
            <span className="minimap-title title">{reading.islandName}</span>
            <button
              type="button"
              className="minimap-close"
              data-testid="minimap-close"
              aria-label="Close map"
              onClick={() => setExpanded(false)}
            >
              Close
            </button>
          </div>
        )}
        <div className="minimap-body">
          <div className="minimap-frame">
            <canvas ref={canvasRef} className="minimap-canvas" />
            <span className="minimap-north">N</span>
          </div>
          {expanded && (
            <ul className="minimap-legend" data-testid="minimap-legend">
              <li>
                <svg className="mm-you" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M10 2 L17 17 L10 13 L3 17 Z" fill="#fff" stroke="#5b4636" strokeWidth="1.8" strokeLinejoin="round" />
                </svg>
                {mode === "companion" ? "You (playing)" : "You"}
              </li>
              <li>
                <span className="mm-key" style={{ background: petColor }} />
                {mode === "pet" ? `${petName} (playing)` : petName}
              </li>
              {reading.villagers.map((v, i) => (
                <li key={`${v.name}-${i}`}>
                  <span
                    className="mm-key mm-villager"
                    style={{ background: VILLAGER_COLORS[i % VILLAGER_COLORS.length] }}
                  >
                    {v.name.charAt(0).toUpperCase()}
                  </span>
                  {v.name}
                  {quests[i] === "active" && <span className="mm-quest">!</span>}
                </li>
              ))}
              <li>
                <span className="mm-key mm-item" />
                Items
              </li>
              <li>
                <span className="mm-key mm-home" />
                Homes
              </li>
            </ul>
          )}
        </div>
        {!expanded && <span className="minimap-hint">M</span>}
      </div>
    </div>
  );
}
