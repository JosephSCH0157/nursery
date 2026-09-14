import { Buffer } from "node:buffer";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createClient } from "@supabase/supabase-js";
import { generateCanonicalCleanupCandidates } from "../server/tongs/hammer-cleanup-review-generator";
import type { Database } from "../../../packages/tongs/src/db.types.ts";
import { handleHammerShortsAuthorityRequest } from "../../../packages/tongs/src/hammer-shorts-authority.ts";
// Use the workspace source in dev so new Tongs routes are available after a Vite restart
// without depending on a separately rebuilt package dist snapshot.
import {
  createTongsCommitApiHandlerWithService,
  createTongsCommitService,
  type BrollAcquisitionRuntime,
  type BrollVideoProvider,
  type TongsCommitApiOptions,
} from "../../../packages/tongs/src/workpiece-commit-api.ts";
import { RunwayBrollVideoProvider } from "../../../packages/tongs/src/providers/runway-broll-video-provider.ts";
import {
  deriveBrollPoster,
  fetchExternalBrollMedia,
  fetchExternalMediaBytes,
  inspectBrollMedia,
} from "../../../packages/tongs/src/broll-acquisition.ts";
import { renderCanonicalReferenceVisual } from "../../../packages/tongs/src/reference-visual-renderer.ts";
import {
  derivePosterWithForgeFfmpeg,
  probeMediaWithForgeFfmpeg,
  readForgeFfmpegClientConfig,
} from "../server/forge-ffmpeg-client";
import { resolveTongsRuntimeConfig, type ResolvedTongsRuntimeConfig } from "../server/tongs/tongs-runtime-config";
import { ensureWorkpieceJobRunnerStarted } from "../server/tongs/workpiece-job-runner";

type Next = (err?: unknown) => void;

export function isClientAbortError(error: unknown, req?: Pick<IncomingMessage, "aborted" | "destroyed">): boolean {
  if (req?.aborted || req?.destroyed) return true;
  if (!error || typeof error !== "object") return false;
  const row = error as { code?: unknown; message?: unknown };
  return row.code === "ECONNRESET" || row.code === "ERR_STREAM_PREMATURE_CLOSE" || row.message === "aborted";
}

export type NurseryTongsProviderBoundary = {
  options: TongsCommitApiOptions;
  provider: BrollVideoProvider | undefined;
  acquisitionRuntime: BrollAcquisitionRuntime;
  diagnostic: {
    runwayConfigured: boolean;
    providerConstructed: boolean;
    providerInjected: boolean;
    lazyFallbackDisabled: boolean;
    acquisitionRuntimeInjected: boolean;
    lateAcquisitionImportDisabled: boolean;
  };
};

function detectTimedBrollMime(bytes: Uint8Array): "video/mp4" | "video/webm" | null {
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp") return "video/mp4";
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "video/webm";
  return null;
}

