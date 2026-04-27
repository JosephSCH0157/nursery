import { Buffer } from "node:buffer";
import type { IncomingMessage, ServerResponse } from "node:http";
// Use the workspace source in dev so new Tongs routes are available after a Vite restart
// without depending on a separately rebuilt package dist snapshot.
import {
  createTongsCommitApiHandlerWithService,
  createTongsCommitService,
} from "../../../packages/tongs/src/workpiece-commit-api.ts";
import { resolveTongsRuntimeConfig } from "../server/tongs/tongs-runtime-config";
import { ensureWorkpieceJobRunnerStarted } from "../server/tongs/workpiece-job-runner";

type Next = (err?: unknown) => void;

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

export function createNurseryTongsMiddleware(opts?: { routePrefix?: string }) {
  const routePrefix = opts?.routePrefix ?? "/tongs";
  const config = resolveTongsRuntimeConfig();
  const service = config.missing.length ? null : createTongsCommitService(config.options);
  const handler = service ? createTongsCommitApiHandlerWithService(service, config.options.apiToken) : null;

  if (service) {
    ensureWorkpieceJobRunnerStarted({ service });
  }

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
      const requestBody = body ? new Uint8Array(body) : undefined;
      const request = new Request(fullUrl, {
        method: req.method || "GET",
        headers: nodeHeadersToFetch(req.headers),
        body: requestBody,
      });

      const response = await handler(request);
      await writeFetchResponse(res, response);
    } catch (error) {
      next(error);
    }
  };
}
