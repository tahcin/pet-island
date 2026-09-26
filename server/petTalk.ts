import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { PET_ACTS, PET_MOODS, PetTalkSchema, clip, type PetTalk } from "../src/schema/petReading";
import { MODEL, type CallResult, type FallbackReason, type ParseClient } from "./petReading";

export const TALK_TIMEOUT_MS = 12_000;

let sharedClient: Anthropic | null = null;
export function defaultTalkClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  sharedClient ??= new Anthropic();
  return sharedClient;
}

function isTimeout(err: unknown): boolean {
  return (
    err instanceof Anthropic.APIConnectionTimeoutError ||
    err instanceof Anthropic.APIUserAbortError ||
    (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError"))
  );
}

/**
 * One text-only structured-output call. Never throws: refusal, unparseable output, timeout,
 * and API errors all resolve to `fallbackValue` with a reason.
 */
export async function parseText<S extends z.ZodType, T>(
  label: string,
  schema: S,
  system: string,
  user: string,
  normalize: (raw: z.infer<S>) => T,
  fallbackValue: T,
  client: ParseClient | null,
  timeoutMs: number,
): Promise<CallResult<T>> {
  const start = Date.now();
  const done = (value: T, reason?: FallbackReason): CallResult<T> => ({
    value,
    fallback: reason !== undefined,
    reason,
    ms: Date.now() - start,
  });
  if (!client) return done(fallbackValue, "no_key");
  try {
    const response = await client.messages.parse(
      {
        model: MODEL,
        max_tokens: 1024,
        system,
        output_config: { effort: "low", format: zodOutputFormat(schema) },
        messages: [{ role: "user", content: user }],
      },
      { timeout: timeoutMs, maxRetries: 0, signal: AbortSignal.timeout(timeoutMs) },
    );
    if (response.stop_reason === "refusal") return done(fallbackValue, "refusal");
    if (response.parsed_output === null || response.parsed_output === undefined) return done(fallbackValue, "parse");
    return done(normalize(response.parsed_output as z.infer<S>));
  } catch (err) {
    if (isTimeout(err)) return done(fallbackValue, "timeout");
    if (err instanceof Anthropic.APIError) {
      console.warn(`${label} API error ${err.status}: ${err.message}`);
      return done(fallbackValue, "error");
    }
    console.warn(`${label} failed:`, err instanceof Error ? err.message : err);
    return done(fallbackValue, "parse");
  }
}

/** Request body for POST /api/pet/talk (PRD 9.9). The client builds the perception prose. */
export const TalkRequestSchema = z.object({
  pet: z.object({
    name: z.string(),
    species: z.string(),
    islandName: z.string().optional(),
    mind: z.object({ persona: z.string(), voice: z.string(), goal: z.string() }),
  }),
  perception: z.string(),
});
export type TalkRequest = z.infer<typeof TalkRequestSchema>;

export function talkSystem(req: TalkRequest): string {
  const p = req.pet;
  return `You are ${clip(p.name, 24, "Pet")}, a ${clip(p.species, 24, "pet").replace("_", " ")} who lives on ${clip(p.islandName, 40, "the island")} with the person who loves you.
You are their pet, not an assistant: you have your own feelings, habits and wishes.
Personality: ${clip(p.mind.persona, 420)}
How you talk: ${clip(p.mind.voice, 180)}
What you want: ${clip(p.mind.goal, 200)}
You speak in short, simple, warm sentences, like an Animal Crossing character, and may use one pet
sound ("woof", "mrrp") now and then. Everything you perceive is in the user message. Mention only
things that are really there. Keep it short and natural, never repeat an earlier line, and do not
describe your actions in words: choose an act instead. If the person asks you to do something you
can do, do it. If they ask what you are, you can say your thoughts are played by Claude.
Say at most 30 words. target is a name from the "Around you" list when act is go_to, otherwise "".
remember is one short new fact worth keeping about the person or the island, or "".`;
}

export function normalizeTalk(raw: PetTalk): PetTalk {
  const words = clip(raw.say, 240).split(/\s+/).filter(Boolean);
  return {
    say: words.slice(0, 30).join(" "),
    act: (PET_ACTS as readonly string[]).includes(raw.act) ? raw.act : "follow",
    target: clip(raw.target, 60),
    mood: (PET_MOODS as readonly string[]).includes(raw.mood) ? raw.mood : "happy",
    remember: clip(raw.remember, 120),
  };
}

export const TALK_FALLBACK: PetTalk = { say: "", act: "follow", target: "", mood: "happy", remember: "" };

export async function petTalk(
  req: TalkRequest,
  client: ParseClient | null = defaultTalkClient(),
  timeoutMs = TALK_TIMEOUT_MS,
): Promise<CallResult<PetTalk>> {
  return parseText(
    "pet talk",
    PetTalkSchema,
    talkSystem(req),
    clip(req.perception, 6000, "The person is here."),
    normalizeTalk,
    TALK_FALLBACK,
    client,
    timeoutMs,
  );
}
