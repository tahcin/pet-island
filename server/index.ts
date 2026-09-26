import "dotenv/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app";

const port = Number(process.env.PORT ?? 8787);
const app = createApp();

if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}

serve({ fetch: app.fetch, port }, (info) => {
  const keyState = process.env.ANTHROPIC_API_KEY ? "set" : "missing, using fallbacks";
  console.log(`Pet Island server on http://localhost:${info.port} (ANTHROPIC_API_KEY ${keyState})`);
});
