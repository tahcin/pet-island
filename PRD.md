# Pet Island: Product Requirements Document

Version 1.0, 2026-09-26. Written for Opus Build Day. Implementation target: Claude Opus 5.5 in Claude Code.

## 1. Overview

**One line:** Upload a photo of your pet and explore a randomly generated Animal Crossing style island with them, as a companion or as the pet itself.

**Working name:** Pet Island (placeholder, rename freely).

**Vision.** Pet parents love their pets and love cute worlds. Pet Island turns one photo into a chibi, toon-shaded, big-headed version of their pet and drops it onto a fresh island of pastel hills, cliffs, beaches, and wandering villager animals. It should feel like a warm Sunday afternoon in a Nintendo game, built in one day in the browser.

**What we are building today.** A single-page web app:

1. Upload a pet photo.
2. Claude reads the photo and returns a structured pet description, a name, a personality, an island name, and villager dialogue in one call.
3. The app builds the pet procedurally from primitives (no generative 3D), then generates a seeded island.
4. You explore in companion mode (you are a villager, the pet follows and does pet things) or pet mode (you are the pet).
5. You collect things, meet villagers, finish two small fetch quests, and take photos.
6. You can talk to your pet and it answers in character, you overhear villagers chatting with each other, and when you come back later the same island and pet are waiting for you.

**What we are not building today.** Accounts, cloud saves, multiplayer, generative image-to-3D, mobile-first controls, sound design beyond one or two loops.

## 2. Inspiration and references

