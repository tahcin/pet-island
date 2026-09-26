# Inspiration: Worldpen, read 2026-09-26

Source: the user's copy of the Worldpen artifact (https://claude.ai/artifact/XVrVDjzou4rcHWHrtqZPua), a single-file three.js r149 app of 11,416 lines. Read in full. This digest keeps only what Pet Island can use. Anything marked "adopt" is already reflected in `PRD.md`. Section 9 records which scope options were taken.

## What Worldpen is

Describe a world (or upload a picture), pick who you are, and walk in. Claude writes the world spec, your avatar, and landmarks as streamed JSON lines. Inside, anything you type, draw, or sketch becomes a real object built from primitives, optionally with behaviour code, physics, or "a mind of its own" played live by Claude. It also has a 2D picture-book mode with nine art styles. It is a realistic-render world with a dark glass HUD, so the look is the opposite of ours, but the structure underneath is almost exactly what Pet Island needs.

## 1. Things made of primitives (our pet builder)

Worldpen's whole content model is "a thing line plus 12 to 36 part lines", each part `{p: name, s: shape, at: [x,y,z], d: dims, c: hex, r?: deg, e?: glow, pv?: pivot, m?: material}`. Shapes: box, ball, cyl, cone, pyramid, capsule, ring, dome, wedge. Claude never sends rig data. Instead:

- **Part names are the animation API (adopt).** `catOf(name)` classifies parts into body, head, eye, mouth, ear, leg, arm, wing, tail, fin, wheel, flame, leaf. Legs are `leg1, leg2, ...`; a leg built from three parts sharing one name (thigh, shin, foot) gets a knee and a grounded foot automatically.
- **Auto pivots by category (adopt).** Legs and arms hinge at their top centre, tails and fins at the end nearest the body along the longest axis, heads at the bottom centre (the neck), wings at the inner edge. Children are re-parented so the pivot sits at that point. Quadruped detection: four or more legs spread more than 15 percent of body height in Z; then diagonal pairs share a phase.
- **Head attachment by name and containment (adopt).** Eyes, mouth, ears, nose, whiskers, hats inside an expanded head box become children of the head pivot, so they turn with it.
- **Pose loop constants (adopt).** Stride advances at `2.6 + 1.5 * speed`. Leg swing `sin(stride + parity*PI) * 0.6 * moveAmt`. Tail wag `sin(T * (3 + 3*moveAmt)) * 0.35`. Blink: eye `scale.y = 0.12` for 0.13 s every 2.5 to 6 s. Mouth while talking `1 + 0.4 * |sin(14T)|`. Breathing `1 + 0.018 * sin(2.2T)`. Head turns toward the player within 12 m, clamped to 0.8 rad, damped at 4 per second.
- **Glance behaviour (adopt).** When nobody is near, pick a random look target every 2.5 to 6.5 s with a 55 percent chance of "look nowhere". Yaw clamp 63 degrees, pitch -0.55 to 0.6, 35 percent of the yaw goes into a neck if one exists. This alone makes a companion feel alive.
- **Two-bone leg IK with a no-knee fallback (option, P1).** With a knee: law of cosines from hip height to ground sample under the projected foot. Without a knee: scale the leg in Y between 0.7 and 1.25 to reach the ground. Quadruped body pitch from front and back ground samples, roll from left and right, both damped at 6 per second. Our pet legs are single capsules, so the scale fallback plus body pitch is the cheap win on slopes.
- **Squash and stretch spring.** `v += (-190x - 16v) * h` integrated at 8 ms substeps, applied as `scale(1 + 0.55k, 1 - k, 1 + 0.55k)`. Jump sets -0.16, landing sets `clamp(impact/60, 0.06, 0.26)`.
- **Draw-in reveal (adopt for the reveal screen).** Each part first appears as an ink outline (`EdgesGeometry`) that traces itself over 0.28 s with gold sparks and one pentatonic pluck note, then the coloured mesh pops from 55 to 100 percent with a back-out ease. Parts are staggered 0.15 s. This turns "building your pet" into a show.
- **Library fallback.** `LIB.fox` is a ready quadruped from primitives (body ball, chest, head, snout cone, nose, two ear cones, two eyes, four cylinder legs with pivots, capsule tail with tip ball). `LIB_WORDS` routes "dog, cat, wolf, pet, bunny, rabbit" to it. Our default reading should be the same idea: a named fallback spec per species.
- **Sanitiser pattern (adopt).** `normMeta` clamps every field: name 40 chars, say lines 3 x 90 chars, size 0.15 to 70, parts max 64, code 3000 chars. Our Zod schema does this, but keep the habit for anything Claude writes into UI.

