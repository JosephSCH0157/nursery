import { Buffer } from "node:buffer";
import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createTongsCommitApiHandler, type TongsCommitApiOptions } from "@forge/tongs";

type Next = (err?: unknown) => void;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_ROOT = path.join(__dirname, "..");
const ENV_FILES = [".env.local", ".env"];

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

for (const filename of ENV_FILES) {
  loadEnvFile(path.join(ENV_ROOT, filename));
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

type ResolvedConfig = {
  options: TongsCommitApiOptions;
  missing: string[];
  allowUnsafeNoToken: boolean;
};

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

function resolveConfig(): ResolvedConfig {
  const supabaseUrl = readEnv("TONGS_SUPABASE_URL") || readEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = readEnv("TONGS_SERVICE_ROLE_KEY") || readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const apiToken = readEnv("TONGS_API_TOKEN");
  const allowUnsafeNoToken = readEnv("TONGS_ALLOW_UNSAFE_NO_TOKEN") === "1";

  const missing: string[] = [];
  if (!supabaseUrl) missing.push("TONGS_SUPABASE_URL (or SUPABASE_URL)");
  if (!supabaseServiceRoleKey) missing.push("TONGS_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY)");
  if (!apiToken && !allowUnsafeNoToken) missing.push("TONGS_API_TOKEN");

  if (missing.length) {
    return {
      options: {
        supabaseUrl: "",
        supabaseServiceRoleKey: "",
      },
      missing,
      allowUnsafeNoToken,
    };
  }

  const resolvedSupabaseUrl = supabaseUrl!;
  const resolvedServiceRoleKey = supabaseServiceRoleKey!;

  return {
    options: {
      supabaseUrl: resolvedSupabaseUrl,
      supabaseServiceRoleKey: resolvedServiceRoleKey,
      apiToken,
      bucket: readEnv("TONGS_WORKPIECE_BUCKET"),
    },
    missing,
    allowUnsafeNoToken,
  };
}

export function createNurseryTongsMiddleware(opts?: { routePrefix?: string }) {
  const routePrefix = opts?.routePrefix ?? "/tongs";
  const config = resolveConfig();
  const handler = config.missing.length ? null : createTongsCommitApiHandler(config.options);

  if (!handler) {
    console.warn("[nursery:tongs-commit-api] not mounted: missing required env", config.missing);
  } else if (config.allowUnsafeNoToken && !config.options.apiToken) {
    console.warn("[nursery:tongs-commit-api] running without token guard because TONGS_ALLOW_UNSAFE_NO_TOKEN=1");
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
              message: "Missing required server env for Tongs Commit API",
              missing_env: config.missing,
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