export function resolveNurseryTongsProviderBoundary(
  config: ResolvedTongsRuntimeConfig,
  createRunwayProvider: (apiKey: string) => BrollVideoProvider = (apiKey) => new RunwayBrollVideoProvider(apiKey),
): NurseryTongsProviderBoundary {
  const runwayApiKey = config.options.runwayApiKey?.trim();
  const provider = runwayApiKey ? createRunwayProvider(runwayApiKey) : undefined;
  const forgeFfmpeg = readForgeFfmpegClientConfig(process.env, { callerId: "netlify" });
  const acquisitionRuntime: BrollAcquisitionRuntime = {
    inspectMedia: async (bytes, expected) => {
      if (!forgeFfmpeg || expected !== "video") return inspectBrollMedia(bytes, expected);
      const mimeType = detectTimedBrollMime(bytes);
      if (!mimeType) throw new Error("broll_media_signature_invalid");
      const inspected = await probeMediaWithForgeFfmpeg({
        client: forgeFfmpeg,
        sourceBytes: bytes,
        sourceFilename: mimeType === "video/mp4" ? "broll.mp4" : "broll.webm",
        contentType: mimeType,
      });
      return {
        bytes,
        mimeType,
        width: inspected.width,
        height: inspected.height,
        durationMs: inspected.durationMs,
        hasAudioStream: inspected.hasAudio,
        hasVideoStream: true,
      };
    },
    derivePoster: async (video) => {
      if (!forgeFfmpeg) return deriveBrollPoster(video);
      const poster = await derivePosterWithForgeFfmpeg({
        client: forgeFfmpeg,
        sourceBytes: video.bytes,
        sourceFilename: video.mimeType === "video/mp4" ? "broll.mp4" : "broll.webm",
        contentType: video.mimeType,
      });
      return inspectBrollMedia(new Uint8Array(poster.posterBytes), "poster");
    },
    fetchExternalMedia: fetchExternalBrollMedia,
    inspectReferenceImage: (bytes) => inspectBrollMedia(bytes, "poster"),
    fetchExternalBytes: fetchExternalMediaBytes,
    renderReferenceVisual: renderCanonicalReferenceVisual,
  };
  const options: TongsCommitApiOptions = {
    ...config.options,
    cleanupReviewGenerator: generateCanonicalCleanupCandidates,
    // Nursery owns provider construction. Removing the key from the downstream
    // options makes the Vite-sensitive lazy fallback impossible in this process.
    runwayApiKey: undefined,
    brollVideoProvider: provider,
    brollAcquisitionRuntime: acquisitionRuntime,
  };
  return {
    options,
    provider,
    acquisitionRuntime,
    diagnostic: {
      runwayConfigured: Boolean(runwayApiKey),
      providerConstructed: Boolean(provider),
      providerInjected: options.brollVideoProvider === provider && Boolean(provider),
      lazyFallbackDisabled: options.runwayApiKey == null,
      acquisitionRuntimeInjected: options.brollAcquisitionRuntime === acquisitionRuntime,
      lateAcquisitionImportDisabled: true,
    },
  };
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

export function createNurseryTongsMiddleware(opts?: {
  routePrefix?: string;
  /** Isolated-test seam. Production callers must leave this undefined. */
  testOnlyOptionsOverride?: Partial<TongsCommitApiOptions>;
}) {
  const routePrefix = (opts?.routePrefix ?? "/tongs").replace(/\/+$/, "") || "/tongs";
  const config = resolveTongsRuntimeConfig();
  const providerBoundary = resolveNurseryTongsProviderBoundary(config);
  if (opts?.testOnlyOptionsOverride) {
    const localApi = /^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/i.test(config.options.supabaseUrl);
    if (process.env.NODE_ENV === "production" || !localApi) {
      throw new Error("testOnlyOptionsOverride is restricted to an isolated local Supabase runtime");
    }
    providerBoundary.options = { ...providerBoundary.options, ...opts.testOnlyOptionsOverride };
  }
  const service = config.missing.length ? null : createTongsCommitService(providerBoundary.options);
  const handler = service ? createTongsCommitApiHandlerWithService(service, config.options.apiToken) : null;
  const shortsServiceClient = config.missing.length ? null : createClient<Database>(config.options.supabaseUrl, config.options.supabaseServiceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  console.info("[nursery:tongs-commit-api] provider boundary", {
    ...providerBoundary.diagnostic,
    serviceCreated: Boolean(service),
    serviceProviderMatches: Boolean(service && providerBoundary.provider && service.brollVideoProvider === providerBoundary.provider),
    acquisitionRuntimeLoaded: [deriveBrollPoster, fetchExternalBrollMedia, inspectBrollMedia].every(
      (dependency) => typeof dependency === "function",
    ),
    serviceAcquisitionRuntimeMatches: Boolean(service && service.brollAcquisitionRuntime === providerBoundary.acquisitionRuntime),
  });

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
      const origin = `http://${req.headers.host || "localhost"}`;
      const parsedUrl = new URL(rawUrl, origin);
      const pathname = parsedUrl.pathname;
      const isTarget =
        pathname === routePrefix || pathname.startsWith(`${routePrefix}/`);
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

      const fullUrl = parsedUrl.toString();
      const body = await readBody(req);
      const requestBody = body ? new Uint8Array(body) : undefined;
      const request = new Request(fullUrl, {
        method: req.method || "GET",
        headers: nodeHeadersToFetch(req.headers),
        body: requestBody,
      });

      let response: Response;
      if (pathname.startsWith(`${routePrefix}/hammer/shorts`)) {
        const rawAuthorization = String(req.headers["x-forge-user-authorization"] ?? req.headers.authorization ?? "");
        const accessToken = rawAuthorization.replace(/^Bearer\s+/i, "").trim();
        if (!accessToken) {
          response = new Response(JSON.stringify({ ok: false, error: { code: "hammer_shorts_auth_required" } }), { status: 401, headers: { "content-type": "application/json" } });
        } else {
          const userClient = createClient<Database>(config.options.supabaseUrl, config.options.supabaseServiceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: `Bearer ${accessToken}` } },
          });
          response = await handleHammerShortsAuthorityRequest(request, userClient, shortsServiceClient ?? undefined)
            ?? new Response(JSON.stringify({ ok: false, error: { code: "hammer_shorts_route_not_found" } }), { status: 404 });
        }
      } else {
        response = await handler(request);
      }
      await writeFetchResponse(res, response);
    } catch (error) {
      // Browser navigation, HMR, or cancellation can close a request while a
      // long-running media operation is in flight. It is not a Vite error and
      // must not be forwarded to the dev error overlay.
      if (isClientAbortError(error, req)) return;
      next(error);
    }
  };
}
