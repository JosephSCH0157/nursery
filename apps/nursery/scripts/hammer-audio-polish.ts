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
  "local_root_abs" | "local_relpath" | "canonical_workpiece_path"
> & {
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

function readTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
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
  const mediaKind = readTrimmed(row.media_kind);
  if (!workspaceId || !workpieceId || !mediaKind) {
    return null;
  }
  if (!(localRootAbs && localRelpath) && !canonicalWorkpiecePath) {
    return null;
  }

  return {
    workspace_id: workspaceId,
    workpiece_id: workpieceId,
    media_kind: mediaKind as HammerAudioPolishRequest["media_kind"],
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

async function loadCanonicalWorkpieceFile(args: {
  context: HammerAudioPolishRequestContext;
  request: NormalizedHammerAudioPolishRequest;
  workpiecePath: string;
}): Promise<{
  contentType: string;
  fileBytes: Buffer;
}> {
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
      throw new Error(readErrorMessage(payload, "Hammer could not read canonical workpiece media."));
    }

    const contentLength = readHeaderNumber(response.headers, "content-length");
    if (contentLength != null && contentLength > MAX_AUDIO_POLISH_SOURCE_BYTES) {
      throw new Error(buildAudioPolishSourceTooLargeMessage(contentLength));
    }

    const fileBytes = Buffer.from(await response.arrayBuffer());
    if (fileBytes.byteLength > MAX_AUDIO_POLISH_SOURCE_BYTES) {
      throw new Error(buildAudioPolishSourceTooLargeMessage(fileBytes.byteLength));
    }

    return {
      contentType: readTrimmed(response.headers.get("content-type"))
        ?? inferContentType(args.workpiecePath, args.request.mime_type),
      fileBytes,
    };
  } catch (error) {
    if (fetchTimeout.controller.signal.aborted) {
      throw new Error("Hammer timed out while reading canonical workpiece media for audio prep.");
    }
    throw error;
  } finally {
    fetchTimeout.dispose();
  }
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
  if (request.local_root_abs && request.local_relpath && path.isAbsolute(request.local_root_abs)) {
    const absolutePath = resolveMediaFileAbs(request.local_root_abs, request.local_relpath);
    if (absolutePath) {
      const stat = await fsPromises.stat(absolutePath).catch(() => null);
      if (stat?.isFile()) {
        if (stat.size > MAX_AUDIO_POLISH_SOURCE_BYTES) {
          throw new Error(buildAudioPolishSourceTooLargeMessage(stat.size));
        }
        return {
          sourceKind: "local_workspace_media",
          sourceLabel: absolutePath,
          sourceExtension: path.extname(absolutePath).toLowerCase(),
          contentType: inferContentType(absolutePath, request.mime_type),
          sourceBytes: await fsPromises.readFile(absolutePath),
          canonicalWorkpiecePath: request.canonical_workpiece_path ?? request.local_relpath,
          localRootAbs: request.local_root_abs,
          localRelpath: request.local_relpath,
        };
      }
    }
  }

  if (!request.canonical_workpiece_path) {
    throw new Error("Hammer could not locate source media in the workspace mapping or canonical workpiece storage.");
  }
  if (!canUseCanonicalTongsContext(context)) {
    throw new Error("Hammer audio prep needs authenticated Tongs access to read canonical workpiece media.");
  }

  const canonicalFile = await loadCanonicalWorkpieceFile({
    context,
    request,
    workpiecePath: request.canonical_workpiece_path,
  });
  return {
    sourceKind: "canonical_workpiece_media",
    sourceLabel: request.canonical_workpiece_path,
    sourceExtension: path.extname(request.canonical_workpiece_path).toLowerCase(),
    contentType: canonicalFile.contentType,
    sourceBytes: canonicalFile.fileBytes,
    canonicalWorkpiecePath: request.canonical_workpiece_path,
    localRootAbs: request.local_root_abs,
    localRelpath: request.local_relpath,
  };
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

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });
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

function applyPresenceLift(samples: Float32Array, sampleRate: number, cutoffHz: number, amount: number): void {
  const dt = 1 / sampleRate;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const alpha = dt / (rc + dt);
  let lowPass = samples[0] ?? 0;
  for (let index = 0; index < samples.length; index += 1) {
    const input = samples[index];
    lowPass += alpha * (input - lowPass);
    const highBand = input - lowPass;
    samples[index] = Math.max(-1, Math.min(1, input + highBand * amount));
  }
}

