import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { validateServerPayload } from "./public/core.js";

const ROOT = fileURLToPath(new URL("./public/", import.meta.url));
const PORT = Number.parseInt(process.env.PORT ?? "4173", 10);
const webhookUrl = process.env.DISCORD_WEBHOOK_URL?.trim() || "";
const MAX_BODY_BYTES = 8_192;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

export function isWebhookConfigured(value = webhookUrl) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" &&
      (parsed.hostname === "discord.com" || parsed.hostname === "discordapp.com") &&
      /^\/api\/webhooks\/\d+\/[^/]+/.test(parsed.pathname);
  } catch {
    return false;
  }
}

function json(response, status, data, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers
  });
  response.end(JSON.stringify(data));
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new RangeError("Request is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function postDiscord(response, payload) {
  if (!isWebhookConfigured()) return json(response, 503, { error: "Discord posting is not configured." });
  let safe;
  try {
    safe = validateServerPayload(payload);
  } catch (error) {
    return json(response, 400, { error: error.message });
  }

  try {
    const discordResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: safe.content,
        allowed_mentions: { parse: safe.allowEveryone ? ["everyone"] : [] }
      }),
      signal: AbortSignal.timeout(10_000)
    });

    if (discordResponse.ok) return json(response, 200, { ok: true });
    if (discordResponse.status === 429) {
      const retryAfter = Math.min(Number(discordResponse.headers.get("retry-after") ?? 1), 60);
      return json(response, 429, { error: "Discord is rate limiting posts. Please wait and try again.", retryAfter });
    }
    return json(response, 502, { error: "Discord rejected the message. Check the webhook and channel permissions." });
  } catch {
    return json(response, 502, { error: "Discord could not be reached. Please try again." });
  }
}

async function handler(request, response) {
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("x-frame-options", "DENY");

  if (request.method === "GET" && request.url === "/api/config") {
    return json(response, 200, { webhookConfigured: isWebhookConfigured() });
  }
  if (request.method === "POST" && request.url === "/api/post") {
    try {
      return await postDiscord(response, await readJson(request));
    } catch (error) {
      return json(response, 400, { error: error instanceof SyntaxError ? "Invalid JSON request." : error.message });
    }
  }
  if (!["GET", "HEAD"].includes(request.method)) return json(response, 405, { error: "Method not allowed." });

  const rawPath = decodeURIComponent((request.url ?? "/").split("?")[0]);
  const relative = rawPath === "/" ? "index.html" : normalize(rawPath).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
  const filePath = join(ROOT, relative);
  if (!filePath.startsWith(ROOT)) return json(response, 404, { error: "Not found." });

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "content-type": MIME[extname(filePath)] ?? "application/octet-stream",
      "content-security-policy": "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'",
      "x-content-type-options": "nosniff"
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    json(response, 404, { error: "Not found." });
  }
}

if (process.env.NODE_ENV !== "test") {
  createServer(handler).listen(PORT, "127.0.0.1", () => {
    console.log(`Discord Stream Schedule Builder is running at http://127.0.0.1:${PORT}`);
    console.log(`Webhook posting: ${isWebhookConfigured() ? "configured" : "not configured"}`);
  });
}

export { handler };
