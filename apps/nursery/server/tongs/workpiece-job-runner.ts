import crypto from "node:crypto";
import path from "node:path";
import fsPromises from "node:fs/promises";
import os from "node:os";
import { spawn } from "node:child_process";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@forge/tongs";
import type { HammerTranscriptPrepSegment } from "../../../hammer/src/prep/hammerPrepApi";
import type { HammerPersistedVisualPlacements } from "../../../hammer/src/persistence/hammerPersistenceContract";
import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import type { MediaKind, MediaRef } from "../../../../packages/contracts/hammer/media-resolver.contract";
import { TongsCommitService } from "../../../../packages/tongs/src/workpiece-commit-api";
import { resolveHearthRuntimeConfig } from "../hearth/hearth-runtime-config";
import {
  HAMMER_RUNTIME_WRITTEN_BY,
  applyPreparedTranscriptToLaunchContext,
  buildHammerPrepPersistenceSaveRequest,
  buildPreparedTranscript,
} from "../../../hammer/src/prep/hammerPrep";
import {
  buildUnavailableHammerVisualPlacements,
  deriveHammerVisualPlacements,
} from "../../../hammer/src/lib/hammerVisualPlacements";
import { detectHammerMediaRuntime } from "../../scripts/hammer-media-runtime";
import {
  readHammerForgeFfmpegClientConfig,
  transcodeToWorkingWavWithForgeFfmpeg,
} from "../../scripts/hammer-forge-ffmpeg-client";

type WorkpieceJobRow = Database["tongs"]["Tables"]["workpiece_jobs"]["Row"];

type RunnerDeps = {
  service: TongsCommitService;
};

type RunnerState = {
  runnerId: string;
  intervalId: NodeJS.Timeout | null;
  inFlight: boolean;
};

const MAX_TRANSCRIPT_SOURCE_BYTES = 256 * 1024 * 1024;
const MAX_OPENAI_TRANSCRIBE_UPLOAD_BYTES = 25 * 1024 * 1024;
const FFMPEG_TRANSCRIPT_AUDIO_TIMEOUT_MS = 3 * 60 * 1000;

function readTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function readJsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function inferMediaKindFromPath(relpath: string): MediaKind {
  const ext = path.extname(relpath).toLowerCase();
  if (ext === ".mp4" || ext === ".webm" || ext === ".mov") return "recording_video";
  if (ext === ".wav" || ext === ".mp3" || ext === ".m4a") return "recording_audio";
  return "other";
}

function inferContentType(relpath: string, hint?: string | null): string {
  if (hint && hint.trim()) return hint.trim();
  const ext = path.extname(relpath).toLowerCase();
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".m4a") return "audio/mp4";
  return "application/octet-stream";
}