function applyGentleNoiseReduction(samples: Float32Array, sampleRate: number): void {
  const windowSize = Math.max(64, Math.round(sampleRate * 0.01));
  const rmsValues: number[] = [];
  for (let start = 0; start < samples.length; start += windowSize) {
    let sumSquares = 0;
    const end = Math.min(start + windowSize, samples.length);
    for (let index = start; index < end; index += 1) {
      const sample = samples[index];
      sumSquares += sample * sample;
    }
    rmsValues.push(Math.sqrt(sumSquares / Math.max(end - start, 1)));
  }
  if (rmsValues.length === 0) return;

  const sorted = [...rmsValues].sort((left, right) => left - right);
  const percentileIndex = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.2));
  const floorRms = Math.max(sorted[percentileIndex] ?? 0, 0.0015);
  const attenuationCeiling = 0.84;

  for (let windowIndex = 0; windowIndex < rmsValues.length; windowIndex += 1) {
    const rms = rmsValues[windowIndex];
    const normalized = Math.min(1, rms / (floorRms * 2.25));
    const gain = attenuationCeiling + (1 - attenuationCeiling) * normalized;
    const start = windowIndex * windowSize;
    const end = Math.min(start + windowSize, samples.length);
    for (let index = start; index < end; index += 1) {
      samples[index] *= gain;
    }
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

function normalizePeak(channelData: Float32Array[], targetPeak = 0.89): void {
  let peak = 0;
  for (const samples of channelData) {
    for (let index = 0; index < samples.length; index += 1) {
      peak = Math.max(peak, Math.abs(samples[index]));
    }
  }
  if (peak <= 0) return;
  const gain = targetPeak / peak;
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
    applyHighPass(samples, parsedWave.sampleRate, 72);
    applyPresenceLift(samples, parsedWave.sampleRate, 1_900, 0.1);
    applyGentleNoiseReduction(samples, parsedWave.sampleRate);
    applyLightCompression(samples, parsedWave.sampleRate);
  }
  normalizePeak(processedChannels);

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
}): Promise<HammerLoudnessAnalysis> {
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

      child.stderr.on("data", (chunk) => {
        const next = chunk.toString("utf8");
        if (stderrText.length < 64_000) {
          stderrText += next.slice(0, 64_000 - stderrText.length);
        }
      });
      child.on("error", (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
      child.on("close", (code) => {
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

    return parseLoudnessSummary(stderr, args.sourceLabel);
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

      child.stderr.on("data", (chunk) => {
        const next = chunk.toString("utf8");
        if (stderrText.length < 64_000) {
          stderrText += next.slice(0, 64_000 - stderrText.length);
        }
      });
      child.on("error", (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
      child.on("close", (code) => {
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

      workingWaveBytes = await renderWorkingAudioWaveBufferWithFfmpeg({
        sourceBytes: sourceMedia.sourceBytes,
        sourceExtension: sourceMedia.sourceExtension,
        sourceLabel: sourceMedia.sourceLabel,
        ffmpegBin,
      });
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
    const loudnessAnalysis = ffmpegBin
      ? await analyzeLoudnessWithFfmpeg({
        ffmpegBin,
        wavBytes: workingWaveBytes,
        sourceLabel: workingAudioWorkpiecePath ?? sourceMedia.sourceLabel,
      })
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
            channel_characterization: analyzeChannelCharacterization(parsedWave),
            waveform_proxy: null,
          },
          settings_summary: {
            supported_source: true,
            source_media_kind: request.media_kind,
            source_kind: sourceMedia.sourceKind,
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
            analysis_speech_region_count: segmentationAnalysis.speech_region_count,
            analysis_silence_region_count: segmentationAnalysis.silence_region_count,
            analysis_chunk_count: transcriptPrepAnalysis.chunk_count,
            analysis_channel_count: parsedWave.channelData.length,
            analysis_dual_mono: parsedWave.channelData.length > 1,
            analysis_phase: activePhase,
            chain: "dc_remove,high_pass,presence_lift,gentle_noise_reduction,light_compression,peak_normalize",
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
