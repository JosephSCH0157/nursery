import crypto from "node:crypto";
import { spawn } from "node:child_process";
import type { IncomingMessage } from "node:http";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { detectHammerMediaRuntime } from "./hammer-media-runtime";
import { resolveHammerAudioPolishExecutionPlan } from "../../hammer/src/media/hammerMediaBackbone";
import {
  HAMMER_AUDIO_POLISH_PROCESSOR_VERSION,
  HAMMER_AUDIO_POLISH_PREPARED_PASSES,
} from "../../hammer/src/prep/hammerAudioPolish";
import {
  readHammerForgeFfmpegClientConfig,
  transcodeToWorkingWavWithForgeFfmpeg,
} from "./hammer-forge-ffmpeg-client";
import type {
  HammerAudioPolishPhase,
  HammerAudioPolishRequest,
  HammerAudioPolishResponse,
} from "../../hammer/src/prep/hammerAudioPolishApi";
import type {
  HammerAudioPolishAnalysis,
  HammerAudioPolishFailureCode,
} from "../../hammer/src/persistence/hammerPersistenceContract";

type HammerAudioPolishRouteResult = {
  status: number;
  payload: {
    ok: boolean;
    data?: HammerAudioPolishResponse;
    error?: { message: string };
  };
};

type ParsedWave = {
  sampleRate: number;
  channelCount: number;
  sampleCount: number;
  formatLabel: string;
  channelData: Float32Array[];
};

type HammerAudioPolishRequestContext = {
  origin: string;
  authorization: string | null;
  userAuthorization: string | null;
};

type NormalizedHammerAudioPolishRequest = Omit<
  HammerAudioPolishRequest,
  "local_root_abs" | "local_relpath" | "canonical_workpiece_path" | "input" | "tongs_origin"
> & {
  input: { type: "local_path" | "url"; value: string } | null;
  tongs_origin: string | null;
  local_root_abs: string | null;
  local_relpath: string | null;
  canonical_workpiece_path: string | null;
};

type LoadedSourceMedia = {
  sourceKind: "local_workspace_media" | "canonical_workpiece_media";
  sourceLabel: string;
  sourceExtension: string;
  contentType: string;
  sourceBytes: Buffer;
  canonicalWorkpiecePath: string;
  localRootAbs: string | null;
  localRelpath: string | null;
  resolvedInputType: "local_path" | "url" | "unknown";
  attemptedSources: Array<{ kind: "local_path" | "url"; value: string }>;
};

type HammerFfprobeMediaTruth = {
  durationMs: number | null;
  sampleRate: number | null;
  channelCount: number | null;
  bitDepth: number | null;
  timebase: string | null;
};

type HammerLoudnessAnalysis = HammerAudioPolishAnalysis["loudness"];
type HammerSegmentationAnalysis = HammerAudioPolishAnalysis["segmentation"];
type HammerSegmentationRegion = HammerSegmentationAnalysis["regions"][number];
type HammerTranscriptPrepAnalysis = HammerAudioPolishAnalysis["transcript_prep"];
type HammerChannelCharacterization = HammerAudioPolishAnalysis["channel_characterization"];
type HammerWaveformProxy = HammerAudioPolishAnalysis["waveform_proxy"];

const OUTPUT_MIME_TYPE = "audio/wav";
const MEDIA_CONTENT_TYPES: Partial<Record<string, string>> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
};
const MAX_AUDIO_POLISH_SOURCE_BYTES = 256 * 1024 * 1024;
const CANONICAL_MEDIA_FETCH_TIMEOUT_MS = 60_000;
const FFMPEG_PROCESS_TIMEOUT_MS = 2 * 60 * 1000;
const FFPROBE_PROCESS_TIMEOUT_MS = 30_000;
const SILENCE_DETECT_NOISE_DB = -35;
const SILENCE_DETECT_MIN_SEC = 0.25;
const SEGMENT_EDGE_CLAMP_SEC = 0.02;
const TRANSCRIPT_CHUNK_TARGET_SEC = 60;
const TRANSCRIPT_CHUNK_HARD_MAX_SEC = 90;
const TRANSCRIPT_CHUNK_MIN_SEC = 8;
const TRANSCRIPT_CHUNK_BOUNDARY_SEARCH_WINDOW_SEC = 18;
const SILENT_CHANNEL_THRESHOLD_DBFS = -85;
const DUAL_MONO_CORRELATION_THRESHOLD = 0.99;
const PHASE_CONCERN_CORRELATION_THRESHOLD = -0.5;
const WAVEFORM_PROXY_BUCKET_DURATION_SEC = 0.05;
const WAVEFORM_PROXY_MAX_BUCKET_COUNT = 2400;

function readTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readAudioPolishInput(value: unknown): NormalizedHammerAudioPolishRequest["input"] {
  const row = readObject(value);
  if (!row) return null;
  const type = readTrimmed(row.type);
  const v = readTrimmed(row.value);
  if (!v) return null;
  if (type !== "local_path" && type !== "url") return null;
  return { type, value: v };
}