async function downloadWorkpieceBytes(
  supabase: SupabaseClient<Database>,
  bucket: string,
  workpieceId: string,
  relpath: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const storageKey = `workpieces/${workpieceId}/${relpath}`;
  const { data, error } = await supabase.storage.from(bucket).download(storageKey);
  if (error || !data) {
    throw new Error(`Failed to download workpiece media (${relpath}).`);
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  const { data: fileRow } = await supabase
    .schema("tongs")
    .from("workpiece_files")
    .select("content_type")
    .eq("workpiece_id", workpieceId)
    .eq("path", relpath)
    .maybeSingle();
  const contentType = (fileRow?.content_type ?? "").trim() || inferContentType(relpath, null);
  return { bytes, contentType };
}

function normalizeSegments(payload: unknown): HammerTranscriptPrepSegment[] {
  type RawSegment = {
    id: string;
    start: number;
    end: number;
    text: string;
    speaker: string | null;
    confidence: number | null;
  };

  const ABS_MAX_DURATION_SEC = 8.0;
  const ABS_MAX_WORDS = 24;
  const PREF_MERGE_MAX_DURATION_SEC = 5.5;
  const PREF_MERGE_MAX_WORDS = 14;

  const STRONG_PUNCT_RE = /[.!?…]+$/u;
  const SENTENCE_SPLIT_RE = /(?<=[.!?…])\s+/u;

  function readNumber(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return value;
  }

  function countWords(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  function endsWithStrongPunctuation(text: string): boolean {
    return STRONG_PUNCT_RE.test(text.trim());
  }

  function splitToSentences(text: string): string[] {
    const normalized = text.trim().replace(/\s+/g, " ");
    if (!normalized) return [];
    const parts = normalized.split(SENTENCE_SPLIT_RE).map((part) => part.trim()).filter(Boolean);
    return parts.length > 0 ? parts : [normalized];
  }

  function splitSentenceToWordWindows(sentence: string): string[] {
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    if (words.length <= ABS_MAX_WORDS) return [sentence.trim()];

    const out: string[] = [];
    let cursor = 0;
    while (cursor < words.length) {
      const remaining = words.length - cursor;
      const target = remaining <= 12 ? remaining : 10;
      const take = Math.min(Math.max(8, target), remaining, 12);
      out.push(words.slice(cursor, cursor + take).join(" "));
      cursor += take;
    }
    return out;
  }

  function splitOversizedRange(args: { text: string; start: number; end: number }): Array<{ text: string; start: number; end: number }> {
    const duration = args.end - args.start;
    const wordCount = countWords(args.text);
    if (!Number.isFinite(duration) || duration <= 0 || wordCount <= 0) {
      return [];
    }

    const tooLongByDuration = duration > ABS_MAX_DURATION_SEC;
    const tooLongByWords = wordCount > ABS_MAX_WORDS;
    if (!tooLongByDuration && !tooLongByWords) {
      return [{ ...args, text: args.text.trim().replace(/\s+/g, " ") }];
    }

    const minPartsByDuration = Math.ceil(duration / ABS_MAX_DURATION_SEC);
    const minPartsByWords = Math.ceil(wordCount / ABS_MAX_WORDS);
    const parts = Math.max(1, Math.max(minPartsByDuration, minPartsByWords));
    const wordsPerPart = Math.max(1, Math.ceil(wordCount / parts));

    const words = args.text.trim().split(/\s+/).filter(Boolean);
    const out: Array<{ text: string; start: number; end: number }> = [];
    for (let partIndex = 0; partIndex < parts; partIndex += 1) {
      const startWordIndex = partIndex * wordsPerPart;
      if (startWordIndex >= words.length) break;
      const endWordIndexExclusive = Math.min(words.length, startWordIndex + wordsPerPart);
      const partText = words.slice(startWordIndex, endWordIndexExclusive).join(" ").trim();
      if (!partText) continue;
      const partStart = args.start + (duration * startWordIndex) / words.length;
      const partEnd = args.start + (duration * endWordIndexExclusive) / words.length;
      out.push({
        text: partText,
        start: partStart,
        end: partEnd,
      });
    }
    return out.length > 0 ? out : [{ ...args, text: args.text.trim().replace(/\s+/g, " ") }];
  }

  function normalizeOne(raw: RawSegment): Array<Omit<RawSegment, "id">> {
    const sentences = splitToSentences(raw.text);
    if (sentences.length === 0) return [];
    const sentenceParts: Array<{ text: string; start: number; end: number }> = [];
    if (sentences.length === 1) {
      sentenceParts.push({ text: sentences[0], start: raw.start, end: raw.end });
    } else {
      const duration = raw.end - raw.start;
      const perSentence = duration / sentences.length;
      sentences.forEach((sentence, index) => {
        const start = raw.start + perSentence * index;
        const end = index === sentences.length - 1 ? raw.end : raw.start + perSentence * (index + 1);
        sentenceParts.push({ text: sentence, start, end });
      });
    }

    const clamped = sentenceParts.flatMap((sentence) => (
      splitSentenceToWordWindows(sentence.text).flatMap((windowText) => (
        splitOversizedRange({ text: windowText, start: sentence.start, end: sentence.end })
      ))
    ));

    const withSpeaker = clamped.map((part) => ({
      start: part.start,
      end: part.end,
      text: part.text.trim().replace(/\s+/g, " "),
      speaker: raw.speaker,
      confidence: raw.confidence,
    }));

    const merged: typeof withSpeaker = [];
    for (const part of withSpeaker) {
      const prev = merged.at(-1) ?? null;
      if (
        prev
        && prev.speaker === part.speaker
        && !endsWithStrongPunctuation(prev.text)
      ) {
        const combinedText = `${prev.text} ${part.text}`.trim().replace(/\s+/g, " ");
        const combinedDuration = part.end - prev.start;
        const combinedWords = countWords(prev.text) + countWords(part.text);
        if (combinedDuration <= PREF_MERGE_MAX_DURATION_SEC && combinedWords <= PREF_MERGE_MAX_WORDS) {
          prev.text = combinedText;
          prev.end = Math.max(prev.end, part.end);
          continue;
        }
      }
      merged.push({ ...part });
    }

    const hardClamped = merged.flatMap((part) => {
      const duration = part.end - part.start;
      if (duration <= ABS_MAX_DURATION_SEC && countWords(part.text) <= ABS_MAX_WORDS) {
        return [part];
      }
      return splitOversizedRange({ text: part.text, start: part.start, end: part.end }).map((range) => ({
        ...range,
        speaker: part.speaker,
        confidence: part.confidence,
      }));
    });

    return hardClamped.map((part) => ({
      start: part.start,
      end: part.end,
      text: part.text,
      speaker: part.speaker,
      confidence: part.confidence,
    }));
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const row = payload as Record<string, unknown>;
  const segmentsRaw = Array.isArray(row.segments)
    ? row.segments
    : Array.isArray(row.utterances)
      ? row.utterances
      : [];

  const rawSegments: RawSegment[] = [];
  segmentsRaw.forEach((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const segment = value as Record<string, unknown>;
    const start = readNumber(segment.start);
    const end = readNumber(segment.end);
    const text = readTrimmed(segment.text);
    if (start == null || end == null || end <= start || !text) {
      return;
    }
    rawSegments.push({
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

  const normalized: HammerTranscriptPrepSegment[] = [];
  for (const raw of rawSegments.sort((left, right) => left.start - right.start)) {
    const parts = normalizeOne(raw);
    for (const part of parts) {
      const duration = part.end - part.start;
      const wordCount = countWords(part.text);
      if (duration > ABS_MAX_DURATION_SEC || wordCount > ABS_MAX_WORDS) {
        continue;
      }
      normalized.push({
        id: raw.id,
        start: part.start,
        end: part.end,
        text: part.text,
        speaker: part.speaker,
        ...(part.confidence == null ? {} : { confidence: part.confidence }),
      });
    }
  }

  if (normalized.length === 0 && rawSegments.length > 0) {
    return rawSegments.map((raw) => ({
      id: raw.id,
      start: raw.start,
      end: raw.end,
      text: raw.text.trim().replace(/\s+/g, " "),
      speaker: raw.speaker,
      ...(raw.confidence == null ? {} : { confidence: raw.confidence }),
    } satisfies HammerTranscriptPrepSegment));
  }

  return normalized.map((segment, index) => ({
    id: `seg_${index + 1}`,
    start: segment.start,
    end: segment.end,
    text: segment.text,
    speaker: segment.speaker,
    ...(typeof segment.confidence === "number" ? { confidence: segment.confidence } : {}),
  }));
}

async function renderTranscriptAudioWavWithFfmpeg(args: {
  sourceBytes: Buffer;
  sourceExtension: string;
  sourceLabel: string;
  ffmpegBin: string;
}): Promise<Buffer> {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "hammer-job-transcript-audio-"));
  const inputPath = path.join(tempRoot, `input${args.sourceExtension || ".bin"}`);
  const outputPath = path.join(tempRoot, "transcript-audio.wav");
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
          "16000",
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
      }, FFMPEG_TRANSCRIPT_AUDIO_TIMEOUT_MS);

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
          reject(new Error("Hammer job FFmpeg transcript-audio extraction timed out."));
          return;
        }
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(stderr.trim() || `Hammer job FFmpeg transcript-audio extraction failed for ${args.sourceLabel}.`));
      });
    });
    return await fsPromises.readFile(outputPath);
  } finally {
    await fsPromises.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

function buildTranscriptAudioFilename(sourcePath: string): string {
  const parsed = path.parse(sourcePath);
  return `${parsed.name || "transcript-audio"}.wav`;
}

function shouldPreferForgeTranscriptTranscode(): boolean {
  return readTrimmed(process.env.HAMMER_TRANSCRIPT_AUDIO_TRANSCODE_BACKEND)?.toLowerCase() === "forge";
}

function isLikelyUnsupportedAudioUpload(status: number, detail: string): boolean {
  if (status !== 400 && status !== 415 && status !== 422) return false;
  const lower = detail.toLowerCase();
  return lower.includes("audio file might be corrupted or unsupported")
    || lower.includes("invalid_request_error")
    || lower.includes("unsupported")
    || lower.includes("invalid value");
}

class OpenAiTranscriptionError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(`OpenAI transcription failed (${status}): ${detail.slice(0, 240)}`);
    this.name = "OpenAiTranscriptionError";
    this.status = status;
    this.detail = detail;
  }
}

