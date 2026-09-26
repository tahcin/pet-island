# Pet Island

Upload a pet photo, get a chibi toon 3D version of the pet, explore a generated Animal Crossing style island with it. Full spec in `PRD.md`. Progress checklist in `TASKS.md`. Techniques and constants borrowed from the Worldpen reference are in `docs/inspiration.md`; read it before M1 (pet builder) and M3 (companion AI).

## Stopping rules

- Work through `TASKS.md` in order without pausing to report or offer options. Tick items as they pass their acceptance criteria.
- Move fast. Get each milestone working end to end before polishing. Build M0 and M1 in parallel with a subagent. If something blocks you after a few attempts, take the fallback in the PRD, note it in TASKS.md, and keep going.
- Stop at exactly two human checkpoints (PRD section 12): Checkpoint A after M0 and M1 (show island and pet screenshots, ask about the look) and Checkpoint B after M3 (first playable, ask what feels off). Wait for feedback, apply it, then continue.
- Otherwise stop and ask only when you cannot continue without a human: a missing `ANTHROPIC_API_KEY`, an asset download that fails after one retry and has no primitive fallback listed in the PRD, or a decision the PRD leaves open that changes the demo.
- Never delete data, force-push, run `git reset --hard`, or change anything outside this folder.
- This folder is the repo root. Scaffold into it, not into a subfolder.
- Real pet photos for testing are in `test-photos/`.

## Commands

```
npm install
npm run dev          # Vite on 5173 with /api proxied to the server on 8787
npm run server       # Hono server with the Claude route
npm run build
npm test             # vitest
npm run e2e          # playwright smoke tests
npm run screenshot   # deterministic island PNGs at seed 12345 into ./screenshots
```

## Conventions

- TypeScript strict. No `any` outside third-party typings.
- `src/world/generateWorld.ts` and `src/pet/buildPet.ts` are pure and deterministic. No React, no store, no side effects.
- Per-frame values in refs and `useFrame`, never in React state.
- Materials with `onBeforeCompile` are created once in `useMemo` or module scope.
- Every feature has at least one unit test if it is pure, or is covered by the Playwright smoke test if it is UI.
- No em dashes in any copy, comment, or commit message. Rewrite the sentence instead.
- No emoji in UI copy.
- Commit at the end of every milestone with a message that names the milestone.

## Verification before each commit

1. `npm test` and `npm run e2e` pass.
2. `npm run screenshot`, then look at the PNGs and compare against PRD section 8. List anything off and fix it before committing.
3. Review the diff: list only problems you would block the merge for, with file, line, why it is wrong, and how to show it fails. Fix them.

## Claude API

- Model `claude-opus-5`, `client.messages.parse` with `output_config: { effort: "low", format: zodOutputFormat(PetReadingSchema) }`.
- Check `stop_reason === "refusal"` and `parsed_output === null`. Both return the default reading with `fallback: true`.
- The API key lives only in `.env` on the server. The browser never calls Anthropic directly.
- Three routes, all `claude-opus-5` at low effort with structured outputs: `/api/pet` (photo reading, PRD 6.4), `/api/pet/talk` (PRD 9.9), `/api/villagers/chat` (PRD 9.10). Every route has a fallback so the game never waits on Claude.
- Only one talk or chat call in flight at a time; talk takes priority.