function readUrlOrigin(value: unknown): string | null {
  const candidate = readTrimmed(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.origin;
  } catch {
    return null;
  }
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
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

function inferContentType(sourcePath: string, mimeType?: string | null): string {
  const explicit = readTrimmed(mimeType);
  if (explicit) return explicit;
  return MEDIA_CONTENT_TYPES[path.extname(sourcePath).toLowerCase()] ?? "application/octet-stream";
}

function formatBytesAsMiB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function buildAudioPolishSourceTooLargeMessage(byteCount: number): string {
  return `Hammer audio prep currently supports source media up to ${formatBytesAsMiB(MAX_AUDIO_POLISH_SOURCE_BYTES)} in this runtime. Received ${formatBytesAsMiB(byteCount)}.`;
}

function readHeaderNumber(headers: Headers, name: string): number | null {
  const value = readTrimmed(headers.get(name));
  if (!value) return null;
  return readNumber(value);
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

function normalizeAudioPolishRequest(body: unknown): NormalizedHammerAudioPolishRequest | null {
  const row = readObject(body);
  if (!row) return null;
  const workspaceId = readTrimmed(row.workspace_id);
  const workpieceId = readTrimmed(row.workpiece_id);
  const localRootAbs = readTrimmed(row.local_root_abs);
  const localRelpath = readTrimmed(row.local_relpath);
  const canonicalWorkpiecePath = readTrimmed(row.canonical_workpiece_path) ?? localRelpath;
  const explicitInput = readAudioPolishInput(row.input);
  const derivedLocalInput = !explicitInput && localRootAbs && localRelpath && path.isAbsolute(localRootAbs)
    ? resolveMediaFileAbs(localRootAbs, localRelpath)
    : null;
  const input = explicitInput ?? (derivedLocalInput ? { type: "local_path" as const, value: derivedLocalInput } : null);
  const tongsOrigin = readUrlOrigin(row.tongs_origin);
  const mediaKind = readTrimmed(row.media_kind);
  if (!workspaceId || !workpieceId || !mediaKind) {
    return null;
  }

  return {
    workspace_id: workspaceId,
    workpiece_id: workpieceId,
    media_kind: mediaKind as HammerAudioPolishRequest["media_kind"],
    input,
    tongs_origin: tongsOrigin,
    local_root_abs: localRootAbs,
    local_relpath: localRelpath,
    canonical_workpiece_path: canonicalWorkpiecePath,
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

function resolveSourceRelpath(request: NormalizedHammerAudioPolishRequest): string {
  return request.canonical_workpiece_path
    ?? request.local_relpath
    ?? "source";
}

export function buildArtifactRelpath(
  category: "audio-polish" | "working-audio",
  request: NormalizedHammerAudioPolishRequest,
): string {
  const sourceRelpath = resolveSourceRelpath(request);
  const extensionless = path.basename(sourceRelpath, path.extname(sourceRelpath));
  const hash = crypto
    .createHash("sha1")
    .update(`${request.workpiece_id}:${category}:${sourceRelpath}:${HAMMER_AUDIO_POLISH_PROCESSOR_VERSION}`)
    .digest("hex")
    .slice(0, 10);
  const filename = `${sanitizeSlug(extensionless) || "source"}--${hash}.wav`;
  return ["hammer", "prep", category, sanitizeSlug(request.workpiece_id) || "workpiece", filename].join("/");
}

function createFailedResponse(args: {
  code: HammerAudioPolishFailureCode;
  reason: string;
  phase?: HammerAudioPolishPhase | null;
  failedPhase?: HammerAudioPolishPhase | null;
  settingsSummary?: Record<string, string | number | boolean | null>;
}): HammerAudioPolishResponse {
  return {
    status: "failed",
    phase: args.phase ?? null,
    failed_phase: args.failedPhase ?? null,
    prepared_at: null,
    prepared_passes: [],
    processor_version: HAMMER_AUDIO_POLISH_PROCESSOR_VERSION,
    output_local_relpath: null,
    output_workpiece_path: null,
    output_mime_type: null,
    output_duration_ms: null,
    failure_code: args.code,
    failure_reason: args.reason,
    analysis: null,
    audio_edit: null,
    settings_summary: {
      supported_source: false,
      ...args.settingsSummary,
    },
  };
}

function canUseCanonicalTongsContext(
  context: HammerAudioPolishRequestContext | undefined,
): context is HammerAudioPolishRequestContext {
  return Boolean(
    context
    && context.origin
    && (context.authorization || context.userAuthorization),
  );
}

async function commitCanonicalWorkpieceFile(args: {
  context: HammerAudioPolishRequestContext;
  request: NormalizedHammerAudioPolishRequest;
  workpiecePath: string;
  bytes: Buffer;
  contentType: string;
  eventName: string;
  eventPayload: Record<string, unknown>;
}): Promise<void> {
  const origin = args.request.tongs_origin ?? args.context.origin;
  const url = new URL(`/tongs/workpieces/${encodeURIComponent(args.request.workpiece_id)}/commit-file`, origin);
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
      event_name: args.eventName,
      event_payload: args.eventPayload,
      written_by: {
        tool: "hammer",
        tool_version: HAMMER_AUDIO_POLISH_PROCESSOR_VERSION,
        lane: "forge-managed",
      },
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(readErrorMessage(payload, "Hammer could not commit canonical audio prep output."));
  }
}

async function loadSourceMedia(
  request: NormalizedHammerAudioPolishRequest,
  context?: HammerAudioPolishRequestContext,
): Promise<LoadedSourceMedia> {
  const attemptedSources: LoadedSourceMedia["attemptedSources"] = [];

  const tryLocalPath = async (absolutePath: string): Promise<LoadedSourceMedia> => {
    attemptedSources.push({ kind: "local_path", value: absolutePath });
    const stat = await fsPromises.stat(absolutePath).catch(() => null);
    if (!stat?.isFile()) {
      throw new Error("Hammer could not locate the local source media file for audio prep.");
    }
    if (stat.size > MAX_AUDIO_POLISH_SOURCE_BYTES) {
      throw new Error(buildAudioPolishSourceTooLargeMessage(stat.size));
    }
    return {
      sourceKind: "local_workspace_media",
      sourceLabel: absolutePath,
      sourceExtension: path.extname(absolutePath).toLowerCase(),
      contentType: inferContentType(absolutePath, request.mime_type),
      sourceBytes: await fsPromises.readFile(absolutePath),
      canonicalWorkpiecePath: request.canonical_workpiece_path ?? request.local_relpath ?? absolutePath,
      localRootAbs: request.local_root_abs,
      localRelpath: request.local_relpath,
      resolvedInputType: "local_path",
      attemptedSources,
    };
  };

  const tryUrl = async (url: string): Promise<LoadedSourceMedia> => {
    attemptedSources.push({ kind: "url", value: url });
    const fetchTimeout = createTimeoutAbortController(CANONICAL_MEDIA_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          accept: "application/octet-stream, application/json",
          ...(context?.authorization ? { authorization: context.authorization } : {}),
          ...(context?.userAuthorization ? { "x-forge-user-authorization": context.userAuthorization } : {}),
        },
        signal: fetchTimeout.controller.signal,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(readErrorMessage(payload, "Hammer could not fetch source media for audio prep."));
      }

      const contentLength = readHeaderNumber(response.headers, "content-length");
      if (contentLength != null && contentLength > MAX_AUDIO_POLISH_SOURCE_BYTES) {
        throw new Error(buildAudioPolishSourceTooLargeMessage(contentLength));
      }

      const fileBytes = Buffer.from(await response.arrayBuffer());
      if (fileBytes.byteLength > MAX_AUDIO_POLISH_SOURCE_BYTES) {
        throw new Error(buildAudioPolishSourceTooLargeMessage(fileBytes.byteLength));
      }

      const contentType = readTrimmed(response.headers.get("content-type"))
        ?? inferContentType(request.canonical_workpiece_path ?? url, request.mime_type);

      return {
        sourceKind: "canonical_workpiece_media",
        sourceLabel: url,
        sourceExtension: path.extname(request.canonical_workpiece_path ?? url).toLowerCase(),
        contentType,
        sourceBytes: fileBytes,
        canonicalWorkpiecePath: request.canonical_workpiece_path ?? url,
        localRootAbs: request.local_root_abs,
        localRelpath: request.local_relpath,
        resolvedInputType: "url",
        attemptedSources,
      };
    } catch (error) {
      if (fetchTimeout.controller.signal.aborted) {
        throw new Error("Hammer timed out while fetching source media for audio prep.");
      }
      throw error;
    } finally {
      fetchTimeout.dispose();
    }
  };

  if (request.input?.type === "local_path") {
    const candidate = request.input.value;
    if (!path.isAbsolute(candidate)) {
      throw new Error("Hammer audio prep requires an absolute local file path.");
    }
    return await tryLocalPath(candidate);
  }

  if (request.input?.type === "url") {
    try {
      return await tryUrl(request.input.value);
    } catch (error) {
      if (process.env.NODE_ENV !== "production" && request.local_root_abs && request.local_relpath && path.isAbsolute(request.local_root_abs)) {
        const fallbackAbs = resolveMediaFileAbs(request.local_root_abs, request.local_relpath);
        if (fallbackAbs) {
          return await tryLocalPath(fallbackAbs);
        }
      }
      throw error;
    }
  }

  throw new Error("Hammer audio prep input is unresolvable. Provide a local_path or fetchable url.");
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
      writeFailureReason: "Hammer could not resolve the local output path for the prepared audio artifact.",
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
        : "Hammer could not write the prepared audio artifact into the local workspace mapping.",
    };
  }
}