- **Animal Crossing: New Horizons.** Rolling-log horizon, terraced cliffs, pastel toon lighting, oversized heads and eyes, speech bubbles, gentle fetch quests, photo mode. We copy the feeling, not the assets.
- **Reference artifact "Worldpen"** (https://claude.ai/artifact/XVrVDjzou4rcHWHrtqZPua). A single-file three.js app where Claude writes worlds and objects as streamed JSON lines of primitives, with companion AI, Claude-played NPC minds, and a 2D picture-book mode. Read in full on 2026-09-26; the digest is in `docs/inspiration.md`. Its content model (things made of named primitive parts, auto-pivoted and animated by part name) is the same idea as our pet builder, and its follow, greet, camera, and grounding constants are adopted below. Its realistic rendering layer is not.
- **Style rule of thumb.** Every shape is rounded. Every color is a pastel or a saturated mid-tone. Nothing is black except pupils. Shadows are soft and blue-tinted, never dark.

## 3. Users and goals

**Primary user:** a pet parent at a demo table with a phone photo of their pet. They want to see their pet, recognize it, and smile within 20 seconds of uploading.

**Emotional job:** "That is my dog." Recognition comes from species silhouette, color palette, markings, ear and tail shape, and a name and personality that feel right. Photo-accurate likeness is out of scope.

**Build-day goals:**

1. A stranger can upload a photo and be walking around with their pet in under 30 seconds.
2. The island looks unmistakably Animal Crossing inspired in a screenshot.
3. The demo never stalls: every failure has a fallback that still produces a pet and an island.
4. The codebase is small enough that Opus 5.5 can hold it in context and keep polishing until the end of the day.

**Non-goals:** exact likeness, exotic pets beyond the archetypes, saves that sync across devices, performance on low-end phones.

## 4. Core experience

### 4.1 User journey

| Step | What the user sees | What happens underneath | Target time |
| --- | --- | --- | --- |
| 1. Landing | Pastel title screen, one big "Upload your pet" button, a sample pet idling in a toon scene behind the button. | App shell loaded, world generation code warmed up, a default sample pet rendered. | 0 s |
| 2. Upload | File picker or drag and drop. Photo preview appears with a "Meet your pet" button. | Image resized client-side to max 1024 px JPEG, base64 encoded. | 2 s |
| 3. Reading | "Claude is looking at your pet..." with the polaroid-style preview floating and sparkling over the sample island. | POST `/api/pet` to the Node server, which calls Claude with a structured output schema. | 3 to 8 s |
| 4. Reveal | The pet is built on screen in a turntable, with its name, three personality traits, and the island name. "Let's go" button. | PetSpec turned into a three.js group. Island generated with a random seed. | 1 s |
| 5. Explore | Third-person companion mode on the island. HUD shows controls, collectible counter, and mode toggle. | Game loop running. Pet follow AI active. | continuous |
| 6. Play | Collect items, talk to villagers, finish fetch quests, swap into pet mode, take photos, reroll the island. | Quest state and inventory in a zustand store. | continuous |

### 4.2 Controls

| Key | Companion mode | Pet mode |
| --- | --- | --- |
| W A S D or arrows | Move villager | Move pet |
| Shift | Run | Run |
| Space | Interact with the nearest thing: quest turn-in, villager, collectible, then play with the pet if it is within 2 m (full order in 9.7) | Same interact order, then dig or sniff at the current spot |
| Tab | Swap to pet mode | Swap to companion mode |
| T or Enter | Open the chat bar to talk to your pet (Esc closes) | none |
| C | none | Toggle pet-cam (low camera at pet eye height) |
| P | Photo mode (hide HUD, download PNG) | Same |
| N | New island (reseed, keep pet) | Same |
| Mouse drag | Orbit camera around the character | Same |
| Scroll | Zoom camera | Same |

Mobile is not a target, but the canvas must not break on touch. Two on-screen buttons (a virtual joystick and an action button) are a P2 item.

## 5. Feature requirements

Priority: P0 must ship for the demo. P1 ships if the day goes to plan. P2 is polish if there is time.

### P0

| ID | Requirement | Acceptance criteria |
| --- | --- | --- |
| F1 | Photo upload | JPEG, PNG, WebP accepted (HEIC only if the browser converts it). Files over 10 MB are resized before upload. Drag and drop and click both work. |
| F2 | Claude pet reading | One request returns a PetReading matching the schema in section 6.3: spec, name, three traits, island name, villager dialogue. Round trip under 10 s on a normal connection. Refusal, timeout, or parse failure falls back to a default reading and a friendly message, never a blank screen. |
| F3 | Parametric pet builder | Dog, cat, and rabbit archetypes. Ear, tail, build, fur length, base and secondary colors, and marking pattern are all visible on the model. Same spec always produces the same pet. |
| F4 | Procedural pet animation | Idle (breathing, ear twitch, tail wag), walk, run, sit, dig, sniff, happy hop. Transitions blend within 0.2 s and never pop. |
| F5 | Seeded island | Given a seed, the same island is generated every time. Beach ring, three terrace levels, one river, water plane, vertex-colored flat-shaded terrain. Generation under 500 ms. |
| F6 | Props | Trees, rocks, flowers, and bushes placed with Poisson-disk sampling, instanced, filtered by elevation and slope. Nothing spawns in water, on the river, or on cliff faces. |
| F7 | Toon look | MeshToonMaterial with a 3-step gradient map on every mesh, hemisphere plus one shadow-casting directional light, sky-colored fog, no ACES tone mapping. |
| F8 | Curved world | A vertex bend on every material (shared uniform) so the horizon rolls away like Animal Crossing. Gameplay stays in flat space. |
| F9 | Companion mode | Player controls a simple villager avatar. Pet follows at 1.5 to 3 m, sniffs random points of interest, sits after 6 s idle, runs to catch up beyond 8 m. Never walks into water. |
| F10 | Pet mode | Tab swaps control to the pet. Avatar stays put and waves when the pet gets close. Camera drops to a lower follow height. Space digs or sniffs with a small dust puff. |
| F11 | Collectibles | Species-matched items (bones, yarn balls, carrots) plus shells on the beach. Walk into or press Space to collect. HUD counter. 12 to 20 per island. |
| F12 | Villagers | Three villager pets built with the same builder from seeded random specs. They wander within a radius, face the player when near, and show a speech bubble with a Claude-written line on Space. |
| F13 | HUD | Pet name and traits, collectible counter, control hints, mode indicator, quest tracker. Pastel rounded UI. |
| F14 | Reveal screen | Turntable of the built pet with name, traits, island name, and a "Let's go" button. |

### P1

| ID | Requirement | Acceptance criteria |
| --- | --- | --- |
| F15 | Fetch quests | Two villagers each ask for 3 of a collectible type. Turning them in rewards a bandana or a hat that appears on the pet. Quest tracker updates in the HUD. |
| F16 | Photo mode | P hides the HUD, freezes the characters in an idle pose, and downloads a PNG of the canvas with the pet name in a corner. |
| F17 | New island | N regenerates the island with a new seed, keeps the pet, resets collectibles and quests. Under 1 s including prop placement. |
| F18 | Wind sway | Foliage materials sway with a time uniform, bases stay planted. |
| F19 | Small rodent archetype | Hamster and guinea pig shaped body for the fourth archetype. |
| F20 | Pet-cam | C toggles a low first-person-ish camera in pet mode. |
| F25 | Talk to your pet | In companion mode, T opens a chat bar. The pet answers in character within 3 s on average, in a speech bubble with animalese blips, and acts on what it says (follow, sit, play, trick, and so on). It remembers up to 8 facts. With Claude unavailable, a keyword fallback still makes it obey simple commands. Details in 9.9. |
| F26 | Island remembers you | The island, pet, inventory, quests, and memories are saved in the browser. On return, the landing shows "Continue with {name}", new shells have washed up, and the pet greets you. Details in 9.11. |
| F27 | Overheard villager chats | About every 75 s while you play, two villagers meet and have a 2 to 4 line conversation in speech bubbles that you can overhear. They remember things, including quests you finished for them. Details in 9.10. |

### P2

| ID | Requirement | Acceptance criteria |
| --- | --- | --- |
| F21 | Day and night | A 4-minute cycle drives sun position, light and fog colors, and stars. Can be paused from the HUD. |
| F22 | Ambient audio | One sea loop near the beach and one bird loop near trees, positional, muted by default with a toggle. |
| F23 | Touch controls | Virtual joystick and action button on touch devices. |
| F24 | Home plot | A small house on the island in the pet's colors with the pet name on a sign. |

## 6. Pet-to-3D pipeline

### 6.1 Decision: parametric, not generative

Every hosted image-to-3D service (Meshy, Tripo, Hunyuan3D, TRELLIS, Rodin) reconstructs the photo and has no "make it chibi" control. Getting the Animal Crossing look that way needs a photo-restyle step, then a mesh, then a rig, at 2 to 4 minutes and roughly $0.65 per pet, through a server proxy. That is too slow and too fragile for a demo table, and it conflicts with the constraint of no external APIs beyond Claude.

So the pet is built from primitives, driven by a PetSpec that Claude extracts from the photo. Results arrive in seconds, the style is guaranteed, and animation is fully under our control. See section 6.7 for the upgrade path if we ever want true likeness.

### 6.2 Known limitations (accepted)

1. Likeness is caricature. Owners recognize species, colors, markings, ears, and tail, not their pet's actual face.
2. Only the archetypes we build exist: dog, cat, rabbit, and small rodent as P1. Anything else snaps to the nearest archetype.
3. Markings come from a fixed vocabulary. Fine patterns (brindle, a specific tabby swirl) are approximated.
4. Claude can misread a photo taken at an odd angle. There is no tweak panel by decision, so the mitigation is re-uploading a clearer photo, plus a prompt that asks Claude to prefer the most common configuration when unsure.
5. Primitive animals risk looking like programmer art. Mitigation is in section 8: simple silhouettes, big heads, big eyes, high-floor toon shading, and time spent polishing dog and cat first.

### 6.3 PetSpec schema

Claude returns exactly this shape (enforced with a Zod schema and structured outputs). All fields required.

```ts
export const PetSpecSchema = z.object({
  species: z.enum(["dog", "cat", "rabbit", "small_rodent"]),
  build: z.enum(["slim", "average", "stocky", "long"]),
  size: z.enum(["tiny", "small", "medium", "large"]),
  furLength: z.enum(["short", "medium", "long"]),
  baseColor: z.string(),        // hex, e.g. "#c8955a"
  secondaryColor: z.string(),   // hex; equals baseColor for solid pets
  markingPattern: z.enum(["solid", "patches", "spots", "tabby", "tuxedo", "mask", "blaze", "socks", "brindle_approx"]),
  markingCoverage: z.number().min(0).max(1),   // how much secondary color shows
  earType: z.enum(["pointy", "floppy", "folded", "long_upright", "rounded", "long_floppy"]),
  tailType: z.enum(["curly", "long", "bob", "fluffy", "thin", "puff"]),
  eyeColor: z.string(),         // hex
  noseColor: z.string(),        // hex
  collar: z.object({ present: z.boolean(), color: z.string() }),
  accessory: z.enum(["none", "bandana", "bow", "hat"]),
  confidence: z.number().min(0).max(1),
});

export const PetReadingSchema = z.object({
  spec: PetSpecSchema,
  nameSuggestions: z.array(z.string()).length(3),   // first one is used
  personality: z.array(z.string()).length(3),        // short adjectives, e.g. "curious"
  greeting: z.string(),                              // one line the pet "says" on reveal
  islandName: z.string(),
  mind: z.object({                                   // used by F25, written once here
    persona: z.string(),       // 2 or 3 sentences: temperament, what it loves and fears, how it feels about its person
    voice: z.string(),         // how it talks: tone, pace, pet phrases
    goal: z.string(),          // what it wants to do on the island
  }),
  villagers: z.array(z.object({
    name: z.string(),
    species: z.enum(["dog", "cat", "rabbit", "small_rodent"]),
    persona: z.string(),       // one sentence, used by F27
    lines: z.array(z.string()).length(3),
    questAsk: z.string(),      // "Could you find me 3 shells?"
    questThanks: z.string(),
  })).length(3),
});
```

If structured outputs reject a constraint such as an array length or a number range, drop that constraint from the schema sent to Claude and enforce it when parsing on the server (truncate, clamp, or pad from the default reading). Truncate every string Claude writes before it reaches the UI: persona 420 characters, voice 180, goal 200, any spoken line 160.

`species: "small_rodent"` renders with the rabbit archetype until F19 lands. Villager specs beyond species are seeded random from the world seed so villagers differ per island.

### 6.4 Claude call

Runs on the Node server so the API key never reaches the browser. TypeScript with the official SDK (`@anthropic-ai/sdk`).

- Model: `claude-opus-5`. Thinking is adaptive by default. Set `output_config: { effort: "low", format: zodOutputFormat(PetReadingSchema) }` for latency, raise to `medium` if reads are sloppy.
- Use `client.messages.parse(...)` so `response.parsed_output` is typed. `max_tokens: 4096` is plenty for this payload.
- Image content block: `{ type: "image", source: { type: "base64", media_type: "image/jpeg", data } }` placed before the text block.
- Check `stop_reason === "refusal"` and `parsed_output === null` before use. Either case returns HTTP 200 with `{ fallback: true, reading: DEFAULT_READING }` so the client still proceeds.
- Optional: enable server-side refusal fallbacks (`betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`) so a false-positive refusal on a photo is retried automatically. Not required for the demo.
- Timeout: 20 s on the request. On timeout the client shows "Taking longer than usual, here is a stand-in pet" and uses the default reading.

System prompt (starting point, tune during the day):

```
You are helping build a cute Animal Crossing style 3D version of a pet from one photo.
Describe the pet using only the allowed values. Choose the closest archetype for unusual pets.
When unsure about ears, tail, or build, choose the most common configuration for that breed or species.
Colors are hex strings that read well as flat pastel toon shading: lift very dark coats to a warm charcoal
like #3a3238 rather than pure black, and keep whites slightly warm like #f6f1e7.
Name suggestions should feel like a pet name, short and friendly. Personality is three lowercase adjectives.
The greeting, island name, and villager lines are warm, playful, one sentence each, no emoji.
Villagers are other pets who live on the island; give them varied species and names.
Write the pet's mind as a warm, specific character sketch you can read from the photo (a pet
sprawled on a sofa is a champion napper, a pet in a costume is a show-off). Its voice is how it
talks, with one or two pet phrases. Each villager persona is one sentence.
```

The user turn contains the image and: `Describe this pet for the island.`

### 6.5 Builder design

`src/pet/buildPet.ts` takes a PetSpec and returns a `THREE.Group` with named pivots. Pure function, no React.

Body parts per archetype (all MeshToonMaterial, all rounded primitives):

| Part | Geometry | Pivot name | Notes |
| --- | --- | --- | --- |
| Body | CapsuleGeometry, scaled by build | `body` | Long build stretches along Z, stocky widens X. |
| Head | SphereGeometry, radius about 0.9 times body radius | `head` | Oversized on purpose. Slight forward tilt. |
| Muzzle | SphereGeometry, small, pushed forward | `muzzle` | Dog longer, cat and rabbit shorter. |
| Eyes | Two SphereGeometry, black with a white highlight sphere | `eyeL`, `eyeR` | Large, set wide, slightly forward. Eye color as a thin iris ring only for cats. |
| Nose | Small sphere or rounded triangle | `nose` | noseColor. |
| Ears | Per earType: cone (pointy), flattened capsule hanging (floppy), folded cone (folded), tall capsule (long_upright), sphere (rounded), long hanging capsule (long_floppy) | `earL`, `earR` | Pivot at the base so they can twitch. |
| Legs | Four short CapsuleGeometry | `legFL`, `legFR`, `legBL`, `legBR` | Pivot at the hip so they swing. |
| Tail | Per tailType: torus segment (curly), capsule (long or thin), tiny sphere (bob or puff), fat capsule (fluffy) | `tail` | Pivot at the base. |
| Collar | TorusGeometry around the neck | `collar` | Only if present. |
| Accessory | Bandana (flattened triangle), bow (two spheres), hat (cylinder plus disc) | `accessory` | Also used for quest rewards. |

Fur length nudges scale: long fur scales body and head by 1.1 and softens the toon step count. Size scales the whole group between 0.7 and 1.3.

**Part naming and pivots (from Worldpen).** Every mesh is named by its role and the builder derives pivots from names and bounding boxes, so the animator never needs per-species rig data: legs and arms hinge at their top centre, the tail at the end nearest the body along its longest axis, the head at its bottom centre (the neck), ears at their base. Eyes, nose, muzzle, ears, whiskers, and accessories inside an expanded head box are parented to the head pivot so they turn with it. Quadruped legs are paired diagonally (front-left with back-right) for the walk cycle.

**Animation constants.** Stride advances at `2.6 + 1.5 * speed` per second. Leg swing `sin(stride + parity * PI) * 0.6 * moveAmount`. Tail wag `sin(T * (3 + 3 * moveAmount)) * 0.35`. Blink sets eye `scale.y` to 0.12 for 0.13 s every 2.5 to 6 s. Breathing scales the body `1 + 0.018 * sin(2.2 T)`. The head turns toward the player within 12 m, clamped to 0.8 rad and damped at 4 per second; when nobody is near it picks a random glance target every 2.5 to 6.5 s with a 55 percent chance of looking straight ahead. Squash and stretch on hops uses a spring `v += (-190 x - 16 v) * h` applied as `scale(1 + 0.55 k, 1 - k, 1 + 0.55 k)`. On slopes, legs without knees scale in Y between 0.7 and 1.25 to reach the ground, and the body pitches from front and back ground samples, damped at 6 per second (P1).

**Reveal draw-in.** On the reveal screen each part first appears as a thin ink outline that traces itself over 0.28 s with a few gold sparkles and one pentatonic pluck note, then the coloured mesh pops from 55 to 100 percent scale with a back-out ease. Parts are staggered 0.15 s apart. The whole pet takes about three seconds to draw itself in.

### 6.6 Markings

`src/pet/markingTexture.ts` paints a 256x256 canvas per part (body and head) and returns a `CanvasTexture` with `colorSpace = SRGBColorSpace`. Patterns:

| Pattern | How it is painted |
| --- | --- |
| solid | Base color only. |
| patches | Two or three soft blobs of secondary color at seeded positions, sized by coverage. |
| spots | Seeded noise threshold produces round spots. |
| tabby | Vertical stripes of secondary color with slight sine wobble on the body, an "M" on the forehead. |
| tuxedo | Chest, belly, and paws in secondary (white), face blaze optional. |
| mask | Head texture darker in secondary around the eyes and muzzle. |
| blaze | A single vertical stripe of secondary color down the face. |
| socks | Legs get secondary color materials below the knee; no texture needed. |
| brindle_approx | Fine diagonal stripes at 30 percent alpha of secondary. |

Textures are generated once per spec and cached by a hash of the spec.

### 6.7 Upgrade path (documented, not built)

If true likeness becomes a goal later, the researched route is: Claude classifies the pet and writes a restyle prompt, an image model restyles the photo to chibi low-poly on a white background, Tripo image-to-model v3.1 with `smart_low_poly`, then Tripo `rig` with `rig_type: "quadruped"` and `retarget` with `preset:quadruped:walk`. About 65 credits ($0.65) and 2 to 4 minutes per pet, needs a server proxy because Tripo blocks browser CORS, and quadrupeds get a walk clip only. Meshy's API is humanoid-only for rigging and needs a $20 per month plan. TRELLIS on fal is $0.02 per mesh with no rig. Details and sources are in section 16.

## 7. World generation

All in pure TypeScript under `src/world/`, no React and no three.js imports in the generators, so they are unit-testable.

### 7.1 Parameters

| Parameter | Value |
| --- | --- |
| Island size | 160 x 160 m |
| Heightmap resolution | 200 x 200 vertices |
| Sea level | 0 m |
| Terrace levels | 3, at 0.6 m, 3.0 m, 5.4 m (beach sits just above 0) |
| Beach band | elevation in [0, 0.6) |
| Cliff step | vertical wall between levels rendered by a narrow smoothstep band of width 0.02 in noise space |
| River | one polyline from the highest level to the sea, 2.5 m wide, carved to just below sea level |
| Prop spacing | Poisson min distance 2.5 m, max 4 m |
| Seed | 32-bit integer, shown in the HUD, taken from the URL hash if present |

### 7.2 Algorithm

1. `rng = alea(seed)`; `noise2D = createNoise2D(rng)`.
2. fBm elevation: `e = (n(1x) + 0.5 n(2x) + 0.25 n(4x)) / 1.75`, normalized to [0, 1].
3. Radial island mask with low-frequency jitter so the coast is not a circle: `e = lerp(e, 1 - d, 0.6)`.
4. Beach: below the beach threshold is sand.
5. Terraces: `level = round(e * 3) / 3` for the interior; height in meters comes from the level table.
6. River: pick a start on level 3 and an end on the coast; walk a noise-perturbed polyline; subtract a smoothstep trench along it.
7. Mesh: `PlaneGeometry(160, 160, 199, 199)`, set Y per vertex, `toNonIndexed()`, `computeVertexNormals()` for flat shading, vertex colors per level and slope.
8. `heightAt(x, z)` uses bilinear interpolation on the heightmap; `levelAt(x, z)` returns the terrace index; `isWater(x, z)` and `isRiver(x, z)` are lookups.
9. Placement: Poisson sample the island once; for each point, evaluate height, slope, level, water, river. Assign tree, bush, rock, flower, or collectible by level and a seeded roll. Skip anything within 6 m of a villager home spot.
10. Villager homes: the first three Poisson points on level 1 with slope below threshold and at least 20 m apart. Each villager wanders within 10 m of home.
11. Player spawn: the flattest beach point nearest the island center. Pet spawns 2 m behind.
12. Island intro: when the world first shows, every prop pops in with a back-out ease staggered by distance from spawn (`0.2 + distance / 90` seconds), so the island grows outward from the player over about two seconds. Reseeding with N replays it.

### 7.3 Movement rules

- Characters can walk on beach and within a level. Moving to a different level is only allowed on ramps: the generator adds two ramps per level boundary by locally smoothing the heightmap along a 3 m wide corridor.
- Water and river are blocked. Beach edge into water stops the character.
- No physics engine. Grounding is `heightAt`. Collisions with trees and rocks use simple circle checks against a spatial hash of placed props.

### 7.4 Props and asset list

CC0 packs, GLB, loaded once and instanced per prop type:

| Prop | Source | Notes |
| --- | --- | --- |
| Trees (3 variants), bushes, rocks, flowers, mushrooms | Kenney Nature Kit, https://kenney.nl/assets/nature-kit (CC0, GLB in the download) | Swap materials to MeshToonMaterial keeping the atlas texture. |
| Extra stylized trees and rocks | Quaternius Ultimate Stylized Nature Pack via Poly Pizza, https://poly.pizza/bundle/Ultimate-Stylized-Nature-Pack-zyIyYd9yGr (CC0) | Only if Kenney lacks a shape we want. |
| Villager house | Kenney Nature Kit cabin or a primitive house from `src/world/house.ts` | Primitive house is the fallback so no asset blocks progress. |
| Collectibles | Primitives built in code: bone (two spheres and a capsule), yarn ball (sphere with torus), carrot (cone and leaves), shell (flattened sphere) | No downloads needed. |

Download assets into `public/models/` at the start of the build and commit them. If a download fails, use primitive stand-ins and keep going.

## 8. Art direction

Rules Opus 5.5 should follow without asking:

- **Shading.** `MeshToonMaterial` everywhere. Gradient map is a `DataTexture` with 3 steps, values `[120, 190, 255]`, `NearestFilter`, so the darkest band is still pastel.
- **Lighting.** `HemisphereLight` sky `#bfe3ff`, ground `#ffe1b8`, intensity 1.4. One `DirectionalLight` `#fff4dc` intensity 1.6 casting `PCFSoftShadowMap` shadows from a 2048 map with a tight orthographic frustum around the island.
- **Tone mapping.** `NoToneMapping` (R3F `flat` prop). Pick colors directly in pastel ranges.
- **Fog.** `THREE.Fog` matching the sky color, near 60, far 160.
- **Sky.** drei `Sky` with a high sun, or a large inverted sphere with a two-color gradient shader. No HDRI environment maps.
- **Palette.** Sand `#f4e2b8`, grass level 1 `#8fd17a`, level 2 `#7cc46a`, level 3 `#6bb85f`, cliff `#c9b58f`, water `#7ed3e6` at 0.85 opacity, sky `#cfeaff`. Pet colors come from Claude, clamped so luminance stays above 0.12.
- **Curved world.** Parabolic bend `wp.y -= uCurve * dot(d.xz, d.xz)` where `d = wp.xyz - cameraPosition`, `uCurve = 0.004` to start. Applied through `onBeforeCompile` on every material, with a shared uniform object and a `customProgramCacheKey`. Read `node_modules/three/src/renderers/shaders/ShaderChunk/project_vertex.glsl.js` before writing the replacement so `mvPosition` stays defined for fog and shadow chunks. Bent meshes set `frustumCulled = false`. Shadows use a `customDepthMaterial` with the same patch. Gameplay math never sees the bend.
- **Proportions.** Head about 0.9 of body length. Eyes about a quarter of head height. Legs short. Everything rounded.
- **Outlines.** None. AC has no hard outlines.
- **UI.** Rounded 20 px corners, cream `#fff8ea` panels, brown `#5b4636` text, pastel accent per species (dog peach, cat lilac, rabbit mint). Font: Nunito or Fredoka from Google Fonts. No em dashes anywhere in copy.
- **Motion.** Everything eases. Pet idle has a 2 s breathing cycle. Speech bubbles pop with a 150 ms scale-in.

Things to avoid explicitly: hard black outlines, gray or realistic textures, ACES washed-out look, dark shadows, sharp low-poly triangles on characters, generic dark-mode UI, emoji in copy.

## 9. Gameplay systems

### 9.1 Modes

`mode: "companion" | "pet"` in the store. Both characters always exist. The controller reads input for the controlled one; the other runs its AI.

### 9.2 Companion pet AI (companion mode)

State machine in `src/pet/petBrain.ts`, ticked from `useFrame`:

| State | Enter when | Behavior | Exit |
| --- | --- | --- | --- |
| follow | default | Keep distance `2.4 + 1.3 * petRadius` behind the player, stop at keep minus 0.4 (hysteresis). Base speed under 7 m gap, 1.4x over 7 m, 2x over 14 m, and match the player's speed times 1.05 up to 2.8x base when they sprint. Slow to 25 percent while turning more than 1.2 rad. | player idle for 2 s: idle. Interest point within 6 m and cooldown over: sniff. Blocked for 2.2 s: idle 8 s |
| idle | player stopped | Idle animation, glance behaviour. | 6 s: sit. Player moves: follow |
| sit | idle too long | Sit animation. | player moves 3 m away: follow |
| sniff | interest point nearby | Walk to point, sniff 1.5 s. 30 percent chance to dig, which spawns a collectible. | done: follow |
| play | player stands still for 10 s, or presses Space with the pet within 2 m and nothing else to interact with | Pick a random point 2.5 to 6 m around the player, run there at 1.7x, hop on arrival, repeat every 4 s. | 12 s: follow |
| happy | player collects something | Hop twice, heart particles. | 1 s: follow |

Interest points are a seeded subset of prop positions and collectible positions. Cooldown 8 s. Every state change that has a mood shows one glyph above the pet for 2.2 s: heart for happy, "!" for alert, "?" for sniff, a note for play, "z" for sleep. Glyphs are only shown when the mood changes.

**Villager greeting beat.** When the controlled character enters `3.5 + villagerRadius`, the villager stops for 2.6 s, faces them, and pops a "!" (75 percent) or a note. It does not repeat until the player has been more than 12 m away.

### 9.3 Avatar AI (pet mode)

The avatar stands where it was left, idles, and waves when the pet is within 4 m. Tab returns control; the pet then resumes follow.

### 9.4 Collectibles

Placed by the world generator. Species-matched item type from the pet spec: dog gets bones, cat gets yarn, rabbit and small rodent get carrots. Shells on the beach for every species. Collect by walking within 0.8 m or pressing Space within 1.5 m. Collected items fly to the HUD counter with a small tween.

### 9.5 Villagers and dialogue

Three villagers from `reading.villagers`, bodies from seeded random specs. Each has a home spot and wanders on a random walk within 10 m, pausing 3 to 6 s. When the controlled character is within 3 m, the villager turns to face it and a "Space to talk" hint appears. Space cycles through the villager's three lines in a drei `Html` speech bubble. Quest villagers show `questAsk` first.

### 9.6 Quests (P1)

Two of the three villagers hold a quest: "bring me 3 of X" where X is shells for one and the species item for the other. Turning in (Space near the villager with enough items) removes the items, shows `questThanks`, and equips a reward: bandana for quest 1, hat for quest 2. Quest state: `notStarted | active | done`.

### 9.7 Camera and controller constants

Third-person camera: shoulder offset `0.45 * characterHeight` clamped 0.5 to 3.5 (times 0.3 on portrait screens), look-at height `0.85 * characterHeight`, boom length `4.6 + 1.3 * characterHeight` times zoom, pitch clamped -0.35 to 1.2 rad, ten samples along the boom that pull the camera in before it enters terrain, plus a hard floor of ground + 0.4. Position follows with `1 - exp(-16 dt)`; the look target is copied directly. Mouse look 0.0055 rad per pixel yaw and 0.0045 pitch, wheel zoom x1.1 per notch clamped 0.45 to 2.6. Switching to pet-cam swoops over 1.7 s with a 4 m vertical arc. Pet-cam uses eye height `0.9 * petHeight + 0.05`, nudged 0.15 m forward.

Movement: walk 4.8 m/s, run x1.75, horizontal velocity damped at rate 10, yaw turns toward the move direction at rate 10. Grounding is `heightAt` with gravity, terminal -60, step-up snap under 1.2 m, step-down snap under 0.6 m, cliffs blocked by the level rule in 7.3. Hop: jump velocity 8, jump buffer 0.16 s, coyote time 0.1 s, 1.2x gravity when the key is released early. Scenery collision: cylinder colliders in an 8 m spatial hash, pushed out only when the character's feet are below the collider top minus 0.25 so rocks can be stood on.

Interaction picking: raycast from the camera against character and collectible groups every third frame; if the ray misses, the nearest thing within 2.5 m that is not more than slightly behind. The prompt tag is placed by projecting the top of the target. Space resolves to the first match in this order. Companion mode: turn in quest, talk to villager, collect item, play with the pet (pet within 2 m). Pet mode: turn in quest, talk to villager, collect item, dig or sniff at the current spot.

### 9.8 Photo mode (P1)

P toggles. HUD hides, characters switch to idle facing the camera, a 1 s countdown, then `renderer.domElement.toDataURL("image/png")` with `preserveDrawingBuffer` on for that frame, downloaded as `{petName}-island-{seed}.png`. The pet name is drawn into a corner via an offscreen canvas composite.

### 9.9 Talking to your pet (F25, P1)

Adapted from Worldpen's "minds" (see `docs/inspiration.md` section 3). The pet's persona, voice, and goal come from the photo call, so every later reply is one small call.

**UI.** In companion mode, T or Enter opens a chat bar at the bottom centre with suggestion chips above it: "Who are you?", "Follow me", "Wait here", "Show me a trick", "Let's play", "Find something!". WASD is disabled while the bar has focus; Esc closes it. The player's line appears in a pale blue speech bubble over the avatar. While the pet thinks, its bubble shows three bouncing dots. Its reply types out at 38 characters per second, each letter playing a tiny WebAudio blip at `430 / sqrt(petHeight)` Hz with a little jitter (animalese), muted when sound is off. Input is capped at 200 characters.

**Route.** `POST /api/pet/talk` on the server.

```ts
// request
{ pet: { name, species, mind }, perception: string, log: { who: "person" | "pet"; say: string }[],
  memory: string[], why: "spoken" | "return", line?: string, news?: string[] }

// response, enforced with structured outputs
export const PetTalkSchema = z.object({
  say: z.string(),       // at most 30 words, or "" to stay quiet
  act: z.enum(["follow", "come", "stay", "sit", "play", "sniff", "dig", "trick", "sleep", "go_to"]),
  target: z.string(),    // for go_to: a name from the perception list, otherwise ""
  mood: z.enum(["happy", "curious", "excited", "calm", "sleepy", "playful", "shy", "proud", "loving", "grumpy"]),
  remember: z.string(),  // one short new fact worth keeping, or ""
});
```

Model `claude-opus-5`, `effort: "low"`, `max_tokens: 1024`, `messages.parse` with `zodOutputFormat(PetTalkSchema)`, 12 s timeout, not streamed. Streaming the `say` field into the bubble before the JSON finishes is a P2 polish.

**System prompt** (starting point):

```
You are {name}, a {species} who lives on {islandName} with the person who loves you.
You are their pet, not an assistant: you have your own feelings, habits and wishes.
Personality: {persona}
How you talk: {voice}
What you want: {goal}
You speak in short, simple, warm sentences, like an Animal Crossing character, and may use one pet
sound ("woof", "mrrp") now and then. Everything you perceive is in the user message. Mention only
things that are really there. Keep it short and natural, never repeat an earlier line, and do not
describe your actions in words: choose an act instead. If the person asks you to do something you
can do, do it. If they ask what you are, you can say your thoughts are played by Claude.
```

**User message**, built client-side by a pure function in `src/talk/perception.ts`:

```
You: {name}, a small {build} {species}, feeling {mood}, currently {current act in words}.
The person: 3 m away, in front of you, to the left; walking; looking at you.
Around you: Mallow the rabbit (villager, 12 m to your right); a shell (4 m behind you); the beach (6 m ahead); the river (20 m to your left).
The island: {islandName}, daytime. The person has 2 shells and 1 bone. Quest: Mallow wants 3 shells (2 of 3).
You remember: {memory joined with "; "}.
Your conversation so far (oldest first): {last 12 lines}
What just happened: {recent events, e.g. "The person picked up a shell."}
{why line}
The person just said: "{line}"
```

Distances are rounded to whole metres and at most 6 nearby things within 25 m are listed. The why line for `spoken` is "Answer what they actually said, and act on it if you want to." For `return` it is "The person has just come back after {duration}. Greet them warmly and mention something from this news if it matters to you: {news}."

**Acting.** `act` maps onto the pet brain from 9.2 as a plan with a duration, after which the pet returns to its normal follow behaviour: follow 120 s, come (walk to the player, then stay) 25 s, stay 40 s, sit 40 s, play 12 s, sniff (nearest interest point) 15 s, dig (at the current spot, 30 percent chance of a collectible) 6 s, trick (a full spin and two hops with sparkles) 3 s, sleep 60 s with a "z" glyph every 3 s, go_to (walk to the named thing) 30 s. `mood` shows its glyph from 9.2 when it changes. A non-empty `remember` is appended to the pet's memory (cap 8, oldest dropped). The log keeps the last 16 lines.

**Cost and latency controls.** Calls happen only when the player speaks, plus one `return` greeting per visit. One call in flight at a time; a second line sent while waiting is queued, and further lines replace the queued one. Talk and villager chats share the same one-call-in-flight rule, with talk taking priority.

**Fallback.** On refusal, timeout, or error, a keyword matcher in `src/talk/offlineIntent.ts` picks the act ("follow", "come" to follow or come; "sit", "stay", "wait" to sit or stay; "play", "fetch" to play; "trick", "dance", "spin" to trick; "sleep", "nap" to sleep; "find", "dig", "sniff" to sniff) and the pet says a species line ("Woof!", "Mrrp!", a happy nose wiggle for rabbits). A toast says "{name} didn't quite catch that. Try again." only for real errors, not when the key is missing.

### 9.10 Overheard villager chats (F27, P1)

**Trigger.** Every 75 s, pick the two villagers nearest the player. If both are within 35 m of the player, they walk to a walkable meeting point between them, face each other, and chat. Conditions: tab visible, player pressed a key in the last 60 s, not in photo mode, no Claude call in flight. On failure, skip silently and try again after 150 s. At most one chat at a time.

**Route.** `POST /api/villagers/chat`.

```ts
// request
{ a: { name, species, persona, memory: string[] }, b: { ... }, islandName, timeOfDay,
  petName, recent: string[] }   // recent player events, e.g. "Finished Mallow's shell quest"

// response
export const VillagerChatSchema = z.object({
  lines: z.array(z.object({ who: z.enum(["A", "B"]), say: z.string() })),  // 2 to 4 lines, taking turns
  memoryA: z.string(),   // what A will remember from this chat, or ""
  memoryB: z.string(),
});
```

Same model and settings as 9.9. The prompt asks for a short conversation between two villagers on an Animal Crossing style island that the player can overhear: each line at most 16 words, in character, about their day, the island, the player's pet by name, or something they remember.

**Playback.** Each line shows in the speaker's bubble with animalese, held for `1.4 + length * 0.055` s before the next. The first speaker pops a note glyph. Afterwards both wander home. Each villager keeps up to 6 memories. Finishing a villager's quest also adds "{petName}'s person brought me 3 shells." to that villager's memory, so chats can mention it.

### 9.11 Save and return (F26, P1)

**What is saved.** One save in `localStorage` under `petIsland.save.v1`: version, `savedAt`, the full reading (spec, names, mind, villagers), seed, mode, player and pet position and yaw, inventory, collected item ids, quest states, equipped accessories, pet memory and last 12 chat lines, villager memories. Never the photo.

**When.** Every 20 s while on the island, and on `visibilitychange` to hidden and on `pagehide`. Every read and write is wrapped in try/catch; a failed or unreadable save is ignored and never blocks play. A save with a different version is ignored.

**Landing.** When a valid save exists, a card above the upload button shows the pet's name, species colour swatch, island name, and "last visited 2 hours ago", with a "Continue with {name}" button. A small "Start fresh with a new pet" link clears the save after a confirm. Continue skips reading and reveal, rebuilds the island from the seed, restores state, and plays the island intro pop-in.

**Return news.** Computed from the time away when it is at least 2 minutes: up to 3 uncollected beach shells respawn ("New shells washed up on the beach"), and every villager gets the memory "{petName} and their person were away for {duration}." Durations in words: "a few minutes", "about an hour", "3 hours", "2 days". The pet then greets the player with one talk call using `why: "return"` and the news list. Without Claude, it says a canned "You're back!" with a happy hop and a heart glyph.

## 10. Technical architecture

### 10.1 Stack and versions (verified 2026-09-26)

| Piece | Choice | Version |
| --- | --- | --- |
| Bundler | Vite | latest |
| UI | React | 19.x (R3F 9 requires 19) |
| 3D | three | 0.186.1 |
| React renderer | @react-three/fiber | 9.8.1 |
| Helpers | @react-three/drei | 10.7.9 |
| State | zustand | latest 5.x |
| Noise and RNG | simplex-noise 4.0.3, alea 1.0.1, poisson-disk-sampling 2.3.1 | |
| Schema | zod | whichever major the SDK's `zodOutputFormat` helper supports |
| Server | Node 22 with Hono (or Express), tsx for dev | |
| Claude | @anthropic-ai/sdk | latest |
| Tests | vitest, @playwright/test | |
| Language | TypeScript strict | |

No physics engine, no post-processing, no ecctrl. Heightmap grounding and circle collisions are enough.

### 10.2 Data flow

```
Browser                                  Server (Node)                    Anthropic
  upload photo
  resize to 1024 px JPEG, base64
  POST /api/pet {imageBase64}  ------->  validate size and type
                                         messages.parse (structured)  --> claude-opus-5
                                         check refusal, parsed_output <--
  {reading, fallback?}         <-------  200 JSON
  store.setReading(reading)
  buildPet(reading.spec)
  generateWorld(seed)
  render, game loop
```

The server stores nothing. The browser keeps one save in `localStorage` (9.11). The photo is discarded after the reading response and is never saved. Later Claude calls (pet talk in 9.9, villager chats in 9.10) go through the same server so the key stays server-side.

### 10.3 File layout

This folder (the one holding `PRD.md`) is the repository root. Scaffold the app directly into it; do not create a `pet-island/` subfolder. The tree below uses `pet-island/` only as a label for this folder.

```
pet-island/
  package.json
  vite.config.ts            # proxies /api to the server in dev
  index.html
  .env.example              # ANTHROPIC_API_KEY=
  server/
    index.ts                # Hono app, /api/pet, /api/pet/talk, /api/villagers/chat, serves dist/ in production
    petReading.ts           # Claude call, schema, fallback reading
    petTalk.ts              # F25 talk call and fallback
    villagerChat.ts         # F27 chat call
  src/
    main.tsx
    App.tsx                 # screen router: landing, reading, reveal, play
    store.ts                # zustand: screen, reading, seed, mode, inventory, quests
    schema/petReading.ts    # zod schemas shared with the server
    pet/
      buildPet.ts           # PetSpec -> THREE.Group with pivots (pure)
      archetypes/{dog,cat,rabbit,rodent}.ts
      markingTexture.ts     # canvas textures
      petAnimator.ts        # procedural animation state machine
      petBrain.ts           # companion AI
      Pet.tsx               # R3F wrapper
    avatar/
      buildAvatar.ts
      Avatar.tsx
    world/
      generateWorld.ts      # seed -> WorldData (heightmap, levels, river, placements) (pure)
      heightmap.ts
      river.ts
      placement.ts
      Terrain.tsx
      Water.tsx
      Props.tsx             # instanced GLB props
      Collectibles.tsx
      Villagers.tsx
    render/
      toon.ts               # gradient map, material factory
      bend.ts               # curved world onBeforeCompile patch
      Lights.tsx
      SkyDome.tsx
    control/
      useInput.ts
      CharacterController.tsx
      FollowCamera.tsx
    ui/
      Landing.tsx, Reading.tsx, Reveal.tsx, Hud.tsx, SpeechBubble.tsx, PhotoMode.tsx
    game/
      collectibles.ts, quests.ts, interactions.ts
    talk/
      perception.ts         # pure: world state -> prose for the talk prompt
      offlineIntent.ts      # keyword fallback
      petMind.ts            # queue, plans, memory
      TalkBar.tsx
      animalese.ts          # per-letter WebAudio blips
    villagers/
      villagerChat.ts       # meetup trigger and playback
    save/
      save.ts               # localStorage save, load, return news
  public/models/            # CC0 GLBs
  tests/
    unit/                   # vitest: heightmap determinism, placement rules, marking textures, schema
    e2e/                    # playwright: load, mocked /api/pet, screenshot
  scripts/
    screenshot.ts           # launches the app with a fixed seed and saves a PNG for visual review
  CLAUDE.md
  TASKS.md
  PRD.md
```

### 10.4 Module boundaries

- `world/generateWorld.ts` and `pet/buildPet.ts` are pure and deterministic. They take a seed or spec and return data or a three.js group. No React, no store access.
- React components only wire pure modules into the scene and read the store.
- Per-frame values live in refs and `useFrame`, never in React state.
- Materials with `onBeforeCompile` are created in `useMemo` or module scope, never inline in JSX.
- The server imports the same zod schema file as the client.

### 10.5 Performance budget

- Under 150 draw calls at any time. Props are `InstancedMesh` per type. Terrain is one mesh. Water is one mesh.
- 60 fps on a 2022 laptop with integrated graphics at 1.5 device pixel ratio. `dpr={[1, 1.5]}`.
- One shadow light, 2048 map.
- World generation and prop placement under 500 ms total on reseed.

### 10.6 Configuration

- `ANTHROPIC_API_KEY` in `.env` on the server only.
- `VITE_DEFAULT_SEED` optional for reproducible screenshots.
- URL hash `#seed=12345` loads a specific island.

## 11. Testing and verification

| Layer | Tool | What it proves |
| --- | --- | --- |
| Unit | vitest | Same seed gives identical heightmap and placements. No placement in water, river, or above slope threshold. `heightAt` matches vertex heights at grid points. Every PetSpec enum combination builds without throwing and yields all named pivots. Marking textures are non-empty and deterministic. Schema rejects bad Claude output. |
| Server | vitest with a mocked SDK | Refusal, timeout, and parse failure return the fallback reading with `fallback: true`. Oversized images return 413. Talk and chat routes return a fallback on refusal and timeout. |
| Unit (P1) | vitest | `perception.ts` gives stable prose for a fixed state. `offlineIntent.ts` maps each keyword to its act. Save round-trips through JSON, a corrupt or wrong-version save is ignored, and return news is deterministic for a given time away. |
| E2E | playwright | App loads, mocked `/api/pet` returns a fixture reading, reveal screen shows the name, play screen renders, Tab swaps mode, N reseeds, P downloads a file. P1: mocked talk route, typing "sit" makes the pet sit; reload shows "Continue with {name}". |
| Visual | `scripts/screenshot.ts` | Deterministic PNG at seed 12345 from three camera angles for Opus 5.5 to inspect after each visual change. |

Playwright runs headed Chromium with WebGL enabled (`--use-gl=angle` or `--use-angle=swiftshader` as a fallback).

## 12. Build plan

There is no fixed time budget. The goal is the fastest path to a playable demo, then as much polish as the day allows. Each milestone ends with a commit, passing tests, and a screenshot, and leaves the app in a demoable state.

**Speed rules.**

- Get each milestone working end to end before polishing any part of it. Polish belongs to M4 and later.
- Prefer the simplest implementation that meets the acceptance criteria. Reach for a library only when it saves real time.
- Build M0 and M1 in parallel: give M1 (pet builder) to a subagent while the main agent builds M0 (island). They share only the zod schema and the toon material factory, so create those two files first.
- If something blocks progress for more than a few attempts, take the fallback the PRD lists (primitive props, default reading, plain download) and move on. Note it in TASKS.md.

| Milestone | Scope | Finish line |
| --- | --- | --- |
| M0 Walkable island | Vite + R3F scaffold, terrain from seed, water, toon lighting, curved bend, capsule placeholder with WASD and follow camera, ramps between levels. | Walk from beach to level 3 without clipping. Screenshot looks pastel and curved. |
| M1 Pet builder | Dog, cat, rabbit archetypes from a hardcoded spec, markings, procedural animations, reveal turntable. | All 7 animations play. 3 species x 6 ear types x 6 tail types build without errors. |
| **Checkpoint A** | Human review of the look. | See below. |
| M2 Claude reading | Server route, structured output, fallback, upload UI, reading screen, reveal screen wired to real data. | Upload a photo and land on the island with the right species and colors in under 10 s. |
| M3 Two modes | Avatar builder, companion follow AI, Tab swap, pet-cam. | Pet follows, sniffs, sits. Tab swaps cleanly. Avatar waves. |
| **Checkpoint B** | Human playtest of the first playable. | See below. |
| M4 Props and polish | Kenney props instanced, Poisson placement, wind sway, fog and sky tune, HUD. | Under 150 draw calls, 60 fps, screenshot passes the "is this AC?" check. |
| M5 Play | Collectibles, villagers with dialogue, two quests with rewards. | A stranger can finish both quests in 3 minutes. |
| M6 Living island | Talk to your pet (9.9), save and return (9.11), overheard villager chats (9.10), in that order. | Typing "show me a trick" gets an in-character reply and a trick. Reloading shows "Continue with {name}" and the pet greets you. Two villagers hold an overheard chat. |
| M7 Juice | Photo mode, new island button, ambient audio, day and night. | Photo downloads with the pet name. N reseeds in under 1 s. |

### Human checkpoints

These are the only planned stops. Everything else runs autonomously.

- **Checkpoint A, after M0 and M1: the look.** Stop and show the human three things: the island screenshots from `npm run screenshot`, and a turntable screenshot each of the dog, cat, and rabbit saved to `screenshots/pets/`. Also give the command to run the dev server so they can look live. Ask one question: "Does this look like Animal Crossing, and do the pets look cute rather than like programmer art?" Apply their feedback before starting M2. The pets are the biggest risk in the project, so this checkpoint matters more than any other.
- **Checkpoint B, after M3: the first playable.** Stop when a real photo from `test-photos/` goes through upload, reading, reveal, and onto the island with the pet following, and Tab swaps modes. Give the human the run commands and ask them to play for two minutes. Ask one question: "What feels off?" Apply their feedback, then continue through M4 to M6 and P1 without stopping.

**Cut list, in order, if the human says to wrap up:** day and night, ambient audio, small rodent archetype, overheard villager chats, second quest, pet-cam, wind sway, third villager, photo mode watermark (keep plain download), save and return.

**Never cut:** curved world, toon look, pet follow, Claude reading with fallback.

## 13. Implementing with Opus 5.5

Guidance distilled from "Getting the most out of Opus 5.5" (https://claude.dev/blog/getting-the-most-out-of-opus-5-5/), applied to this project.

### 13.1 How to run the build

1. Put `PRD.md`, `CLAUDE.md`, `TASKS.md`, and `docs/inspiration.md` in the project folder. Run `git init` and commit them.
2. Start Claude Code with `/model claude-opus-5-5` and effort `high` or `xhigh` (Opus 5.5 defaults to `medium`, so set it).
3. Give the whole task in one message with the finish line. Do not split it into milestone prompts; the milestones are for Opus to pace itself and for you to check in.
4. Let it run. Type clarifications mid-run without restarting. Check `TASKS.md` for progress instead of reading the transcript.
5. When it stops, read what it needs from you first, then its summary.

### 13.2 Kickoff prompt

```
Read PRD.md, CLAUDE.md, TASKS.md, and docs/inspiration.md. Build Pet Island exactly as specified, milestone by milestone
in the order in TASKS.md, checking off items as you finish them. The finish line: every P0 requirement
in PRD.md section 5 has passing acceptance criteria, `npm test` and `npm run e2e` pass, `npm run
screenshot` produces an island screenshot that matches the art direction in section 8, and a real
photo from test-photos/ uploaded through the UI produces a matching pet within 10 seconds. Move as
fast as you can: build M0 and M1 in parallel with a subagent, and get each milestone working end to
end before polishing. Stop at the two human checkpoints in section 12 and wait for my feedback.
Otherwise stop only if you cannot continue without me, or before anything destructive. After P0,
continue into P1 in order until you run out of items or I stop you. Commit at the end of every
milestone.
```

### 13.3 Stopping rules (also in CLAUDE.md)

- Proceed autonomously through every milestone, except the two human checkpoints in section 12.
- Stop only when blocked on something only the human can do: the API key, a missing asset download that fails, or a design decision the PRD leaves open and that changes the demo.
- Never delete data, force-push, or change anything outside the project folder.

### 13.4 Verification loop

After each milestone, before committing, Opus 5.5 should:

1. Run `npm test` and `npm run e2e`.
2. Run `npm run screenshot` and inspect the PNGs. Opus 5.5 is strong at reading screenshots, so ask it to compare the image against section 8 and list what looks off.
3. Review its own diff with: "List only problems you would block the merge for. For each, give the file and line, why it is wrong, and how to show it fails."
4. Fix, re-run, commit, tick TASKS.md.

### 13.5 Prompting notes

- No "think step by step" or "be careful" filler. State the task and the finish line.
- Be concrete about visuals, including what to avoid. Section 8 lists the avoid-list on purpose.
- If Opus stops mid-run to offer options, reply "continue with your recommendation" and consider tightening the stopping rules.
- For research-type questions during the build, ask it to mark anything it could not confirm and where it looked.
- Once a decision is made in the transcript, tell it to treat that as done and not revisit it.

### 13.6 Subagents

Only two pieces are independent enough to fan out: the pet builder (M1) and the world generator (M0). The kickoff prompt tells Opus to give M1 to a subagent while it does M0, and to check the subagent's evidence (tests passing, screenshot) before accepting the result. Everything after M2 touches shared state and should stay in one agent.

## 14. Risks, open questions, and decisions made

### Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Parametric pets look like programmer art | Medium | Big heads, big eyes, rounded primitives, high-floor toon gradient. Polish dog and cat first. Screenshot review after M1 and M4. |
| Claude misreads a photo | Medium | Prompt asks for the most common configuration when unsure. Re-upload is the fix. Confidence field shown subtly on the reveal. |
| Curved bend breaks shadows or culling | Medium | Custom depth material with the same patch. `frustumCulled = false`. Keep curvature small. |
| R3F and drei version pairing | Low | Versions pinned in section 10.1. Do not upgrade mid-day. |
| Kenney assets do not load or look wrong under toon shading | Low | Material swap keeps the atlas. Primitive fallbacks exist for every prop type. |
| Playwright WebGL flakiness in headless mode | Medium | Run headed or with SwiftShader. E2E is a smoke test, not a visual test. |
| Pet replies feel slow | Medium | Low effort, one call in flight, thinking dots in the bubble, keyword fallback so commands still work. Streaming the `say` field is the next step if needed. |
| Background villager chats run up API cost | Low | One chat per 75 s at most, only while the tab is visible and the player is active, skipped while another call is in flight. |
| Running out of time before quests | Medium | Milestones are ordered so the app is demoable after each one. M0 to M3 alone is a good demo. Cut list in section 12. |

### Open questions

1. Should the island theme itself around the pet (a bone-shaped pond for dogs)? Fun, not required. Parked as a P2 idea.
2. The browser save restores everything on the same browser. The seed in the URL (10.6) only shares the island layout, not the pet. Good enough for today.

### Decisions made during planning

| Decision | Choice | Why |
| --- | --- | --- |
| Pet to 3D | Parametric from a Claude-extracted spec | Instant, no external APIs, guaranteed style. Generative route documented in 6.7. |
| Tweak panel | None | Saves about an hour. Re-upload is the fix for a misread. |
| Default mode | Companion, with Tab to become the pet | Matches the original framing of exploring with the pet. Pet mode is the bonus. |
| Persistence | One browser save in localStorage | Chosen so the island remembers you and the pet can greet you on return. Nothing is stored on the server and the photo is never saved. |
| Extras from Worldpen | Talk to your pet, overheard villager chats, save and return. Not included: writing objects into the world, riding the pet | Talking to the pet is the emotional core. The other two are cheap once talk exists. |
| Talk and chat model | claude-opus-5 at low effort, not streamed | One model for every call. Target under 3 s per reply; streaming is the next lever if replies feel slow. |
| Stack | Vite, React 19, R3F 9, drei 10, three 0.186, zustand, Hono, TypeScript | Largest corpus for an AI coding agent, hot reload, and pure modules stay testable. |
| Physics | None | Heightmap grounding and circle collisions cover everything in scope. |
| Vision model | claude-opus-5 at low effort | Quality of the read matters more than the few hundred milliseconds a smaller model would save. |

## 15. Success criteria and demo script

**Success criteria for the day:**

1. Five different pet photos (two dogs, two cats, one rabbit) each produce a pet a stranger identifies correctly by species and color within 3 seconds of the reveal.
2. Upload to walking on the island in under 20 seconds, measured on the demo laptop.
3. 60 fps at 1.5 dpr with all props visible.
4. Zero blank screens across 20 consecutive uploads, including one deliberately bad image (a screenshot of text) that must produce the fallback pet.
5. A screenshot from `npm run screenshot` that people describe as Animal Crossing without prompting.
6. The pet answers a typed line in under 3 seconds on average, in character, and does what it says.

**Demo script (2 minutes):**

1. "This is Pet Island. Give me a photo of your pet." Upload from a phone via a shared folder or the laptop's camera.
2. Reading screen, then the reveal: read the name and personality out loud.
3. Walk down the beach in companion mode, let the pet sniff and dig up a bone.
4. Talk to a villager, accept the shell quest, pick up three shells on the beach, turn them in, show the bandana.
5. Press T and type "show me a trick". The pet answers in its own voice and spins. Pause near two villagers chatting.
6. Tab into pet mode, press C for pet-cam, run through the flowers.
7. Press P for a photo, hand them the PNG.
8. Reload the page: "Continue with {name}". The pet greets them and new shells have washed up.
9. Press N: "And here is a brand new island for the next pet."

## 16. Sources

Image-to-3D and rigging research (pages opened 2026-09-26):

- Meshy image-to-3D, rigging, and pricing: https://docs.meshy.ai/en/api/image-to-3d, https://docs.meshy.ai/en/api/rigging, https://www.meshy.ai/api
- Tripo image-to-model v3.1, rig, retarget, pricing: https://docs.tripo3d.ai/model-generation/image-to-model-v3-0-v3-1.html, https://developers.tripo3d.ai/en/docs/animations-rig, https://developers.tripo3d.ai/en/docs/animations-retarget, https://docs.tripo3d.ai/get-started/pricing.html
- Hunyuan3D on fal and Replicate: https://fal.ai/models/fal-ai/hunyuan-3d/v3.1/pro/image-to-3d, https://replicate.com/tencent/hunyuan3d-2
- TRELLIS on fal: https://fal.ai/models/fal-ai/trellis
- Anything World animate API: https://anything-world.gitbook.io/anything-world/api/rest-api-references

Rendering and world generation:

- Curved world shader math: https://alastaira.wordpress.com/2013/10/25/animal-crossing-curved-world-shader/, https://notslot.com/tutorials/2020/04/world-bending-effect
- three.js onBeforeCompile and custom depth material: https://threejs.org/docs/#api/en/materials/Material.onBeforeCompile, https://threejs.org/docs/pages/Object3D.html
- MeshToonMaterial and gradient maps: https://threejs.org/docs/pages/MeshToonMaterial.html
- Terrain from noise: https://www.redblobgames.com/maps/terrain-from-noise/
- Libraries: https://github.com/jwagner/simplex-noise.js, https://github.com/kchapelier/poisson-disk-sampling
- drei docs: https://drei.docs.pmnd.rs/ (KeyboardControls, useGLTF, useAnimations, Html, Sky, Stars, Clouds, PositionalAudio)
- R3F scaling guidance: https://r3f.docs.pmnd.rs/advanced/scaling-performance
- Stylized grass and wind: https://smythdesign.com/blog/stylized-grass-webgl/

Assets (CC0):

- Kenney Nature Kit: https://kenney.nl/assets/nature-kit
- Quaternius Ultimate Stylized Nature Pack: https://poly.pizza/bundle/Ultimate-Stylized-Nature-Pack-zyIyYd9yGr
- Quaternius Animated Animal Pack (reference only, not used): https://poly.pizza/bundle/Animated-Animal-Pack-ILAPXeUYiS

Opus 5.5 guidance: https://claude.dev/blog/getting-the-most-out-of-opus-5-5/
