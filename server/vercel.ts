import { createApp } from "./app";

/**
 * Vercel serverless entry. Vercel's Node runtime accepts web-standard Request handlers, and
 * Hono's app.fetch is one, so every /api/* request reaches the same app as local dev.
 */
const app = createApp();

export const GET = (request: Request): Response | Promise<Response> => app.fetch(request);
export const POST = (request: Request): Response | Promise<Response> => app.fetch(request);
