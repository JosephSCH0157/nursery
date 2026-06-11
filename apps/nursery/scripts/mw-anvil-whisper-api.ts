import { Buffer } from "node:buffer";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  ANVIL_WHISPER_ROUTE,
  createAnvilWhisperHandler,
  resolveAnvilWhisperRuntimeConfig,
} from "../server/anvil/create-anvil-whisper-handler";

type Next = (err?: unknown) => void;

const FORWARDED_WHISPER_HEADER_ALLOWLIST = new Set([
  "content-type",
  "x-whisper-request-seq",
  "x-forge-user-authorization",
  "x-forge-user-token",
]);

const LOCAL_WHISPER_HEADER_LIMIT_BYTES = 12 * 1024;

function estimateNodeHeaderBytes(headers: IncomingMessage["headers"]): number {
  let total = 0;
  for (const [key, value] of Object.entries(headers)) {
    if (value == null) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const one of values) {
      total += Buffer.byteLength(key, "utf8");
      total += Buffer.byteLength(String(one), "utf8");
      total += 4;
    }
  }
  return total;
}

function summarizeNodeHeaders(headers: IncomingMessage["headers"]): Array<{ name: string; bytes: number }> {
  return Object.entries(headers)
    .filter(([, value]) => value != null)
    .map(([key, value]) => ({
      name: key.toLowerCase(),
      bytes: (Array.isArray(value) ? value : [value]).reduce((total, one) => total + Buffer.byteLength(String(one), "utf8"), 0),
    }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 5);
}

function writeLocalHeaderOverflow(res: ServerResponse, args: {
  error: string;
  code: string;
  detail: string;
}): void {
  const body = Buffer.from(JSON.stringify({
    ok: false,
    text: "",
    error: args.error,
    code: args.code,
    detail: args.detail,
  }));
  res.statusCode = 431;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-length", String(body.length));
  res.end(body);
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

      const totalHeaderBytes = estimateNodeHeaderBytes(req.headers);
      const cookieValue = req.headers.cookie;
      const cookieBytes = cookieValue == null
        ? 0
        : (Array.isArray(cookieValue) ? cookieValue : [cookieValue]).reduce((total, one) => total + Buffer.byteLength(String(one), "utf8"), 0);
      const authorizationValue = req.headers.authorization;
      const authorizationBytes = authorizationValue == null
        ? 0
        : (Array.isArray(authorizationValue) ? authorizationValue : [authorizationValue]).reduce((total, one) => total + Buffer.byteLength(String(one), "utf8"), 0);
      const contentTypeValue = req.headers["content-type"];
      const contentTypeBytes = contentTypeValue == null
        ? 0
        : (Array.isArray(contentTypeValue) ? contentTypeValue : [contentTypeValue]).reduce((total, one) => total + Buffer.byteLength(String(one), "utf8"), 0);
      const requestSeq = Array.isArray(req.headers["x-whisper-request-seq"])
        ? req.headers["x-whisper-request-seq"][0]
        : req.headers["x-whisper-request-seq"];
      try {
        console.info("[ASR_WHISPER_LOCAL_INCOMING_HEADER_BUDGET]", {
          boundary: "vite_middleware",
          headerNames: Object.keys(req.headers).map((key) => key.toLowerCase()).sort(),
          totalHeaderBytes,
          largestHeaderNames: summarizeNodeHeaders(req.headers),
          hasCookie: cookieBytes > 0,
          cookieBytes,
          hasAuthorization: authorizationBytes > 0,
          authorizationBytes,
          contentTypeBytes,
          contentLength: req.headers["content-length"] ?? null,
          requestUrl: fullUrl.toString(),
          requestSeq: typeof requestSeq === "string" ? requestSeq : null,
        });
      } catch {
        // ignore logging failures
      }
      if (totalHeaderBytes > LOCAL_WHISPER_HEADER_LIMIT_BYTES) {
        writeLocalHeaderOverflow(res, {
          error: "Local whisper request headers are too large.",
          code: "whisper_local_header_overflow",
          detail: `Local whisper route rejected oversized incoming headers (${totalHeaderBytes} bytes).`,
        });
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
