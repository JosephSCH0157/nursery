import { Buffer } from "node:buffer";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createTongsCommitApiHandler,
  type TongsCommitApiOptions,
} from "../../../packages/tongs/src/workpiece-commit-api";

type Next = (err?: unknown) => void;

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function readBody(req: IncomingMessage): Promise<Uint8Array | undefined> {
  const method = (req.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return Promise.resolve(undefined);

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(chunks.length ? Buffer.concat(chunks) : undefined));
    req.on("error", reject);
  });
}

function nodeHeadersToFetch(headers: IncomingMessage["headers"]): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const one of value) result.append(key, one);
    } else {
      result.set(key, value);
    }
  }
  // Drop hop-by-hop headers to avoid protocol mismatch issues.
  result.delete("connection");
  result.delete("keep-alive");
  result.delete("transfer-encoding");
  result.delete("upgrade");
  return result;
}

async function writeFetchResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "transfer-encoding") return;
    res.setHeader(key, value);
  });

  const body = Buffer.from(await response.arrayBuffer());
  if (!res.getHeader("content-length")) {
    res.setHeader("content-length", String(body.length));
  }
  res.end(body);
}

function buildOptionsFromEnv(): TongsCommitApiOptions | null {
  const supabaseUrl = readEnv("SUPABASE_URL") || readEnv("VITE_SUPABASE_URL");
  const supabaseServiceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    apiToken: readEnv("TONGS_API_TOKEN"),
    bucket: readEnv("TONGS_WORKPIECE_BUCKET"),
  };
}

export function createNurseryTongsMiddleware(opts?: { routePrefix?: string }) {
  const routePrefix = opts?.routePrefix ?? "/tongs";
  const options = buildOptionsFromEnv();
  const handler = options ? createTongsCommitApiHandler(options) : null;

  if (!handler) {
    console.warn(
      "[nursery:tongs-commit-api] not mounted: missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return async function nurseryTongsMiddleware(req: IncomingMessage, res: ServerResponse, next: Next) {
    try {
      const rawUrl = req.url || "";
      const isTarget =
        rawUrl === routePrefix || rawUrl.startsWith(`${routePrefix}/`) || rawUrl.startsWith(`${routePrefix}?`);
      if (!isTarget) return next();

      if (!handler) {
        res.statusCode = 503;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(
          JSON.stringify({
            ok: false,
            error: {
              code: "tongs_commit_api_unconfigured",
              message: "Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
            },
          }),
        );
        return;
      }

      const origin = `http://${req.headers.host || "localhost"}`;
      const fullUrl = new URL(rawUrl, origin).toString();
      const body = await readBody(req);
      const request = new Request(fullUrl, {
        method: req.method || "GET",
        headers: nodeHeadersToFetch(req.headers),
        body,
      });

      const response = await handler(request);
      await writeFetchResponse(res, response);
    } catch (error) {
      next(error);
    }
  };
}
