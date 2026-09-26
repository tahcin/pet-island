import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import {
  DEFAULT_READING,
  PetCoreWireSchema,
  PetDetailsWireSchema,
  normalizeDetails,
  normalizeReading,
  type PetDetails,
  type PetReading,
} from "../src/schema/petReading";

export const MODEL = "claude-opus-5";
export const READING_TIMEOUT_MS = 20_000;
/** Claude's per-image limit is 5 MB decoded; the client resizes to 1024 px so real uploads are far below. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

const SHARED = `You are helping build a cute Animal Crossing style 3D version of a pet from one photo.
Everything you write is warm and playful, one sentence per line, no emoji.`;

export const CORE_SYSTEM = `${SHARED}
Describe the pet using only the allowed values. Choose the closest archetype for unusual pets.
When unsure about ears, tail, or build, choose the most common configuration for that breed or species.
Colors are hex strings that read well as flat pastel toon shading: lift very dark coats to a warm charcoal
like #3a3238 rather than pure black, and keep whites slightly warm like #f6f1e7.
baseColor is the main coat color; secondaryColor is the marking color (equal to baseColor for solid pets).
markingCoverage is 0 to 1, how much of the secondary color shows. confidence is 0 to 1.
Give exactly 3 name suggestions and exactly 3 personality words.
Name suggestions should feel like a pet name, short and friendly, and fit this pet's look
(a tuxedo cat could be Domino); avoid the most overused names such as Biscuit, Mochi, and Luna. Personality is three lowercase adjectives.
The greeting is one line the pet says when it first sees its island. The island name is short and cute.
If the image has no animal in it, describe a friendly made-up dog and set confidence to 0.`;

export const DETAILS_SYSTEM = `${SHARED}
Write the pet's mind as a warm, specific character sketch you can read from the photo (a pet
sprawled on a sofa is a champion napper, a pet in a costume is a show-off): persona in 2 or 3
sentences (temperament, what it loves and fears, how it feels about its person), voice (how it talks,
with one or two pet phrases), and goal (what it wants to do on the island).
Never use the pet's name; its name is chosen elsewhere, so say "this pup", "she", "he", or "they".
Also invent exactly 3 villagers: other pets who live on the island, with varied species and
distinctive, unusual names (not Biscuit, Pip, Mochi, or other very common pet names).
Each has a one-sentence persona, exactly 3 short lines they say to the player, a questAsk asking the
player to bring 3 of something, and a questThanks thanking them for it.
If the image has no animal in it, write the mind for a friendly made-up dog.`;

export type FallbackReason = "no_key" | "refusal" | "parse" | "timeout" | "error" | "no_pet";

/** Below this confidence Claude found no animal in the photo, so the stand-in pet is used. */
export const NO_PET_CONFIDENCE = 0.1;

export interface CallResult<T> {
  value: T;
  fallback: boolean;
  reason?: FallbackReason;
  ms: number;
}
export type ReadingResult = CallResult<PetReading> & { reading: PetReading };

/** The subset of the SDK the reading needs, so tests can pass a fake. */
export interface ParseClient {
  messages: {
    parse: Anthropic["messages"]["parse"];
  };
}

let sharedClient: Anthropic | null = null;
function defaultClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  sharedClient ??= new Anthropic();
  return sharedClient;
}

export function base64Bytes(b64: string): number {
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

function isTimeout(err: unknown): boolean {
  return (
    err instanceof Anthropic.APIConnectionTimeoutError ||
    err instanceof Anthropic.APIUserAbortError ||
    (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError"))
  );
}

/**
 * One structured-output call over the photo. Never throws: refusal, unparseable output,
 * timeout, and API errors all return the fallback with a reason.
 */
async function parseImage<S extends z.ZodType, T>(
  schema: S,
  system: string,
  imageBase64: string,
  mediaType: ImageType,
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
        max_tokens: 4096,
        system,
        output_config: { effort: "low", format: zodOutputFormat(schema) },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
              { type: "text", text: "Describe this pet for the island." },
            ],
          },
        ],
      },
      { timeout: timeoutMs, maxRetries: 0, signal: AbortSignal.timeout(timeoutMs) },
    );
    if (response.stop_reason === "refusal") return done(fallbackValue, "refusal");
    if (response.parsed_output === null || response.parsed_output === undefined) {
      return done(fallbackValue, "parse");
    }
    return done(normalize(response.parsed_output as z.infer<S>));
  } catch (err) {
    if (isTimeout(err)) return done(fallbackValue, "timeout");
    if (err instanceof Anthropic.APIError) {
      console.warn(`pet reading API error ${err.status}: ${err.message}`);
      return done(fallbackValue, "error");
    }
    // Malformed JSON or schema validation failures surface as thrown errors from parse().
    console.warn("pet reading failed:", err instanceof Error ? err.message : err);
    return done(fallbackValue, "parse");
  }
}

/**
 * The core reading (PRD 6.4): spec, names, traits, greeting, island name. The mind and
 * villagers come from DEFAULT_READING until readPetDetails fills them in.
 */
export async function readPet(
  imageBase64: string,
  mediaType: ImageType,
  client: ParseClient | null = defaultClient(),
  timeoutMs = READING_TIMEOUT_MS,
): Promise<ReadingResult> {
  const r = await parseImage(
    PetCoreWireSchema,
    CORE_SYSTEM,
    imageBase64,
    mediaType,
    (raw) => normalizeReading({ ...DEFAULT_READING, ...raw }),
    DEFAULT_READING,
    client,
    timeoutMs,
  );
  if (!r.fallback && r.value.spec.confidence < NO_PET_CONFIDENCE) {
    return { ...r, value: DEFAULT_READING, reading: DEFAULT_READING, fallback: true, reason: "no_pet" };
  }
  return { ...r, reading: r.value };
}

/** The pet's mind and the three villagers, fetched in parallel with the core reading. */
export async function readPetDetails(
  imageBase64: string,
  mediaType: ImageType,
  client: ParseClient | null = defaultClient(),
  timeoutMs = READING_TIMEOUT_MS,
): Promise<CallResult<PetDetails>> {
  const fallback: PetDetails = { mind: DEFAULT_READING.mind, villagers: DEFAULT_READING.villagers };
  return parseImage(
    PetDetailsWireSchema,
    DETAILS_SYSTEM,
    imageBase64,
    mediaType,
    (raw) => normalizeDetails({ ...DEFAULT_READING, ...raw }),
    fallback,
    client,
    timeoutMs,
  );
}
