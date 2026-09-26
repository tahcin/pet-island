# Pet Island

Show Claude a photo of your pet. Seconds later you're walking around a cozy Animal Crossing style island with a chibi 3D version of them, and they talk back. No photo handy? Play with the Claude mascot instead.

Built at **Opus Build Day, Bangalore**, on the **Delight track**.

**Play it:** https://pet-island.vercel.app

## Who it's for

Pet parents, which is roughly everyone with a phone full of pet photos. We built the whole thing for the moment someone says "that's my dog."

## How it plays

1. **Pick your companion.** Upload a photo of your pet (dogs, cats, rabbits and hamsters work best), or play with Claude's own mascot.
2. **Claude reads the photo.** Species, build, colours, markings, ears and tail, plus a name, a personality, a voice, an island name and your neighbours. The reveal lands in about 5 seconds.
3. **Your pet draws itself in.** It's built from rounded toon shapes right in the browser, so it's instant, with no generative 3D involved, and it always comes out cute.
4. **Explore.** Every island is freshly generated: beaches, terraced cliffs you can scramble up, a river, waves with shore foam, a rolling curved horizon, and a day and night cycle. Your pet follows you, sniffs around, digs things up and sits when you stop. Press Tab to play as the pet and C for a pet's-eye camera.
5. **Visit the town.** Six villagers live around a little plaza with a fountain. Each one has a quest for you: fetch shells, deliver a letter, show them your pet, climb to the lookout. The journal tracks them and "Guide me" points the way on screen and on the minimap. Rewards include a bandana, a hat and a bow for your pet.
6. **Talk to your pet.** Type "show me a trick" and it answers in its own voice, then actually does the trick. It remembers things about you. Villagers gossip with each other nearby, and they remember what you did for them.
7. **Come back tomorrow.** Your island, pet and progress are saved. Every day brings a streak bonus, a gift, three fresh daily tasks and a chance at rare finds (golden shells, sparkly bones). Your bond with your pet levels up from "New friends" to "Soulmates", and the Island Passport keeps your collection, stamps and a bell shop.

## What Claude does

Small structured-output calls to `claude-opus-5`. Each one has an offline fallback, so the game never waits on the network.

| Call | Claude gets | Claude returns |
| --- | --- | --- |
| Read the pet | One photo | A typed spec: species, body, colours, markings, ears, tail, name, personality, island name. Fast, so the reveal waits only on this |
| Get to know the pet | The same photo, in parallel | The pet's mind (persona, voice, goal) and three villager neighbours with lines and quests |
| Talk to the pet | What the pet can see, what it remembers, what you said | A line, an action (sit, play, trick, go to...), a mood and a new memory |
| Villager gossip | Two villagers and their memories | A short chat you can overhear, which might mention what you did for them |

## Why this needs the new model

- **One photo in, a whole character out.** A vision call turns a casual phone photo into a valid, typed spec that drives both the 3D model and the personality, and it's fast enough for a live demo table.
- **The pet perceives and acts.** Every reply is grounded in a snapshot of the world (who's nearby, what's in your pocket, what just happened) and ends in an action the game carries out. It's a character living on the island, not a chatbot bolted onto a game.
- **Built by Opus 5.5 in a day.** Claude Code built the game from our spec, milestone by milestone, orchestrating parallel subagents for the world, quests, talk, town, progression, landing page and mobile. It checked its own screenshots against the art direction before each commit.

## Controls

| Key | Does |
| --- | --- |
| WASD / arrows | Move (Shift to run) |
| Mouse drag, scroll | Look around, zoom |
| Space | Talk, collect, turn in a quest, play with your pet |
| T | Talk to your pet |
| Tab | Swap between you and the pet |
| C | Pet's-eye camera (as the pet) |
| J | Quest journal |
| K | Island Passport (bond, daily tasks, collection, stamps, shop) |
| M | Island map |
| P | Photo mode, saves a PNG with your pet's name |
| Esc | Pause menu: sound, photo, new island |

On phones there's a joystick and action buttons.

## Run it locally

```
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
npm run dev        # http://localhost:5173
```

Without a key it still runs, just with a stand-in pet and offline replies.

`npm test` runs the unit tests, `npm run e2e` the Playwright tests, and `npm run screenshot` renders the island at a fixed seed for visual review.

## Deploy

The site deploys to Vercel from this repo. The Hono API is bundled into one serverless function at `api/index.js`, so after changing anything under `server/`, run `npm run build:api` and commit the result. Set `ANTHROPIC_API_KEY` in the Vercel project settings.

## Built with

Claude Opus 5.5 in Claude Code as the builder, the Claude API with structured outputs at runtime, three.js with React Three Fiber, Vite, Hono and zustand. Everything is procedural: the pets, the Claude mascot, the island, the props, the cottages, the town and the sounds are all made from code.

Full spec in [`PRD.md`](PRD.md).
