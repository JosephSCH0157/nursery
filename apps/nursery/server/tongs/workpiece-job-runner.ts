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
  buildHammerForgeFfmpegRequestHeaders,
  readHammerForgeFfmpegClientConfig,
  transcodeToWorkingWavWithForgeFfmpeg,
} from "../../scripts/hammer-forge-ffmpeg-client";
import { configuredOpenAiTranscriptionMode } from "../../../../packages/tongs/src/providers/openai-transcription-paid-boundary";
import { normalizeOpenAiTextPaidExecutionHandle } from "../../../../packages/tongs/src/providers/paid-openai-text-route-execution";
import {
  readOpenAiTranscriptionUsage,
} from "../../../../packages/tongs/src/providers/paid-openai-transcription-route-execution";
import { OpenAiTextPostPersistenceContinuationError } from "../../../../packages/tongs/src/providers/paid-openai-text-execution-coordinator";

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
const NEAR_SILENT_RMS_DBFS_THRESHOLD = -52;
const MIN_USABLE_AUDIO_DURATION_SEC = 0.35;

async function runFinalVideoRenderJob(deps: RunnerDeps, job: WorkpieceJobRow): Promise<Record<string, unknown>> {
  const payload = readJsonObject(job.payload_json);
  if (!payload) throw new Error("Final video render payload is missing.");
  const required = (key: string): string => {
    const value = readTrimmed(payload[key]);
    if (!value) throw new Error(`Final video render payload is missing ${key}.`);
    return value;
  };
  const operationId = required("operation_id");
  const operationFingerprint = required("operation_fingerprint");
  const recordingRevisionId = required("recording_revision_id");
  const compositionFingerprint = required("composition_fingerprint");
  const renderPlanFingerprint = required("render_plan_fingerprint");
  const audioMasterAssetId = required("audio_master_asset_id");
  const rendererVersion = required("renderer_version");
  const outputProfileId = required("output_profile_id");
  const compositionRevision = Number(payload.composition_revision);
  const backgroundEffectFingerprint = readTrimmed(payload.background_effect_fingerprint);
  const replacementAssetId = readTrimmed(payload.replacement_asset_id);
  const segmentationAuthority = readJsonObject(payload.segmentation_authority);
  const effectPlan = readJsonObject(payload.background_effect_plan);
  if (!Number.isInteger(compositionRevision) || compositionRevision <= 0 || !effectPlan || !segmentationAuthority) throw new Error("Final video render authority is invalid.");
  const rpc = deps.service.supabase.schema("tongs") as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string } | null }> };
  const begun = await rpc.rpc("begin_hammer_video_render", { p_operation_id: operationId, p_operation_fingerprint: operationFingerprint, p_workspace_id: job.workspace_id, p_workpiece_id: job.workpiece_id, p_recording_revision_id: recordingRevisionId, p_composition_revision: compositionRevision, p_composition_fingerprint: compositionFingerprint, p_render_plan_fingerprint: renderPlanFingerprint, p_background_effect_fingerprint: backgroundEffectFingerprint, p_audio_master_asset_id: audioMasterAssetId, p_replacement_asset_id: replacementAssetId, p_renderer_version: rendererVersion, p_output_profile_id: outputProfileId, p_segmentation_authority: segmentationAuthority, p_actor_id: job.requested_by });
  if (begun.error) throw new Error(begun.error.message ?? "Final video render reservation failed.");
  const reserved = await rpc.rpc("reserve_hammer_video_render_attempt", { p_operation_id: operationId, p_operation_fingerprint: operationFingerprint, p_lease_owner: job.runner_id ?? "workpiece-job-runner", p_lease_seconds: 1800 });
  if (reserved.error) throw new Error(reserved.error.message ?? "Final video render attempt reservation failed.");
  const reservedRow = readJsonObject(reserved.data); const attempt = readJsonObject(reservedRow?.attempt); const attemptId = readTrimmed(attempt?.attempt_id);
  if (!attemptId) throw new Error("Final video render attempt returned no identity.");
  let possibleExternalCommit = false;
  const heartbeat = setInterval(() => {
    void updateJobProgressPercent(deps.service, job.id, 45).catch(() => undefined);
  }, 60_000);
  try {
    const revisionResult = await deps.service.supabase.schema("tongs").from("recording_revisions")
      .select("canonical_recording_id").eq("id", recordingRevisionId).eq("workspace_id", job.workspace_id).eq("workpiece_id", job.workpiece_id).maybeSingle();
    if (revisionResult.error || !revisionResult.data) throw new Error("Canonical recording revision could not be resolved.");
    const recordingResult = await deps.service.supabase.schema("tongs").from("canonical_recordings")
      .select("media_path").eq("id", revisionResult.data.canonical_recording_id).eq("workspace_id", job.workspace_id).eq("workpiece_id", job.workpiece_id).maybeSingle();
    if (recordingResult.error || !recordingResult.data?.media_path) throw new Error("Canonical recording source could not be resolved.");
    const audioAsset = await resolveReadyWorkpieceAssetStorage(deps.service.supabase, job.workspace_id, job.workpiece_id, audioMasterAssetId, "hammer_audio_master");
    const replacementAsset = replacementAssetId
      ? await resolveReadyWorkpieceAssetStorage(deps.service.supabase, job.workspace_id, job.workpiece_id, replacementAssetId, null, "image/")
      : null;
    const [source, audio, replacement] = await Promise.all([
      downloadWorkpieceBytes(deps.service.supabase, "forge-workpieces", job.workpiece_id, recordingResult.data.media_path),
      downloadAssetStorageBytes(deps.service.supabase, audioAsset.storage_bucket, audioAsset.storage_key),
      replacementAsset ? downloadAssetStorageBytes(deps.service.supabase, replacementAsset.storage_bucket, replacementAsset.storage_key) : Promise.resolve(null),
    ]);
    const client = readHammerForgeFfmpegClientConfig();
    if (!client) throw new Error("Forge media runtime is not configured for final video rendering.");
    const response = await fetch(`${client.baseUrl}/render/background-effect`, { method: "POST", headers: buildHammerForgeFfmpegRequestHeaders(client, { "content-type": "application/json" }), body: JSON.stringify({ source_base64: Buffer.from(source.bytes).toString("base64"), audio_master_base64: Buffer.from(audio).toString("base64"), replacement_asset_base64: replacement ? Buffer.from(replacement).toString("base64") : undefined, plan: effectPlan }), signal: AbortSignal.timeout(Math.max(client.timeoutMs, 30 * 60_000)) });
    if (!response.ok) throw new Error(`Forge final video render failed (${response.status}).`);
    const output = Buffer.from(await response.arrayBuffer());
    const encodedEvidence = response.headers.get("x-forge-render-evidence");
    const evidence = encodedEvidence ? readJsonObject(JSON.parse(Buffer.from(encodedEvidence, "base64url").toString("utf8"))) : null;
    if (!evidence) throw new Error("Forge final video render returned no verified evidence.");
    const fps = Number(evidence.fps); const frameCount = Number(evidence.frame_count); const width = Number(evidence.width); const height = Number(evidence.height);
    if (!(fps > 0 && frameCount > 0 && width > 0 && height > 0)) throw new Error("Forge final video render evidence is invalid.");
    const contentHash = crypto.createHash("sha256").update(output).digest("hex");
    const outputPath = `hammer/renders/video/${operationId}.mp4`; const storageKey = `workpieces/${job.workpiece_id}/${outputPath}`;
    const uploaded = await deps.service.supabase.storage.from("forge-workpieces").upload(storageKey, output, { contentType: "video/mp4", upsert: false });
    if (uploaded.error && !/already exists/i.test(uploaded.error.message)) throw new Error(uploaded.error.message);
    possibleExternalCommit = true;
    const acknowledged = crypto.createHash("sha256").update(JSON.stringify({ operation_id: operationId, asset_hash: contentHash, render_plan_fingerprint: renderPlanFingerprint })).digest("hex");
    const committed = await rpc.rpc("commit_hammer_video_master", { p_operation_id: operationId, p_operation_fingerprint: operationFingerprint, p_attempt_id: attemptId, p_path: outputPath, p_mime_type: "video/mp4", p_byte_size: output.byteLength, p_content_hash: contentHash, p_storage_bucket: "forge-workpieces", p_storage_key: storageKey, p_duration_ms: Math.round(frameCount * 1000 / fps), p_width: width, p_height: height, p_fps: fps, p_render_evidence: { ...evidence, recording_revision_id: recordingRevisionId, audio_master_asset_id: audioMasterAssetId, replacement_asset_id: replacementAssetId }, p_acknowledged_result_fingerprint: acknowledged });
    if (committed.error) throw new Error(committed.error.message ?? "Final video master commit failed.");
    return { operation_id: operationId, attempt_id: attemptId, content_hash: contentHash, receipt: committed.data };
  } catch (error) {
    await rpc.rpc("fail_hammer_video_render", { p_operation_id: operationId, p_operation_fingerprint: operationFingerprint, p_attempt_id: attemptId, p_failure_code: "final_video_render_failed", p_failure_message: error instanceof Error ? error.message : "Final video render failed.", p_outcome_unknown: possibleExternalCommit });
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}