async function renderWorkingAudioWaveBufferWithFfmpeg(args: {
  sourceBytes: Buffer;
  sourceExtension: string;
  sourceLabel: string;
  ffmpegBin: string;
}): Promise<Buffer> {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "hammer-working-audio-"));
  const safeExtension = args.sourceExtension || ".bin";
  const inputPath = path.join(tempRoot, `input${safeExtension}`);
  const outputPath = path.join(tempRoot, "working-audio.wav");
  try {
    await fsPromises.writeFile(inputPath, args.sourceBytes);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        args.ffmpegBin,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-i",
          inputPath,
          "-vn",
          "-acodec",
          "pcm_s16le",
          "-ar",
          "48000",
          "-ac",
          "1",
          outputPath,
        ],
        {
          windowsHide: true,
          stdio: ["ignore", "ignore", "pipe"],
        },
      );

      let stderr = "";
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, FFMPEG_PROCESS_TIMEOUT_MS);

      child.stderr.on("data", (chunk: Buffer) => {
        const next = chunk.toString("utf8");
        if (stderr.length < 16_384) {
          stderr += next.slice(0, 16_384 - stderr.length);
        }
      });
      child.on("error", (error: unknown) => {
        clearTimeout(timeoutId);
        reject(error);
      });
      child.on("close", (code: number | null) => {
        clearTimeout(timeoutId);
        if (timedOut) {
          reject(new Error("Hammer FFmpeg working-audio extraction timed out."));
          return;
        }
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(
          stderr.trim() || `Hammer FFmpeg working-audio extraction failed for ${args.sourceLabel}.`,
        ));
      });
    });
    return await fsPromises.readFile(outputPath);
  } finally {
    await fsPromises.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function renderWorkingAudioWaveBuffer(args: {
  sourceBytes: Buffer;
  sourceExtension: string;
  sourceLabel: string;
  sourceContentType: string;
  ffmpegBin: string;
}): Promise<{
  workingWaveBytes: Buffer;
  backend: "local_ffmpeg" | "forge_ffmpeg_service";
  serviceRequestId: string | null;
  serviceOutputFormat: string | null;
  serviceOutputSampleRate: number | null;
  serviceOutputChannels: number | null;
}> {
  const forgeClient = readHammerForgeFfmpegClientConfig();
  if (forgeClient) {
    try {
      const transcodeResult = await transcodeToWorkingWavWithForgeFfmpeg({
        client: forgeClient,
        sourceBytes: args.sourceBytes,
        sourceFilename: path.basename(args.sourceLabel || `source${args.sourceExtension || ""}`),
        contentType: args.sourceContentType,
      });
      return {
        workingWaveBytes: transcodeResult.audioBytes,
        backend: "forge_ffmpeg_service",
        serviceRequestId: transcodeResult.requestId,
        serviceOutputFormat: transcodeResult.outputFormat,
        serviceOutputSampleRate: transcodeResult.outputSampleRate,
        serviceOutputChannels: transcodeResult.outputChannels,
      };
    } catch (error) {
      // DEV resilience: if the remote Forge FFmpeg service is unreachable, fall back to local ffmpeg.
      // This preserves the "must be executable input" contract while preventing opaque "fetch failed" dead-ends.
      const fallbackMessage = error instanceof Error && error.message.trim()
        ? error.message.trim()
        : "Forge FFmpeg working-audio transcode failed.";

      try {
        return {
          workingWaveBytes: await renderWorkingAudioWaveBufferWithFfmpeg({
            sourceBytes: args.sourceBytes,
            sourceExtension: args.sourceExtension,
            sourceLabel: args.sourceLabel,
            ffmpegBin: args.ffmpegBin,
          }),
          backend: "local_ffmpeg",
          serviceRequestId: null,
          serviceOutputFormat: null,
          serviceOutputSampleRate: null,
          serviceOutputChannels: null,
        };
      } catch (fallbackError) {
        const fallbackDetail = fallbackError instanceof Error && fallbackError.message.trim()
          ? fallbackError.message.trim()
          : "Local ffmpeg fallback failed.";
        throw new Error(`[forge_ffmpeg_service:${forgeClient.baseUrl}] ${fallbackMessage} | [local_ffmpeg_fallback] ${fallbackDetail}`);
      }
    }
  }

  return {
    workingWaveBytes: await renderWorkingAudioWaveBufferWithFfmpeg({
      sourceBytes: args.sourceBytes,
      sourceExtension: args.sourceExtension,
      sourceLabel: args.sourceLabel,
      ffmpegBin: args.ffmpegBin,
    }),
    backend: "local_ffmpeg",
    serviceRequestId: null,
    serviceOutputFormat: null,
    serviceOutputSampleRate: null,
    serviceOutputChannels: null,
  };
}

function toFiniteNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readBitDepth(stream: Record<string, unknown>): number | null {
  const raw = toFiniteNumberOrNull(stream.bits_per_raw_sample);
  if (raw && raw > 0) return raw;
  const bits = toFiniteNumberOrNull(stream.bits_per_sample);
  return bits && bits > 0 ? bits : null;
}

async function probeMediaTruthWithFfprobe(args: {
  ffprobeBin: string;
  bytes: Buffer;
  sourceExtension: string;
  sourceLabel: string;
}): Promise<HammerFfprobeMediaTruth> {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "hammer-ffprobe-media-truth-"));
  const safeExtension = args.sourceExtension || ".bin";
  const inputPath = path.join(tempRoot, `input${safeExtension}`);
  try {
    await fsPromises.writeFile(inputPath, args.bytes);
    const probeJson = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        args.ffprobeBin,
        [
          "-v",
          "error",
          "-select_streams",
          "a:0",
          "-show_entries",
          "stream=sample_rate,channels,bits_per_raw_sample,bits_per_sample,time_base,duration:format=duration",
          "-of",
          "json",
          inputPath,
        ],
        {
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, FFPROBE_PROCESS_TIMEOUT_MS);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        const next = chunk.toString("utf8");
        if (stderr.length < 16_384) {
          stderr += next.slice(0, 16_384 - stderr.length);
        }
      });
      child.on("error", (error: unknown) => {
        clearTimeout(timeoutId);
        reject(error);
      });
      child.on("close", (code: number | null) => {
        clearTimeout(timeoutId);
        if (timedOut) {
          reject(new Error("Hammer FFprobe media truth probe timed out."));
          return;
        }
        if (code === 0) {
          resolve(stdout);
          return;
        }
        reject(new Error(stderr.trim() || `Hammer FFprobe media truth probe failed for ${args.sourceLabel}.`));
      });
    });

    const parsed = JSON.parse(probeJson) as {
      streams?: Array<Record<string, unknown>>;
      format?: Record<string, unknown>;
    };
    const stream = Array.isArray(parsed.streams) ? parsed.streams[0] ?? {} : {};
    const format = parsed.format ?? {};
    const streamDuration = toFiniteNumberOrNull(stream.duration);
    const formatDuration = toFiniteNumberOrNull(format.duration);
    const durationSec = streamDuration ?? formatDuration;

    return {
      durationMs: durationSec != null && durationSec >= 0
        ? Math.round(durationSec * 1000)
        : null,
      sampleRate: toFiniteNumberOrNull(stream.sample_rate),
      channelCount: toFiniteNumberOrNull(stream.channels),
      bitDepth: readBitDepth(stream),
      timebase: readTrimmed(typeof stream.time_base === "string" ? stream.time_base : null),
    };
  } finally {
    await fsPromises.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

function parseWaveFormatTag(formatTag: number, fmtChunk: Buffer): {
  normalizedFormat: "pcm16" | "float32" | null;
  formatLabel: string;
} {
  let resolvedFormatTag = formatTag;
  if (formatTag === 0xfffe && fmtChunk.length >= 26) {
    resolvedFormatTag = fmtChunk.readUInt16LE(24);
  }

  const bitsPerSample = fmtChunk.readUInt16LE(14);
  if (resolvedFormatTag === 1 && bitsPerSample === 16) {
    return { normalizedFormat: "pcm16", formatLabel: "wav_pcm_s16le" };
  }
  if (resolvedFormatTag === 3 && bitsPerSample === 32) {
    return { normalizedFormat: "float32", formatLabel: "wav_f32le" };
  }
  return { normalizedFormat: null, formatLabel: `wav_format_${resolvedFormatTag}_${bitsPerSample}` };
}

function parseWaveBuffer(buffer: Buffer): ParsedWave {
  if (buffer.length < 44) {
    throw new Error("WAV file is too small to parse.");
  }
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Source file is not a RIFF/WAVE file.");
  }

  let fmtChunk: Buffer | null = null;
  let dataChunk: Buffer | null = null;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;
    if (chunkEnd > buffer.length) {
      break;
    }
    if (chunkId === "fmt ") {
      fmtChunk = buffer.subarray(chunkStart, chunkEnd);
    } else if (chunkId === "data") {
      dataChunk = buffer.subarray(chunkStart, chunkEnd);
    }
    offset = chunkEnd + (chunkSize % 2);
  }

  if (!fmtChunk || fmtChunk.length < 16 || !dataChunk) {
    throw new Error("WAV file is missing required fmt/data chunks.");
  }

  const formatTag = fmtChunk.readUInt16LE(0);
  const channelCount = fmtChunk.readUInt16LE(2);
  const sampleRate = fmtChunk.readUInt32LE(4);
  const blockAlign = fmtChunk.readUInt16LE(12);
  const bitsPerSample = fmtChunk.readUInt16LE(14);
  const { normalizedFormat, formatLabel } = parseWaveFormatTag(formatTag, fmtChunk);

  if (!normalizedFormat) {
    throw new Error(`Hammer supports PCM16 or float32 WAV input for baseline polish. Received ${formatLabel}.`);
  }
  if (channelCount < 1 || channelCount > 2) {
    throw new Error("Hammer baseline polish supports mono or stereo WAV input only.");
  }
  if (!Number.isFinite(sampleRate) || sampleRate < 8_000 || sampleRate > 96_000) {
    throw new Error("Hammer baseline polish requires a sane WAV sample rate.");
  }
  if (blockAlign <= 0 || dataChunk.length % blockAlign !== 0) {
    throw new Error("WAV data chunk alignment is invalid.");
  }

  const bytesPerSample = bitsPerSample / 8;
  const sampleCount = dataChunk.length / blockAlign;
  const channelData = Array.from({ length: channelCount }, () => new Float32Array(sampleCount));
  for (let frameIndex = 0; frameIndex < sampleCount; frameIndex += 1) {
    const frameOffset = frameIndex * blockAlign;
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sampleOffset = frameOffset + channelIndex * bytesPerSample;
      const sample = normalizedFormat === "pcm16"
        ? dataChunk.readInt16LE(sampleOffset) / 32768
        : dataChunk.readFloatLE(sampleOffset);
      channelData[channelIndex][frameIndex] = Math.max(-1, Math.min(1, sample));
    }
  }

  return {
    sampleRate,
    channelCount,
    sampleCount,
    formatLabel,
    channelData,
  };
}

function applyDcRemoval(samples: Float32Array): void {
  let mean = 0;
  for (let index = 0; index < samples.length; index += 1) {
    mean += samples[index];
  }
  mean /= Math.max(samples.length, 1);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] -= mean;
  }
}

function applyHighPass(samples: Float32Array, sampleRate: number, cutoffHz: number): void {
  const dt = 1 / sampleRate;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const alpha = rc / (rc + dt);
  let previousInput = samples[0] ?? 0;
  let previousOutput = previousInput;
  for (let index = 1; index < samples.length; index += 1) {
    const input = samples[index];
    const output = alpha * (previousOutput + input - previousInput);
    samples[index] = output;
    previousInput = input;
    previousOutput = output;
  }
}

function applyLowPass(samples: Float32Array, sampleRate: number, cutoffHz: number): void {
  const dt = 1 / sampleRate;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const alpha = dt / (rc + dt);
  let lowPass = samples[0] ?? 0;
  for (let index = 0; index < samples.length; index += 1) {
    const input = samples[index];
    lowPass += alpha * (input - lowPass);
    samples[index] = lowPass;
  }
}

