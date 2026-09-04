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
import { buildHammerExactDspFfmpegPlan, buildHammerStudioRackFfmpegPlan } from "../../hammer/src/editor/hammerStudioRackFfmpegPlan";
import type { HammerFinalAudioMasterAuthority, HammerFinalAudioRenderIdentity } from "../../hammer/src/composition/hammerFinalAudioAuthority";
import { buildHammerExactAudioRenderReceipt, HAMMER_AUDIO_ALGORITHM_VERSIONS, type HammerExactAudioLoudnessReceiptV1, type HammerLoudnessMeasurementV1 } from "../../hammer/src/editor/hammerExactAudioReceipt";
import type { HammerAudioDspPlanV1, HammerAudioRenderIdentityV1 } from "../../hammer/src/editor/hammerAudioDspPlan";

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
  commitFinalAudioMaster?: (args: {
    request: NormalizedStudioRackRenderRequest;
    identity: HammerFinalAudioRenderIdentity;
    outputWorkpiecePath: string;
    bytes: Buffer;
    durationMs: number;
    mimeType: string;
    renderEvidence: Record<string, unknown>;
  }) => Promise<HammerFinalAudioMasterAuthority>;
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
const FFPROBE_PROCESS_TIMEOUT_MS = 30_000;
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

function toFiniteNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readBitRate(value: unknown): number | null {
  const parsed = toFiniteNumberOrNull(value);
  return parsed != null && parsed > 0 ? Math.round(parsed) : null;
}

