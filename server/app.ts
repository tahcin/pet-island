import { Hono } from "hono";

/** Builds the API app. Kept separate from the listener so tests can call app.request(). */
export function createApp(): Hono {
  const app = new Hono();
  app.get("/api/health", (c) => c.json({ ok: true, claude: Boolean(process.env.ANTHROPIC_API_KEY) }));
  return app;
}