function applyPeakingEq(samples: Float32Array, sampleRate: number, centerHz: number, gainDb: number, q: number): void {
  const w0 = (2 * Math.PI * centerHz) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const A = Math.pow(10, gainDb / 40);
  const alpha = sin / (2 * Math.max(0.1, q));

  const b0 = 1 + alpha * A;
  const b1 = -2 * cos;
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1 = -2 * cos;
  const a2 = 1 - alpha / A;

  const nb0 = b0 / a0;
  const nb1 = b1 / a0;
  const nb2 = b2 / a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;

  let x1 = samples[0] ?? 0;
  let x2 = samples[0] ?? 0;
  let y1 = x1;
  let y2 = x2;

  for (let index = 0; index < samples.length; index += 1) {
    const x0 = samples[index];
    const y0 = nb0 * x0 + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
    samples[index] = Math.max(-1, Math.min(1, y0));
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
}

function applyGentleDeEsser(samples: Float32Array, sampleRate: number): void {
  const highBand = new Float32Array(samples);
  applyHighPass(highBand, sampleRate, 4_500);
  applyLowPass(highBand, sampleRate, 11_000);
  const originalBand = new Float32Array(highBand);

  let sumSquares = 0;
  for (let index = 0; index < highBand.length; index += 1) {
    const value = highBand[index];
    sumSquares += value * value;
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, highBand.length));
  const threshold = rms * 2.2;
  const intensity = 0.18;

  const attack = Math.max(0.001, 1 / (sampleRate * 0.004));
  const release = Math.max(0.001, 1 / (sampleRate * 0.02));
  let envelope = 0;

  for (let index = 0; index < highBand.length; index += 1) {
    const value = highBand[index];
    const magnitude = Math.abs(value);
    envelope = magnitude > envelope
      ? envelope + (magnitude - envelope) * attack
      : envelope + (magnitude - envelope) * release;

    if (envelope <= threshold) continue;
    const over = envelope - threshold;
    const damp = Math.max(0.5, 1 - intensity * (over / (envelope + 1e-6)));
    highBand[index] = value * damp;
  }

  for (let index = 0; index < samples.length; index += 1) {
    const delta = highBand[index] - originalBand[index];
    samples[index] = Math.max(-1, Math.min(1, samples[index] + delta));
  }
}

function applyLightCompression(samples: Float32Array, sampleRate: number): void {
  const thresholdDb = -18;
  const threshold = Math.pow(10, thresholdDb / 20);
  const ratio = 2.1;
  const attackCoeff = Math.exp(-1 / (sampleRate * 0.005));
  const releaseCoeff = Math.exp(-1 / (sampleRate * 0.12));
  const makeupGain = 1.08;
  let envelope = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const input = samples[index];
    const amplitude = Math.abs(input);
    envelope = amplitude > envelope
      ? attackCoeff * envelope + (1 - attackCoeff) * amplitude
      : releaseCoeff * envelope + (1 - releaseCoeff) * amplitude;

    let gain = 1;
    if (envelope > threshold) {
      const envelopeDb = 20 * Math.log10(envelope);
      const compressedDb = thresholdDb + (envelopeDb - thresholdDb) / ratio;
      gain = Math.pow(10, (compressedDb - envelopeDb) / 20);
    }

    samples[index] = Math.max(-1, Math.min(1, input * gain * makeupGain));
  }
}

function normalizeLoudness(channelData: Float32Array[], targetRmsDbfs: number, maxPeak = 0.92): void {
  let sumSquares = 0;
  let sampleTotal = 0;
  let peak = 0;

  for (const samples of channelData) {
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index];
      sumSquares += sample * sample;
      sampleTotal += 1;
      peak = Math.max(peak, Math.abs(sample));
    }
  }

  const rms = sampleTotal > 0 ? Math.sqrt(sumSquares / sampleTotal) : 0;
  if (!(rms > 0)) return;

  const targetRms = Math.pow(10, targetRmsDbfs / 20);
  let gain = targetRms / rms;
  gain = Math.max(0.25, Math.min(6, gain));

  const projectedPeak = peak * gain;
  if (projectedPeak > maxPeak && projectedPeak > 0) {
    gain *= (maxPeak / projectedPeak);
  }

  for (const samples of channelData) {
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.max(-1, Math.min(1, samples[index] * gain));
    }
  }
}

function renderPolishedWaveBuffer(parsedWave: ParsedWave): Buffer {
  const processedChannels = parsedWave.channelData.map((channel) => new Float32Array(channel));
  for (const samples of processedChannels) {
    applyDcRemoval(samples);
    applyHighPass(samples, parsedWave.sampleRate, 85);
    applyPeakingEq(samples, parsedWave.sampleRate, 320, -2.6, 1.1);
    applyGentleDeEsser(samples, parsedWave.sampleRate);
    applyLightCompression(samples, parsedWave.sampleRate);
  }
  normalizeLoudness(processedChannels, -20, 0.92);

  const blockAlign = parsedWave.channelCount * 2;
  const byteRate = parsedWave.sampleRate * blockAlign;
  const dataSize = parsedWave.sampleCount * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(parsedWave.channelCount, 22);
  buffer.writeUInt32LE(parsedWave.sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let frameIndex = 0; frameIndex < parsedWave.sampleCount; frameIndex += 1) {
    for (let channelIndex = 0; channelIndex < parsedWave.channelCount; channelIndex += 1) {
      const sample = processedChannels[channelIndex][frameIndex];
      const scaled = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
      buffer.writeInt16LE(scaled, offset);
      offset += 2;
    }
  }

  return buffer;
}

function readHeaderString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return readTrimmed(value[0]);
  }
  return readTrimmed(value);
}

function buildEmptyLoudnessAnalysis(): HammerLoudnessAnalysis {
  return {
    integrated_lufs: null,
    loudness_range_lu: null,
    true_peak_dbtp: null,
    rms_dbfs: null,
  };
}

