import { generateWorld } from "../src/world/generateWorld";
for (const s of [12345, 1, 777]) { const t = performance.now(); const w = generateWorld(s); console.log(s, (performance.now()-t).toFixed(0), "ms ramps", w.ramps.length); }