async function resolveReadyWorkpieceAssetStorage(
  supabase: SupabaseClient<Database>, workspaceId: string, workpieceId: string, assetId: string,
  assetKind: string | null, mimePrefix?: string,
): Promise<{ storage_bucket: string; storage_key: string }> {
  let query = supabase.schema("tongs").from("assets").select("storage_bucket,storage_key,mime_type,asset_kind,status")
    .eq("id", assetId).eq("workspace_id", workspaceId).eq("workpiece_id", workpieceId).eq("status", "ready");
  if (assetKind) query = query.eq("asset_kind", assetKind);
  const result = await query.maybeSingle();
  if (result.error || !result.data || (mimePrefix && !result.data.mime_type.startsWith(mimePrefix))) throw new Error("Canonical render asset relationship mismatch.");
  return { storage_bucket: result.data.storage_bucket, storage_key: result.data.storage_key };
}

async function downloadAssetStorageBytes(supabase: SupabaseClient<Database>, bucket: string, storageKey: string): Promise<Uint8Array> {
  const result = await supabase.storage.from(bucket).download(storageKey);
  if (result.error || !result.data) throw new Error("Canonical render asset bytes could not be downloaded.");
  return new Uint8Array(await result.data.arrayBuffer());
}

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

class OpenAiTranscriptionSubmissionUnknownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAiTranscriptionSubmissionUnknownError";
  }
}