## 2. Companion and villager AI

Worldpen layers control as **Claude plan > daily routine > scripted code > default wander**, each expiring back to the one below.

- **Follow (adopt).** Keep distance `2.4 + 1.3 * radius` with hysteresis (stop at keep minus 0.4). Speed tiers: base under 7 m, 1.4x over 7 m, 2x over 14 m, and match the player's speed times 1.05 up to 2.8x base when they sprint. Slow to 25 percent while turning more than 1.2 rad. If blocked for 2.2 s, stand still 8 s.
- **Greeting beat (adopt for villagers).** When the player enters `3.5 + radius`, stop for 2.6 s, face them, pop a "!" (75 percent) or a musical note. Do not repeat until they have left 12 m.
- **Play (adopt).** Pick a random point 2.5 to 6 m around the player, run there at 1.7x, hop on arrival, repeat every 4 s.
- **Circle, dance, sleep.** Circle at radius `3 + 1.6 * radius`. Dance: yaw spins at 3.2 rad/s with a hop every 0.9 s and notes every 1.6 s. Sleep: idle, "z" emote every 3 s, wake when the player comes within `2.2 + radius`.
- **Plan durations.** follow 120 s, approach 25, stay 40, go_to 30, look_at 12, circle 14, play 12, dance 8, sleep 70, then back to autonomy. This is why "follow me" never sticks forever.
- **Needs and routines.** Hunger 0 to 1 over 280 s, thirst over 330 s, a rule cascade every 2.5 to 5 s: sleep at night, carry, shy if bond is low, visit the player with a gift if bond is high, drink over 0.65, eat over 0.6, gather in the evening, else wander near home. Eating shrinks the plant by 0.42 and it regrows over about 5 minutes. Villagers sleep in a deterministic ring around their home.
- **Mood glyphs (adopt).** A one-word mood maps to one glyph: heart, !, !!, ?, note, star, z, #, ellipsis, tilde. Shown only when the mood changes. Cheap emotional readability with no animation work.
- **Bond (option).** One float per creature in -1 to 1. +0.03 per line said to it, +0.2 per gift, -0.15 when kicked. Bands in words: "you do not know them well yet" through "you trust them completely". Changes over 0.1 are written into memory as first-person sentences ("The person gave me berries."). Persisted with the save.

## 3. Minds: Claude-played NPCs (adopted as F25 and F27, see PRD 9.9 and 9.10)

- Persona, voice, and goal are written **once** by the builder call (2 to 3 sentences each) and stored on the thing. Every later thought is one small call at the fastest tier.
- Perception is prose: "You: Ellie, an elephant about 3 m tall. The person: 4 m away, in front of you, to the left; walking; looking right at you." Up to 8 nearby things, nearest water, the world's time and weather, the last 12 conversation lines, pending events, and "what just happened".
- The output contract is one JSON object: `say` (max 30 words or empty), `act` from a fixed verb list, `target`, `mood`, `emit`, `sound`, `remember` (one fact, cap 8), `ride`.
- Key prompt lines worth quoting: "You are not an assistant: you have your own mind, feelings and wishes." "Staying quiet is fine: most of the time living things just get on with their day." "Keep it short and natural, never repeat an earlier line, and don't describe your actions in words: act instead."
- Cost controls: one call in flight, max 6 ambient calls per rolling minute, none when the tab is hidden or the player has been idle 100 s, spoken replies interrupt idle musing, a "quiet" counter lengthens the interval when the mind keeps choosing silence.
- The `say` field streams into the speech bubble before the JSON finishes (`partialSay` scans the accumulating text), so latency feels halved.
- Two villagers within 10 m hold an overheard conversation in a single call every 45 s or more: 2 to 4 lines plus a bond delta and a memory each.

