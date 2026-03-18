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
  HammerAudioPolishRequest,
  HammerAudioPolishResponse,
} from "../../hammer/src/prep/hammerAudioPolishApi";
import type { HammerAudioPolishFailureCode } from "../../hammer/src/persistence/hammerPersistenceContract";

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

function buildArtifactRelpath(
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
  settingsSummary?: Record<string, string | number | boolean | null>;
}): HammerAudioPolishResponse {
  return {
    status: "failed",
    prepared_at: null,
    prepared_passes: [],
    processor_version: HAMMER_AUDIO_POLISH_PROCESSOR_VERSION,
    output_local_relpath: null,
    output_workpiece_path: null,
    output_mime_type: null,
    output_duration_ms: null,
    failure_code: args.code,
    failure_reason: args.reason,
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
          "-ac",
          "2",
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

  try {
    let workingWaveBytes = sourceMedia.sourceBytes;
    const sourceArtifactPaths = [sourceMedia.canonicalWorkpiecePath];
    let workingAudioWorkpiecePath: string | null = null;

    if (executionPlan.current_strategy === "ffmpeg_working_audio_v1") {
      const ffmpegBin = readTrimmed(mediaRuntime.ffmpeg.ffmpeg_bin);
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
    }

    const parsedWave = parseWaveBuffer(workingWaveBytes);
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

    return {
      status: 200,
      payload: {
        ok: true,
        data: {
          status: "prepared",
          prepared_at: new Date().toISOString(),
          prepared_passes: [...HAMMER_AUDIO_POLISH_PREPARED_PASSES],
          processor_version: HAMMER_AUDIO_POLISH_PROCESSOR_VERSION,
          output_local_relpath: localArtifactWrite.outputLocalRelpath,
          output_workpiece_path: outputWorkpiecePath,
          output_mime_type: OUTPUT_MIME_TYPE,
          output_duration_ms: Math.round((parsedWave.sampleCount / parsedWave.sampleRate) * 1000),
          failure_code: null,
          failure_reason: null,
          settings_summary: {
            supported_source: true,
            source_media_kind: request.media_kind,
            source_kind: sourceMedia.sourceKind,
            source_extension: sourceMedia.sourceExtension,
            source_canonical_workpiece_path: sourceMedia.canonicalWorkpiecePath,
            source_format: parsedWave.formatLabel,
            sample_rate: parsedWave.sampleRate,
            channel_count: parsedWave.channelCount,
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
}
