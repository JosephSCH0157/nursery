import crypto from "node:crypto";
import { spawn } from "node:child_process";
import type { IncomingMessage } from "node:http";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { detectHammerMediaRuntime } from "./hammer-media-runtime";
import type {
  HammerStudioRackRenderRequest,
  HammerStudioRackRenderResponse,
} from "../../hammer/src/editor/hammerStudioRackRenderApi";
import { isHammerStudioRackIdentity, type HammerStudioRackState } from "../../hammer/src/editor/hammerStudioRack";
import {
  buildHammerTimelineAudioRenderPlan,
  type HammerAudioTimelineSegmentInput,
} from "../../hammer/src/editor/hammerAudioTimelineRenderPlan";
import { buildHammerStudioRackFfmpegPlan } from "../../hammer/src/editor/hammerStudioRackFfmpegPlan";

type HammerStudioRackRenderRouteResult = {
  status: number;
  payload: {
    ok: boolean;
    data?: HammerStudioRackRenderResponse;
    error?: { message: string };
  };
};

type HammerRenderRequestContext = {
  origin: string;
  authorization: string | null;
  userAuthorization: string | null;
};

type NormalizedStudioRackRenderRequest = Omit<
  HammerStudioRackRenderRequest,
  "local_root_abs" | "local_relpath" | "canonical_workpiece_path" | "mime_type"
> & {
  timeline_segments: HammerAudioTimelineSegmentInput[];
  local_root_abs: string | null;
  local_relpath: string | null;
  canonical_workpiece_path: string | null;
  mime_type: string | null;
};

type LoadedSourceMedia = {
  sourceLabel: string;
  sourceExtension: string;
  sourceBytes: Buffer;
  canonicalWorkpiecePath: string | null;
  localRootAbs: string | null;
};

const OUTPUT_MIME_TYPE = "audio/wav";
const MAX_SOURCE_BYTES = 256 * 1024 * 1024;
const CANONICAL_MEDIA_FETCH_TIMEOUT_MS = 60_000;
const FFMPEG_PROCESS_TIMEOUT_MS = 2 * 60 * 1000;
const CUT_SEAM_FADE_SEC = 0.006;

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

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readErrorMessage(payload: unknown, fallback: string): string {
  const row = readObject(payload);
  const error = readObject(row?.error);
  return readTrimmed(error?.message)
    ?? readTrimmed(row?.message)
    ?? readTrimmed(row?.detail)
    ?? fallback;
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

function readHeaderString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return readTrimmed(value[0]);
  }
  return readTrimmed(value);
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

function createFailedResponse(args: {
  request: NormalizedStudioRackRenderRequest;
  resolvedBackend: "native" | "ffmpeg";
  reason: string;
  summary?: Record<string, string | number | boolean | null>;
}): HammerStudioRackRenderResponse {
  return {
    status: "failed",
    requested_backend: args.request.requested_backend,
    resolved_backend: args.resolvedBackend,
    processed_at: null,
    output_local_relpath: null,
    output_workpiece_path: null,
    output_mime_type: null,
    output_duration_ms: null,
    failure_reason: args.reason,
    settings_summary: {
      ...args.summary,
    },
  };
}

function createSkippedResponse(args: {
  request: NormalizedStudioRackRenderRequest;
  resolvedBackend: "native" | "ffmpeg";
  reason: string;
  summary?: Record<string, string | number | boolean | null>;
}): HammerStudioRackRenderResponse {
  return {
    status: "skipped",
    requested_backend: args.request.requested_backend,
    resolved_backend: args.resolvedBackend,
    processed_at: null,
    output_local_relpath: null,
    output_workpiece_path: null,
    output_mime_type: null,
    output_duration_ms: null,
    failure_reason: args.reason,
    settings_summary: {
      ...args.summary,
    },
  };
}