function assertValidWavHeader(bytes: Uint8Array): void {
  if (bytes.byteLength < 4) {
    throw new Error("Transcoded audio output is invalid before upload (too small for WAV header).");
  }
  const magic = Buffer.from(bytes.subarray(0, 4)).toString("ascii");
  if (magic !== "RIFF") {
    throw new Error(`Transcoded audio output is invalid before upload (expected RIFF header, got ${magic || "empty"}).`);
  }
}

async function prepareTranscriptJobUploadMedia(args: {
  bytes: Uint8Array;
  contentType: string;
  sourcePath: string;
  forceTranscode?: boolean;
}): Promise<{
  bytes: Uint8Array;
  contentType: string;
  filename: string;
  transcodeBackend: "direct_source" | "local_ffmpeg" | "forge_ffmpeg_service";
  ffmpegRequestId: string | null;
  outputFormat: string | null;
  outputSampleRate: number | null;
  outputChannels: number | null;
}> {
  if (args.bytes.byteLength > MAX_TRANSCRIPT_SOURCE_BYTES) {
    throw new Error(`Hammer transcript job source media is too large (${args.bytes.byteLength} bytes).`);
  }

  const extension = path.extname(args.sourcePath).toLowerCase();
  const shouldTranscode = Boolean(args.forceTranscode)
    || args.contentType.toLowerCase().startsWith("video/")
    || args.bytes.byteLength > MAX_OPENAI_TRANSCRIBE_UPLOAD_BYTES;
  if (!shouldTranscode) {
    return {
      bytes: args.bytes,
      contentType: args.contentType,
      filename: path.basename(args.sourcePath) || "source-media",
      transcodeBackend: "direct_source",
      ffmpegRequestId: null,
      outputFormat: null,
      outputSampleRate: null,
      outputChannels: null,
    };
  }

  const sourceBytes = Buffer.from(args.bytes);
  const transcodeWithForge = async () => {
    const forgeClient = readHammerForgeFfmpegClientConfig();
    if (!forgeClient) {
      throw new Error("Forge FFmpeg is not configured for transcript audio extraction.");
    }
    try {
      const transcoded = await transcodeToWorkingWavWithForgeFfmpeg({
        client: forgeClient,
        sourceBytes,
        sourceFilename: path.basename(args.sourcePath) || `source${extension || ""}`,
        contentType: args.contentType,
      });
      if (transcoded.audioBytes.byteLength > MAX_OPENAI_TRANSCRIBE_UPLOAD_BYTES) {
        throw new Error(`Transcoded transcript audio is too large (${transcoded.audioBytes.byteLength} bytes).`);
      }
      return {
        bytes: new Uint8Array(transcoded.audioBytes),
        contentType: "audio/wav",
        filename: buildTranscriptAudioFilename(args.sourcePath),
        transcodeBackend: "forge_ffmpeg_service" as const,
        ffmpegRequestId: transcoded.requestId,
        outputFormat: transcoded.outputFormat,
        outputSampleRate: transcoded.outputSampleRate,
        outputChannels: transcoded.outputChannels,
      };
    } catch (error) {
      throw error instanceof Error ? error : new Error("Forge FFmpeg transcript-audio extraction failed.");
    }
  };

  const transcodeWithLocalFfmpeg = async () => {
    const mediaRuntime = detectHammerMediaRuntime();
    const ffmpegBin = readTrimmed(mediaRuntime.ffmpeg.ffmpeg_bin);
    if (!ffmpegBin) {
      throw new Error("Hammer transcript jobs need FFmpeg to extract audio before transcription for this media.");
    }
    const wavBytes = await renderTranscriptAudioWavWithFfmpeg({
      sourceBytes,
      sourceExtension: extension,
      sourceLabel: args.sourcePath,
      ffmpegBin,
    });
    if (wavBytes.byteLength > MAX_OPENAI_TRANSCRIBE_UPLOAD_BYTES) {
      throw new Error(`Transcoded transcript audio is too large (${wavBytes.byteLength} bytes).`);
    }
    return {
      bytes: new Uint8Array(wavBytes),
      contentType: "audio/wav",
      filename: buildTranscriptAudioFilename(args.sourcePath),
      transcodeBackend: "local_ffmpeg" as const,
      ffmpegRequestId: null,
      outputFormat: "wav_pcm_s16le",
      outputSampleRate: 16000,
      outputChannels: 1,
    };
  };

  if (shouldPreferForgeTranscriptTranscode()) {
    try {
      return await transcodeWithForge();
    } catch (forgeError) {
      try {
        return await transcodeWithLocalFfmpeg();
      } catch {
        throw forgeError;
      }
    }
  }

  try {
    return await transcodeWithLocalFfmpeg();
  } catch (localError) {
    try {
      return await transcodeWithForge();
    } catch {
      throw localError;
    }
  }
}