## 4. World

- **Island height function.** `(fbm(x/70) * 1.3 + 0.12 + 0.55 * (1 - smooth(0, 60, r)) - 0.3 * smooth(90, 190, r)) * 24 * relief + detail * 0.8`. Water level is the `spec.water` quantile of sorted interior heights, so "water 0.42" floods the lowest 42 percent. A spawn pad is flattened with `smooth(8, 24, r)`. Beyond the playable radius the ground sinks to sea floor so you cannot walk off.
- **Scatter rules (adopt).** Per type: max count, slope limit, min distance from spawn, spacing, scale range, cluster strength, collider radius factor, variants, priority (buildings first). Rejection sampling in a disc, `sqrt(r)` for uniform area, scale `lerp(s0, s1, r^1.6)` so most things are small, 6 m occupancy grid for spacing, `footHeight` (min over 8 samples) so big things sit on slopes. Props pop in with a back-out ease staggered by distance from spawn (`0.2 + dist/90` seconds). Same idea for our island intro.
- **Colliders (adopt).** Cylinder colliders in an 8 m spatial hash. `pushOut` only if feet are below the top minus 0.25, so you can stand on rocks. `blockedAt` doubles as the AI pathing test.
- **Grass that follows you.** 42,000 instanced blades tiled in a 52 m patch around the player with `mod()` in the vertex shader, height from a height texture, culled by slope, water, and a 128x128 mask around placed things, wind sway, and blades within 1.4 m lean away from the player. One draw call. Add a second push point for the pet.
- **Fog shared by every material.** One uniform object injected via `onBeforeCompile` before `<tonemapping_fragment>`, with `customProgramCacheKey`. Same pattern as our curved-world bend, so both patches can share one function.
- **Time of day.** A day every 12 minutes, eight keyframes (night, night, dawn, day, day, sunset, night, night), two named looks blended with smoothstep. Sun elevation `top * sin(PI * u) + 2.2`. Season advances one step per day. `clockGoto` fast-forwards instead of jumping so the sun visibly travels.
- **Ambient life.** Birds are 14 two-triangle V shapes circling a centre that drifts toward the player; butterflies steer to random targets 3 to 21 m away with a `sin(3T)` wobble; fish are three triangles with a tail wag. Each is about 60 lines and one draw call.
- **Particles.** One 256x128 atlas with 8 cells (dot, heart, note, star, flake, petal, ring, sparkle) and recipes: hearts with negative gravity, confetti, sparkles, poof, leaves, snow. Weather is a camera-wrapping box of points.
- **Audio.** Every sound is synthesised with WebAudio: bark, meow, chirp, quack, pop, ding, a 4-note pad chord every 4.6 s per mood, birds by day, crickets at night. Zero asset loading. "Animalese" is a tiny tone per typed character at `430 / sqrt(height)` Hz.

## 5. Player, camera, interaction