function normalizeStudioRackRenderRequest(body: unknown): NormalizedStudioRackRenderRequest | null {
  const row = readObject(body);
  if (!row) return null;
  const workspaceId = readTrimmed(row.workspace_id);
  const workpieceId = readTrimmed(row.workpiece_id);
  const mediaKind = readTrimmed(row.media_kind);
  const requestedBackend = readTrimmed(row.requested_backend);
  const timelineSegments: HammerAudioTimelineSegmentInput[] = Array.isArray(row.timeline_segments)
    ? row.timeline_segments.reduce<HammerAudioTimelineSegmentInput[]>((acc, value) => {
      const segment = readObject(value);
      const segmentId = readTrimmed(segment?.segment_id);
      const startSec = readNumber(segment?.start_sec);
      const endSec = readNumber(segment?.end_sec);
      if (!segmentId || startSec == null || endSec == null) return acc;
      acc.push({
        segment_id: segmentId,
        start_sec: startSec,
        end_sec: endSec,
        is_disabled: segment?.is_disabled === true,
        gain_db: readNumber(segment?.gain_db) ?? 0,
      });
      return acc;
    }, [])
    : [];
  const rackState = row.rack_state;
  if (
    !workspaceId
    || !workpieceId
    || !mediaKind
    || (requestedBackend !== "native" && requestedBackend !== "ffmpeg")
    || timelineSegments.length === 0
    || !rackState
  ) {
    return null;
  }

  return {
    workspace_id: workspaceId,
    workpiece_id: workpieceId,
    media_kind: mediaKind as HammerStudioRackRenderRequest["media_kind"],
    requested_backend: requestedBackend,
    timeline_segments: timelineSegments,
    rack_state: rackState as HammerStudioRackState,
    local_root_abs: readTrimmed(row.local_root_abs),
    local_relpath: readTrimmed(row.local_relpath),
    canonical_workpiece_path: readTrimmed(row.canonical_workpiece_path),
    mime_type: readTrimmed(row.mime_type),
  };
}

function sanitizeSlug(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function buildArtifactRelpath(request: NormalizedStudioRackRenderRequest, sourceLabel: string): string {
  const sourceToken = request.canonical_workpiece_path
    ?? request.local_relpath
    ?? sourceLabel;
  const extensionless = path.basename(sourceToken, path.extname(sourceToken));
  const hash = crypto
    .createHash("sha1")
    .update(`${request.workpiece_id}:${sourceToken}:${JSON.stringify(request.rack_state)}`)
    .digest("hex")
    .slice(0, 12);
  const filename = `${sanitizeSlug(extensionless) || "source"}--${hash}.wav`;
  return ["hammer", "render", "studio-rack", sanitizeSlug(request.workpiece_id) || "workpiece", filename].join("/");
}

async function writeBestEffortLocalArtifact(args: {
  localRootAbs: string | null;
  relpath: string;
  bytes: Buffer;
}): Promise<{ outputLocalRelpath: string | null; writeFailed: boolean; writeFailureReason: string | null }> {
  if (!args.localRootAbs || !path.isAbsolute(args.localRootAbs)) {
    return {
      outputLocalRelpath: null,
      writeFailed: false,
      writeFailureReason: null,
    };
  }

  const absolutePath = resolveMediaFileAbs(args.localRootAbs, args.relpath);
  if (!absolutePath) {
    return {
      outputLocalRelpath: null,
      writeFailed: true,
      writeFailureReason: "Hammer could not resolve the local Studio Rack output path.",
    };
  }

  try {
    await fsPromises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fsPromises.writeFile(absolutePath, args.bytes);
    return {
      outputLocalRelpath: args.relpath,
      writeFailed: false,
      writeFailureReason: null,
    };
  } catch (error) {
    return {
      outputLocalRelpath: null,
      writeFailed: true,
      writeFailureReason: error instanceof Error && error.message.trim()
        ? error.message
        : "Hammer could not write local Studio Rack output.",
    };
  }
}

async function renderWaveBufferWithFfmpeg(args: {
  sourceBytes: Buffer;
  sourceExtension: string;
  sourceLabel: string;
  ffmpegBin: string;
  filterChain: string;
}): Promise<Buffer> {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "hammer-studio-rack-render-"));
  const safeExtension = args.sourceExtension || ".bin";
  const inputPath = path.join(tempRoot, `input${safeExtension}`);
  const outputPath = path.join(tempRoot, "studio-rack-render.wav");
  try {
    await fsPromises.writeFile(inputPath, args.sourceBytes);

    const ffmpegArgs = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputPath,
      "-vn",
      ...(args.filterChain ? ["-af", args.filterChain] : []),
      "-acodec",
      "pcm_s16le",
      "-ar",
      "48000",
      "-ac",
      "2",
      outputPath,
    ];

    await new Promise<void>((resolve, reject) => {
      const child = spawn(args.ffmpegBin, ffmpegArgs, {
        windowsHide: true,
        stdio: ["ignore", "ignore", "pipe"],
      });

      let stderr = "";
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, FFMPEG_PROCESS_TIMEOUT_MS);

      child.stderr.on("data", (chunk) => {
        const next = chunk.toString("utf8");
        if (stderr.length < 16_384) {
          stderr += next.slice(0, 16_384 - stderr.length);
        }
      });
      child.on("error", (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timeoutId);
        if (timedOut) {
          reject(new Error("Hammer Studio Rack FFmpeg render timed out."));
          return;
        }
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(
          stderr.trim() || `Hammer Studio Rack FFmpeg render failed for ${args.sourceLabel}.`,
        ));
      });
    });

    return await fsPromises.readFile(outputPath);
  } finally {
    await fsPromises.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

function readWavDurationMs(buffer: Buffer): number | null {
  if (buffer.length < 44) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") return null;
  const byteRate = buffer.readUInt32LE(28);
  if (!Number.isFinite(byteRate) || byteRate <= 0) return null;

  let dataSize: number | null = null;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;
    if (chunkEnd > buffer.length) break;
    if (chunkId === "data") {
      dataSize = chunkSize;
      break;
    }
    offset = chunkEnd + (chunkSize % 2);
  }
  if (dataSize == null) return null;
  return Math.round((dataSize / byteRate) * 1000);
}

