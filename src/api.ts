import {
  DEFAULT_READING,
  normalizeDetails,
  normalizeReading,
  type PetDetails,
  type PetReading,
} from "./schema/petReading";

export type FallbackReason = "no_key" | "refusal" | "parse" | "timeout" | "error" | "network" | "no_pet";

export interface CoreResponse {
  reading: PetReading;
  fallback: boolean;
  reason?: FallbackReason;
}

export interface DetailsResponse {
  details: PetDetails;
  fallback: boolean;
}

/** Slightly longer than the server's 20 s so the server's own timeout fallback usually wins. */
const CLIENT_TIMEOUT_MS = 22_000;

async function postJson(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
}

/** POST /api/pet. Never throws: network failures come back as the default reading. */
export async function fetchReading(base64: string): Promise<CoreResponse> {
  try {
    const json = (await postJson("/api/pet", { imageBase64: base64, mediaType: "image/jpeg" }, CLIENT_TIMEOUT_MS)) as {
      reading?: unknown;
      fallback?: boolean;
      reason?: FallbackReason;
    };
    return { reading: normalizeReading(json.reading), fallback: Boolean(json.fallback), reason: json.reason };
  } catch (err) {
    return { reading: DEFAULT_READING, fallback: true, reason: isAbort(err) ? "timeout" : "network" };
  }
}

/** POST /api/pet/details. Never throws. */
export async function fetchDetails(base64: string): Promise<DetailsResponse> {
  try {
    const json = (await postJson(
      "/api/pet/details",
      { imageBase64: base64, mediaType: "image/jpeg" },
      CLIENT_TIMEOUT_MS,
    )) as { details?: unknown; fallback?: boolean };
    return { details: normalizeDetails({ ...DEFAULT_READING, ...(json.details as object) }), fallback: Boolean(json.fallback) };
  } catch {
    return { details: { mind: DEFAULT_READING.mind, villagers: DEFAULT_READING.villagers }, fallback: true };
  }
}

/** Friendly sentence for each fallback reason, or null when no message is needed. */
export function fallbackMessage(reason: FallbackReason | undefined): string | null {
  switch (reason) {
    case "timeout":
      return "Taking longer than usual, here is a stand-in pet.";
    case "no_pet":
      return "Claude could not find a pet in that photo, so here is a stand-in pet. Try a photo of your pet.";
    case "refusal":
    case "parse":
      return "Claude could not quite read that photo, so here is a stand-in pet. A clearer photo helps.";
    case "error":
    case "network":
      return "Claude is busy right now, so here is a stand-in pet. Try again in a moment.";
    case "no_key":
      return "Claude is not connected, so here is a stand-in pet.";
    default:
      return null;
  }
}
