# Pet Island build checklist

No time budget: move as fast as possible. Build M0 and M1 in parallel with a subagent (create the zod schema and toon material factory first, since both need them).

Tick an item only when its acceptance criteria in `PRD.md` pass. Commit at the end of each milestone.

## M0 Walkable island

- [ ] Vite + React 19 + R3F 9 + drei 10 + three 0.186 + zustand + TypeScript strict scaffold, `npm run dev` renders a canvas
- [ ] Hono server scaffold with `/api/health`, Vite proxy for `/api`
- [ ] `src/world/heightmap.ts`: seeded fBm, island mask, beach band, three terraces, `heightAt`, `levelAt`, `isWater`
- [ ] `src/world/river.ts`: one river polyline carved into the heightmap
- [ ] Ramps between terrace levels (two per boundary)
- [ ] `Terrain.tsx`: flat-shaded, vertex-colored mesh from the heightmap
- [ ] `Water.tsx`: translucent plane at sea level
- [ ] `render/toon.ts`: gradient map and MeshToonMaterial factory
- [ ] `render/bend.ts`: curved world patch with shared uniform, custom depth material, `frustumCulled = false`
- [ ] Lights, sky, fog per PRD section 8, `flat` tone mapping
- [ ] Capsule placeholder with WASD, Shift run, heightmap grounding, water and cliff blocking
- [ ] Damped follow camera with mouse orbit and scroll zoom
- [ ] `scripts/screenshot.ts` writes three PNGs at seed 12345
- [ ] Unit tests: heightmap determinism, no NaN heights, ramps connect levels
- [ ] Screenshot reviewed against PRD section 8, commit "M0 walkable island"

## M1 Pet builder

- [ ] `schema/petReading.ts` with the zod schemas from PRD 6.3
- [ ] `pet/buildPet.ts` returns a group with all named pivots for dog, cat, rabbit
- [ ] Ear variants (6) and tail variants (6) implemented
- [ ] Build, size, fur length affect proportions
- [ ] `pet/markingTexture.ts` with all nine patterns, cached by spec hash
- [ ] `pet/petAnimator.ts`: idle, walk, run, sit, dig, sniff, happy with 0.2 s blends
- [ ] Reveal turntable screen with name, traits, island name, "Let's go"
- [ ] Unit tests: every enum combination builds, pivots exist, textures deterministic
- [ ] Screenshot of dog, cat, rabbit reviewed for the AC look, commit "M1 pet builder"

## Checkpoint A: the look

- [ ] Island screenshots in `screenshots/` and dog, cat, rabbit turntable screenshots in `screenshots/pets/`
- [ ] Stop, show them to the human with the dev server command, ask: "Does this look like Animal Crossing, and do the pets look cute rather than like programmer art?"
- [ ] Apply feedback, commit "checkpoint A feedback"

## M2 Claude reading

- [ ] `server/petReading.ts`: `messages.parse` with structured output, refusal and parse fallback, 20 s timeout, 413 on oversized images
- [ ] `POST /api/pet` route
- [ ] Landing screen with drag and drop upload, client-side resize to 1024 px JPEG
- [ ] Reading screen with placeholder pet wiggle
- [ ] Store wiring: reading, seed, screen router
- [ ] Server unit tests with a mocked SDK: refusal, timeout, bad JSON, oversized image
- [ ] Real photo test: every photo in `test-photos/` produces a sensible spec in under 10 s, and the bad image produces the fallback pet
- [ ] Commit "M2 claude reading"

## M3 Two modes

- [ ] `avatar/buildAvatar.ts`: simple villager with idle, walk, run, wave
- [ ] `pet/petBrain.ts`: follow, idle, sit, sniff, happy states per PRD 9.2
- [ ] Tab swaps control, camera height changes, avatar waves when the pet is near
- [ ] Space in pet mode digs or sniffs with a dust puff
- [ ] C toggles pet-cam in pet mode
- [ ] Playwright smoke: load, mocked reading, reveal, play, Tab swap
- [ ] Commit "M3 two modes"

## Checkpoint B: first playable

- [ ] A real photo from `test-photos/` goes upload, reading, reveal, island, pet follows, Tab swaps
- [ ] Stop, give the human the run commands, ask them to play two minutes: "What feels off?"
- [ ] Apply feedback, commit "checkpoint B feedback"

## M4 Props and polish

- [ ] Kenney Nature Kit GLBs in `public/models`, primitive fallbacks for every prop type
- [ ] `world/placement.ts`: Poisson placement filtered by level, slope, water, river, homes
- [ ] `Props.tsx`: one InstancedMesh per prop type, toon materials keeping the atlas
- [ ] Circle collisions against a spatial hash of trees and rocks
- [ ] Wind sway uniform on foliage materials
- [ ] HUD: name, traits, counter, hints, mode, seed
- [ ] Draw calls under 150, 60 fps at 1.5 dpr on the dev laptop
- [ ] Unit tests: no placement in water, river, or on steep slopes
- [ ] Screenshot passes the "is this Animal Crossing?" check, commit "M4 props and polish"

## M5 Play

- [ ] Collectible primitives: bone, yarn, carrot, shell
- [ ] Collectibles placed by species and beach, collected by proximity or Space, HUD tween
- [ ] Pet digs reveal a collectible 30 percent of the time
- [ ] Villagers from the reading, seeded random bodies, wander, face player, speech bubbles
- [ ] Two fetch quests with bandana and hat rewards, quest tracker in HUD
- [ ] Playwright: collect an item, talk to a villager
- [ ] Commit "M5 play"

## M6 Living island

- [ ] Check the reading already carries `mind` and villager `persona` (built into the schema in M1 and the prompt in M2) and the default reading has them too
- [ ] `/api/pet/talk` with `PetTalkSchema`, 12 s timeout, fallback (PRD 9.9)
- [ ] `talk/perception.ts` (pure), `talk/offlineIntent.ts`, `talk/petMind.ts` queue, plans, memory
- [ ] TalkBar with chips, player bubble, thinking dots, typewriter reply with animalese
- [ ] Acts drive the pet brain with plan durations, mood glyphs on change
- [ ] `save/save.ts`: autosave every 20 s and on hide, load, version check, try/catch everywhere (PRD 9.11)
- [ ] Landing "Continue with {name}" card and "Start fresh" link
- [ ] Return news (shells wash up, villager memories) and the pet's return greeting
- [ ] `/api/villagers/chat` with `VillagerChatSchema`, meetup trigger every 75 s, playback, villager memory (PRD 9.10)
- [ ] Quest completion adds a villager memory
- [ ] Unit tests: perception, offline intent, save round-trip and corrupt save, return news
- [ ] Playwright: mocked talk route, "sit" makes the pet sit; reload shows "Continue with {name}"
- [ ] Commit "M6 living island"

## M7 Juice

- [ ] Photo mode: P hides HUD, countdown, PNG download with pet name
- [ ] N reseeds the island in under 1 s and resets collectibles and quests
- [ ] Ambient sea and bird loops, muted by default
- [ ] Day and night cycle with pause toggle
- [ ] Small rodent archetype
- [ ] Commit "M7 juice"

## Cut list (apply in order if the human says to wrap up)

day and night, ambient audio, small rodent archetype, overheard villager chats, second quest, pet-cam, wind sway, third villager, photo watermark, save and return

## Never cut

curved world, toon look, pet follow, Claude reading with fallback