async function loadCanonicalWorkpieceFile(args: {
  context: HammerRenderRequestContext;
  request: NormalizedStudioRackRenderRequest;
  workpiecePath: string;
}): Promise<Buffer> {
  const url = new URL(`/tongs/workpieces/${encodeURIComponent(args.request.workpiece_id)}/read-file`, args.context.origin);
  url.searchParams.set("path", args.workpiecePath);
  url.searchParams.set("encoding", "binary");

  const fetchTimeout = createTimeoutAbortController(CANONICAL_MEDIA_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/octet-stream, application/json",
        ...(args.context.authorization ? { authorization: args.context.authorization } : {}),
        ...(args.context.userAuthorization ? { "x-forge-user-authorization": args.context.userAuthorization } : {}),
      },
      signal: fetchTimeout.controller.signal,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(readErrorMessage(payload, "Hammer could not read canonical workpiece media for Studio Rack render."));
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > MAX_SOURCE_BYTES) {
      throw new Error(`Hammer Studio Rack render supports source media up to ${Math.round(MAX_SOURCE_BYTES / (1024 * 1024))} MiB.`);
    }
    return bytes;
  } catch (error) {
    if (fetchTimeout.controller.signal.aborted) {
      throw new Error("Hammer Studio Rack render timed out while reading canonical workpiece media.");
    }
    throw error;
  } finally {
    fetchTimeout.dispose();
  }
}

function canUseCanonicalTongsContext(context: HammerRenderRequestContext | undefined): context is HammerRenderRequestContext {
  return Boolean(
    context
    && context.origin
    && (context.authorization || context.userAuthorization),
  );
}

async function commitCanonicalWorkpieceFile(args: {
  context: HammerRenderRequestContext;
  request: NormalizedStudioRackRenderRequest;
  workpiecePath: string;
  bytes: Buffer;
  contentType: string;
  eventPayload: Record<string, unknown>;
}): Promise<void> {
  const url = new URL(`/tongs/workpieces/${encodeURIComponent(args.request.workpiece_id)}/commit-file`, args.context.origin);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(args.context.authorization ? { authorization: args.context.authorization } : {}),
      ...(args.context.userAuthorization ? { "x-forge-user-authorization": args.context.userAuthorization } : {}),
    },
    body: JSON.stringify({
      path: args.workpiecePath,
      bytes_base64: args.bytes.toString("base64"),
      content_type: args.contentType,
      event_name: "hammer.studio-rack.render.committed",
      event_payload: args.eventPayload,
      written_by: {
        tool: "hammer",
        tool_version: "forge-v1.2.0/studio-rack-render.v1",
        lane: "render",
      },
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(readErrorMessage(payload, "Hammer could not commit canonical Studio Rack render output."));
  }
}