async function runOpenAiTranscription(args: {
  apiKey: string;
  model: string;
  bytes: Uint8Array;
  contentType: string;
  filename: string;
  timeoutMs: number;
}): Promise<{ provider_request_id: string | null; segments: HammerTranscriptPrepSegment[]; text: string | null }> {
  const form = new FormData();
  form.set("model", args.model);
  form.set("response_format", "diarized_json");
  form.set("chunking_strategy", "auto");
  form.set("file", new Blob([new Uint8Array(args.bytes)], { type: args.contentType }), args.filename);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${args.apiKey}`,
      },
      body: form,
      signal: controller.signal,
    });
    const providerRequestId = response.headers.get("x-request-id");
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new OpenAiTranscriptionError(response.status, detail);
    }
    const payload = (await response.json()) as unknown;
    const segments = normalizeSegments(payload);
    const payloadRow = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {};
    const transcriptText = readTrimmed(payloadRow.text) ?? segments.map((seg) => seg.text).filter(Boolean).join(" ");
    return { provider_request_id: providerRequestId, segments, text: transcriptText || null };
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildLaunchContext(args: {
  workspaceId: string;
  workpieceId: string;
  mediaRef: MediaRef;
}): HammerLaunchContext {
  return {
    workspace_id: args.workspaceId,
    workpiece_id: args.workpieceId,
    source_mode: "tongs",
    transcript: {
      kind: "tongs-stub",
      transcript_id: "transcript_pending",
      segments: [],
      label: "transcript_pending",
    },
    media: {
      kind: "tongs-stub",
      ref: args.mediaRef,
      workspace_mapping: undefined,
      label: args.mediaRef.media_id,
    },
  };
}

async function writeIngestDiagnostics(service: TongsCommitService, job: WorkpieceJobRow, diagnostic: Record<string, unknown>): Promise<void> {
  await service.commitFile(job.workpiece_id, {
    path: "hammer/diagnostics/ingest-last.v1.json",
    content_type: "application/json",
    file_type: "hammer_diagnostics",
    written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
    event_name: "hammer.diagnostics.ingest.saved.v1",
    event_payload: {
      schema_version: 1,
      workspace_id: job.workspace_id,
      workpiece_id: job.workpiece_id,
      job_id: job.id,
      job_type: job.job_type,
    } as Json,
    json: diagnostic as unknown as Json,
    user_access_token: null,
  });
}

async function updateJobProgressPercent(
  service: TongsCommitService,
  jobId: string,
  progressPercent: number,
): Promise<void> {
  const clamped = Math.max(1, Math.min(99, Math.round(progressPercent)));
  await service.supabase
    .schema("tongs")
    .from("workpiece_jobs")
    .update({
      progress_percent: clamped,
      heartbeat_at: new Date().toISOString(),
    } satisfies Partial<Database["tongs"]["Tables"]["workpiece_jobs"]["Update"]>)
    .eq("id", jobId)
    .eq("status", "running");
}

async function runTranscriptJob(deps: RunnerDeps, job: WorkpieceJobRow): Promise<Record<string, unknown>> {
  const payload = readJsonObject(job.payload_json) ?? {};
  const revisionId = readTrimmed(payload.revision_id);
  const canonicalRecordingId = readTrimmed(payload.canonical_recording_id);
  const canonicalWorkpiecePath = readTrimmed(payload.canonical_workpiece_path);
  const refreshPlacements = readBoolean(payload.refresh_visual_placements) ?? (job.job_type === "hammer_transcript_prep");
  const mimeTypeHint = readTrimmed(payload.mime_type);

  if (!revisionId || !canonicalRecordingId) {
    throw new Error("Job payload is missing revision_id or canonical_recording_id.");
  }

  const runtimeConfig = resolveHearthRuntimeConfig();
  const textApiKey = runtimeConfig.textApiKey ?? runtimeConfig.apiKey ?? null;
  if (!textApiKey) {
    throw new Error("Missing OPENAI_TEXT_API_KEY (or OPENAI_API_KEY) in server env.");
  }
  const model = readTrimmed(process.env.HAMMER_TRANSCRIBE_MODEL) ?? "gpt-4o-transcribe-diarize";
  const timeoutMs = Math.max(30_000, Math.min(60 * 60 * 1000, Number(process.env.HAMMER_OPENAI_TRANSCRIBE_TIMEOUT_MS) || 15 * 60 * 1000));

  const { canonical_recording: canonical, revision } = await deps.service.readHammerRecordingRevision(
    job.workspace_id,
    job.workpiece_id,
    revisionId,
    { userId: job.requested_by },
  );

  const sourcePath = canonicalWorkpiecePath ?? canonical.media_path ?? null;
  if (!sourcePath) {
    throw new Error("No canonical_workpiece_path available for transcript job.");
  }
  await updateJobProgressPercent(deps.service, job.id, 5);

  const { bytes, contentType } = await downloadWorkpieceBytes(deps.service.supabase, deps.service.bucket, job.workpiece_id, sourcePath);
  await updateJobProgressPercent(deps.service, job.id, 15);
  const originalContentType = inferContentType(sourcePath, mimeTypeHint ?? contentType);
  const uploadMedia = await prepareTranscriptJobUploadMedia({
    bytes,
    contentType: originalContentType,
    sourcePath,
  });
  await updateJobProgressPercent(deps.service, job.id, 30);

  const beforeSnapshot = await deps.service.supabase
    .schema("tongs")
    .from("hammer_workpiece_state")
    .select("transcript_artifact_path,visual_placement_artifact_path")
    .eq("workspace_id", job.workspace_id)
    .eq("workpiece_id", job.workpiece_id)
    .maybeSingle();
  const transcriptArtifactPathBefore = beforeSnapshot.data?.transcript_artifact_path ?? null;
  const visualPlacementsPathBefore = beforeSnapshot.data?.visual_placement_artifact_path ?? null;

  const segmentCountBefore = await (async (): Promise<number | null> => {
    if (!transcriptArtifactPathBefore) return null;
    const read = await deps.service.readWorkpieceJson(job.workpiece_id, transcriptArtifactPathBefore);
    const root = read.found ? read.data : null;
    const segments = readJsonObject(root)?.segments;
    return Array.isArray(segments) ? segments.length : null;
  })();

  const { placementCountBefore, uncertainCountBefore } = await (async (): Promise<{ placementCountBefore: number | null; uncertainCountBefore: number | null }> => {
    if (!visualPlacementsPathBefore) return { placementCountBefore: null, uncertainCountBefore: null };
    const read = await deps.service.readWorkpieceJson(job.workpiece_id, visualPlacementsPathBefore);
    const placements = read.found ? readJsonObject(read.data)?.placements : null;
    if (!Array.isArray(placements)) return { placementCountBefore: null, uncertainCountBefore: null };
    const placementCount = placements.length;
    let count = 0;
    for (const placement of placements) {
      const row = readJsonObject(placement);
      if (row?.status === "uncertain") count += 1;
    }
    return { placementCountBefore: placementCount, uncertainCountBefore: count };
  })();

  const directAcceptableForOpenAi = !originalContentType.toLowerCase().startsWith("video/")
    && bytes.byteLength <= MAX_OPENAI_TRANSCRIBE_UPLOAD_BYTES;
  let selectedUploadMedia = uploadMedia;
  let openAiResult: Awaited<ReturnType<typeof runOpenAiTranscription>>;
  let fallbackAttempted = false;
  try {
    const firstCandidate = directAcceptableForOpenAi
      ? {
          bytes,
          contentType: originalContentType,
          filename: path.basename(sourcePath) || "source-media",
          transcodeBackend: "direct_source" as const,
          ffmpegRequestId: null,
          outputFormat: null,
          outputSampleRate: null,
          outputChannels: null,
        }
      : uploadMedia;
    selectedUploadMedia = firstCandidate;
    openAiResult = await runOpenAiTranscription({
      apiKey: textApiKey,
      model,
      bytes: firstCandidate.bytes,
      contentType: firstCandidate.contentType,
      filename: firstCandidate.filename,
      timeoutMs,
    });
  } catch (error) {
    const shouldFallbackToTranscode = error instanceof OpenAiTranscriptionError
      && directAcceptableForOpenAi
      && isLikelyUnsupportedAudioUpload(error.status, error.detail);
    if (!shouldFallbackToTranscode) throw error;
    fallbackAttempted = true;
    const fallbackUploadMedia = await prepareTranscriptJobUploadMedia({
      bytes,
      contentType: originalContentType,
      sourcePath,
      forceTranscode: true,
    });
    if (fallbackUploadMedia.contentType === "audio/wav") {
      assertValidWavHeader(fallbackUploadMedia.bytes);
    }
    selectedUploadMedia = fallbackUploadMedia;
    try {
      openAiResult = await runOpenAiTranscription({
        apiKey: textApiKey,
        model,
        bytes: fallbackUploadMedia.bytes,
        contentType: fallbackUploadMedia.contentType,
        filename: fallbackUploadMedia.filename,
        timeoutMs,
      });
    } catch (fallbackError) {
      if (fallbackError instanceof OpenAiTranscriptionError) {
        throw new Error(
          `OpenAI transcription failed after fallback transcode (${fallbackError.status}): ${fallbackError.detail.slice(0, 240)}`,
        );
      }
      throw fallbackError;
    }
  }
  await updateJobProgressPercent(deps.service, job.id, 70);

  const mediaRef: MediaRef = {
    media_id: canonical.media_id ?? `kept-take:${job.workpiece_id}`,
    kind: inferMediaKindFromPath(sourcePath),
    local_relpath: sourcePath,
    duration_ms: canonical.media_duration_ms ?? undefined,
    byte_size: canonical.media_bytes ?? undefined,
  };

  const launchContext = buildLaunchContext({
    workspaceId: job.workspace_id,
    workpieceId: job.workpiece_id,
    mediaRef,
  });

  const prepared = buildPreparedTranscript(launchContext, {
    provider: "openai",
    model,
    provider_request_id: openAiResult.provider_request_id,
    text: openAiResult.text,
    segments: openAiResult.segments,
  });
  await updateJobProgressPercent(deps.service, job.id, 78);

  const nextLaunchContext = applyPreparedTranscriptToLaunchContext(launchContext, prepared);

  // Best-effort seal (only if unsealed).
  if (!canonical.sealed_at) {
    try {
      await deps.service.sealHammerCanonicalBaseline(
        job.workspace_id,
        job.workpiece_id,
        canonicalRecordingId,
        {
          written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
          structured_transcript: { data: prepared.structuredTranscript },
          speaker_map: { data: prepared.speakerMap },
        },
        { userId: job.requested_by },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("already sealed")) {
        // ignore seal races / non-fatal failures
      }
    }
  }

  let placementsRefreshed = false;
  let placementsData: HammerPersistedVisualPlacements | null = null;
  if (refreshPlacements) {
    try {
      const visualPackage = await deps.service.getWorkpieceVisualPackage(job.workpiece_id, { userId: job.requested_by });
      placementsData = deriveHammerVisualPlacements({
        transcriptSourceId: prepared.transcriptId,
        transcriptSegments: prepared.turns,
        visualPackage,
      });
      placementsRefreshed = true;
    } catch (error) {
      placementsData = buildUnavailableHammerVisualPlacements(
        prepared.transcriptId,
        error instanceof Error ? `visual_package_unavailable:${error.message}` : "visual_package_unavailable",
      );
      placementsRefreshed = false;
    }
  }
  await updateJobProgressPercent(deps.service, job.id, 86);

  const persistenceRequest = buildHammerPrepPersistenceSaveRequest({
    launchContext: nextLaunchContext,
    status: "prepared",
    preparedTranscript: prepared,
    ...(placementsData ? { visualPlacements: placementsData } : {}),
  });

  // Save revision pointers.
  await deps.service.saveHammerRecordingRevision(
    job.workspace_id,
    job.workpiece_id,
    revision.id,
    {
      written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
      editor_session: persistenceRequest.editor_session,
      revision_transcript: { data: prepared.structuredTranscript },
      ...(placementsData ? { visual_placements: { data: placementsData } } : {}),
    },
    { userId: job.requested_by },
  );
  await updateJobProgressPercent(deps.service, job.id, 93);

  // Promote prepared transcript to workpiece-level pointer.
  await deps.service.saveHammerWorkpieceState(
    job.workspace_id,
    job.workpiece_id,
    persistenceRequest,
    { userId: job.requested_by },
  );
  await updateJobProgressPercent(deps.service, job.id, 97);

  const placementCountAfter = placementsRefreshed && placementsData?.placements && Array.isArray(placementsData.placements)
    ? placementsData.placements.length
    : null;
  const uncertainCountAfter = placementsRefreshed && placementsData?.placements && Array.isArray(placementsData.placements)
    ? placementsData.placements.reduce((count, placement) => count + (placement.status === "uncertain" ? 1 : 0), 0)
    : null;

  const result = {
    finished_at: new Date().toISOString(),
    segment_count_before: segmentCountBefore,
    segment_count_after: prepared.turns.length,
    placements_refreshed: placementsRefreshed,
    placement_count_before: placementCountBefore,
    placement_count_after: placementCountAfter,
    uncertain_count_before: uncertainCountBefore,
    uncertain_count_after: uncertainCountAfter,
    transcript_id: prepared.transcriptId,
    provider_request_id: openAiResult.provider_request_id,
    transcode_backend: selectedUploadMedia.transcodeBackend,
    ffmpeg_request_id: selectedUploadMedia.ffmpegRequestId,
    transcript_upload_bytes: selectedUploadMedia.bytes.byteLength,
  };

  await writeIngestDiagnostics(deps.service, job, {
    timestamp: new Date().toISOString(),
    selected_source: "prepared_transcript",
    final_status: "prepared_transcript",
    segment_count: prepared.turns.length,
    prep: {
      client_request_id: payload.client_request_id ?? null,
      provider_request_id: openAiResult.provider_request_id,
      model,
      provider: "openai",
      fallback_attempted: fallbackAttempted,
      original_source_content_type: originalContentType,
      original_source_bytes: bytes.byteLength,
      direct_acceptable_for_openai: directAcceptableForOpenAi,
      transcode_backend: selectedUploadMedia.transcodeBackend,
      ffmpeg_request_id: selectedUploadMedia.ffmpegRequestId,
      upload_bytes: selectedUploadMedia.bytes.byteLength,
      output_format: selectedUploadMedia.outputFormat,
      output_sample_rate: selectedUploadMedia.outputSampleRate,
      output_channels: selectedUploadMedia.outputChannels,
    },
    seal_outcome: canonical.sealed_at ? "skipped_already_sealed" : "attempted",
    placements_refreshed: placementsRefreshed,
    ...(typeof result.uncertain_count_after === "number" ? { uncertain_after: result.uncertain_count_after } : {}),
  });

  return result;
}

async function claimNextQueuedJob(service: TongsCommitService, runnerId: string): Promise<WorkpieceJobRow | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await service.supabase
    .schema("tongs")
    .from("workpiece_jobs")
    .select("*")
    .eq("status", "queued")
    .or(`lease_expires_at.is.null,lease_expires_at.lt.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) {
    return null;
  }
  const job = Array.isArray(data) ? (data[0] as WorkpieceJobRow | undefined) : undefined;
  if (!job) return null;

  const leaseExpiresAt = new Date(Date.now() + 2 * 60_000).toISOString();
  const update = await service.supabase
    .schema("tongs")
    .from("workpiece_jobs")
    .update({
      status: "running",
      runner_id: runnerId,
      lease_expires_at: leaseExpiresAt,
      heartbeat_at: nowIso,
      started_at: job.started_at ?? nowIso,
      attempt_count: (job.attempt_count ?? 0) + 1,
      progress_percent: 1,
    } satisfies Partial<Database["tongs"]["Tables"]["workpiece_jobs"]["Update"]>)
    .eq("id", job.id)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();
  if (update.error || !update.data) return null;
  return update.data as WorkpieceJobRow;
}