async function probeInputAudioWithFfprobe(args: {
  ffprobeBin: string;
  bytes: Buffer;
  sourceExtension: string;
  sourceLabel: string;
}): Promise<{
  codec: string | null;
  sampleRate: number | null;
  channels: number | null;
  durationSec: number | null;
  bitRate: number | null;
}> {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "hammer-studio-rack-ffprobe-"));
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
          "stream=codec_name,sample_rate,channels,duration,bit_rate:format=duration,bit_rate",
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
          reject(new Error("Hammer Studio Rack ffprobe timed out."));
          return;
        }
        if (code === 0) {
          resolve(stdout);
          return;
        }
        reject(new Error(stderr.trim() || `Hammer Studio Rack ffprobe failed for ${args.sourceLabel}.`));
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
    return {
      codec: readTrimmed(stream.codec_name),
      sampleRate: toFiniteNumberOrNull(stream.sample_rate),
      channels: toFiniteNumberOrNull(stream.channels),
      durationSec: streamDuration ?? formatDuration,
      bitRate: readBitRate(stream.bit_rate) ?? readBitRate(format.bit_rate),
    };
  } finally {
    await fsPromises.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
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
    canonical_audio_master: null,
    exact_audio_receipt: null,
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
    canonical_audio_master: null,
    exact_audio_receipt: null,
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
  const dspPlan = readObject(row.dsp_plan) as unknown as HammerAudioDspPlanV1 | null;
  const renderIdentity = readObject(row.render_identity) as unknown as HammerAudioRenderIdentityV1 | null;
  const renderPurpose = readTrimmed(row.render_purpose);
  const identityRow = readObject(row.final_audio_identity);
  const podcastMasterRow = readObject(row.podcast_master);
  const finalAudioIdentity = identityRow ? {
    recording_revision_id: readTrimmed(identityRow.recording_revision_id) ?? "",
    composition_revision: readNumber(identityRow.composition_revision) ?? 0,
    composition_fingerprint: readTrimmed(identityRow.composition_fingerprint) ?? "",
    render_job_id: readTrimmed(identityRow.render_job_id) ?? "",
    render_plan_fingerprint: readTrimmed(identityRow.render_plan_fingerprint) ?? "",
    operation_fingerprint: readTrimmed(identityRow.operation_fingerprint) ?? "",
    renderer_version: readTrimmed(identityRow.renderer_version) ?? "",
    output_profile_id: readTrimmed(identityRow.output_profile_id) ?? "",
  } satisfies HammerFinalAudioRenderIdentity : null;
  const podcastMaster = podcastMasterRow ? {
    noise_cleanup: readTrimmed(podcastMasterRow.noise_cleanup) === "light" ? "light" as const : "off" as const,
    normalization_lufs: readNumber(podcastMasterRow.normalization_lufs) ?? -16,
    compression_amount: readTrimmed(podcastMasterRow.compression_amount) === "light" ? "light" as const : "medium" as const,
    limiter_ceiling_dbtp: readNumber(podcastMasterRow.limiter_ceiling_dbtp) ?? -1,
  } : null;
  if (
    !workspaceId
    || !workpieceId
    || !mediaKind
    || (requestedBackend !== "native" && requestedBackend !== "ffmpeg")
    || timelineSegments.length === 0
    || !rackState || !dspPlan || !renderIdentity || !readTrimmed(dspPlan.dspFingerprint) || !readTrimmed(renderIdentity.renderFingerprint)
    || (renderPurpose === "final" && (!finalAudioIdentity || !finalAudioIdentity.recording_revision_id || finalAudioIdentity.composition_revision <= 0 || !/^[0-9a-f]{64}$/.test(finalAudioIdentity.operation_fingerprint)))
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
    dsp_plan: dspPlan,
    render_identity: renderIdentity,
    render_purpose: renderPurpose === "final" ? "final" : "preview",
    final_audio_identity: finalAudioIdentity,
    podcast_master: podcastMaster,
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
  filterComplex: string;
  outputLabel: string;
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
      ...(args.filterComplex ? ["-filter_complex", args.filterComplex] : []),
      ...(args.filterComplex ? ["-map", `[${args.outputLabel}]`] : ["-map", "0:a:0"]),
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

function parseLoudnormMeasurement(stderr: string): HammerLoudnessMeasurementV1 {
  const matches = stderr.match(/\{[\s\S]*?\}/g) ?? [];
  const row = matches.length > 0 ? JSON.parse(matches[matches.length - 1]!) as Record<string, unknown> : null;
  const number = (key: string): number => {
    const parsed = Number(row?.[key]);
    if (!Number.isFinite(parsed)) throw new Error(`FFmpeg loudnorm measurement is missing ${key}.`);
    return parsed;
  };
  return Object.freeze({
    integrated_lufs: number("input_i"), loudness_range_lu: number("input_lra"),
    true_peak_dbtp: number("input_tp"), threshold_lufs: number("input_thresh"),
    offset_lu: number("target_offset"),
  });
}

async function analyzeLoudnessWithFfmpeg(args: { ffmpegBin: string; bytes: Buffer; targetLufs: number; targetLra: number; truePeak: number }): Promise<HammerLoudnessMeasurementV1> {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "hammer-loudnorm-analysis-"));
  const inputPath = path.join(tempRoot, "input.wav");
  try {
    await fsPromises.writeFile(inputPath, args.bytes);
    const stderr = await new Promise<string>((resolve, reject) => {
      const child = spawn(args.ffmpegBin, ["-hide_banner", "-nostats", "-i", inputPath, "-af", `loudnorm=I=${args.targetLufs}:TP=${args.truePeak}:LRA=${args.targetLra}:print_format=json`, "-f", "null", "-"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
      let output = ""; const timeoutId = setTimeout(() => child.kill(), FFMPEG_PROCESS_TIMEOUT_MS);
      child.stderr.on("data", (chunk) => { output += chunk.toString("utf8"); });
      child.on("error", (error) => { clearTimeout(timeoutId); reject(error); });
      child.on("close", (code) => {
        clearTimeout(timeoutId);
        if (code === 0) resolve(output);
        else reject(new Error(output.trim() || "FFmpeg loudnorm analysis failed."));
      });
    });
    return parseLoudnormMeasurement(stderr);
  } finally { await fsPromises.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined); }
}

function readPcm16SamplePeakDbfs(buffer: Buffer): number | null {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF") return null;
  let peak = 0;
  for (let offset = 44; offset + 1 < buffer.length; offset += 2) peak = Math.max(peak, Math.abs(buffer.readInt16LE(offset)));
  return peak === 0 ? null : 20 * Math.log10(peak / 32768);
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

export function createHammerStudioRackRenderRequestContext(
  req: IncomingMessage,
  commitFinalAudioMaster?: HammerRenderRequestContext["commitFinalAudioMaster"],
): HammerRenderRequestContext {
  const forwardedProto = readHeaderString(req.headers["x-forwarded-proto"]);
  const host = readHeaderString(req.headers.host) ?? "localhost";
  return {
    origin: `${forwardedProto ?? "http"}://${host}`,
    authorization: readHeaderString(req.headers.authorization),
    userAuthorization: readHeaderString(req.headers["x-forge-user-authorization"]),
    commitFinalAudioMaster,
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

  if (request.render_purpose !== "final"
    && (!request.rack_state.is_enabled || request.rack_state.is_bypassed || isHammerStudioRackIdentity(request.rack_state))) {
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
    const ffprobeBin = readTrimmed(mediaRuntime.ffmpeg.ffprobe_bin);
    let inputProbe: Awaited<ReturnType<typeof probeInputAudioWithFfprobe>> | null = null;
    let inputProbeError: string | null = null;
    if (mediaRuntime.ffmpeg.ffprobe_available && ffprobeBin) {
      try {
        inputProbe = await probeInputAudioWithFfprobe({
          ffprobeBin,
          bytes: sourceMedia.sourceBytes,
          sourceExtension: sourceMedia.sourceExtension,
          sourceLabel: sourceMedia.sourceLabel,
        });
      } catch (error) {
        inputProbeError = error instanceof Error && error.message.trim()
          ? error.message
          : "Input audio probe failed.";
      }
    } else {
      inputProbeError = "ffprobe unavailable";
    }

    const chain = buildHammerStudioRackFfmpegPlan(request.rack_state);
    const unsupportedRequestedModules = chain.decisions.filter((decision) => decision.requested && !decision.applied);
    if (request.render_purpose === "final" && unsupportedRequestedModules.length > 0) {
      return {
        status: 200,
        payload: {
          ok: true,
          data: createFailedResponse({
            request,
            resolvedBackend: "ffmpeg",
            reason: `Final audio render cannot silently omit active modules: ${unsupportedRequestedModules.map((decision) => decision.moduleId).join(", ")}.`,
            summary: chain.summary,
          }),
        },
      };
    }
    const shouldApplyRack = request.requested_backend === "ffmpeg"
      && request.rack_state.is_enabled
      && !request.rack_state.is_bypassed
      && !isHammerStudioRackIdentity(request.rack_state);
    const exactDspPlan = buildHammerExactDspFfmpegPlan(request.dsp_plan);
    const postFilterChain = shouldApplyRack ? exactDspPlan.preLoudnessFilters.join(",") : "";
    const timelinePlan = buildHammerTimelineAudioRenderPlan({
      segments: request.timeline_segments,
      postFilterChain: postFilterChain || null,
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

    const preLoudnessWaveBytes = await renderWaveBufferWithFfmpeg({
      sourceBytes: sourceMedia.sourceBytes,
      sourceExtension: sourceMedia.sourceExtension,
      sourceLabel: sourceMedia.sourceLabel,
      ffmpegBin,
      filterComplex: timelinePlan.filterComplex,
      outputLabel: timelinePlan.outputLabel,
    });
    const loudnessOperation = request.dsp_plan.operations.find((operation) => operation.id === "loudness_normalization" && operation.enabled) ?? null;
    const limiterOperation = request.dsp_plan.operations.find((operation) => operation.id === "output_limiter" && operation.enabled) ?? null;
    let loudnessReceipt: HammerExactAudioLoudnessReceiptV1 = Object.freeze({ status: "not_requested", target_lufs: null, target_lra_lu: null, true_peak_ceiling_dbtp: null, first_pass: null, second_pass_parameters: null, verification: null, sample_peak_dbfs: readPcm16SamplePeakDbfs(preLoudnessWaveBytes) });
    let renderedWaveBytes = preLoudnessWaveBytes;
    let exactLoudnessFilter = "";
    if (loudnessOperation) {
      const targetLufs = Number(loudnessOperation.parameters.target_lufs);
      const targetLra = Number(loudnessOperation.parameters.lra);
      const truePeak = Number(loudnessOperation.parameters.true_peak_dbtp);
      if (![targetLufs, targetLra, truePeak].every(Number.isFinite)) throw new Error("Canonical loudness targets are invalid.");
      const firstPass = await analyzeLoudnessWithFfmpeg({ ffmpegBin, bytes: preLoudnessWaveBytes, targetLufs, targetLra, truePeak });
      const secondPassParameters = Object.freeze({ measured_I: firstPass.integrated_lufs, measured_LRA: firstPass.loudness_range_lu, measured_TP: firstPass.true_peak_dbtp, measured_thresh: firstPass.threshold_lufs, offset: firstPass.offset_lu });
      const loudnorm = `loudnorm=I=${targetLufs}:TP=${truePeak}:LRA=${targetLra}:measured_I=${firstPass.integrated_lufs}:measured_LRA=${firstPass.loudness_range_lu}:measured_TP=${firstPass.true_peak_dbtp}:measured_thresh=${firstPass.threshold_lufs}:offset=${firstPass.offset_lu}:linear=true:print_format=summary`;
      const limiter = limiterOperation ? `,alimiter=limit=${Math.pow(10, Number(limiterOperation.parameters.ceiling_dbfs) / 20).toFixed(6)}:level=false` : "";
      exactLoudnessFilter = `${loudnorm}${limiter}`;
      renderedWaveBytes = await renderWaveBufferWithFfmpeg({ sourceBytes: preLoudnessWaveBytes, sourceExtension: ".wav", sourceLabel: "pre-loudness exact audio", ffmpegBin, filterComplex: `[0:a:0]${exactLoudnessFilter}[outa]`, outputLabel: "outa" });
      const verification = await analyzeLoudnessWithFfmpeg({ ffmpegBin, bytes: renderedWaveBytes, targetLufs, targetLra, truePeak });
      const verified = Math.abs(verification.integrated_lufs - targetLufs) <= 1 && verification.true_peak_dbtp <= truePeak;
      loudnessReceipt = Object.freeze({ status: verified ? "verified" : "failed", target_lufs: targetLufs, target_lra_lu: targetLra, true_peak_ceiling_dbtp: truePeak, first_pass: firstPass, second_pass_parameters: secondPassParameters, verification, sample_peak_dbfs: readPcm16SamplePeakDbfs(renderedWaveBytes) });
      if (!verified) throw new Error(`Exact loudness verification failed (I=${verification.integrated_lufs} LUFS, TP=${verification.true_peak_dbtp} dBTP).`);
    } else if (limiterOperation) {
      const ceiling = Number(limiterOperation.parameters.ceiling_dbfs);
      if (!Number.isFinite(ceiling)) throw new Error("Canonical sample-limiter ceiling is invalid.");
      exactLoudnessFilter = `alimiter=limit=${Math.pow(10, ceiling / 20).toFixed(6)}:level=false`;
      renderedWaveBytes = await renderWaveBufferWithFfmpeg({ sourceBytes: preLoudnessWaveBytes, sourceExtension: ".wav", sourceLabel: "pre-limiter exact audio", ffmpegBin, filterComplex: `[0:a:0]${exactLoudnessFilter}[outa]`, outputLabel: "outa" });
      loudnessReceipt = Object.freeze({ ...loudnessReceipt, sample_peak_dbfs: readPcm16SamplePeakDbfs(renderedWaveBytes) });
    }
    const outputWorkpiecePath = buildArtifactRelpath(request, sourceMedia.sourceLabel);
    const outputDurationMs = readWavDurationMs(renderedWaveBytes);
    const outputContentHash = crypto.createHash("sha256").update(renderedWaveBytes).digest("hex");
    const operationDecisions = request.dsp_plan.operations.map((operation) => ({ id: operation.id, order: operation.order, state: operation.enabled ? (shouldApplyRack ? "applied" as const : "failed" as const) : "bypassed" as const, detail: operation.enabled && !shouldApplyRack ? "ffmpeg_exact_lane_not_selected" : operation.enabled ? null : operation.bypassed ? "rack_bypassed" : "operation_disabled" }));
    let exactAudioReceipt = buildHammerExactAudioRenderReceipt({
      dspImplementationVersion: request.dsp_plan.implementationVersion,
      rendererVersion: request.render_identity.rendererVersion,
      algorithmVersions: HAMMER_AUDIO_ALGORITHM_VERSIONS,
      dspFingerprint: request.dsp_plan.dspFingerprint,
      renderIdentity: request.render_identity,
      operations: operationDecisions,
      ffmpegFilterPlan: `${timelinePlan.filterComplex}${exactLoudnessFilter ? `;[${timelinePlan.outputLabel}]${exactLoudnessFilter}[exact_out]` : ""}`,
      loudness: loudnessReceipt,
      output: { canonicalAssetId: null, contentHash: outputContentHash, workpiecePath: outputWorkpiecePath, mimeType: OUTPUT_MIME_TYPE, durationMs: outputDurationMs ?? 0, sampleRate: 48000, channels: 2 },
    });

    let commitError: string | null = null;
    let canonicalAudioMaster: HammerFinalAudioMasterAuthority | null = null;
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
        if (request.render_purpose === "final") {
          if (!request.final_audio_identity || !context?.commitFinalAudioMaster) {
            throw new Error("Final audio render authority is unavailable.");
          }
          canonicalAudioMaster = await context.commitFinalAudioMaster({
            request,
            identity: request.final_audio_identity,
            outputWorkpiecePath,
            bytes: renderedWaveBytes,
            durationMs: outputDurationMs ?? 0,
            mimeType: OUTPUT_MIME_TYPE,
            renderEvidence: {
              timeline_summary: timelinePlan.summary,
              rack_summary: chain.summary,
              exact_audio_receipt: exactAudioReceipt,
              output_sample_rate: 48000,
              output_channels: 2,
            },
          });
          exactAudioReceipt = buildHammerExactAudioRenderReceipt({
            ...exactAudioReceipt,
            output: { ...exactAudioReceipt.output, canonicalAssetId: canonicalAudioMaster.canonical_asset_id },
          });
          canonicalAudioMaster = { ...canonicalAudioMaster, exact_audio_receipt_fingerprint: exactAudioReceipt.receiptFingerprint };
        }
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
            preview_audio_processing_active: false,
            export_audio_processing_active: true,
            preview_audio_filter_chain: null,
            export_audio_filter_mode: "filter_complex",
            export_audio_filter_chain: timelinePlan.filterComplex,
            exact_audio_post_filter_chain: exactLoudnessFilter || null,
            exact_audio_receipt_fingerprint: exactAudioReceipt.receiptFingerprint,
            export_audio_filter_args: `-filter_complex <graph> -map [${timelinePlan.outputLabel}]`,
            export_audio_mapped_stream: `[${timelinePlan.outputLabel}]`,
            export_audio_source_stream: "0:a:0",
            voice_cleanup_enabled: request.rack_state.voice_polish?.voice_cleanup_enabled === true,
            export_input_codec: inputProbe?.codec ?? null,
            export_input_sample_rate: inputProbe?.sampleRate ?? null,
            export_input_channels: inputProbe?.channels ?? null,
            export_input_duration: inputProbe?.durationSec ?? null,
            export_input_bit_rate: inputProbe?.bitRate ?? null,
            export_input_probe_error: inputProbeError,
            export_output_codec: "pcm_s16le",
            export_output_sample_rate: 48000,
            export_output_channels: 2,
            export_output_mime_type: OUTPUT_MIME_TYPE,
            timeline_order_preserved: true,
            ...timelinePlan.summary,
            ...chain.summary,
          },
          canonical_audio_master: canonicalAudioMaster,
          exact_audio_receipt: exactAudioReceipt,
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