async function loadSourceMedia(
  request: NormalizedStudioRackRenderRequest,
  context?: HammerRenderRequestContext,
): Promise<LoadedSourceMedia> {
  if (request.local_root_abs && request.local_relpath && path.isAbsolute(request.local_root_abs)) {
    const absolutePath = resolveMediaFileAbs(request.local_root_abs, request.local_relpath);
    if (absolutePath && fs.existsSync(absolutePath)) {
      const stat = await fsPromises.stat(absolutePath);
      if (stat.isFile()) {
        if (stat.size > MAX_SOURCE_BYTES) {
          throw new Error(`Hammer Studio Rack render supports source media up to ${Math.round(MAX_SOURCE_BYTES / (1024 * 1024))} MiB.`);
        }
        return {
          sourceLabel: absolutePath,
          sourceExtension: path.extname(absolutePath).toLowerCase(),
          sourceBytes: await fsPromises.readFile(absolutePath),
          canonicalWorkpiecePath: request.canonical_workpiece_path,
          localRootAbs: request.local_root_abs,
        };
      }
    }
  }

  if (!request.canonical_workpiece_path) {
    throw new Error("Hammer could not locate source media for Studio Rack render.");
  }
  if (!canUseCanonicalTongsContext(context)) {
    throw new Error("Hammer Studio Rack render needs authenticated Tongs access to read canonical media.");
  }

  const bytes = await loadCanonicalWorkpieceFile({
    context,
    request,
    workpiecePath: request.canonical_workpiece_path,
  });
  return {
    sourceLabel: request.canonical_workpiece_path,
    sourceExtension: path.extname(request.canonical_workpiece_path).toLowerCase(),
    sourceBytes: bytes,
    canonicalWorkpiecePath: request.canonical_workpiece_path,
    localRootAbs: request.local_root_abs,
  };
}

export function createHammerStudioRackRenderRequestContext(req: IncomingMessage): HammerRenderRequestContext {
  const forwardedProto = readHeaderString(req.headers["x-forwarded-proto"]);
  const host = readHeaderString(req.headers.host) ?? "localhost";
  return {
    origin: `${forwardedProto ?? "http"}://${host}`,
    authorization: readHeaderString(req.headers.authorization),
    userAuthorization: readHeaderString(req.headers["x-forge-user-authorization"]),
  };
}