- **Third-person camera (adopt).** Shoulder offset `0.45 * h` clamped 0.5 to 3.5, look height `0.85 * h`, boom `4.6 + 1.3 * h` times zoom, pitch -0.35 to 1.2 rad, ten samples along the boom pulling in before terrain plus a floor of ground + 0.4, position follow `1 - exp(-16 dt)`, mouse look 0.0055 rad/px yaw and 0.0045 pitch, wheel zoom x1.1 clamped 0.45 to 2.6. A 1.7 s swoop with a 4 m vertical arc when switching views.
- **Grounding without physics (adopt).** Gravity with terminal -60, land when `y <= ground`, step-up snap under 1.2 m, step-down snap under 0.6 m. Walk 4.8 m/s, sprint x1.75, jump velocity 8. From the 2D mode: jump buffer 0.16 s, coyote time 0.1 s, 1.2x gravity when the key is released early.
- **Picking (adopt).** Raycast from the camera against thing groups every third frame, walk up to `userData.thing`; if the ray misses, the nearest thing within 2.5 m that is not more than slightly behind. Tag placed by projecting the top of the thing with `translate(-50%, -100%)`. Verb priority: put down > hop off > talk > ride > pick up > custom action.
- **Kick and throw.** Nearest body within `1.6 + 0.25 h` in a front cone. Impulse `8 / sqrt(mass)` horizontal and `4.5 * sqrt(18 / g)` up. Throw speed `17 + 0.6 * playerSpeed`. A fetch game writes itself from this.
- **Peek camera.** When something spawns off-screen, frame both the player and it for 4.5 s, zoom out to 0.6, cancel when the player walks.

## 6. Claude integration (for reference; ours differs)

Worldpen calls `window.claude.use('sample')` from the page with one prompt string, streams text, and parses JSON lines with a brace-depth scanner so objects are used the moment they close. Tiers are surfaced as Fast / Balanced / Best with honest copy ("simpler shapes and little behaviour code" versus "richest code and physics"). One retry only, for image failures, falling back to a text-only reprompt. Every error code maps to a warm sentence ("Claude is busy right now. Try again in a moment.", "Claude would rather not make that one. Try something else."). Status pill copy while working: "Claude is looking at your picture", "Writing Biscuit · 9 parts", "Yours is next", "Yours is second in line".

Pet Island keeps its server route and structured output, but should copy: the status copy, streaming the reveal part by part, the error sentences, and the "Measured from it" trick where the page measures the picture's palette before the call so the fallback still matches the photo.

## 7. Copy worth quoting

- "Write a world. Walk in. Keep writing."
- "Sketch anything. Then make it real."
- "New worlds are written live by Claude from this page. The first time, you'll be asked to allow it."
- "Riding Biscuit. E to hop off." / "Hopped off Biscuit."
- "Look at something and press E to talk to it, or ride it."
- "{name} has a mind of its own. Press E to talk with it."
- "Welcome back to {world}. 2 days passed while you were away; it's autumn now."
- "{name} brought you a flower."
- "For me? Thank you!" / "Oh, how lovely!" / "You're kind."
- Talk chips: "Hi! Who are you?", "What can you see?", "Follow me", "Wait here", "Show me a trick".

## 8. What not to copy

Preetham scattering sky, PMREM environment lighting, ACES filmic grade with vignette and grain, 12-sample screen-space ambient occlusion, HDR bloom pyramid, the four-octave realistic terrain shader, alpha-tested leaf textures, PBR metal and glass part materials, and the `natural()` colour clamp that desaturates toward real albedo. All of these pull toward realism. The rendering layer above the structure is the only part that must be replaced for the Animal Crossing look.

## 9. Scope options raised by this read

Decided on 2026-09-26: options 1, 3, and 5 are in the PRD as F25, F26, and F27 (milestone M6). Options 2 and 4 are out.

1. **Pet mind.** Give the companion pet a Claude-played mind: persona from the photo call, one small call per spoken line, streaming `say`, mood glyphs, `remember`. Adds a second Claude route and latency per reply, and needs the cost controls above.
2. **Write things into existence.** A text box that lets the player add an object or change the weather via one Claude call with a create / event / change schema. Huge fun per line of code, but it is a second content pipeline.
3. **Return greeting with persistence.** A localStorage save with "time passed while you were away" news. Cheap, conflicts with session-only.
4. **Ride the pet.** Seat by part-name regex, camera follows the mount's yaw. Cute for large dogs, odd for hamsters.
5. **Overheard villager chats.** One call every 45 s or more when two villagers are close. Ambient and cheap, but a third Claude call type.