type TranscriptAudioProbeDiagnostic = {
  canonical_media_path: string;
  byte_size: number;
  mime: string;
  extension: string;
  hasAudioStream: boolean;
  audioCodec: string | null;
  channels: number | null;
  sampleRate: number | null;
  durationSec: number | null;
  nearSilent: boolean | null;
  rmsDbfs: number | null;
};

class TranscriptAudioPreflightError extends Error {
  diagnostic: TranscriptAudioProbeDiagnostic;
  constructor(message: string, diagnostic: TranscriptAudioProbeDiagnostic) {
    super(message);
    this.name = "TranscriptAudioPreflightError";
    this.diagnostic = diagnostic;
  }
}

function analyzeWavSignal(bytes: Uint8Array): {
  channels: number | null;
  sampleRate: number | null;
  durationSec: number | null;
  rmsDbfs: number | null;
  nearSilent: boolean | null;
} {
  try {
    if (bytes.byteLength < 44) {
      return { channels: null, sampleRate: null, durationSec: null, rmsDbfs: null, nearSilent: null };
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const channels = view.getUint16(22, true);
    const sampleRate = view.getUint32(24, true);
    const bitsPerSample = view.getUint16(34, true);
    if (!channels || !sampleRate || bitsPerSample !== 16) {
      return { channels: channels || null, sampleRate: sampleRate || null, durationSec: null, rmsDbfs: null, nearSilent: null };
    }
    const dataBytes = Math.max(0, bytes.byteLength - 44);
    const sampleCount = Math.floor(dataBytes / 2);
    if (sampleCount <= 0) {
      return { channels, sampleRate, durationSec: 0, rmsDbfs: -120, nearSilent: true };
    }
    let energy = 0;
    for (let i = 44; i + 1 < bytes.byteLength; i += 2) {
      const sample = view.getInt16(i, true) / 32768;
      energy += sample * sample;
    }
    const rms = Math.sqrt(energy / sampleCount);
    const rmsDbfs = rms > 0 ? 20 * Math.log10(rms) : -120;
    const durationSec = sampleCount / (sampleRate * channels);
    const nearSilent = durationSec >= MIN_USABLE_AUDIO_DURATION_SEC && rmsDbfs <= NEAR_SILENT_RMS_DBFS_THRESHOLD;
    return { channels, sampleRate, durationSec, rmsDbfs, nearSilent };
  } catch {
    return { channels: null, sampleRate: null, durationSec: null, rmsDbfs: null, nearSilent: null };
  }
}

function isLikelyNoAudioStreamError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("contains no stream")
    || lower.includes("stream map")
    || lower.includes("no audio")
    || lower.includes("audio stream");
}

