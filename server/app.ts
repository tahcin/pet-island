import { Hono, type Context } from "hono";
import {
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  base64Bytes,
  readPet,
  readPetDetails,
  type ImageType,
  type ParseClient,
} from "./petReading";
import { TalkRequestSchema, defaultTalkClient, petTalk } from "./petTalk";
import { ChatRequestSchema, villagerChat } from "./villagerChat";

export interface AppDeps {
  /** Claude client override for tests; undefined uses the real SDK when a key is set. */
  claude?: ParseClient | null;
}

type ImageBody = { ok: true; data: string; mediaType: ImageType } | { ok: false; response: Response };

/** Validates { imageBase64, mediaType }: 400 when missing, 415 for other types, 413 when too big. */
async function readImageBody(c: Context): Promise<ImageBody> {
  let body: { imageBase64?: unknown; mediaType?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return { ok: false, response: c.json({ error: "Send JSON with imageBase64 and mediaType." }, 400) };
  }
  const raw = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
  const data = raw.replace(/^data:[^;]+;base64,/, "");
  const mediaType = (typeof body.mediaType === "string" ? body.mediaType : "image/jpeg") as ImageType;
  if (!data) return { ok: false, response: c.json({ error: "No image in the request." }, 400) };
  if (!(IMAGE_TYPES as readonly string[]).includes(mediaType)) {
    return { ok: false, response: c.json({ error: "Please use a JPEG, PNG, or WebP photo." }, 415) };
  }
  if (base64Bytes(data) > MAX_IMAGE_BYTES) {
    return { ok: false, response: c.json({ error: "That photo is too big. Try a smaller one." }, 413) };
  }
  return { ok: true, data, mediaType };
}

/** Builds the API app. Kept separate from the listener so tests can call app.request(). */
export function createApp(deps: AppDeps = {}): Hono {
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ ok: true, claude: Boolean(process.env.ANTHROPIC_API_KEY) }));

  app.post("/api/pet", async (c) => {
    const img = await readImageBody(c);
    if (!img.ok) return img.response;
    const r = await readPet(img.data, img.mediaType, deps.claude);
    console.log(`/api/pet ${r.fallback ? `fallback (${r.reason})` : "ok"} in ${r.ms} ms`);
    return c.json({ reading: r.reading, fallback: r.fallback, reason: r.reason, ms: r.ms });
  });

  app.post("/api/pet/details", async (c) => {
    const img = await readImageBody(c);
    if (!img.ok) return img.response;
    const r = await readPetDetails(img.data, img.mediaType, deps.claude);
    console.log(`/api/pet/details ${r.fallback ? `fallback (${r.reason})` : "ok"} in ${r.ms} ms`);
    return c.json({ details: r.value, fallback: r.fallback, reason: r.reason, ms: r.ms });
  });

  app.post("/api/pet/talk", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Send JSON." }, 400);
    }
    const parsed = TalkRequestSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "Bad talk request." }, 400);
    const r = await petTalk(parsed.data, deps.claude === undefined ? defaultTalkClient() : deps.claude);
    console.log(`/api/pet/talk ${r.fallback ? `fallback (${r.reason})` : "ok"} in ${r.ms} ms`);
    return c.json({ talk: r.fallback ? null : r.value, fallback: r.fallback, reason: r.reason, ms: r.ms });
  });

  app.post("/api/villagers/chat", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Send JSON." }, 400);
    }
    const parsed = ChatRequestSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "Bad chat request." }, 400);
    const r = await villagerChat(parsed.data, deps.claude === undefined ? defaultTalkClient() : deps.claude);
    console.log(`/api/villagers/chat ${r.fallback ? `fallback (${r.reason})` : "ok"} in ${r.ms} ms`);
    return c.json({ chat: r.fallback ? null : r.value, fallback: r.fallback, reason: r.reason, ms: r.ms });
  });

  return app;
}
