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
  const rackState = row.rack_state;
  if (
    !workspaceId
    || !workpieceId
    || !mediaKind
    || (requestedBackend !== "native" && requestedBackend !== "ffmpeg")
    || !rackState
  ) {
    return null;
  }

  return {
    workspace_id: workspaceId,
    workpiece_id: workpieceId,
    media_kind: mediaKind as HammerStudioRackRenderRequest["media_kind"],
    requested_backend: requestedBackend,
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

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function toLinearFromDb(dbValue: number): number {
  return Math.pow(10, dbValue / 20);
}

function buildFfmpegFilterChain(rackState: HammerStudioRackState): {
  filters: string[];
  summary: Record<string, string | number | boolean | null>;
} {
  const filters: string[] = [];
  const summary: Record<string, string | number | boolean | null> = {
    rack_enabled: rackState.is_enabled,
    rack_bypassed: rackState.is_bypassed,
  };

  const gate = rackState.modules.gate;
  if (gate.is_enabled && !gate.is_bypassed) {
    filters.push(
      `agate=threshold=${toLinearFromDb(clamp(gate.threshold_db, -80, 0)).toFixed(6)}`
      + `:range=${toLinearFromDb(clamp(gate.range_db, -60, 0)).toFixed(6)}`
      + `:attack=${clamp(gate.attack_ms, 0.5, 120).toFixed(1)}`
      + `:release=${clamp(gate.release_ms, 10, 1200).toFixed(1)}`,
    );
  }

  const compressor = rackState.modules.compressor;
  if (compressor.is_enabled && !compressor.is_bypassed) {
    filters.push(
      `acompressor=threshold=${clamp(compressor.threshold_db, -60, 0).toFixed(1)}dB`
      + `:ratio=${clamp(compressor.ratio, 1, 20).toFixed(2)}`
      + `:attack=${clamp(compressor.attack_ms, 0.5, 120).toFixed(1)}`
      + `:release=${clamp(compressor.release_ms, 10, 1200).toFixed(1)}`
      + `:makeup=${clamp(compressor.makeup_gain_db, -12, 18).toFixed(1)}`,
    );
  }

  const eq = rackState.modules.eq;
  if (eq.is_enabled && !eq.is_bypassed) {
    filters.push(
      `equalizer=f=${clamp(eq.low_shelf_hz, 40, 400).toFixed(0)}:t=o:w=1:g=${clamp(eq.low_shelf_gain_db, -12, 12).toFixed(2)}`,
      `equalizer=f=${clamp(eq.mid_hz, 200, 8000).toFixed(0)}:t=q:w=${clamp(eq.mid_q, 0.2, 8).toFixed(2)}:g=${clamp(eq.mid_gain_db, -12, 12).toFixed(2)}`,
      `equalizer=f=${clamp(eq.high_shelf_hz, 2000, 16000).toFixed(0)}:t=o:w=1:g=${clamp(eq.high_shelf_gain_db, -12, 12).toFixed(2)}`,
    );
  }

  const reverb = rackState.modules.reverb;
  if (reverb.is_enabled && !reverb.is_bypassed) {
    const mix = clamp(reverb.mix, 0, 0.35);
    const predelayMs = Math.max(1, Math.round(clamp(reverb.predelay_ms, 0, 140)));
    const decayAmount = clamp(reverb.decay_sec / 3.2, 0.05, 0.9);
    filters.push(
      `aecho=in_gain=${(1 - mix).toFixed(3)}:out_gain=1.0:delays=${predelayMs}:decays=${decayAmount.toFixed(3)}`,
    );
  }

  const tube = rackState.modules.tubeMicCharacter;
  if (tube.is_enabled && !tube.is_bypassed) {
    const amount = clamp(tube.amount, 0, 1);
    const airGain = clamp(tube.air * amount * 6, -6, 6);
    const warmthGain = clamp(tube.warmth * amount * 6, -6, 6);
    const tubeRatio = 1 + amount * 2;
    const tubeMakeup = amount * 2;
    filters.push(
      `equalizer=f=180:t=o:w=1:g=${warmthGain.toFixed(2)}`,
      `equalizer=f=9500:t=o:w=1:g=${airGain.toFixed(2)}`,
      `acompressor=threshold=-16dB:ratio=${tubeRatio.toFixed(2)}:attack=10:release=120:makeup=${tubeMakeup.toFixed(2)}`,
    );
  }

  summary.filter_count = filters.length;
  summary.filter_chain = filters.join(",");
  return { filters, summary };
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

  if (request.requested_backend !== "ffmpeg") {
    return {
      status: 200,
      payload: {
        ok: true,
        data: createSkippedResponse({
          request,
          resolvedBackend: "native",
          reason: "Render lane native backend is not configured for Studio Rack processing. No derived artifact was produced.",
          summary: {
            requested_backend: request.requested_backend,
            media_runtime_ffmpeg_available: mediaRuntime.ffmpeg.ffmpeg_available,
          },
        }),
      },
    };
  }

  if (!mediaRuntime.ffmpeg.ffmpeg_available || !ffmpegBin) {
    return {
      status: 200,
      payload: {
        ok: true,
        data: createSkippedResponse({
          request,
          resolvedBackend: "native",
          reason: "FFmpeg is unavailable. Studio Rack render stayed on native lane and did not process.",
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
    const chain = buildFfmpegFilterChain(request.rack_state);
    const renderedWaveBytes = await renderWaveBufferWithFfmpeg({
      sourceBytes: sourceMedia.sourceBytes,
      sourceExtension: sourceMedia.sourceExtension,
      sourceLabel: sourceMedia.sourceLabel,
      ffmpegBin,
      filterChain: chain.filters.join(","),
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
            resolved_backend: "ffmpeg",
            filter_count: chain.filters.length,
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
          resolved_backend: "ffmpeg",
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
