import { Buffer } from "node:buffer";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  ANVIL_WHISPER_ROUTE,
  createAnvilWhisperHandler,
  resolveAnvilWhisperRuntimeConfig,
} from "../server/anvil/create-anvil-whisper-handler";

type Next = (err?: unknown) => void;

const FORWARDED_WHISPER_HEADER_ALLOWLIST = new Set([
  "authorization",
  "content-type",
  "x-forge-user-authorization",
  "x-forge-user-token",
]);

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

export function nodeHeadersToFetch(headers: IncomingMessage["headers"]): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value == null) continue;
    const normalizedKey = key.toLowerCase();
    if (!FORWARDED_WHISPER_HEADER_ALLOWLIST.has(normalizedKey)) continue;
    if (Array.isArray(value)) {
      for (const one of value) result.append(normalizedKey, one);
    } else {
      result.set(normalizedKey, value);
    }
  }
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

export function mwAnvilWhisperApi() {
  const handler = createAnvilWhisperHandler(resolveAnvilWhisperRuntimeConfig());

  return async function anvilWhisperMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: Next,
  ) {
    try {
      const rawUrl = req.url || "";
      const origin = `http://${req.headers.host || "localhost"}`;
      const fullUrl = new URL(rawUrl, origin);

      if (fullUrl.pathname !== ANVIL_WHISPER_ROUTE) {
        next();
        return;
      }

      const requestAbort = new AbortController();
      const onAborted = () => requestAbort.abort();
      req.once("aborted", onAborted);

      const body = await readBody(req);
      try {
        const requestBody = body ? new Uint8Array(body) : undefined;
        const request = new Request(fullUrl.toString(), {
          method: req.method || "GET",
          headers: nodeHeadersToFetch(req.headers),
          ...(requestBody ? { body: requestBody } : {}),
          signal: requestAbort.signal,
        });

        const response = await handler(request);
        await writeFetchResponse(res, response);
      } finally {
        req.removeListener("aborted", onAborted);
      }
    } catch (error) {
      next(error);
    }
  };
}
