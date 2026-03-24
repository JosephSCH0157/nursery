import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import {
  createHammerAudioPolishRequestContext,
  handleHammerAudioPolishRequest,
} from "./hammer-audio-polish";
import { HAMMER_AUDIO_POLISH_ROUTE } from "../../hammer/src/prep/hammerAudioPolishApi";
import { HAMMER_STUDIO_RACK_RENDER_ROUTE } from "../../hammer/src/editor/hammerStudioRackRenderApi";
import {
  createHammerStudioRackRenderRequestContext,
  handleHammerStudioRackRenderRequest,
} from "./hammer-studio-rack-render";
import {
  HAMMER_TRANSCRIPT_PREP_ROUTE,
  type HammerTranscriptPrepRequest,
  type HammerTranscriptPrepSegment,
} from "../../hammer/src/prep/hammerPrepApi";
import { resolveHearthRuntimeConfig } from "../server/hearth/hearth-runtime-config";

type Next = (err?: unknown) => void;

const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-transcribe-diarize";
const ALLOWED_MEDIA_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".wav", ".mp3", ".m4a"]);
const MAX_TRANSCRIBE_SOURCE_BYTES = 96 * 1024 * 1024;
const CANONICAL_MEDIA_FETCH_TIMEOUT_MS = 60_000;
const OPENAI_TRANSCRIBE_TIMEOUT_MS = 4 * 60 * 1000;
const MEDIA_CONTENT_TYPES: Partial<Record<string, string>> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
};

type NormalizedLocalRequest = HammerTranscriptPrepRequest & {
  local_root_abs: string;
  local_relpath: string;
};

type NormalizedCanonicalWorkpieceRequest = Omit<
  HammerTranscriptPrepRequest,
  "local_root_abs" | "local_relpath" | "canonical_workpiece_path"
> & {
  canonical_workpiece_path: string;
};

function readTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isSafeRelpath(value: string): boolean {
  const normalized = value.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length > 0 && parts.every((part) => part !== "." && part !== "..");
}

function resolveMediaFileAbs(localRootAbs: string, localRelpath: string): string | null {
  if (!isSafeRelpath(localRelpath)) {
    return null;
  }

  const rootAbs = path.resolve(localRootAbs);
  const absolutePath = path.resolve(rootAbs, ...localRelpath.replace(/\\/g, "/").split("/").filter(Boolean));
  const relative = path.relative(rootAbs, absolutePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return absolutePath;
}

function inferContentType(absolutePath: string, mimeType?: string | null): string {
  const explicit = readTrimmed(mimeType);
  if (explicit) return explicit;
  const extension = path.extname(absolutePath).toLowerCase();
  return MEDIA_CONTENT_TYPES[extension] ?? "application/octet-stream";
}

function formatBytesAsMiB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function buildSourceTooLargeMessage(byteCount: number): string {
  return `Hammer transcript prep currently supports source media up to ${formatBytesAsMiB(MAX_TRANSCRIBE_SOURCE_BYTES)} in this runtime. Received ${formatBytesAsMiB(byteCount)}.`;
}

function readHeaderNumber(headers: Headers, name: string): number | null {
  const value = readTrimmed(headers.get(name));
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function createTimeoutAbortController(timeoutMs: number): {
  controller: AbortController;
  dispose: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return {
    controller,
    dispose: () => clearTimeout(timeoutId),
  };
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(body);
}

function normalizeRequest(body: unknown): NormalizedLocalRequest | NormalizedCanonicalWorkpieceRequest | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const row = body as Record<string, unknown>;
  const workspaceId = readTrimmed(row.workspace_id);
  const workpieceId = readTrimmed(row.workpiece_id);
  const localRootAbs = readTrimmed(row.local_root_abs);
  const localRelpath = readTrimmed(row.local_relpath);
  const canonicalWorkpiecePath = readTrimmed(row.canonical_workpiece_path);
  const mediaKind = readTrimmed(row.media_kind);
  if (!workspaceId || !workpieceId || !mediaKind) {
    return null;
  }

  if (localRootAbs && localRelpath) {
    return {
      workspace_id: workspaceId,
      workpiece_id: workpieceId,
      media_kind: mediaKind as HammerTranscriptPrepRequest["media_kind"],
      local_root_abs: localRootAbs,
      local_relpath: localRelpath,
      mime_type: readTrimmed(row.mime_type),
    };
  }

  if (!canonicalWorkpiecePath) {
    return null;
  }

  return {
    workspace_id: workspaceId,
    workpiece_id: workpieceId,
    media_kind: mediaKind as HammerTranscriptPrepRequest["media_kind"],
    canonical_workpiece_path: canonicalWorkpiecePath,
    mime_type: readTrimmed(row.mime_type),
  };
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", resolve);
    req.on("error", reject);
  });

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return null;
  return JSON.parse(raw) as unknown;
}

function readUpstreamErrorMessage(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object") return trimmed;
    const row = parsed as Record<string, unknown>;
    const error = row.error;
    if (error && typeof error === "object" && !Array.isArray(error)) {
      return readTrimmed((error as Record<string, unknown>).message) ?? trimmed;
    }
    return readTrimmed(row.message) ?? trimmed;
  } catch {
    return trimmed;
  }
}