async function finalizeJob(
  service: TongsCommitService,
  jobId: string,
  patch: Partial<Database["tongs"]["Tables"]["workpiece_jobs"]["Update"]>,
): Promise<void> {
  await service.supabase
    .schema("tongs")
    .from("workpiece_jobs")
    .update(patch)
    .eq("id", jobId);
}

async function tickRunner(deps: RunnerDeps, state: RunnerState): Promise<void> {
  if (state.inFlight) return;
  state.inFlight = true;
  try {
    const job = await claimNextQueuedJob(deps.service, state.runnerId);
    if (!job) return;

    try {
      const result = job.job_type === "hammer_transcript_prep" || job.job_type === "hammer_transcript_regeneration"
        ? await runTranscriptJob(deps, job)
        : (() => {
          throw new Error(`Unsupported job_type: ${job.job_type}`);
        })();

      console.info("[workpiece-job-runner] job completed", {
        job_id: job.id,
        job_type: job.job_type,
        workspace_id: job.workspace_id,
        workpiece_id: job.workpiece_id,
      });
      await finalizeJob(deps.service, job.id, {
        status: "completed",
        completed_at: new Date().toISOString(),
        lease_expires_at: null,
        heartbeat_at: new Date().toISOString(),
        progress_percent: 100,
        result_json: result as unknown as Json,
        error_code: null,
        error_message: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[workpiece-job-runner] job failed", {
        job_id: job.id,
        job_type: job.job_type,
        workspace_id: job.workspace_id,
        workpiece_id: job.workpiece_id,
        message,
      });
      await writeIngestDiagnostics(deps.service, job, {
        timestamp: new Date().toISOString(),
        selected_source: job.job_type === "hammer_transcript_regeneration" ? "ai_regeneration" : "prepared_transcript",
        final_status: "blocked",
        prep: {
          client_request_id: readJsonObject(job.payload_json)?.client_request_id ?? null,
          provider: "openai",
          status: "failed",
          error_message: message,
        },
      }).catch(() => undefined);
      await finalizeJob(deps.service, job.id, {
        status: "failed",
        completed_at: new Date().toISOString(),
        lease_expires_at: null,
        heartbeat_at: new Date().toISOString(),
        progress_percent: null,
        error_code: "JOB_FAILED",
        error_message: message,
      });
    }
  } finally {
    state.inFlight = false;
  }
}

export function ensureWorkpieceJobRunnerStarted(deps: RunnerDeps): void {
  type RunnerGlobal = typeof globalThis & { __forge_workpiece_job_runner__?: RunnerState };
  const globalAny = globalThis as RunnerGlobal;
  const existing = globalAny.__forge_workpiece_job_runner__;
  if (existing?.intervalId) return;

  const runnerState: RunnerState = {
    runnerId: `nursery:${process.pid}:${crypto.randomUUID()}`,
    intervalId: null,
    inFlight: false,
  };
  globalAny.__forge_workpiece_job_runner__ = runnerState;

  console.info("[workpiece-job-runner] started", { runner_id: runnerState.runnerId });
  runnerState.intervalId = setInterval(() => {
    void tickRunner(deps, runnerState);
  }, 1500);
  void tickRunner(deps, runnerState);
}