function roundToMillis(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function buildEmptySegmentationAnalysis(): HammerSegmentationAnalysis {
  return {
    strategy: "ffmpeg_silencedetect_v1",
    noise_floor_db: SILENCE_DETECT_NOISE_DB,
    min_silence_sec: SILENCE_DETECT_MIN_SEC,
    regions: [],
    speech_region_count: 0,
    silence_region_count: 0,
  };
}

function buildEmptyTranscriptPrepAnalysis(): HammerTranscriptPrepAnalysis {
  return {
    strategy: "fixed_chunk_with_silence_bias_v1",
    target_chunk_sec: TRANSCRIPT_CHUNK_TARGET_SEC,
    max_chunk_sec: TRANSCRIPT_CHUNK_HARD_MAX_SEC,
    chunks: [],
    chunk_count: 0,
  };
}

function computeWaveRmsDbfs(parsedWave: ParsedWave): number | null {
  let sumSquares = 0;
  let sampleTotal = 0;
  for (const channel of parsedWave.channelData) {
    for (let index = 0; index < channel.length; index += 1) {
      const sample = channel[index];
      sumSquares += sample * sample;
      sampleTotal += 1;
    }
  }
  if (sampleTotal === 0) return null;
  const rms = Math.sqrt(sumSquares / sampleTotal);
  if (!(rms > 0)) return null;
  return 20 * Math.log10(rms);
}

function parseLoudnessSummary(stderr: string, sourceLabel: string): HammerLoudnessAnalysis {
  const integratedMatch = stderr.match(/Integrated loudness:\s*[\r\n]+\s*I:\s*([-\d.]+)\s+LUFS/i);
  const lraMatch = stderr.match(/Loudness range:\s*[\s\S]*?\bLRA:\s*([-\d.]+)\s+LU/i);
  const peakMatch = stderr.match(/True peak:\s*[\s\S]*?\bPeak:\s*(-?inf|[-\d.]+)\s+dBF(?:S|TP)/i);

  const integratedLufs = integratedMatch ? Number(integratedMatch[1]) : Number.NaN;
  const loudnessRangeLu = lraMatch ? Number(lraMatch[1]) : Number.NaN;
  const peakRaw = peakMatch?.[1]?.toLowerCase() ?? null;
  const truePeakDbtp = peakRaw === "-inf" || peakRaw === "inf"
    ? null
    : peakRaw != null
    ? Number(peakRaw)
    : Number.NaN;

  if (!Number.isFinite(integratedLufs) || !Number.isFinite(loudnessRangeLu) || (truePeakDbtp != null && !Number.isFinite(truePeakDbtp))) {
    throw new Error(`Hammer could not parse FFmpeg loudness analysis for ${sourceLabel}.`);
  }

  return {
    integrated_lufs: integratedLufs,
    loudness_range_lu: loudnessRangeLu,
    true_peak_dbtp: truePeakDbtp,
    rms_dbfs: null,
  };
}

async function analyzeLoudnessWithFfmpeg(args: {
  ffmpegBin: string;
  wavBytes: Buffer;
  sourceLabel: string;
}): Promise<{ analysis: HammerLoudnessAnalysis; parseOk: boolean; parseError: string | null; stderrExcerpt: string | null }> {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "hammer-ebur128-"));
  const inputPath = path.join(tempRoot, "working-audio.wav");
  try {
    await fsPromises.writeFile(inputPath, args.wavBytes);
    const stderr = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        args.ffmpegBin,
        [
          "-hide_banner",
          "-nostats",
          "-i",
          inputPath,
          "-filter_complex",
          "ebur128=peak=true",
          "-f",
          "null",
          "-",
        ],
        {
          windowsHide: true,
          stdio: ["ignore", "ignore", "pipe"],
        },
      );

      let stderrText = "";
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, FFMPEG_PROCESS_TIMEOUT_MS);

      child.stderr.on("data", (chunk: Buffer) => {
        const next = chunk.toString("utf8");
        if (stderrText.length < 64_000) {
          stderrText += next.slice(0, 64_000 - stderrText.length);
        }
      });
      child.on("error", (error: unknown) => {
        clearTimeout(timeoutId);
        reject(error);
      });
      child.on("close", (code: number | null) => {
        clearTimeout(timeoutId);
        if (timedOut) {
          reject(new Error("Hammer loudness analysis timed out."));
          return;
        }
        if (code === 0) {
          resolve(stderrText);
          return;
        }
        reject(new Error(stderrText.trim() || `Hammer loudness analysis failed for ${args.sourceLabel}.`));
      });
    });

    try {
      return {
        analysis: parseLoudnessSummary(stderr, args.sourceLabel),
        parseOk: true,
        parseError: null,
        stderrExcerpt: null,
      };
    } catch (error) {
      const excerpt = stderr.trim().slice(0, 2400) || null;
      return {
        analysis: buildEmptyLoudnessAnalysis(),
        parseOk: false,
        parseError: error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "Hammer loudness analysis parse failed.",
        stderrExcerpt: excerpt,
      };
    }
  } finally {
    await fsPromises.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

type RawSilenceWindow = {
  start_sec: number;
  end_sec: number;
};

function parseSilenceWindows(stderr: string): RawSilenceWindow[] {
  const windows: RawSilenceWindow[] = [];
  const starts = [...stderr.matchAll(/silence_start:\s*([-\d.]+)/gi)].map((match) => Number(match[1]));
  const ends = [...stderr.matchAll(/silence_end:\s*([-\d.]+)/gi)].map((match) => Number(match[1]));
  const pairCount = Math.min(starts.length, ends.length);
  for (let index = 0; index < pairCount; index += 1) {
    const start = starts[index];
    const end = ends[index];
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    windows.push({
      start_sec: start,
      end_sec: end,
    });
  }
  return windows;
}

function mergeSameKindRegions(regions: HammerSegmentationRegion[]): HammerSegmentationRegion[] {
  if (regions.length <= 1) return regions;
  const merged: HammerSegmentationRegion[] = [];
  for (const region of regions) {
    const previous = merged[merged.length - 1];
    if (previous && previous.kind === region.kind && Math.abs(previous.end_sec - region.start_sec) <= 0.001) {
      previous.end_sec = region.end_sec;
      previous.confidence = previous.confidence ?? region.confidence;
      continue;
    }
    merged.push({ ...region });
  }
  return merged;
}

function normalizeSegmentationRegions(args: {
  durationSec: number;
  silenceWindows: RawSilenceWindow[];
}): HammerSegmentationAnalysis {
  const durationSec = roundToMillis(Math.max(0, args.durationSec));
  if (!(durationSec > 0)) {
    return buildEmptySegmentationAnalysis();
  }

  const normalizedSilence = args.silenceWindows
    .map((window) => ({
      start_sec: roundToMillis(Math.max(0, Math.min(durationSec, window.start_sec))),
      end_sec: roundToMillis(Math.max(0, Math.min(durationSec, window.end_sec))),
    }))
    .filter((window) => window.end_sec > window.start_sec)
    .sort((left, right) => left.start_sec - right.start_sec);

  const mergedSilence: RawSilenceWindow[] = [];
  for (const window of normalizedSilence) {
    const previous = mergedSilence[mergedSilence.length - 1];
    if (!previous) {
      mergedSilence.push({ ...window });
      continue;
    }
    if (window.start_sec <= previous.end_sec + 0.001) {
      previous.end_sec = Math.max(previous.end_sec, window.end_sec);
      continue;
    }
    mergedSilence.push({ ...window });
  }

  const regions: HammerSegmentationRegion[] = [];
  let cursor = 0;
  for (const window of mergedSilence) {
    if (window.start_sec > cursor) {
      regions.push({
        id: `speech_${regions.length + 1}`,
        kind: "speech",
        start_sec: cursor,
        end_sec: window.start_sec,
        confidence: null,
      });
    }
    regions.push({
      id: `silence_${regions.length + 1}`,
      kind: "silence",
      start_sec: window.start_sec,
      end_sec: window.end_sec,
      confidence: null,
    });
    cursor = window.end_sec;
  }
  if (cursor < durationSec) {
    regions.push({
      id: `speech_${regions.length + 1}`,
      kind: "speech",
      start_sec: cursor,
      end_sec: durationSec,
      confidence: null,
    });
  }
  if (regions.length === 0) {
    regions.push({
      id: "speech_1",
      kind: "speech",
      start_sec: 0,
      end_sec: durationSec,
      confidence: null,
    });
  }

  const compacted = mergeSameKindRegions(
    regions.filter((region) => region.end_sec - region.start_sec > 0),
  );

  if (compacted.length > 1 && compacted[0].end_sec - compacted[0].start_sec <= SEGMENT_EDGE_CLAMP_SEC) {
    compacted[1].start_sec = 0;
    compacted.shift();
  }
  if (compacted.length > 1) {
    const lastIndex = compacted.length - 1;
    if (compacted[lastIndex].end_sec - compacted[lastIndex].start_sec <= SEGMENT_EDGE_CLAMP_SEC) {
      compacted[lastIndex - 1].end_sec = durationSec;
      compacted.pop();
    }
  }

  const finalized = mergeSameKindRegions(
    compacted
      .map((region, index) => ({
        ...region,
        id: `${region.kind}_${index + 1}`,
        start_sec: index === 0 ? 0 : region.start_sec,
        end_sec: index === compacted.length - 1 ? durationSec : region.end_sec,
      }))
      .filter((region) => region.end_sec - region.start_sec > 0),
  ).sort((left, right) => left.start_sec - right.start_sec);

  for (let index = 1; index < finalized.length; index += 1) {
    finalized[index].start_sec = finalized[index - 1].end_sec;
  }
  if (finalized.length > 0) {
    finalized[0].start_sec = 0;
    finalized[finalized.length - 1].end_sec = durationSec;
  }

  return {
    strategy: "ffmpeg_silencedetect_v1",
    noise_floor_db: SILENCE_DETECT_NOISE_DB,
    min_silence_sec: SILENCE_DETECT_MIN_SEC,
    regions: finalized,
    speech_region_count: finalized.filter((region) => region.kind === "speech").length,
    silence_region_count: finalized.filter((region) => region.kind === "silence").length,
  };
}

async function analyzeSegmentationWithFfmpeg(args: {
  ffmpegBin: string;
  wavBytes: Buffer;
  sourceLabel: string;
  durationSec: number;
}): Promise<HammerSegmentationAnalysis> {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "hammer-silencedetect-"));
  const inputPath = path.join(tempRoot, "working-audio.wav");
  try {
    await fsPromises.writeFile(inputPath, args.wavBytes);
    const stderr = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        args.ffmpegBin,
        [
          "-hide_banner",
          "-nostats",
          "-i",
          inputPath,
          "-af",
          `silencedetect=noise=${SILENCE_DETECT_NOISE_DB}dB:d=${SILENCE_DETECT_MIN_SEC}`,
          "-f",
          "null",
          "-",
        ],
        {
          windowsHide: true,
          stdio: ["ignore", "ignore", "pipe"],
        },
      );

      let stderrText = "";
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, FFMPEG_PROCESS_TIMEOUT_MS);

      child.stderr.on("data", (chunk: Buffer) => {
        const next = chunk.toString("utf8");
        if (stderrText.length < 64_000) {
          stderrText += next.slice(0, 64_000 - stderrText.length);
        }
      });
      child.on("error", (error: unknown) => {
        clearTimeout(timeoutId);
        reject(error);
      });
      child.on("close", (code: number | null) => {
        clearTimeout(timeoutId);
        if (timedOut) {
          reject(new Error("Hammer silence detection timed out."));
          return;
        }
        if (code === 0) {
          resolve(stderrText);
          return;
        }
        reject(new Error(stderrText.trim() || `Hammer silence detection failed for ${args.sourceLabel}.`));
      });
    });

    return normalizeSegmentationRegions({
      durationSec: args.durationSec,
      silenceWindows: parseSilenceWindows(stderr),
    });
  } finally {
    await fsPromises.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

function buildTranscriptPrepChunkMap(args: {
  durationSec: number;
  segmentation: HammerSegmentationAnalysis;
}): HammerTranscriptPrepAnalysis {
  const durationSec = roundToMillis(Math.max(0, args.durationSec));
  if (!(durationSec > 0)) {
    return buildEmptyTranscriptPrepAnalysis();
  }

  if (durationSec <= TRANSCRIPT_CHUNK_TARGET_SEC) {
    return {
      strategy: "fixed_chunk_with_silence_bias_v1",
      target_chunk_sec: TRANSCRIPT_CHUNK_TARGET_SEC,
      max_chunk_sec: TRANSCRIPT_CHUNK_HARD_MAX_SEC,
      chunks: [
        {
          id: "chunk_1",
          chunk_index: 1,
          start_sec: 0,
          end_sec: durationSec,
          duration_sec: durationSec,
          boundary_reason: "short_file",
          source: "short_file",
        },
      ],
      chunk_count: 1,
    };
  }

  const silenceBoundaries = args.segmentation.regions
    .filter((region) => region.kind === "silence")
    .map((region) => roundToMillis(region.start_sec))
    .filter((point) => point > 0 && point < durationSec)
    .sort((left, right) => left - right);

  const chunks: HammerTranscriptPrepAnalysis["chunks"] = [];
  let cursor = 0;
  while (cursor < durationSec - 0.001) {
    const remaining = durationSec - cursor;
    if (remaining <= TRANSCRIPT_CHUNK_HARD_MAX_SEC) {
      const startSec = roundToMillis(cursor);
      const endSec = durationSec;
      if (endSec > startSec) {
        chunks.push({
          id: `chunk_${chunks.length + 1}`,
          chunk_index: chunks.length + 1,
          start_sec: startSec,
          end_sec: endSec,
          duration_sec: roundToMillis(endSec - startSec),
          boundary_reason: chunks.length === 0 ? "short_file" : "silence_boundary",
          source: chunks.length === 0 ? "short_file" : "silence_boundary",
        });
      }
      break;
    }

    const targetBoundary = cursor + TRANSCRIPT_CHUNK_TARGET_SEC;
    const earliestBoundary = cursor + TRANSCRIPT_CHUNK_MIN_SEC;
    const latestBoundary = cursor + TRANSCRIPT_CHUNK_HARD_MAX_SEC;
    const silenceCandidate = silenceBoundaries
      .filter((boundary) => boundary >= earliestBoundary && boundary <= latestBoundary)
      .map((boundary) => ({
        boundary,
        distance: Math.abs(boundary - targetBoundary),
      }))
      .filter((candidate) => candidate.distance <= TRANSCRIPT_CHUNK_BOUNDARY_SEARCH_WINDOW_SEC)
      .sort((left, right) => left.distance - right.distance || left.boundary - right.boundary)[0]
      ?? null;

    const endSec = silenceCandidate
      ? silenceCandidate.boundary
      : roundToMillis(Math.min(durationSec, cursor + TRANSCRIPT_CHUNK_HARD_MAX_SEC));
    const startSec = roundToMillis(cursor);
    if (endSec <= startSec) {
      break;
    }

    chunks.push({
      id: `chunk_${chunks.length + 1}`,
      chunk_index: chunks.length + 1,
      start_sec: startSec,
      end_sec: endSec,
      duration_sec: roundToMillis(endSec - startSec),
      boundary_reason: silenceCandidate ? "silence_boundary" : "hard_max_split",
      source: silenceCandidate ? "silence_boundary" : "hard_max_split",
    });
    cursor = endSec;
  }

  const normalizedChunks = chunks
    .map((chunk, index) => ({
      ...chunk,
      id: `chunk_${index + 1}`,
      chunk_index: index + 1,
      start_sec: index === 0 ? 0 : roundToMillis(chunk.start_sec),
      end_sec: index === chunks.length - 1 ? durationSec : roundToMillis(chunk.end_sec),
    }))
    .filter((chunk) => chunk.end_sec - chunk.start_sec > 0)
    .sort((left, right) => left.start_sec - right.start_sec);

  for (let index = 1; index < normalizedChunks.length; index += 1) {
    normalizedChunks[index].start_sec = normalizedChunks[index - 1].end_sec;
  }
  if (normalizedChunks.length > 0) {
    normalizedChunks[0].start_sec = 0;
    normalizedChunks[normalizedChunks.length - 1].end_sec = durationSec;
  }
  for (const chunk of normalizedChunks) {
    chunk.duration_sec = roundToMillis(chunk.end_sec - chunk.start_sec);
  }

  return {
    strategy: "fixed_chunk_with_silence_bias_v1",
    target_chunk_sec: TRANSCRIPT_CHUNK_TARGET_SEC,
    max_chunk_sec: TRANSCRIPT_CHUNK_HARD_MAX_SEC,
    chunks: normalizedChunks,
    chunk_count: normalizedChunks.length,
  };
}

function computeChannelRmsDbfs(channelData: Float32Array): number | null {
  let sumSquares = 0;
  for (let index = 0; index < channelData.length; index += 1) {
    const sample = channelData[index];
    sumSquares += sample * sample;
  }
  if (channelData.length === 0) return null;
  const rms = Math.sqrt(sumSquares / channelData.length);
  if (!(rms > 0)) return null;
  return 20 * Math.log10(rms);
}

function computePearsonCorrelation(left: Float32Array, right: Float32Array): number | null {
  if (left.length === 0 || right.length !== left.length) return null;
  const length = Math.min(left.length, right.length);
  if (length === 0) return null;

  let sumXY = 0;
  let sumX = 0;
  let sumY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (let index = 0; index < length; index += 1) {
    const x = left[index];
    const y = right[index];
    sumXY += x * y;
    sumX += x;
    sumY += y;
    sumX2 += x * x;
    sumY2 += y * y;
  }

  const numerator = length * sumXY - sumX * sumY;
  const denominator = Math.sqrt((length * sumX2 - sumX * sumX) * (length * sumY2 - sumY * sumY));
  if (!(denominator > 0)) return null;
  const correlation = numerator / denominator;
  if (!Number.isFinite(correlation)) return null;
  return correlation;
}

function analyzeChannelCharacterization(parsedWave: ParsedWave): HammerChannelCharacterization | null {
  if (!parsedWave.channelData || parsedWave.channelData.length === 0) {
    return null;
  }

  const channelCount = parsedWave.channelData.length;
  if (channelCount === 1) {
    return {
      channel_count: 1,
      silent_channel: null,
      dual_mono: false,
      phase_correlation: 1,
      phase_concern: false,
    };
  }

  const channelRmsValues = parsedWave.channelData.map((channel) => computeChannelRmsDbfs(channel));
  let silentChannel: "left" | "right" | null = null;

  if (channelCount === 2) {
    const [leftRms, rightRms] = channelRmsValues;
    if (leftRms != null && rightRms != null) {
      const leftIsSilent = leftRms <= SILENT_CHANNEL_THRESHOLD_DBFS;
      const rightIsSilent = rightRms <= SILENT_CHANNEL_THRESHOLD_DBFS;
      const rmsDifference = Math.abs(leftRms - rightRms);

      if (leftIsSilent && !rightIsSilent && rmsDifference > 5) {
        silentChannel = "left";
      } else if (rightIsSilent && !leftIsSilent && rmsDifference > 5) {
        silentChannel = "right";
      }
    }
  }

  let dualMono = false;
  let phaseCorrelation: number | null = null;
  let phaseConcern = false;

  if (channelCount >= 2) {
    const correlation = computePearsonCorrelation(parsedWave.channelData[0], parsedWave.channelData[1]);
    phaseCorrelation = correlation;

    if (correlation != null) {
      if (Math.abs(correlation) >= DUAL_MONO_CORRELATION_THRESHOLD) {
        const amplitudeDiff = Math.abs((channelRmsValues[0] ?? 0) - (channelRmsValues[1] ?? 0));
        if (amplitudeDiff < 2 && correlation > 0) {
          dualMono = true;
        }
      }

      if (correlation <= PHASE_CONCERN_CORRELATION_THRESHOLD) {
        phaseConcern = true;
      }
    }
  }

  return {
    channel_count: channelCount,
    silent_channel: silentChannel,
    dual_mono: dualMono,
    phase_correlation: phaseCorrelation,
    phase_concern: phaseConcern,
  };
}

function buildWaveformProxy(parsedWave: ParsedWave): HammerWaveformProxy {
  const durationSec = parsedWave.sampleRate > 0
    ? parsedWave.sampleCount / parsedWave.sampleRate
    : 0;
  const safeDurationSec = Math.max(durationSec, 1 / Math.max(parsedWave.sampleRate, 1));
  const effectiveBucketDurationSec = Math.max(
    WAVEFORM_PROXY_BUCKET_DURATION_SEC,
    safeDurationSec / WAVEFORM_PROXY_MAX_BUCKET_COUNT,
  );
  const bucketCount = Math.max(1, Math.ceil(safeDurationSec / effectiveBucketDurationSec));
  const peaks = new Array<number>(bucketCount).fill(0);

  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const startSample = Math.floor((bucketIndex * parsedWave.sampleCount) / bucketCount);
    const endSample = Math.floor(((bucketIndex + 1) * parsedWave.sampleCount) / bucketCount);
    let bucketPeak = 0;

    for (let sampleIndex = startSample; sampleIndex < endSample; sampleIndex += 1) {
      let mixedSample = 0;
      if (parsedWave.channelCount === 1) {
        mixedSample = parsedWave.channelData[0][sampleIndex] ?? 0;
      } else {
        mixedSample = ((parsedWave.channelData[0][sampleIndex] ?? 0) + (parsedWave.channelData[1][sampleIndex] ?? 0)) / 2;
      }
      const magnitude = Math.abs(mixedSample);
      if (magnitude > bucketPeak) {
        bucketPeak = magnitude;
      }
    }

    peaks[bucketIndex] = Math.max(0, Math.min(1, bucketPeak));
  }

  return {
    version: "v1",
    duration_sec: roundToMillis(safeDurationSec),
    bucket_count: bucketCount,
    bucket_duration_sec: roundToMillis(safeDurationSec / bucketCount),
    channel_mode: "mono_mixdown",
    peaks,
  };
}