function buildRequestOrigin(req: IncomingMessage): string {
  const forwardedProtoHeader = req.headers["x-forwarded-proto"];
  const forwardedProto = Array.isArray(forwardedProtoHeader)
    ? readTrimmed(forwardedProtoHeader[0])
    : readTrimmed(forwardedProtoHeader);
  const hostHeader = req.headers.host;
  const host = Array.isArray(hostHeader)
    ? readTrimmed(hostHeader[0])
    : readTrimmed(hostHeader);
  return `${forwardedProto ?? "http"}://${host ?? "localhost"}`;
}

function readJsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readErrorMessage(payload: unknown, fallback: string): string {
  const row = readJsonObject(payload);
  const error = readJsonObject(row?.error);
  return readTrimmed(error?.message)
    ?? readTrimmed(row?.message)
    ?? readTrimmed(row?.detail)
    ?? fallback;
}

async function loadCanonicalWorkpieceMediaFile(
  req: IncomingMessage,
  request: NormalizedCanonicalWorkpieceRequest,
): Promise<{
  ok: true;
  contentType: string;
  fileBytes: Buffer;
  sourceLabel: string;
} | {
  ok: false;
  status: number;
  message: string;
}> {
  const origin = buildRequestOrigin(req);
  const url = new URL(`/tongs/workpieces/${encodeURIComponent(request.workpiece_id)}/read-file`, origin);
  url.searchParams.set("path", request.canonical_workpiece_path);
  url.searchParams.set("encoding", "binary");

  const fetchTimeout = createTimeoutAbortController(CANONICAL_MEDIA_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/octet-stream, application/json",
        ...(typeof req.headers.authorization === "string"
          ? { authorization: req.headers.authorization }
          : {}),
        ...(typeof req.headers["x-forge-user-authorization"] === "string"
          ? { "x-forge-user-authorization": req.headers["x-forge-user-authorization"] }
          : {}),
      },
      signal: fetchTimeout.controller.signal,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      return {
        ok: false,
        status: response.status,
        message: readErrorMessage(payload, "Hammer could not read canonical workpiece media."),
      };
    }

    const contentLength = readHeaderNumber(response.headers, "content-length");
    if (contentLength != null && contentLength > MAX_TRANSCRIBE_SOURCE_BYTES) {
      return {
        ok: false,
        status: 413,
        message: buildSourceTooLargeMessage(contentLength),
      };
    }

    const fileBytes = Buffer.from(await response.arrayBuffer());
    if (fileBytes.byteLength > MAX_TRANSCRIBE_SOURCE_BYTES) {
      return {
        ok: false,
        status: 413,
        message: buildSourceTooLargeMessage(fileBytes.byteLength),
      };
    }

    return {
      ok: true,
      contentType: readTrimmed(response.headers.get("content-type"))
        ?? inferContentType(request.canonical_workpiece_path, request.mime_type),
      fileBytes,
      sourceLabel: request.canonical_workpiece_path,
    };
  } catch (error) {
    if (fetchTimeout.controller.signal.aborted) {
      return {
        ok: false,
        status: 504,
        message: "Hammer timed out while reading canonical workpiece media.",
      };
    }
    throw error;
  } finally {
    fetchTimeout.dispose();
  }
}

function normalizeSegments(payload: unknown): HammerTranscriptPrepSegment[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const row = payload as Record<string, unknown>;
  const segmentsRaw = Array.isArray(row.segments)
    ? row.segments
    : Array.isArray(row.utterances)
      ? row.utterances
      : [];

  const segments: HammerTranscriptPrepSegment[] = [];
  segmentsRaw.forEach((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const segment = value as Record<string, unknown>;
    const start = readNumber(segment.start);
    const end = readNumber(segment.end);
    const text = readTrimmed(segment.text);
    if (start == null || end == null || end <= start || !text) {
      return;
    }
    segments.push({
      id: readTrimmed(segment.id) ?? `seg_${index + 1}`,
      start,
      end,
      text,
      speaker: readTrimmed(segment.speaker)
        ?? readTrimmed(segment.speaker_label)
        ?? readTrimmed(segment.speaker_id),
      confidence: readNumber(segment.confidence),
    });
  });
  return segments;
}

