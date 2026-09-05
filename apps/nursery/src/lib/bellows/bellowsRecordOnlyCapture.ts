import type {
  BellowsCaptureProfile,
  BellowsLocalUploadPart,
  BellowsPlayableSegmentManifest,
  BellowsRecordOnlyStatus,
  BellowsRecorderBoundaryReason,
  ParticipantId,
  SessionId,
  TrackId,
  WorkpieceId,
  WorkspaceId,
} from "@forge/bellows";
import {
  BELLOWS_RECORD_ONLY_CONTRACT_VERSION,
  buildBellowsUploadPartId,
} from "@forge/bellows";
import { supabase, tongsSupabase } from "../supabase";

const DATABASE_NAME = "forge-bellows-record-only-v1";
const DATABASE_VERSION = 1;
const PART_STORE = "upload-parts";
const SEGMENT_STORE = "segments";
const CAPTURE_TIMESLICE_MS = 5_000;
const CAPTURE_AUDIO_BITS_PER_SECOND = 128_000;
const CAPTURE_VIDEO_BITS_PER_SECOND = 1_500_000;
const MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
] as const;

type StoredSegment = BellowsPlayableSegmentManifest & {
  readonly phase: BellowsRecordOnlyStatus["phase"];
  readonly packageId?: string;
  readonly playableStorageKey?: string;
  readonly playableSha256?: string;
  readonly playableByteLength?: number;
};

type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

export interface BellowsCaptureIdentity {
  readonly workspaceId: WorkspaceId;
  readonly sessionId: SessionId;
  readonly participantId: ParticipantId;
  readonly workpieceId: WorkpieceId;
}

export interface BellowsCaptureControllerOptions extends BellowsCaptureIdentity {
  readonly onStatus?: (status: BellowsRecordOnlyStatus) => void;
}

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PART_STORE)) {
        const parts = database.createObjectStore(PART_STORE, { keyPath: "partId" });
        parts.createIndex("sessionId", "sessionId", { unique: false });
        parts.createIndex("segmentId", "segmentId", { unique: false });
      }
      if (!database.objectStoreNames.contains(SEGMENT_STORE)) {
        const segments = database.createObjectStore(SEGMENT_STORE, { keyPath: "segmentId" });
        segments.createIndex("sessionId", "sessionId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Bellows could not open local recovery storage."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Bellows local recovery operation failed."));
  });
}

async function putLocal(storeName: string, value: unknown): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, "readwrite");
    await requestResult(transaction.objectStore(storeName).put(value));
  } finally {
    database.close();
  }
}

async function listByIndex<T>(storeName: string, indexName: string, key: string): Promise<T[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, "readonly");
    return await requestResult(transaction.objectStore(storeName).index(indexName).getAll(key)) as T[];
  } finally {
    database.close();
  }
}

async function deleteLocal(storeName: string, key: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, "readwrite");
    await requestResult(transaction.objectStore(storeName).delete(key));
  } finally {
    database.close();
  }
}

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function selectMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
}

async function assertPlayable(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "metadata";
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Playable segment probe timed out.")), 15_000);
      video.addEventListener("loadedmetadata", () => {
        window.clearTimeout(timeout);
        if (video.videoWidth <= 0 || video.videoHeight <= 0) {
          reject(new Error("Reconstructed Bellows media has no decodable video stream."));
          return;
        }
        resolve();
      }, { once: true });
      video.addEventListener("error", () => {
        window.clearTimeout(timeout);
        reject(new Error("Reconstructed Bellows media could not be decoded."));
      }, { once: true });
      video.src = url;
    });
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

