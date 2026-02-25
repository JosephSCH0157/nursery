/* global process, Buffer, console, Request, Headers */

import { createServer } from "node:http";
import { createTongsCommitApiHandler } from "../dist/workpiece-commit-api.js";

function readEnv(name) {
  const raw = process.env[name];
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  return value || undefined;
}

function toHeaders(nodeHeaders) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (typeof value === "undefined") continue;
    if (Array.isArray(value)) {
      for (const one of value) headers.append(key, String(one));
    } else {
      headers.set(key, String(value));
    }
  }
  return headers;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    if (Buffer.isBuffer(chunk)) chunks.push(chunk);
    else chunks.push(Buffer.from(String(chunk)));
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function main() {
  const supabaseUrl = readEnv("TONGS_SUPABASE_URL") || readEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = readEnv("TONGS_SERVICE_ROLE_KEY") || readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const apiToken = readEnv("TONGS_API_TOKEN");
  const allowUnsafeNoToken = readEnv("TONGS_ALLOW_UNSAFE_NO_TOKEN") === "1";

  const missing = [];
  if (!supabaseUrl) missing.push("TONGS_SUPABASE_URL (or SUPABASE_URL)");
  if (!supabaseServiceRoleKey) missing.push("TONGS_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY)");
  if (!apiToken && !allowUnsafeNoToken) missing.push("TONGS_API_TOKEN");
  if (missing.length > 0) {
    throw new Error(
      `Missing required env: ${missing.join(", ")} (set TONGS_ALLOW_UNSAFE_NO_TOKEN=1 only for local throwaway use)`,
    );
  }

  const host = readEnv("TONGS_API_HOST") || "127.0.0.1";
  const port = Number(readEnv("PORT") || readEnv("TONGS_API_PORT") || "8787");
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid port: ${port}`);
  }

  const handler = createTongsCommitApiHandler({
    supabaseUrl,
    supabaseServiceRoleKey,
    apiToken,
    bucket: readEnv("TONGS_WORKPIECE_BUCKET"),
  });

  const server = createServer(async (req, res) => {
    try {
      const method = req.method || "GET";
      const headers = toHeaders(req.headers);
      const body = method === "GET" || method === "HEAD" ? undefined : await readBody(req);
      const url = `http://${host}:${port}${req.url || "/"}`;

      const request = new Request(url, {
        method,
        headers,
        ...(body ? { body } : {}),
      });

      const response = await handler(request);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      const payload = Buffer.from(await response.arrayBuffer());
      res.end(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, error: { code: "server_error", message } }));
    }
  });

  server.listen(port, host, () => {
    const base = `http://${host}:${port}`;
    console.log(`[tongs-commit-api] listening on ${base}`);
    console.log(`[tongs-commit-api] POST ${base}/tongs/cradles`);
    console.log(`[tongs-commit-api] POST ${base}/tongs/workpieces/:id/commit-file`);
    console.log(`[tongs-commit-api] POST ${base}/tongs/workpieces/:id/append-event`);
    if (!apiToken) {
      console.warn("[tongs-commit-api] WARNING: running without token guard (unsafe local mode)");
    }
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[tongs-commit-api] startup failed: ${message}`);
  process.exit(1);
});
