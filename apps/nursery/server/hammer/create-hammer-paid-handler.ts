import { Buffer } from "node:buffer";
import { Readable } from "node:stream";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";

import {
  createHammerPrepMiddleware,
  type HammerPrepMiddlewareOptions,
} from "../../scripts/mw-hammer-prep";
import { HAMMER_SHORTS_DISCOVERY_ROUTE } from "../../scripts/hammer-shorts-discovery";
import { HAMMER_TRANSCRIPT_CLEANUP_ASSIST_ROUTE } from "../../../hammer/src/editor/hammerTranscriptCleanupAssistApi";
import { HAMMER_TRANSCRIPT_PREP_ROUTE } from "../../../hammer/src/prep/hammerPrepApi";

export const HAMMER_PRODUCTION_TEXT_ROUTES = [
  HAMMER_TRANSCRIPT_CLEANUP_ASSIST_ROUTE,
  HAMMER_SHORTS_DISCOVERY_ROUTE,
  HAMMER_TRANSCRIPT_PREP_ROUTE,
] as const;

export type { HammerPrepMiddlewareOptions } from "../../scripts/mw-hammer-prep";

const hammerProductionTextRoutes = new Set<string>(HAMMER_PRODUCTION_TEXT_ROUTES);

function incomingHeaders(request: Request): IncomingHttpHeaders {
  const headers: IncomingHttpHeaders = {};
  request.headers.forEach((value, name) => {
    headers[name.toLowerCase()] = value;
  });
  const requestUrl = new URL(request.url);
  if (!headers.host) headers.host = requestUrl.host;
  // This value is derived from the server-side Request URL, not a caller
  // header. Downstream Hammer middleware uses it for authenticated same-origin
  // Tongs reads and must never substitute the Supabase API origin.
  headers["x-forge-request-origin"] = requestUrl.origin;
  return headers;
}

function responseHeaderValue(value: number | string | readonly string[]): string {
  return Array.isArray(value) ? value.join(", ") : String(value);
}

/**
 * Fetch transport for the canonical Hammer middleware. This adapter provides
 * no execution authority; production callers require the same server-owned
 * paid gate used by local/Vite before any provider attempt can be authorized.
 */
export function createHammerPaidHandler(options: HammerPrepMiddlewareOptions = {}) {
  const middleware = createHammerPrepMiddleware({
    ...options,
    requirePaidExecutionAuthority: true,
  });

  return async function hammerPaidHandler(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (!hammerProductionTextRoutes.has(url.pathname)) {
      return Response.json({ ok: false, error: { code: "not_found" } }, { status: 404 });
    }

    const requestBytes = request.body ? Buffer.from(await request.arrayBuffer()) : Buffer.alloc(0);
    const incoming = Readable.from(requestBytes.length ? [requestBytes] : []) as Readable & Partial<IncomingMessage>;
    incoming.url = `${url.pathname}${url.search}`;
    incoming.method = request.method;
    incoming.headers = incomingHeaders(request);

    const headers = new Headers();
    const chunks: Buffer[] = [];
    let statusCode = 200;
    let ended = false;
    let forwarded = false;
    let forwardedError: unknown = null;
    const outgoing = {
      get statusCode() { return statusCode; },
      set statusCode(value: number) { statusCode = value; },
      get headersSent() { return ended; },
      setHeader(name: string, value: number | string | readonly string[]) {
        headers.set(name, responseHeaderValue(value));
        return outgoing;
      },
      end(chunk?: string | Uint8Array) {
        if (typeof chunk === "string") chunks.push(Buffer.from(chunk));
        else if (chunk) chunks.push(Buffer.from(chunk));
        ended = true;
        return outgoing;
      },
    };

    await middleware(
      incoming as IncomingMessage,
      outgoing as unknown as ServerResponse,
      (error?: unknown) => {
        forwarded = true;
        forwardedError = error ?? null;
      },
    );

    if (forwardedError) throw forwardedError;
    if (forwarded || !ended) {
      return Response.json({ ok: false, error: { code: forwarded ? "not_found" : "transport_incomplete" } }, {
        status: forwarded ? 404 : 500,
        headers: { "cache-control": "no-store" },
      });
    }
    return new Response(Buffer.concat(chunks), { status: statusCode, headers });
  };
}