function numberSetting(settings: MediaTrackSettings, key: "sampleRate" | "channelCount" | "width" | "height" | "frameRate"): number | null {
  const value = settings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildProfile(stream: MediaStream, recorder: MediaRecorder): BellowsCaptureProfile {
  const audio = stream.getAudioTracks()[0]?.getSettings() ?? {};
  const video = stream.getVideoTracks()[0]?.getSettings() ?? {};
  return {
    mimeType: recorder.mimeType,
    audioBitsPerSecond: recorder.audioBitsPerSecond || null,
    videoBitsPerSecond: recorder.videoBitsPerSecond || null,
    sampleRate: numberSetting(audio, "sampleRate"),
    channelCount: numberSetting(audio, "channelCount"),
    width: numberSetting(video, "width"),
    height: numberSetting(video, "height"),
    frameRate: numberSetting(video, "frameRate"),
    userAgent: navigator.userAgent,
  };
}

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const client = tongsSupabase as unknown as RpcClient;
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

export async function readBellowsStorageReadiness(): Promise<{
  readonly supported: boolean;
  readonly quotaBytes: number | null;
  readonly usageBytes: number | null;
}> {
  if (typeof indexedDB === "undefined" || !navigator.storage?.estimate) {
    return { supported: false, quotaBytes: null, usageBytes: null };
  }
  const estimate = await navigator.storage.estimate();
  return {
    supported: true,
    quotaBytes: estimate.quota ?? null,
    usageBytes: estimate.usage ?? null,
  };
}

export function readBellowsGateACompatibility(userAgent = navigator.userAgent): {
  readonly supported: boolean;
  readonly browser: "chrome" | "edge" | "unsupported";
  readonly reason: string;
} {
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
  const edge = /Edg\//.test(userAgent);
  const chrome = /Chrome\//.test(userAgent) && !/OPR\//.test(userAgent);
  if (!mobile && edge) return { supported: true, browser: "edge", reason: "Desktop Edge is in Bellows Gate A." };
  if (!mobile && chrome) return { supported: true, browser: "chrome", reason: "Desktop Chrome is in Bellows Gate A." };
  return {
    supported: false,
    browser: "unsupported",
    reason: "Bellows record-only Gate A currently supports desktop Chrome and Edge only. Safari, Firefox, and mobile require separate certification.",
  };
}

export async function listRecoverableBellowsParts(sessionId: SessionId): Promise<readonly BellowsLocalUploadPart[]> {
  return listByIndex<BellowsLocalUploadPart>(PART_STORE, "sessionId", sessionId);
}

export class BellowsRecordOnlyCaptureController {
  private readonly options: BellowsCaptureControllerOptions;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private activeSegment: StoredSegment | null = null;
  private sequenceNumber = 0;
  private sessionStartedAtMonotonic = 0;
  private pendingWrites: Promise<void>[] = [];
  private authorityGeneration: number | null = null;
  private status: BellowsRecordOnlyStatus = {
    phase: "idle",
    segment: null,
    partCount: 0,
    bytesHeldLocally: 0,
    uploadedPartCount: 0,
    message: "Ready to record locally.",
  };

  public constructor(options: BellowsCaptureControllerOptions) {
    this.options = options;
  }

  public getStatus(): BellowsRecordOnlyStatus {
    return this.status;
  }

  public async inspectRecovery(): Promise<BellowsRecordOnlyStatus> {
    const segments = await listByIndex<StoredSegment>(SEGMENT_STORE, "sessionId", this.options.sessionId);
    const parts = await listRecoverableBellowsParts(this.options.sessionId);
    const uploaded = parts.filter((part) => part.state === "verified_received").length;
    if (segments.length === 0 && parts.length === 0) return this.publish(this.status);
    const latest = [...segments].sort((a, b) => b.recorderGeneration - a.recorderGeneration)[0] ?? null;
    return this.publish({
      phase: uploaded === parts.length && parts.length > 0 ? "verified" : "recoverable",
      segment: latest,
      partCount: parts.length,
      bytesHeldLocally: parts.reduce((total, part) => total + part.byteLength, 0),
      uploadedPartCount: uploaded,
      message: uploaded === parts.length && parts.length > 0
        ? "Canonical receipt verified; local recovery copy is awaiting safe cleanup."
        : `Recovered ${parts.length} locally committed upload part${parts.length === 1 ? "" : "s"}.`,
    });
  }

  public async start(
    stream: MediaStream,
    boundaryReason: BellowsRecorderBoundaryReason = "initial",
  ): Promise<BellowsRecordOnlyStatus> {
    if (this.recorder?.state === "recording") throw new Error("Bellows is already recording.");
    const compatibility = readBellowsGateACompatibility();
    if (!compatibility.supported) throw new Error(compatibility.reason);
    const readiness = await readBellowsStorageReadiness();
    if (!readiness.supported) throw new Error("This browser does not provide Bellows recovery storage.");
    const available = readiness.quotaBytes !== null && readiness.usageBytes !== null
      ? readiness.quotaBytes - readiness.usageBytes
      : null;
    if (available !== null && available < 250 * 1024 * 1024) {
      throw new Error("Bellows requires at least 250 MB of available local recovery storage.");
    }

    const recoveredSegments = await listByIndex<StoredSegment>(SEGMENT_STORE, "sessionId", this.options.sessionId);
    const generation = recoveredSegments.reduce((highest, segment) => Math.max(highest, segment.recorderGeneration), 0) + 1;
    const segmentId = createId("bellows-segment");
    const trackId = `${this.options.sessionId}:${this.options.participantId}:av` as TrackId;
    const mimeType = selectMimeType();
    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: CAPTURE_AUDIO_BITS_PER_SECOND,
      videoBitsPerSecond: CAPTURE_VIDEO_BITS_PER_SECOND,
    });
    const startedAt = new Date().toISOString();
    this.sessionStartedAtMonotonic = performance.now();
    const segment: StoredSegment = {
      contractVersion: BELLOWS_RECORD_ONLY_CONTRACT_VERSION,
      sessionId: this.options.sessionId,
      participantId: this.options.participantId,
      trackId,
      segmentId,
      recorderGeneration: generation,
      boundaryReason,
      profile: buildProfile(stream, recorder),
      startedAt,
      endedAt: null,
      startOffsetMs: 0,
      durationMs: null,
      expectedPartCount: null,
      integrityState: "pending",
      phase: "recording",
    };

    await rpc("register_bellows_capture_segment", {
      p_session_id: segment.sessionId,
      p_participant_id: segment.participantId,
      p_track_id: segment.trackId,
      p_segment_id: segment.segmentId,
      p_recorder_generation: segment.recorderGeneration,
      p_boundary_reason: segment.boundaryReason,
      p_mime_type: segment.profile.mimeType,
      p_capture_profile: segment.profile,
      p_started_at: segment.startedAt,
      p_start_offset_ms: segment.startOffsetMs,
    });
    this.authorityGeneration = await this.readAuthorityGeneration();
    await putLocal(SEGMENT_STORE, segment);

    this.sequenceNumber = 0;
    this.pendingWrites = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size === 0 || !this.activeSegment) return;
      const write = this.commitPart(this.activeSegment, event.data, event.timecode).catch((error: unknown) => {
        this.publish({ ...this.status, phase: "failed", message: error instanceof Error ? error.message : "Local capture persistence failed." });
      });
      this.pendingWrites.push(write);
    });
    recorder.addEventListener("error", () => {
      this.publish({ ...this.status, phase: "failed", message: "The browser recording process failed; committed parts remain recoverable." });
    });
    this.recorder = recorder;
    this.stream = stream;
    this.activeSegment = segment;
    recorder.start(CAPTURE_TIMESLICE_MS);
    return this.publish({
      phase: "recording",
      segment,
      partCount: 0,
      bytesHeldLocally: 0,
      uploadedPartCount: 0,
      message: "Recording locally. Upload parts are committed to recovery storage before transfer.",
    });
  }

  public async stopAndUpload(): Promise<BellowsRecordOnlyStatus> {
    const recorder = this.recorder;
    const segment = this.activeSegment;
    if (!recorder || !segment) throw new Error("Bellows has no active recording to stop.");
    if (recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        recorder.stop();
      });
    }
    await Promise.all(this.pendingWrites);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.recorder = null;
    this.stream = null;
    const durationMs = Math.max(0, Math.round(performance.now() - this.sessionStartedAtMonotonic));
    const parts = (await listByIndex<BellowsLocalUploadPart>(PART_STORE, "segmentId", segment.segmentId))
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    if (parts.length === 0) throw new Error("Bellows stopped without producing recoverable media.");
    const finalized: StoredSegment = {
      ...segment,
      endedAt: new Date().toISOString(),
      durationMs,
      expectedPartCount: parts.length,
      phase: "uploading",
    };
    await putLocal(SEGMENT_STORE, finalized);
    this.activeSegment = finalized;
    this.publish({
      phase: "uploading",
      segment: finalized,
      partCount: parts.length,
      bytesHeldLocally: parts.reduce((total, part) => total + part.byteLength, 0),
      uploadedPartCount: parts.filter((part) => part.state === "verified_received").length,
      message: "Recording finalized locally; resuming canonical upload.",
    });
    return this.uploadSegment(finalized, parts);
  }

  public async resumeUpload(): Promise<BellowsRecordOnlyStatus> {
    const segments = await listByIndex<StoredSegment>(SEGMENT_STORE, "sessionId", this.options.sessionId);
    const segment = [...segments].sort((a, b) => b.recorderGeneration - a.recorderGeneration)[0];
    if (!segment) throw new Error("No recoverable Bellows segment was found.");
    const parts = (await listByIndex<BellowsLocalUploadPart>(PART_STORE, "segmentId", segment.segmentId))
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    if (parts.length === 0) throw new Error("No recoverable Bellows upload parts were found.");
    if (segment.packageId && segment.playableStorageKey && segment.playableSha256 && segment.playableByteLength) {
      return this.handoffSealedSegment(segment, parts);
    }
    return this.uploadSegment(segment, parts);
  }

  public async releaseVerifiedLocalMedia(): Promise<BellowsRecordOnlyStatus> {
    const parts = await listRecoverableBellowsParts(this.options.sessionId);
    if (parts.some((part) => part.state !== "verified_received")) {
      throw new Error("Bellows cannot delete local media before every part has verified canonical receipt.");
    }
    const segments = await listByIndex<StoredSegment>(SEGMENT_STORE, "sessionId", this.options.sessionId);
    await Promise.all(parts.map((part) => deleteLocal(PART_STORE, part.partId)));
    await Promise.all(segments.map((segment) => deleteLocal(SEGMENT_STORE, segment.segmentId)));
    return this.publish({
      phase: "verified",
      segment: null,
      partCount: 0,
      bytesHeldLocally: 0,
      uploadedPartCount: 0,
      message: "Verified canonical media retained by Tongs; local recovery copy released.",
    });
  }

  private async commitPart(segment: StoredSegment, blob: Blob, timecode: number): Promise<void> {
    const sequenceNumber = this.sequenceNumber++;
    const partId = buildBellowsUploadPartId(segment.segmentId, sequenceNumber);
    const part: BellowsLocalUploadPart = {
      contractVersion: BELLOWS_RECORD_ONLY_CONTRACT_VERSION,
      partId,
      sessionId: segment.sessionId,
      participantId: segment.participantId,
      trackId: segment.trackId,
      segmentId: segment.segmentId,
      recorderGeneration: segment.recorderGeneration,
      sequenceNumber,
      byteLength: blob.size,
      sha256: await sha256(blob),
      capturedAtOffsetMs: Math.max(0, Math.round(performance.now() - this.sessionStartedAtMonotonic)),
      blobTimecodeMs: Number.isFinite(timecode) ? timecode : null,
      state: "queued",
      createdAt: new Date().toISOString(),
      blob,
    };
    await putLocal(PART_STORE, part);
    const allParts = await listByIndex<BellowsLocalUploadPart>(PART_STORE, "segmentId", segment.segmentId);
    this.publish({
      ...this.status,
      partCount: allParts.length,
      bytesHeldLocally: allParts.reduce((total, entry) => total + entry.byteLength, 0),
      message: `Recording locally; ${allParts.length} upload part${allParts.length === 1 ? "" : "s"} recoverable.`,
    });
  }

  private async uploadSegment(segment: StoredSegment, parts: readonly BellowsLocalUploadPart[]): Promise<BellowsRecordOnlyStatus> {
    let uploadedPartCount = parts.filter((part) => part.state === "verified_received").length;
    for (const original of parts) {
      if (original.state === "verified_received") continue;
      const storageKey = `${this.options.workspaceId}/${this.options.sessionId}/${original.participantId}/${segment.segmentId}/parts/${original.sequenceNumber}.part`;
      await rpc("register_bellows_upload_part", {
        p_session_id: original.sessionId,
        p_participant_id: original.participantId,
        p_segment_id: original.segmentId,
        p_part_id: original.partId,
        p_sequence_number: original.sequenceNumber,
        p_byte_length: original.byteLength,
        p_sha256: original.sha256,
        p_storage_key: storageKey,
      });
      const uploaded = await supabase.storage.from("bellows-capture").upload(storageKey, original.blob, {
        contentType: "application/octet-stream",
        upsert: false,
      });
      if (uploaded.error && !uploaded.error.message.toLowerCase().includes("already exists")) {
        const retryable: BellowsLocalUploadPart = { ...original, state: "retryable_failed" };
        await putLocal(PART_STORE, retryable);
        return this.publish({ ...this.status, phase: "recoverable", uploadedPartCount, message: `Upload paused: ${uploaded.error.message}` });
      }
      const readback = await supabase.storage.from("bellows-capture").download(storageKey);
      if (readback.error || await sha256(readback.data) !== original.sha256) {
        const failed: BellowsLocalUploadPart = { ...original, state: "retryable_failed" };
        await putLocal(PART_STORE, failed);
        return this.publish({ ...this.status, phase: "recoverable", uploadedPartCount, message: "Canonical upload readback did not match local media; local bytes were retained." });
      }
      await rpc("confirm_bellows_upload_part", { p_part_id: original.partId, p_sha256: original.sha256 });
      await putLocal(PART_STORE, { ...original, state: "verified_received" } satisfies BellowsLocalUploadPart);
      uploadedPartCount += 1;
      this.publish({ ...this.status, phase: "uploading", uploadedPartCount, message: `Verified ${uploadedPartCount} of ${parts.length} upload parts.` });
    }

    const playableBlob = new Blob(parts.map((part) => part.blob), { type: segment.profile.mimeType });
    await assertPlayable(playableBlob);
    const playableSha256 = await sha256(playableBlob);
    const playableKey = `${this.options.workspaceId}/${this.options.sessionId}/${segment.participantId}/${segment.segmentId}/segment${segment.profile.mimeType.includes("mp4") ? ".mp4" : ".webm"}`;
    const playableUpload = await supabase.storage.from("bellows-capture").upload(playableKey, playableBlob, {
      contentType: segment.profile.mimeType.split(";", 1)[0],
      upsert: false,
    });
    if (playableUpload.error && !playableUpload.error.message.toLowerCase().includes("already exists")) {
      return this.publish({ ...this.status, phase: "recoverable", uploadedPartCount, message: `Playable segment upload paused: ${playableUpload.error.message}` });
    }
    const playableReadback = await supabase.storage.from("bellows-capture").download(playableKey);
    if (playableReadback.error || await sha256(playableReadback.data) !== playableSha256) {
      return this.publish({ ...this.status, phase: "recoverable", uploadedPartCount, message: "Playable segment verification failed; local media retained." });
    }
    await assertPlayable(playableReadback.data);
    await rpc("verify_bellows_capture_segment", {
      p_segment_id: segment.segmentId,
      p_expected_part_count: parts.length,
      p_byte_length: parts.reduce((total, part) => total + part.byteLength, 0),
      p_sha256: playableSha256,
      p_storage_key: playableKey,
      p_ended_at: segment.endedAt ?? new Date().toISOString(),
      p_duration_ms: segment.durationMs ?? 0,
    });
    const manifest = {
      schema: "bellows.session-capture-package.v1",
      session_id: this.options.sessionId,
      workspace_id: this.options.workspaceId,
      workpiece_id: this.options.workpieceId,
      participant_id: this.options.participantId,
      outcome: "sealed",
      tracks: [{
        track_id: segment.trackId,
        kind: "audio_video",
        continuity_flag: "complete",
        segments: [{
          segment_id: segment.segmentId,
          recorder_generation: segment.recorderGeneration,
          start_offset_ms: segment.startOffsetMs,
          duration_ms: segment.durationMs,
          mime_type: segment.profile.mimeType,
          byte_length: playableBlob.size,
          sha256: playableSha256,
          storage_bucket: "bellows-capture",
          storage_key: playableKey,
          upload_parts: parts.map((part) => ({
            part_id: part.partId,
            sequence_number: part.sequenceNumber,
            byte_length: part.byteLength,
            sha256: part.sha256,
          })),
        }],
      }],
      integrity_findings: [],
    };
    const manifestSha256 = await sha256(new Blob([JSON.stringify(manifest)], { type: "application/json" }));
    const authorityGeneration = this.authorityGeneration ?? await this.readAuthorityGeneration();
    const sealedValue = await rpc("seal_complete_bellows_capture", {
      p_session_id: this.options.sessionId,
      p_authority_generation: authorityGeneration,
      p_workpiece_id: this.options.workpieceId,
      p_manifest: manifest,
      p_manifest_sha256: manifestSha256,
    });
    const sealed = sealedValue as { id?: string } | null;
    if (!sealed?.id) throw new Error("Bellows sealed the capture without returning its package identity.");
    const verified: StoredSegment = {
      ...segment,
      integrityState: "verified",
      phase: "uploading",
      packageId: sealed.id,
      playableStorageKey: playableKey,
      playableSha256,
      playableByteLength: playableBlob.size,
    };
    await putLocal(SEGMENT_STORE, verified);
    return this.handoffSealedSegment(verified, parts);
  }

  private async handoffSealedSegment(segment: StoredSegment, parts: readonly BellowsLocalUploadPart[]): Promise<BellowsRecordOnlyStatus> {
    if (!segment.packageId || !segment.playableStorageKey || !segment.playableSha256 || !segment.playableByteLength) {
      throw new Error("Bellows cannot hand off media until its sealed package is available.");
    }
    this.publish({ ...this.status, phase: "uploading", message: "Recording sealed safely. Preparing it for Hammer." });
    try {
      await this.adoptVerifiedSegmentInHammer({
        packageId: segment.packageId,
        segment,
        storageKey: segment.playableStorageKey,
        sha256: segment.playableSha256,
        byteLength: segment.playableByteLength,
      });
    } catch (error) {
      await rpc("fail_bellows_hammer_handoff", {
        p_package_id: segment.packageId,
        p_error: error instanceof Error ? error.message : "Hammer handoff failed.",
      }).catch(() => undefined);
      await putLocal(SEGMENT_STORE, { ...segment, phase: "failed" } satisfies StoredSegment);
      return this.publish({
        ...this.status,
        phase: "failed",
        segment,
        message: "The recording is sealed safely, but Hammer handoff needs to be retried.",
      });
    }
    const completed: StoredSegment = { ...segment, phase: "verified" };
    await putLocal(SEGMENT_STORE, completed);
    return this.publish({
      phase: "verified",
      segment: completed,
      partCount: parts.length,
      bytesHeldLocally: parts.reduce((total, part) => total + part.byteLength, 0),
      uploadedPartCount: parts.length,
      message: "Canonical playable segment passed checksum readback and was adopted for Hammer. Local recovery media is retained until release.",
    });
  }

  private async readAuthorityGeneration(): Promise<number> {
    const value = await rpc("read_bellows_authority_generation", { p_session_id: this.options.sessionId });
    const result = value as { outcome?: string; authority_generation?: number } | null;
    if (result?.outcome !== "ok" || !Number.isInteger(result.authority_generation) || (result.authority_generation ?? 0) < 1) {
      throw new Error("Bellows could not establish the canonical authority generation.");
    }
    return result.authority_generation as number;
  }

  private async adoptVerifiedSegmentInHammer(args: {
    packageId: string;
    segment: StoredSegment;
    storageKey: string;
    sha256: string;
    byteLength: number;
  }): Promise<void> {
    const handoffValue = await rpc("begin_bellows_hammer_handoff", { p_package_id: args.packageId });
    const handoff = handoffValue as { outcome?: string; receipt?: { operation_id?: string; hammer_import_id?: string } } | null;
    if (handoff?.outcome === "committed") return;
    const operationId = handoff?.receipt?.operation_id;
    if (!operationId) throw new Error("Bellows could not reserve a sealed Hammer handoff.");
    const extension = args.segment.profile.mimeType.includes("mp4") ? "mp4" : "webm";
    const mediaPath = `recordings/imports/${operationId}/${args.sha256}.${extension}`;
    const reservedValue = await rpc("reserve_hammer_recording_import", {
      p_workspace_id: this.options.workspaceId,
      p_workpiece_id: this.options.workpieceId,
      p_operation_id: operationId,
      p_request_fingerprint: args.sha256,
      p_media_path: mediaPath,
      p_original_filename: `bellows-${args.segment.segmentId}.${extension}`,
      p_expected_media_hash: args.sha256,
      p_expected_media_bytes: args.byteLength,
      p_expected_media_content_type: args.segment.profile.mimeType,
      p_storage_bucket: "bellows-capture",
      p_storage_key: args.storageKey,
      p_hammer_version: "bellows-record-only-v1",
      p_provenance: {
        schema: "bellows.hammer-handoff.v1",
        session_id: this.options.sessionId,
        segment_id: args.segment.segmentId,
        recorder_generation: args.segment.recorderGeneration,
        deliberate_attach: true,
        integrity_state: "verified",
      },
    });
    const reserved = reservedValue as {
      outcome?: string;
      import?: { id?: string; verified_media_hash?: string } | null;
    } | null;
    if (!reserved || !["reserved", "resumable", "duplicate"].includes(reserved.outcome ?? "")) {
      throw new Error(`Hammer handoff reservation failed (${reserved?.outcome ?? "unknown"}).`);
    }
    if (reserved.outcome === "duplicate" && reserved.import?.verified_media_hash === args.sha256) {
      const duplicateImportId = reserved.import?.id;
      if (!duplicateImportId) throw new Error("Hammer returned a duplicate without its import identity.");
      await rpc("complete_bellows_hammer_handoff", { p_package_id: args.packageId, p_hammer_import_id: duplicateImportId });
      return;
    }
    const importId = reserved.import?.id;
    if (!importId) throw new Error("Hammer handoff reservation returned no import identity.");
    const finalizedValue = await rpc("finalize_hammer_recording_import", {
      p_import_id: importId,
      p_verified_media_hash: args.sha256,
      p_verified_media_bytes: args.byteLength,
      p_verified_media_content_type: args.segment.profile.mimeType,
    });
    const finalized = finalizedValue as { outcome?: string; reason?: string } | null;
    if (!finalized || !["committed", "duplicate"].includes(finalized.outcome ?? "")) {
      throw new Error(`Hammer handoff failed (${finalized?.reason ?? finalized?.outcome ?? "unknown"}).`);
    }
    const completed = finalizedValue as { import?: { id?: string } } | null;
    const completedImportId = completed?.import?.id ?? importId;
    await rpc("complete_bellows_hammer_handoff", {
      p_package_id: args.packageId,
      p_hammer_import_id: completedImportId,
    });
  }

  private publish(status: BellowsRecordOnlyStatus): BellowsRecordOnlyStatus {
    this.status = status;
    this.options.onStatus?.(status);
    return status;
  }
}

export function createBellowsRecordOnlyCaptureController(
  options: BellowsCaptureControllerOptions,
): BellowsRecordOnlyCaptureController {
  return new BellowsRecordOnlyCaptureController(options);
}
