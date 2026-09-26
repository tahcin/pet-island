# Pet Island

Show Claude a photo of your pet. Seconds later you're walking around a cozy Animal Crossing style island with a chibi 3D version of them, and they talk back.

Built at **Opus Build Day, Bangalore**, on the **Delight track**.

**Play it:** _live link goes here_

## Who it's for

Pet parents, which is roughly everyone with a phone full of pet photos. We built the whole thing for the moment someone says "that's my dog."

## How it plays

1. **Upload a photo.** Dogs, cats and rabbits work best.
2. **Claude reads it.** One call returns species, build, colours, markings, ears and tail, plus a name, a personality, a voice, an island name and three villager neighbours.
3. **Your pet draws itself in.** It's built from rounded toon shapes right in the browser, so it's instant, with no generative 3D involved, and it always comes out cute.
4. **Explore.** Every island is freshly generated, with beaches, cliffs, a river and a rolling curved horizon. Your pet follows you, sniffs around, digs things up and sits when you stop. Press Tab to play as the pet.
5. **Talk to it.** Type "show me a trick" and it answers in its own voice, then actually does the trick.
6. **Come back later.** The island remembers you. New shells have washed up and your pet is happy to see you.

## What Claude does

Three small structured-output calls. Each one has an offline fallback, so the game never waits on the network.

| Call | Claude gets | Claude returns |
| --- | --- | --- |
| Read the pet | One photo | A typed character sheet covering body spec, name, personality, voice, villagers and quest lines |
| Talk to the pet | What the pet can see, what it remembers, what you said | A line, an action (sit, play, trick, go to...), a mood and a new memory |
| Villager gossip | Two villagers and their memories | A short chat you can overhear, which might mention what you did for them |

## Why this needs the new model

- **One photo in, a whole character out.** A single vision call turns a casual phone photo into a valid, typed spec that drives both the 3D model and the personality, and it's fast enough for a live demo table.
- **The pet perceives and acts.** Every reply is grounded in a snapshot of the world (who's nearby, what's in your pocket, what just happened) and ends in an action the game carries out. It's a character living on the island, not a chatbot bolted onto a game.
- **Built by Opus 5.5 in a day.** Claude Code built the game autonomously from our spec and checked its own screenshots against the art direction before each commit.

## Controls

| Key | Does |
| --- | --- |
| WASD / arrows | Move (Shift to run) |
| Space | Talk, collect, play with your pet |
| T | Talk to your pet |
| Tab | Swap between you and the pet |
| P | Photo mode, saves a PNG |
| N | New island, same pet |

## Run it locally

```
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
npm run dev        # http://localhost:5173
```

Without a key it still runs, just with a stand-in pet and offline replies.

`npm test` runs the unit tests, `npm run e2e` the Playwright smoke test.

## Built with

Claude Opus 5.5 in Claude Code as the builder, the Claude API with structured outputs at runtime, three.js with React Three Fiber, Vite and Hono. Everything is procedural apart from a few free CC0 props. We made the pets, the island and the villagers from code.

Full spec in [`PRD.md`](PRD.md).