export function createHammerAudioPolishRequestContext(req: IncomingMessage): HammerAudioPolishRequestContext {
  const forwardedProto = readHeaderString(req.headers["x-forwarded-proto"]);
  const host = readHeaderString(req.headers.host) ?? "localhost";
  return {
    origin: `${forwardedProto ?? "http"}://${host}`,
    authorization: readHeaderString(req.headers.authorization),
    userAuthorization: readHeaderString(req.headers["x-forge-user-authorization"]),
  };
}

export async function handleHammerAudioPolishRequest(
  body: unknown,
  context?: HammerAudioPolishRequestContext,
  onPhaseChange?: (phase: HammerAudioPolishPhase) => void,
): Promise<HammerAudioPolishRouteResult> {
  const request = normalizeAudioPolishRequest(body);
  if (!request) {
    return {
      status: 400,
      payload: {
        ok: false,
        error: { message: "Invalid Hammer audio polish payload." },
      },
    };
  }
  const mediaRuntime = detectHammerMediaRuntime();

  if (!request.input) {
    return {
      status: 200,
      payload: {
        ok: true,
        data: createFailedResponse({
          code: "unsupported_source",
          reason: "unresolvable_source",
          settingsSummary: {
            source_media_kind: request.media_kind,
            source_kind: request.local_root_abs && request.local_relpath
              ? "local_workspace_media"
              : "canonical_workpiece_media",
            source_canonical_workpiece_path: request.canonical_workpiece_path,
            resolved_input_type: "unknown",
            attempted_sources_json: "[]",
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
          code: "source_unavailable",
          reason: error instanceof Error && error.message.trim()
            ? error.message
            : "Hammer could not locate source media for baseline audio polish.",
          settingsSummary: {
            source_media_kind: request.media_kind,
            source_kind: request.local_root_abs && request.local_relpath
              ? "local_workspace_media"
              : "canonical_workpiece_media",
            source_canonical_workpiece_path: request.canonical_workpiece_path,
            resolved_input_type: request.input.type,
            attempted_sources_json: JSON.stringify([{ kind: request.input.type, value: request.input.value }]),
          },
        }),
      },
    };
  }

  const executionPlan = resolveHammerAudioPolishExecutionPlan({
    runtime: mediaRuntime,
    mediaKind: request.media_kind,
    sourceExtension: sourceMedia.sourceExtension,
  });
  if (!executionPlan.executable) {
    return {
      status: 200,
      payload: {
        ok: true,
        data: createFailedResponse({
          code: "unsupported_source",
          reason: executionPlan.detail,
          settingsSummary: {
            source_media_kind: request.media_kind,
            source_kind: sourceMedia.sourceKind,
            resolved_input_type: sourceMedia.resolvedInputType,
            attempted_sources_json: JSON.stringify(sourceMedia.attemptedSources),
            source_extension: sourceMedia.sourceExtension,
            source_canonical_workpiece_path: sourceMedia.canonicalWorkpiecePath,
            working_audio_service_url: readHammerForgeFfmpegClientConfig()?.baseUrl ?? null,
            media_runtime_preferred_backend: mediaRuntime.preferred_backend,
            media_runtime_ffmpeg_install_state: mediaRuntime.ffmpeg.install_state,
            media_runtime_ffmpeg_configured: mediaRuntime.ffmpeg.ffmpeg_configured,
            media_runtime_ffprobe_configured: mediaRuntime.ffmpeg.ffprobe_configured,
            media_runtime_ffmpeg_available: mediaRuntime.ffmpeg.ffmpeg_available,
            media_runtime_ffprobe_available: mediaRuntime.ffmpeg.ffprobe_available,
            audio_polish_plan_readiness: executionPlan.readiness,
            audio_polish_current_strategy: executionPlan.current_strategy,
            audio_polish_future_strategy: executionPlan.future_strategy,
            audio_polish_requires_ffmpeg: executionPlan.requires_ffmpeg,
          },
        }),
      },
    };
  }

  let activePhase: HammerAudioPolishPhase | null = null;
  const setPhase = (phase: HammerAudioPolishPhase): void => {
    activePhase = phase;
    onPhaseChange?.(phase);
  };

  try {
    let workingWaveBytes = sourceMedia.sourceBytes;
    let workingAudioBackend: "builtin_source" | "local_ffmpeg" | "forge_ffmpeg_service" = "builtin_source";
    let workingAudioServiceRequestId: string | null = null;
    let workingAudioServiceOutputFormat: string | null = null;
    let workingAudioServiceOutputSampleRate: number | null = null;
    let workingAudioServiceOutputChannels: number | null = null;
    const sourceArtifactPaths = [sourceMedia.canonicalWorkpiecePath];
    let workingAudioWorkpiecePath: string | null = null;
    let sourceMediaTruth: HammerFfprobeMediaTruth = {
      durationMs: null,
      sampleRate: null,
      channelCount: null,
      bitDepth: null,
      timebase: null,
    };
    let workingMediaTruth: HammerFfprobeMediaTruth = {
      durationMs: null,
      sampleRate: null,
      channelCount: null,
      bitDepth: null,
      timebase: null,
    };
    const ffprobeBin = readTrimmed(mediaRuntime.ffmpeg.ffprobe_bin);
    const ffmpegBin = readTrimmed(mediaRuntime.ffmpeg.ffmpeg_bin);

    if (ffprobeBin) {
      try {
        sourceMediaTruth = await probeMediaTruthWithFfprobe({
          ffprobeBin,
          bytes: sourceMedia.sourceBytes,
          sourceExtension: sourceMedia.sourceExtension,
          sourceLabel: sourceMedia.sourceLabel,
        });
      } catch {
        // Keep source truth optional when ffprobe probe fails.
      }
    }

    if (executionPlan.current_strategy === "ffmpeg_working_audio_v1") {
      setPhase("extracting_working_audio");
      if (!ffmpegBin) {
        throw new Error("Hammer FFmpeg working audio is configured as the current strategy, but no ffmpeg binary is available.");
      }
      if (!canUseCanonicalTongsContext(context)) {
        throw new Error("Hammer audio prep needs authenticated Tongs access to commit canonical working audio.");
      }

      const workingAudioResult = await renderWorkingAudioWaveBuffer({
        sourceBytes: sourceMedia.sourceBytes,
        sourceExtension: sourceMedia.sourceExtension,
        sourceLabel: sourceMedia.sourceLabel,
        sourceContentType: sourceMedia.contentType,
        ffmpegBin,
      });
      workingWaveBytes = workingAudioResult.workingWaveBytes;
      workingAudioBackend = workingAudioResult.backend;
      workingAudioServiceRequestId = workingAudioResult.serviceRequestId;
      workingAudioServiceOutputFormat = workingAudioResult.serviceOutputFormat;
      workingAudioServiceOutputSampleRate = workingAudioResult.serviceOutputSampleRate;
      workingAudioServiceOutputChannels = workingAudioResult.serviceOutputChannels;
      workingAudioWorkpiecePath = buildArtifactRelpath("working-audio", request);
      await commitCanonicalWorkpieceFile({
        context,
        request,
        workpiecePath: workingAudioWorkpiecePath,
        bytes: workingWaveBytes,
        contentType: OUTPUT_MIME_TYPE,
        eventName: "hammer.working-audio.committed",
        eventPayload: {
          source_path: sourceMedia.canonicalWorkpiecePath,
          strategy: executionPlan.current_strategy,
          media_kind: request.media_kind,
        },
      });
      sourceArtifactPaths.push(workingAudioWorkpiecePath);

      if (ffprobeBin) {
        try {
          workingMediaTruth = await probeMediaTruthWithFfprobe({
            ffprobeBin,
            bytes: workingWaveBytes,
            sourceExtension: ".wav",
            sourceLabel: workingAudioWorkpiecePath,
          });
        } catch {
          // Keep working truth optional when ffprobe probe fails.
        }
      }

      if (workingAudioBackend === "forge_ffmpeg_service") {
        workingMediaTruth.sampleRate = workingMediaTruth.sampleRate ?? workingAudioServiceOutputSampleRate;
        workingMediaTruth.channelCount = workingMediaTruth.channelCount ?? workingAudioServiceOutputChannels;
      }
    }

    const parsedWave = parseWaveBuffer(workingWaveBytes);
    if (workingMediaTruth.durationMs == null) {
      workingMediaTruth.durationMs = Math.round((parsedWave.sampleCount / parsedWave.sampleRate) * 1000);
    }
    if (workingMediaTruth.sampleRate == null) {
      workingMediaTruth.sampleRate = parsedWave.sampleRate;
    }
    if (workingMediaTruth.channelCount == null) {
      workingMediaTruth.channelCount = parsedWave.channelCount;
    }
    if (workingMediaTruth.bitDepth == null) {
      workingMediaTruth.bitDepth = 16;
    }
    if (!workingMediaTruth.timebase) {
      workingMediaTruth.timebase = `1/${parsedWave.sampleRate}`;
    }
    const durationSec = parsedWave.sampleCount / parsedWave.sampleRate;
    setPhase("analyzing_loudness");
    let loudnessParseOk: boolean | null = null;
    let loudnessParseError: string | null = null;
    let loudnessStderrExcerpt: string | null = null;
    const loudnessAnalysis = ffmpegBin
      ? await (async () => {
        try {
          const result = await analyzeLoudnessWithFfmpeg({
            ffmpegBin,
            wavBytes: workingWaveBytes,
            sourceLabel: workingAudioWorkpiecePath ?? sourceMedia.sourceLabel,
          });
          loudnessParseOk = result.parseOk;
          loudnessParseError = result.parseError;
          loudnessStderrExcerpt = result.stderrExcerpt;
          return result.analysis;
        } catch (error) {
          loudnessParseOk = false;
          loudnessParseError = error instanceof Error && error.message.trim()
            ? error.message.trim()
            : "Hammer loudness analysis failed.";
          loudnessStderrExcerpt = null;
          return buildEmptyLoudnessAnalysis();
        }
      })()
      : buildEmptyLoudnessAnalysis();
    loudnessAnalysis.rms_dbfs = computeWaveRmsDbfs(parsedWave);
    setPhase("detecting_silence");
    const segmentationAnalysis = ffmpegBin
      ? await analyzeSegmentationWithFfmpeg({
        ffmpegBin,
        wavBytes: workingWaveBytes,
        sourceLabel: workingAudioWorkpiecePath ?? sourceMedia.sourceLabel,
        durationSec,
      })
      : buildEmptySegmentationAnalysis();
    setPhase("building_chunk_map");
    const transcriptPrepAnalysis = buildTranscriptPrepChunkMap({
      durationSec,
      segmentation: segmentationAnalysis,
    });
    const channelCharacterization = analyzeChannelCharacterization(parsedWave);
    const waveformProxy = buildWaveformProxy(parsedWave);
    setPhase("finalizing_audio_prep");
    const polishedWaveBytes = renderPolishedWaveBuffer(parsedWave);
    const outputWorkpiecePath = buildArtifactRelpath("audio-polish", request);
    if (!canUseCanonicalTongsContext(context)) {
      throw new Error("Hammer audio prep needs authenticated Tongs access to commit canonical audio polish.");
    }

    await commitCanonicalWorkpieceFile({
      context,
      request,
      workpiecePath: outputWorkpiecePath,
      bytes: polishedWaveBytes,
      contentType: OUTPUT_MIME_TYPE,
      eventName: "hammer.audio-polish.committed",
      eventPayload: {
        source_path: sourceMedia.canonicalWorkpiecePath,
        source_artifact_paths: sourceArtifactPaths,
        strategy: executionPlan.current_strategy,
        media_kind: request.media_kind,
      },
    });

    const localArtifactWrite = await writeBestEffortLocalArtifact({
      localRootAbs: sourceMedia.localRootAbs,
      relpath: outputWorkpiecePath,
      bytes: polishedWaveBytes,
    });

    const preparedAt = new Date().toISOString();
    return {
      status: 200,
      payload: {
        ok: true,
        data: {
          status: "prepared",
          phase: activePhase,
          failed_phase: null,
          prepared_at: preparedAt,
          prepared_passes: [...HAMMER_AUDIO_POLISH_PREPARED_PASSES],
          processor_version: HAMMER_AUDIO_POLISH_PROCESSOR_VERSION,
          output_local_relpath: localArtifactWrite.outputLocalRelpath,
          output_workpiece_path: outputWorkpiecePath,
          output_mime_type: OUTPUT_MIME_TYPE,
          output_duration_ms: Math.round((parsedWave.sampleCount / parsedWave.sampleRate) * 1000),
          failure_code: null,
          failure_reason: null,
          analysis: {
            schema_version: 1,
            source_ref: workingAudioWorkpiecePath ?? sourceMedia.canonicalWorkpiecePath,
            analyzed_at: preparedAt,
            loudness: loudnessAnalysis,
            segmentation: segmentationAnalysis,
            transcript_prep: transcriptPrepAnalysis,
            channel_characterization: channelCharacterization,
            waveform_proxy: waveformProxy,
          },
          audio_edit: null,
          settings_summary: {
            supported_source: true,
            source_media_kind: request.media_kind,
            source_kind: sourceMedia.sourceKind,
            resolved_input_type: sourceMedia.resolvedInputType,
            attempted_sources_json: JSON.stringify(sourceMedia.attemptedSources),
            source_extension: sourceMedia.sourceExtension,
            source_canonical_workpiece_path: sourceMedia.canonicalWorkpiecePath,
            source_duration_ms: sourceMediaTruth.durationMs,
            source_sample_rate: sourceMediaTruth.sampleRate,
            source_channel_count: sourceMediaTruth.channelCount,
            source_bit_depth: sourceMediaTruth.bitDepth,
            source_timebase: sourceMediaTruth.timebase,
            source_format: parsedWave.formatLabel,
            sample_rate: workingMediaTruth.sampleRate,
            channel_count: workingMediaTruth.channelCount,
            bit_depth: workingMediaTruth.bitDepth,
            timebase: workingMediaTruth.timebase,
            working_duration_ms: workingMediaTruth.durationMs,
            working_audio_workpiece_path: workingAudioWorkpiecePath,
            working_audio_backend: workingAudioBackend,
            working_audio_service_url: readHammerForgeFfmpegClientConfig()?.baseUrl ?? null,
            working_audio_service_request_id: workingAudioServiceRequestId,
            working_audio_service_output_format: workingAudioServiceOutputFormat,
            working_audio_service_output_sample_rate: workingAudioServiceOutputSampleRate,
            working_audio_service_output_channels: workingAudioServiceOutputChannels,
            local_output_write_failed: localArtifactWrite.writeFailed,
            local_output_write_failure_reason: localArtifactWrite.writeFailureReason,
            media_runtime_preferred_backend: mediaRuntime.preferred_backend,
            media_runtime_ffmpeg_install_state: mediaRuntime.ffmpeg.install_state,
            media_runtime_ffmpeg_configured: mediaRuntime.ffmpeg.ffmpeg_configured,
            media_runtime_ffprobe_configured: mediaRuntime.ffmpeg.ffprobe_configured,
            media_runtime_ffmpeg_available: mediaRuntime.ffmpeg.ffmpeg_available,
            media_runtime_ffprobe_available: mediaRuntime.ffmpeg.ffprobe_available,
            audio_polish_plan_readiness: executionPlan.readiness,
            audio_polish_current_strategy: executionPlan.current_strategy,
            audio_polish_future_strategy: executionPlan.future_strategy,
            audio_polish_requires_ffmpeg: executionPlan.requires_ffmpeg,
            analysis_integrated_lufs: loudnessAnalysis.integrated_lufs,
            analysis_loudness_range_lu: loudnessAnalysis.loudness_range_lu,
            analysis_true_peak_dbtp: loudnessAnalysis.true_peak_dbtp,
            loudness_parse_ok: loudnessParseOk,
            loudness_parse_error: loudnessParseError,
            loudness_stderr_excerpt: loudnessStderrExcerpt,
            analysis_speech_region_count: segmentationAnalysis.speech_region_count,
            analysis_silence_region_count: segmentationAnalysis.silence_region_count,
            analysis_chunk_count: transcriptPrepAnalysis.chunk_count,
            analysis_channel_count: channelCharacterization?.channel_count ?? parsedWave.channelData.length,
            analysis_dual_mono: channelCharacterization?.dual_mono ?? false,
            analysis_waveform_bucket_count: waveformProxy?.bucket_count ?? 0,
            analysis_phase: activePhase,
            chain: "high_pass,boxiness_reduction,gentle_deesser,light_compression,loudness_normalize",
          },
        },
      },
    };
  } catch (error) {
    const message = error instanceof Error && error.message.trim()
      ? error.message
      : "Hammer could not produce a baseline audio polish artifact.";
    const isUnsupported = /supports PCM16 or float32 WAV|supports mono or stereo WAV|not a RIFF\/WAVE|missing required fmt\/data chunks|requires a sane WAV sample rate/i.test(message);
    return {
      status: 200,
      payload: {
        ok: true,
        data: createFailedResponse({
          code: isUnsupported ? "unsupported_source" : "processing_failed",
          reason: isUnsupported
            ? `${message} Unsupported sources will open normally without polish.`
            : message,
          phase: activePhase,
          failedPhase: activePhase,
          settingsSummary: {
            source_media_kind: request.media_kind,
            source_kind: sourceMedia.sourceKind,
            source_extension: sourceMedia.sourceExtension,
            source_canonical_workpiece_path: sourceMedia.canonicalWorkpiecePath,
            media_runtime_preferred_backend: mediaRuntime.preferred_backend,
            media_runtime_ffmpeg_install_state: mediaRuntime.ffmpeg.install_state,
            media_runtime_ffmpeg_configured: mediaRuntime.ffmpeg.ffmpeg_configured,
            media_runtime_ffprobe_configured: mediaRuntime.ffmpeg.ffprobe_configured,
            media_runtime_ffmpeg_available: mediaRuntime.ffmpeg.ffmpeg_available,
            media_runtime_ffprobe_available: mediaRuntime.ffmpeg.ffprobe_available,
            audio_polish_plan_readiness: executionPlan.readiness,
            audio_polish_current_strategy: executionPlan.current_strategy,
            audio_polish_future_strategy: executionPlan.future_strategy,
            audio_polish_requires_ffmpeg: executionPlan.requires_ffmpeg,
            failed_phase: activePhase,
          },
        }),
      },
    };
  }
}