export async function handleHammerStudioRackRenderRequest(
  body: unknown,
  context?: HammerRenderRequestContext,
): Promise<HammerStudioRackRenderRouteResult> {
  const request = normalizeStudioRackRenderRequest(body);
  if (!request) {
    return {
      status: 400,
      payload: {
        ok: false,
        error: { message: "Invalid Hammer Studio Rack render payload." },
      },
    };
  }

  const mediaRuntime = detectHammerMediaRuntime();
  const ffmpegBin = readTrimmed(mediaRuntime.ffmpeg.ffmpeg_bin);
  if (!mediaRuntime.ffmpeg.ffmpeg_available || !ffmpegBin) {
    return {
      status: 200,
      payload: {
        ok: true,
        data: createSkippedResponse({
          request,
          resolvedBackend: "native",
          reason: request.requested_backend === "ffmpeg"
            ? "FFmpeg is unavailable. Studio Rack render stayed on native lane and did not process."
            : "FFmpeg is unavailable. Timeline audio render could not produce a derived artifact in this runtime.",
          summary: {
            requested_backend: request.requested_backend,
            media_runtime_ffmpeg_install_state: mediaRuntime.ffmpeg.install_state,
            media_runtime_ffmpeg_available: mediaRuntime.ffmpeg.ffmpeg_available,
          },
        }),
      },
    };
  }

  if (!request.rack_state.is_enabled || request.rack_state.is_bypassed || isHammerStudioRackIdentity(request.rack_state)) {
    return {
      status: 200,
      payload: {
        ok: true,
        data: createSkippedResponse({
          request,
          resolvedBackend: "ffmpeg",
          reason: "Studio Rack is disabled or identity. Render lane left source audio unchanged.",
          summary: {
            requested_backend: request.requested_backend,
          },
        }),
      },
    };
  }

  let sourceMedia: LoadedSourceMedia;
  try {
    sourceMedia = await loadSourceMedia(request, context);
  } catch (error) {
    return {
      status: 200,
      payload: {
        ok: true,
        data: createFailedResponse({
          request,
          resolvedBackend: "ffmpeg",
          reason: error instanceof Error && error.message.trim()
            ? error.message
            : "Hammer could not load source media for Studio Rack render.",
        }),
      },
    };
  }

  try {
    const chain = buildHammerStudioRackFfmpegPlan(request.rack_state);
    const shouldApplyRack = request.requested_backend === "ffmpeg"
      && request.rack_state.is_enabled
      && !request.rack_state.is_bypassed
      && !isHammerStudioRackIdentity(request.rack_state);
    const timelinePlan = buildHammerTimelineAudioRenderPlan({
      segments: request.timeline_segments,
      postFilterChain: shouldApplyRack ? chain.filterChain : null,
      seamFadeSec: CUT_SEAM_FADE_SEC,
    });
    if (!timelinePlan) {
      return {
        status: 200,
        payload: {
          ok: true,
          data: createSkippedResponse({
            request,
            resolvedBackend: request.requested_backend === "ffmpeg" ? "ffmpeg" : "native",
            reason: "All timeline segments were disabled or invalid. No audio artifact was produced.",
            summary: {
              total_segments: request.timeline_segments.length,
              active_segments: 0,
            },
          }),
        },
      };
    }

    const renderedWaveBytes = await renderWaveBufferWithFfmpeg({
      sourceBytes: sourceMedia.sourceBytes,
      sourceExtension: sourceMedia.sourceExtension,
      sourceLabel: sourceMedia.sourceLabel,
      ffmpegBin,
      filterChain: timelinePlan.filterComplex,
    });
    const outputWorkpiecePath = buildArtifactRelpath(request, sourceMedia.sourceLabel);
    const outputDurationMs = readWavDurationMs(renderedWaveBytes);

    let commitError: string | null = null;
    if (canUseCanonicalTongsContext(context)) {
      try {
        await commitCanonicalWorkpieceFile({
          context,
          request,
          workpiecePath: outputWorkpiecePath,
          bytes: renderedWaveBytes,
          contentType: OUTPUT_MIME_TYPE,
          eventPayload: {
            source_path: sourceMedia.canonicalWorkpiecePath,
            requested_backend: request.requested_backend,
            resolved_backend: shouldApplyRack ? "ffmpeg" : "native",
            filter_count: timelinePlan.filterComplex.split(";").length,
          },
        });
      } catch (error) {
        commitError = error instanceof Error && error.message.trim()
          ? error.message
          : "Hammer could not commit canonical Studio Rack render output.";
      }
    }

    const localArtifactWrite = await writeBestEffortLocalArtifact({
      localRootAbs: sourceMedia.localRootAbs,
      relpath: outputWorkpiecePath,
      bytes: renderedWaveBytes,
    });

    return {
      status: 200,
      payload: {
        ok: true,
        data: {
          status: "processed",
          requested_backend: request.requested_backend,
          resolved_backend: shouldApplyRack ? "ffmpeg" : "native",
          processed_at: new Date().toISOString(),
          output_local_relpath: localArtifactWrite.outputLocalRelpath,
          output_workpiece_path: commitError ? null : outputWorkpiecePath,
          output_mime_type: OUTPUT_MIME_TYPE,
          output_duration_ms: outputDurationMs,
          failure_reason: commitError ?? localArtifactWrite.writeFailureReason,
          settings_summary: {
            source_extension: sourceMedia.sourceExtension,
            source_canonical_workpiece_path: sourceMedia.canonicalWorkpiecePath,
            local_output_write_failed: localArtifactWrite.writeFailed,
            local_output_write_failure_reason: localArtifactWrite.writeFailureReason,
            canonical_commit_failed: Boolean(commitError),
            canonical_commit_failure_reason: commitError,
            media_runtime_ffmpeg_install_state: mediaRuntime.ffmpeg.install_state,
            media_runtime_ffmpeg_available: mediaRuntime.ffmpeg.ffmpeg_available,
            source_path_unchanged: sourceMedia.canonicalWorkpiecePath ?? sourceMedia.sourceLabel,
            derived_output_path: outputWorkpiecePath,
            requested_backend: request.requested_backend,
            resolved_backend: shouldApplyRack ? "ffmpeg" : "native",
            timeline_order_preserved: true,
            ...timelinePlan.summary,
            ...chain.summary,
          },
        },
      },
    };
  } catch (error) {
    return {
      status: 200,
      payload: {
        ok: true,
        data: createFailedResponse({
          request,
          resolvedBackend: "ffmpeg",
          reason: error instanceof Error && error.message.trim()
            ? error.message
            : "Hammer could not render Studio Rack output with FFmpeg.",
        }),
      },
    };
  }
}