export function createHammerPrepMiddleware() {
  const runtimeConfig = resolveHearthRuntimeConfig();
  const textApiKey = runtimeConfig.textApiKey ?? runtimeConfig.apiKey ?? null;
  const model = readTrimmed(process.env.HAMMER_TRANSCRIBE_MODEL) ?? DEFAULT_TRANSCRIBE_MODEL;

  return async function hammerPrepMiddleware(req: IncomingMessage, res: ServerResponse, next: Next) {
    try {
      const rawUrl = req.url || "";
      const origin = `http://${req.headers.host || "localhost"}`;
      const url = new URL(rawUrl, origin);
      if (
        url.pathname !== HAMMER_TRANSCRIPT_PREP_ROUTE
        && url.pathname !== HAMMER_AUDIO_POLISH_ROUTE
        && url.pathname !== HAMMER_STUDIO_RACK_RENDER_ROUTE
      ) {
        next();
        return;
      }

      if ((req.method || "GET").toUpperCase() !== "POST") {
        sendJson(res, 405, { ok: false, error: { message: "Method not allowed." } });
        return;
      }

      const body = await readJsonBody(req);
      if (url.pathname === HAMMER_AUDIO_POLISH_ROUTE) {
        const result = await handleHammerAudioPolishRequest(body, createHammerAudioPolishRequestContext(req));
        sendJson(res, result.status, result.payload);
        return;
      }

      if (url.pathname === HAMMER_STUDIO_RACK_RENDER_ROUTE) {
        const result = await handleHammerStudioRackRenderRequest(body, createHammerStudioRackRenderRequestContext(req));
        sendJson(res, result.status, result.payload);
        return;
      }

      if (!textApiKey) {
        sendJson(res, 500, {
          ok: false,
          error: { message: "Missing OPENAI_TEXT_API_KEY (or OPENAI_API_KEY) in server env." },
        });
        return;
      }

      const request = normalizeRequest(body);
      if (!request) {
        sendJson(res, 400, { ok: false, error: { message: "Invalid Hammer transcript prep payload." } });
        return;
      }

      let fileBytes: Buffer;
      let sourceLabel: string;
      let contentType: string;

      if ("local_root_abs" in request && "local_relpath" in request) {
        if (!path.isAbsolute(request.local_root_abs) || !fs.existsSync(request.local_root_abs)) {
          sendJson(res, 404, { ok: false, error: { message: "Mapped media root was not found on this machine." } });
          return;
        }

        const absolutePath = resolveMediaFileAbs(request.local_root_abs, request.local_relpath);
        if (!absolutePath) {
          sendJson(res, 400, { ok: false, error: { message: "local_relpath is invalid for this media root." } });
          return;
        }

        const stat = await fsPromises.stat(absolutePath).catch(() => null);
        if (!stat || !stat.isFile()) {
          sendJson(res, 404, { ok: false, error: { message: "Requested media file was not found." } });
          return;
        }
        if (stat.size > MAX_TRANSCRIBE_SOURCE_BYTES) {
          sendJson(res, 413, { ok: false, error: { message: buildSourceTooLargeMessage(stat.size) } });
          return;
        }

        fileBytes = await fsPromises.readFile(absolutePath);
        sourceLabel = absolutePath;
        contentType = inferContentType(absolutePath, request.mime_type);
      } else {
        const canonicalMedia = await loadCanonicalWorkpieceMediaFile(req, request);
        if (!canonicalMedia.ok) {
          sendJson(res, canonicalMedia.status, { ok: false, error: { message: canonicalMedia.message } });
          return;
        }
        fileBytes = canonicalMedia.fileBytes;
        sourceLabel = canonicalMedia.sourceLabel;
        contentType = canonicalMedia.contentType;
      }

      const extension = path.extname(sourceLabel).toLowerCase();
      if (!ALLOWED_MEDIA_EXTENSIONS.has(extension)) {
        sendJson(res, 400, { ok: false, error: { message: "Hammer prep only supports audio/video media files." } });
        return;
      }
      const form = new FormData();
      form.set("model", model);
      form.set("response_format", "diarized_json");
      form.set("chunking_strategy", "auto");
      form.set(
        "file",
        new Blob([fileBytes], { type: contentType }),
        path.basename(sourceLabel),
      );

      const upstreamTimeout = createTimeoutAbortController(OPENAI_TRANSCRIBE_TIMEOUT_MS);
      let upstream: Response;
      try {
        upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            authorization: `Bearer ${textApiKey}`,
          },
          body: form,
          signal: upstreamTimeout.controller.signal,
        });
      } catch (error) {
        if (upstreamTimeout.controller.signal.aborted) {
          sendJson(res, 504, {
            ok: false,
            error: {
              message: "Hammer transcript prep timed out while waiting for OpenAI transcription.",
            },
          });
          return;
        }
        throw error;
      } finally {
        upstreamTimeout.dispose();
      }

      if (!upstream.ok) {
        const detail = await upstream.text();
        sendJson(res, upstream.status, {
          ok: false,
          error: {
            message: readUpstreamErrorMessage(detail) ?? "OpenAI transcription failed.",
            detail,
          },
        });
        return;
      }

      const payload = (await upstream.json()) as unknown;
      const segments = normalizeSegments(payload);
      if (segments.length === 0) {
        sendJson(res, 502, {
          ok: false,
          error: {
            message: "OpenAI returned a diarized transcript without usable segments.",
          },
        });
        return;
      }

      const payloadRow = payload && typeof payload === "object" && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : {};
      sendJson(res, 200, {
        ok: true,
        data: {
          provider: "openai",
          model,
          provider_request_id: upstream.headers.get("x-request-id"),
          text: readTrimmed(payloadRow.text),
          segments,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}
