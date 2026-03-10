import { Buffer } from "node:buffer";
import type { IncomingMessage, ServerResponse } from "node:http";
import { HEARTH_AI_ROUTES } from "../../hearth/src/lib/hearth-ai-runtime-contract";
import { createHearthAiHandler } from "../server/hearth/create-hearth-ai-handler";
import { resolveHearthRuntimeConfig } from "../server/hearth/hearth-runtime-config";

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

export function mwHearthChatApi() {
  const handler = createHearthAiHandler(resolveHearthRuntimeConfig());

  return async function hearthChatMiddleware(req: IncomingMessage, res: ServerResponse, next: Next) {
    try {
      const rawUrl = req.url || "";
      const origin = `http://${req.headers.host || "localhost"}`;
      const fullUrl = new URL(rawUrl, origin);
      const pathname = fullUrl.pathname;

      if (
        pathname !== HEARTH_AI_ROUTES.chat
        && pathname !== HEARTH_AI_ROUTES.chatStatus
        && pathname !== HEARTH_AI_ROUTES.stt
      ) {
        next();
        return;
      }

      const requestAbort = new AbortController();
      const onAborted = () => requestAbort.abort();
      req.once("aborted", onAborted);

      const body = await readBody(req);
      try {
        const request = new Request(fullUrl.toString(), {
          method: req.method || "GET",
          headers: nodeHeadersToFetch(req.headers),
          ...(body ? { body } : {}),
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