async function runTranscriptRegenerationAudioPreflight(args: {
  sourcePath: string;
  originalContentType: string;
  sourceBytes: Uint8Array;
}): Promise<TranscriptAudioProbeDiagnostic> {
  const extension = path.extname(args.sourcePath).toLowerCase();
  const baseDiagnostic: TranscriptAudioProbeDiagnostic = {
    canonical_media_path: args.sourcePath,
    byte_size: args.sourceBytes.byteLength,
    mime: args.originalContentType,
    extension,
    hasAudioStream: false,
    audioCodec: null,
    channels: null,
    sampleRate: null,
    durationSec: null,
    nearSilent: null,
    rmsDbfs: null,
  };

  try {
    const preflightMedia = await prepareTranscriptJobUploadMedia({
      bytes: args.sourceBytes,
      contentType: args.originalContentType,
      sourcePath: args.sourcePath,
      forceTranscode: true,
    });
    if (preflightMedia.contentType !== "audio/wav") {
      return {
        ...baseDiagnostic,
        hasAudioStream: true,
      };
    }
    assertValidWavHeader(preflightMedia.bytes);
    const wav = analyzeWavSignal(preflightMedia.bytes);
    return {
      ...baseDiagnostic,
      hasAudioStream: (wav.channels ?? 0) > 0 && (wav.sampleRate ?? 0) > 0 && (wav.durationSec ?? 0) > 0,
      audioCodec: "pcm_s16le",
      channels: wav.channels,
      sampleRate: wav.sampleRate,
      durationSec: wav.durationSec,
      nearSilent: wav.nearSilent,
      rmsDbfs: wav.rmsDbfs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isLikelyNoAudioStreamError(message)) {
      return baseDiagnostic;
    }
    throw error;
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
}): Promise<{ provider_request_id: string | null; segments: HammerTranscriptPrepSegment[]; text: string | null; usage: ReturnType<typeof readOpenAiTranscriptionUsage> }> {
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
    return { provider_request_id: providerRequestId, segments, text: transcriptText || null, usage: readOpenAiTranscriptionUsage(payload) };
  } catch (error) {
    if (error instanceof OpenAiTranscriptionError) throw error;
    throw new OpenAiTranscriptionSubmissionUnknownError(error instanceof Error ? error.message : String(error));
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
  let model = readTrimmed(process.env.HAMMER_TRANSCRIBE_MODEL) ?? "gpt-4o-transcribe-diarize";
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
  const transcriptionMode = configuredOpenAiTranscriptionMode();
  const paidExecution = normalizeOpenAiTextPaidExecutionHandle(payload.paid_execution);
  const transcriptionAuthority = readJsonObject(payload.transcription_authority);
  const routeCode = job.job_type === "hammer_transcript_regeneration"
    ? "hammer.transcript_regeneration"
    : "hammer.transcript_prep";
  const financialGate = deps.service.supabase.schema("tongs") as unknown as {
    rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string } | null }>;
  };
  let paidContext: Record<string, unknown> | null = null;
  if (transcriptionMode === "halt_new") throw new Error("paid_submissions_halted");
  if (transcriptionMode === "enforce") {
    if (!paidExecution || !transcriptionAuthority) throw new Error("transcription_funding_context_required");
    if (readTrimmed(transcriptionAuthority.route_code) !== routeCode
      || readTrimmed(transcriptionAuthority.source_asset_revision) !== revisionId
      || readTrimmed(transcriptionAuthority.output_contract) !== "forge.hammer.diarized-transcript.v1") {
      throw new Error("transcription_source_authority_mismatch");
    }
    const resolved = await financialGate.rpc("resolve_openai_text_paid_execution_context", {
      p_route_code: routeCode,
      p_operation_id: paidExecution.operationId,
      p_reservation_id: paidExecution.reservationId,
      p_user_id: job.requested_by,
      p_workspace_id: job.workspace_id,
      p_workpiece_id: job.workpiece_id,
      p_request_fingerprint: paidExecution.requestFingerprint,
    });
    if (resolved.error || !readJsonObject(resolved.data)) throw new Error(resolved.error?.message ?? "transcription_funding_context_required");
    paidContext = readJsonObject(resolved.data);
    if (paidContext?.credential_funding !== "forge") throw new Error("background_byo_credential_not_supported");
    model = readTrimmed(paidContext?.model) ?? model;
    const admission = await financialGate.rpc("acquire_openai_text_aggregate_admission", {
      p_reservation_id: paidExecution.reservationId,
      p_caller_class: "background",
      p_provider_mode: "real",
    });
    const admissionRow = readJsonObject(admission.data);
    if (admission.error || admissionRow?.authorized !== true || admissionRow.enforcement_enabled !== true || !admissionRow.hold_id) {
      await financialGate.rpc("release_operation", {
        p_reservation_id: paidExecution.reservationId,
        p_release_key: `${paidExecution.operationId}:aggregate-admission-denied`,
        p_reason: readTrimmed(admissionRow?.reason) ?? "aggregate_admission_denied",
        p_evidence_json: { provider: "openai", route_code: routeCode, transmitted: false },
      });
      throw new Error(admission.error?.message ?? "aggregate_admission_denied");
    }
  }
  await updateJobProgressPercent(deps.service, job.id, 5);

  const { bytes, contentType } = await downloadWorkpieceBytes(deps.service.supabase, deps.service.bucket, job.workpiece_id, sourcePath);
  if (transcriptionMode === "enforce" && Number(transcriptionAuthority?.source_bytes) !== bytes.byteLength) {
    throw new Error("transcription_source_size_changed_after_acceptance");
  }
  if (transcriptionMode === "enforce"
    && readTrimmed(transcriptionAuthority?.source_sha256) !== crypto.createHash("sha256").update(bytes).digest("hex")) {
    throw new Error("transcription_source_hash_changed_after_acceptance");
  }
  await updateJobProgressPercent(deps.service, job.id, 15);
  const originalContentType = inferContentType(sourcePath, mimeTypeHint ?? contentType);
  if (transcriptionMode === "enforce" && (bytes.byteLength > MAX_OPENAI_TRANSCRIBE_UPLOAD_BYTES
    || originalContentType.startsWith("video/"))) throw new Error("supporting_cost_not_authorized");
  if (job.job_type === "hammer_transcript_regeneration") {
    const audioProbe = await runTranscriptRegenerationAudioPreflight({
      sourcePath,
      originalContentType,
      sourceBytes: bytes,
    });
    if (!audioProbe.hasAudioStream) {
      throw new TranscriptAudioPreflightError(
        "The selected canonical recording has no usable audio, so transcript regeneration cannot run.",
        audioProbe,
      );
    }
    if (audioProbe.nearSilent === true) {
      throw new TranscriptAudioPreflightError(
        "The selected canonical recording has no usable audio, so transcript regeneration cannot run.",
        audioProbe,
      );
    }
  }
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

  const directAcceptableForOpenAi = bytes.byteLength <= MAX_OPENAI_TRANSCRIBE_UPLOAD_BYTES;
  let selectedUploadMedia = uploadMedia;
  let openAiResult: Awaited<ReturnType<typeof runOpenAiTranscription>>;
  let fallbackAttempted = false;
  const attemptKey = `${paidExecution?.operationId ?? job.id}:attempt:1`;
  if (transcriptionMode === "enforce" && paidExecution && paidContext) {
    const authorized = await financialGate.rpc("authorize_openai_text_provider_attempt_with_aggregate", {
      p_reservation_id: paidExecution.reservationId,
      p_attempt_key: attemptKey,
      p_attempt_number: 1,
      p_caller_class: "background",
      p_failure_exposure_micros: Number(paidContext.maximum_failure_exposure_micros),
      p_lease_seconds: 900,
      p_evidence_json: { provider: "openai", route_code: routeCode, model, job_id: job.id },
    });
    const authorizedRow = readJsonObject(authorized.data);
    if (authorized.error || authorizedRow?.provider_execution_authorized !== true) {
      throw new Error(authorized.error?.message ?? "transcription_provider_attempt_not_authorized");
    }
  }
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
    const shouldFallbackToTranscode = transcriptionMode !== "enforce"
      && error instanceof OpenAiTranscriptionError
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
  let estimatedSupplierCostMicros: number | null = null;
  const supportingCostMicros = transcriptionMode === "enforce" ? Number(paidContext?.supporting_cost_ceiling_micros) : 0;
  if (transcriptionMode === "enforce" && paidExecution && paidContext) {
    const audioRate = Number(paidContext.audio_input_micros_per_million_tokens ?? paidContext.input_micros_per_million_tokens);
    const textRate = Number(paidContext.text_input_micros_per_million_tokens ?? paidContext.input_micros_per_million_tokens);
    const outputRate = Number(paidContext.output_micros_per_million_tokens);
    if (openAiResult.usage.providerReported && [audioRate, textRate, outputRate].every(Number.isSafeInteger)) {
      estimatedSupplierCostMicros = Math.ceil((
        openAiResult.usage.audioInputTokens * audioRate
        + openAiResult.usage.textInputTokens * textRate
        + openAiResult.usage.outputTokens * outputRate
      ) / 1_000_000);
    }
    const captured = await financialGate.rpc("record_openai_text_provider_capture", {
      p_capture_id: crypto.randomUUID(), p_reservation_id: paidExecution.reservationId,
      p_capture_key: `${attemptKey}:provider-capture`, p_provider_request_id: openAiResult.provider_request_id,
      p_attempt_number: 1, p_input_units: openAiResult.usage.audioInputTokens + openAiResult.usage.textInputTokens,
      p_output_units: openAiResult.usage.outputTokens,
      p_response_evidence_json: { operation_kind: "audio_transcription", route_code: routeCode, audio_input_tokens: openAiResult.usage.audioInputTokens, text_input_tokens: openAiResult.usage.textInputTokens, output_tokens: openAiResult.usage.outputTokens, provider_reported_usage: openAiResult.usage.providerReported },
    });
    if (captured.error) throw new Error(captured.error.message ?? "transcription_provider_capture_failed");
    const expensed = await financialGate.rpc("record_openai_text_supplier_attempt_expense", {
      p_reservation_id: paidExecution.reservationId, p_attempt_key: attemptKey, p_attempt_number: 1,
      p_provider_reference: openAiResult.provider_request_id, p_amount_micros: estimatedSupplierCostMicros,
      p_evidence_status: estimatedSupplierCostMicros == null ? "unresolved" : "estimated",
      p_evidence_json: { operation_kind: "audio_transcription", route_code: routeCode, authoritative: false },
    });
    if (expensed.error) throw new Error(expensed.error.message ?? "transcription_supplier_expense_capture_failed");
    if (estimatedSupplierCostMicros != null && estimatedSupplierCostMicros > Number(paidContext.direct_provider_ceiling_micros)) {
      throw new Error("transcription_provider_cost_exceeded_accepted_ceiling");
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

  if (transcriptionMode === "enforce" && paidExecution) {
    try {
      const usageRecorded = await financialGate.rpc("record_openai_text_usage", {
      p_evidence_id: crypto.randomUUID(), p_reservation_id: paidExecution.reservationId,
      p_evidence_key: `${attemptKey}:usage`, p_provider_request_id: openAiResult.provider_request_id,
      p_attempt_number: 1, p_input_units: openAiResult.usage.audioInputTokens + openAiResult.usage.textInputTokens,
      p_output_units: openAiResult.usage.outputTokens, p_provider_reported: openAiResult.usage.providerReported,
      p_result_validated: true, p_canonical_persistence_confirmed: true,
      p_evidence_json: { operation_kind: "audio_transcription", route_code: routeCode, job_id: job.id },
    });
      if (usageRecorded.error) throw new Error(usageRecorded.error.message ?? "transcription_usage_record_failed");
      const fulfillmentCost = estimatedSupplierCostMicros == null
        ? supportingCostMicros
        : estimatedSupplierCostMicros + supportingCostMicros;
      const closed = await financialGate.rpc("close_openai_text_failure_exposure", {
      p_reservation_id: paidExecution.reservationId, p_attempt_key: attemptKey,
      p_outcome: "success_released", p_actual_supplier_cost_micros: estimatedSupplierCostMicros,
      p_evidence_json: { operation_kind: "audio_transcription", route_code: routeCode, authoritative: false },
    });
      if (closed.error) throw new Error(closed.error.message ?? "transcription_attempt_close_failed");
      const settled = await financialGate.rpc("settle_operation", {
      p_reservation_id: paidExecution.reservationId,
      p_settlement_id: crypto.createHash("sha256").update(`${paidExecution.operationId}:settlement`).digest("hex").slice(0, 8) + "-0000-4000-8000-" + crypto.createHash("sha256").update(`${paidExecution.operationId}:settlement`).digest("hex").slice(12, 24),
      p_settlement_key: `${paidExecution.operationId}:settlement`, p_outcome: "success", p_failure_class: null,
      p_actual_fulfillment_cost_micros: fulfillmentCost,
      p_evidence_json: { provider: "openai", operation_kind: "audio_transcription", route_code: routeCode, provider_request_id: openAiResult.provider_request_id, authoritative: false, cost_coverage: estimatedSupplierCostMicros == null ? "incomplete" : "estimated" },
    });
      if (settled.error) throw new Error(settled.error.message ?? "transcription_settlement_failed");
      const aggregated = await financialGate.rpc("record_paid_operation_aggregate_outcome", {
      p_reservation_id: paidExecution.reservationId, p_event_key: `${attemptKey}:aggregate-success`,
      p_outcome: "settled_unconfirmed", p_supplier_obligation_micros: estimatedSupplierCostMicros == null ? null : fulfillmentCost,
      p_supplier_recovery_micros: null, p_evidence_json: { provider: "openai", operation_kind: "audio_transcription", route_code: routeCode, authoritative: false },
    });
      if (aggregated.error) throw new Error(aggregated.error.message ?? "transcription_aggregate_settlement_failed");
    } catch (error) {
      throw new OpenAiTextPostPersistenceContinuationError(
        "Hammer transcript persisted but its billing continuation requires reconciliation.",
        { cause: error },
      );
    }
  }

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
        : job.job_type === "hammer_final_video_render"
        ? await runFinalVideoRenderJob(deps, job)
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
      const failedPayload = readJsonObject(job.payload_json) ?? {};
      const failedHandle = normalizeOpenAiTextPaidExecutionHandle(failedPayload.paid_execution);
      if (configuredOpenAiTranscriptionMode() === "enforce" && failedHandle) {
        const gate = deps.service.supabase.schema("tongs") as unknown as {
          rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string } | null }>;
        };
        const routeCode = job.job_type === "hammer_transcript_regeneration" ? "hammer.transcript_regeneration" : "hammer.transcript_prep";
        const attemptKey = `${failedHandle.operationId}:attempt:1`;
        if (error instanceof OpenAiTranscriptionSubmissionUnknownError) {
          await gate.rpc("close_openai_text_failure_exposure", { p_reservation_id: failedHandle.reservationId, p_attempt_key: attemptKey, p_outcome: "unresolved", p_actual_supplier_cost_micros: null, p_evidence_json: { route_code: routeCode, job_id: job.id, reason: message } }).catch(() => undefined);
          await gate.rpc("mark_submission_unknown", { p_reservation_id: failedHandle.reservationId, p_event_key: `${attemptKey}:submission-unknown`, p_attempt_key: attemptKey, p_evidence_json: { route_code: routeCode, job_id: job.id, reason: message } }).catch(() => undefined);
          await gate.rpc("record_paid_operation_aggregate_outcome", { p_reservation_id: failedHandle.reservationId, p_event_key: `${attemptKey}:aggregate-ambiguous`, p_outcome: "ambiguous", p_supplier_obligation_micros: null, p_supplier_recovery_micros: null, p_evidence_json: { route_code: routeCode, job_id: job.id, reason: message } }).catch(() => undefined);
        } else if (error instanceof OpenAiTextPostPersistenceContinuationError) {
          await gate.rpc("record_paid_operation_aggregate_outcome", { p_reservation_id: failedHandle.reservationId, p_event_key: `${attemptKey}:aggregate-post-persistence-unresolved`, p_outcome: "ambiguous", p_supplier_obligation_micros: null, p_supplier_recovery_micros: null, p_evidence_json: { route_code: routeCode, job_id: job.id, reason: message, phase: "post_persistence_billing_continuation", provider_resubmission_allowed: false } }).catch(() => undefined);
        } else {
          const expenseReader = deps.service.supabase.schema("tongs") as unknown as {
            from(name: string): {
              select(columns: string): {
                eq(column: string, value: string): {
                  maybeSingle(): Promise<{ data: { amount_micros?: number | string | null } | null; error: { message?: string } | null }>;
                };
              };
            };
          };
          const existingExpense = await expenseReader.from("supplier_expenses").select("amount_micros")
            .eq("expense_key", `${attemptKey}:supplier-expense`).maybeSingle().catch(() => ({ data: null, error: null }));
          let supplierObligationMicros: number | null = null;
          if (existingExpense.data?.amount_micros != null) {
            const parsed = Number(existingExpense.data.amount_micros);
            supplierObligationMicros = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
          } else {
            await gate.rpc("record_openai_text_supplier_attempt_expense", {
              p_reservation_id: failedHandle.reservationId, p_attempt_key: attemptKey, p_attempt_number: 1,
              p_provider_reference: null, p_amount_micros: null, p_evidence_status: "unresolved",
              p_evidence_json: { operation_kind: "audio_transcription", route_code: routeCode, job_id: job.id, reason: message, provider_charge_possible: true },
            }).catch(() => undefined);
          }
          await gate.rpc("close_openai_text_failure_exposure", { p_reservation_id: failedHandle.reservationId, p_attempt_key: attemptKey, p_outcome: "failure_realized", p_actual_supplier_cost_micros: supplierObligationMicros, p_evidence_json: { route_code: routeCode, job_id: job.id, reason: message } }).catch(() => undefined);
          await gate.rpc("record_provider_failure", { p_reservation_id: failedHandle.reservationId, p_event_key: `${attemptKey}:background-failure`, p_failure_class: error instanceof OpenAiTranscriptionError ? "provider_failure" : "forge_failure", p_evidence_json: { route_code: routeCode, job_id: job.id, reason: message } }).catch(() => undefined);
          await gate.rpc("settle_openai_customer_failure_without_duplicate_expense", {
            p_reservation_id: failedHandle.reservationId,
            p_relief_id: crypto.createHash("sha256").update(`${failedHandle.operationId}:failure-settlement`).digest("hex").slice(0, 8) + "-0000-4000-8000-" + crypto.createHash("sha256").update(`${failedHandle.operationId}:failure-settlement`).digest("hex").slice(12, 24),
            p_event_key: `${failedHandle.operationId}:failure-settlement`,
            p_failure_class: error instanceof OpenAiTranscriptionError ? "provider_failure" : "forge_failure",
            p_evidence_json: { provider: "openai", route_code: routeCode, customer_charge_micros: 0, supplier_obligation_status: supplierObligationMicros == null ? "preserved_unresolved" : "preserved_estimated", supplier_obligation_micros: supplierObligationMicros, reason: message },
          }).catch(() => undefined);
          await gate.rpc("record_paid_operation_aggregate_outcome", { p_reservation_id: failedHandle.reservationId, p_event_key: `${attemptKey}:aggregate-failure`, p_outcome: "failure", p_supplier_obligation_micros: supplierObligationMicros, p_supplier_recovery_micros: null, p_evidence_json: { route_code: routeCode, job_id: job.id, reason: message } }).catch(() => undefined);
        }
      }
      const transcriptPreflightDiagnostic = error instanceof TranscriptAudioPreflightError
        ? error.diagnostic
        : null;
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
          ...(transcriptPreflightDiagnostic ? { transcript_audio_preflight: transcriptPreflightDiagnostic } : {}),
        },
      }).catch(() => undefined);
      await finalizeJob(deps.service, job.id, {
        status: "failed",
        completed_at: new Date().toISOString(),
        lease_expires_at: null,
        heartbeat_at: new Date().toISOString(),
        progress_percent: null,
        error_code: error instanceof OpenAiTranscriptionSubmissionUnknownError
          ? "SUBMISSION_UNKNOWN"
          : error instanceof OpenAiTextPostPersistenceContinuationError
            ? "BILLING_RECONCILIATION_REQUIRED"
          : transcriptPreflightDiagnostic ? "AUDIO_PREFLIGHT_FAILED" : "JOB_FAILED",
        error_message: message,
        ...(transcriptPreflightDiagnostic
          ? {
              result_json: {
                transcript_audio_preflight: transcriptPreflightDiagnostic,
                user_message: message,
              } as unknown as Json,
            }
          : {}),
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
