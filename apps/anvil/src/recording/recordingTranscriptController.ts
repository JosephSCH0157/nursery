import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { RecordingCaptureStrategy } from "./selectBestRecordingStrategy";

const LIVE_SNAPSHOT_PREFIX = "anvil/transcript/live";
const FINAL_TRANSCRIPT_PREFIX = "anvil/transcript/final";
const LOCAL_SNAPSHOT_KEY_PREFIX = "forge_anvil_live_transcript_v1:";
const SNAPSHOT_PERSIST_INTERVAL_MS = 1_500;
const DEFAULT_SPEAKER = "unknown";
const FINAL_HYPOTHESIS_BOUNDARY_WINDOW_MS = 1_200;

type TranscriptPayload = {
  text?: unknown;
  final?: unknown;
  isFinal?: unknown;
  timestamp?: unknown;
  meta?: unknown;
};

export type RecordingTranscriptStatus =
  | "idle"
  | "starting"
  | "live"
  | "partial"
  | "finalizing"
  | "ready"
  | "degraded";

export type RecordingTranscriptArtifact = {
  schema_version: 1;
  transcript_id: string;
  media_id: string | null;
  media_signature: string | null;
  prepared_at: string;
  structure: "speaker_turns";
  source_media_ref: {
    kind: "workpiece";
    path: string | null;
    content_type: string | null;
  } | null;
  diarization: {
    label_scheme: "forge-neutral-speakers.v1";
    labels: string[];
    raw_labels: string[];
    version: string | null;
    provider: string;
    provider_request_id: string | null;
    model: string | null;
  };
  confidence_flags: Array<{
    turn_id: string;
    code: "speaker_boundary_low_confidence";
    detail: string;
  }>;
  segments: HammerTranscriptSegment[];
};

type RecordingTranscriptSnapshot = {
  schema_version: 1;
  capture_session_id: string;
  workpiece_id: string | null;
  started_at: string;
  updated_at: string;
  status: RecordingTranscriptStatus;
  degraded_reason: string | null;
  live_path: string | null;
  final_path: string | null;
  partial_text: string | null;
  segment_count: number;
  segments: HammerTranscriptSegment[];
  recording_medium: string;
};

export type RecordingTranscriptStartResult = {
  captureSessionId: string;
  workpieceId: string | null;
  status: RecordingTranscriptStatus;
  degradedReason: string | null;
  livePath: string | null;
};

export type RecordingTranscriptFinalizeResult = {
  captureSessionId: string;
  workpieceId: string | null;
  status: RecordingTranscriptStatus;
  degradedReason: string | null;
  livePath: string | null;
  finalPath: string | null;
  finalArtifact: RecordingTranscriptArtifact | null;
  segmentCount: number;
};

type RecordingTranscriptControllerDeps = {
  ensureCaptureTarget: () => Promise<RecordingCaptureTargetResult>;
  commitJsonArtifact: (input: {
    workpieceId: string;
    path: string;
    data: unknown;
    eventName: string;
    eventPayload?: Record<string, unknown>;
  }) => Promise<{ ok: boolean }>;
  startSpeech: (info?: { reason?: string; mode?: string }) => Promise<boolean>;
  stopSpeech: (reason?: string) => void;
  localStorage: Pick<Storage, 'setItem'>;
};

type RecordingCaptureTargetResult =
  | {
      ok: true;
      workspaceId: string | null;
      workpieceId: string;
      createdCradle: boolean;
      plannerRecordingSessionId: string | null;
      captureSessionId: string;
    }
  | {
      ok: false;
      reason: string;
      status?: number;
      details?: unknown;
      workspaceId?: string | null;
      workpieceId?: string | null;
    };

type ActiveTranscriptSession = {
  captureSessionId: string;
  recordingStartedAtMs: number;
  strategy: RecordingCaptureStrategy;
  startedAtIso: string;
  livePath: string;
  finalPath: string;
  status: RecordingTranscriptStatus;
  degradedReason: string | null;
  target: RecordingCaptureTargetResult | null;
  segments: HammerTranscriptSegment[];
  partialText: string | null;
  partialStartSec: number | null;
  pendingFinalText: string | null;
  pendingFinalStartSec: number | null;
  lastFinalHypothesisAtMs: number;
  eventCount: number;
  lastPersistedAtMs: number;
  finalized: boolean;
};

function readText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function buildLocalSnapshotKey(captureSessionId: string): string {
  return `${LOCAL_SNAPSHOT_KEY_PREFIX}${captureSessionId}`;
}

function safeNow(): number {
  return Date.now();
}

function safeTimestampMs(recordingStartedAtMs: number): number {
  return Math.max(0, safeNow() - recordingStartedAtMs);
}

function toSeconds(valueMs: number): number {
  return Number((Math.max(0, valueMs) / 1000).toFixed(3));
}

function estimateSegmentStartSec(text: string, endSec: number, previousEndSec: number): number {
  const wordCount = Math.max(1, text.split(/\s+/).length);
  const estimatedDurationSec = Math.min(6, Math.max(0.35, wordCount / 2.75));
  return Number(Math.max(previousEndSec, endSec - estimatedDurationSec).toFixed(3));
}

function pushFinalSegment(session: ActiveTranscriptSession, text: string, endSec: number): void {
  const previousSegment = session.segments[session.segments.length - 1] ?? null;
  if (previousSegment && previousSegment.text === text) {
    previousSegment.end_sec = Math.max(previousSegment.end_sec, endSec);
    return;
  }

  const previousEndSec = previousSegment?.end_sec ?? 0;
  const startSec = session.partialStartSec != null
    ? Math.max(previousEndSec, Number(session.partialStartSec.toFixed(3)))
    : estimateSegmentStartSec(text, endSec, previousEndSec);
  const segmentIndex = session.segments.length + 1;
  session.segments.push({
    segment_id: `seg-${segmentIndex}`,
    start_sec: startSec,
    end_sec: Math.max(startSec, Number(endSec.toFixed(3))),
    speaker: DEFAULT_SPEAKER,
    text,
  });
}

function buildCanonicalTranscriptText(session: ActiveTranscriptSession): string {
  return session.segments
    .map((segment) => readText(segment.text))
    .filter((segment): segment is string => !!segment)
    .join(" ");
}

function splitWords(value: string): string[] {
  return String(value || "")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function trimCommittedPrefix(candidateText: string, committedText: string): string {
  const candidate = readText(candidateText) ?? "";
  const committed = readText(committedText) ?? "";
  if (!candidate) return "";
  if (!committed) return candidate;
  if (candidate === committed) return "";
  if (candidate.startsWith(`${committed} `)) {
    return readText(candidate.slice(committed.length)) ?? "";
  }
  if (candidate.startsWith(committed)) {
    return readText(candidate.slice(committed.length)) ?? "";
  }

  const committedWords = splitWords(committed);
  const candidateWords = splitWords(candidate);
  const maxOverlap = Math.min(committedWords.length, candidateWords.length, 24);
  for (let overlap = maxOverlap; overlap >= 1; overlap -= 1) {
    const committedTail = committedWords.slice(committedWords.length - overlap).join(" ");
    const candidateHead = candidateWords.slice(0, overlap).join(" ");
    if (committedTail && committedTail === candidateHead) {
      return readText(candidateWords.slice(overlap).join(" ")) ?? "";
    }
  }
  return candidate;
}

function commitPendingFinal(session: ActiveTranscriptSession, endSec: number): boolean {
  const pendingText = readText(session.pendingFinalText);
  const pendingStartSec = session.pendingFinalStartSec;
  if (!pendingText) {
    session.pendingFinalText = null;
    session.pendingFinalStartSec = null;
    return false;
  }
  const appendableText = trimCommittedPrefix(pendingText, buildCanonicalTranscriptText(session));
  session.pendingFinalText = null;
  session.pendingFinalStartSec = null;
  if (!appendableText) {
    session.partialText = null;
    session.partialStartSec = null;
    return false;
  }
  if (pendingStartSec != null) {
    session.partialStartSec = pendingStartSec;
  }
  pushFinalSegment(session, appendableText, endSec);
  session.partialText = null;
  session.partialStartSec = null;
  return true;
}

function absorbFinalHypothesis(session: ActiveTranscriptSession, text: string, endSec: number): boolean {
  const finalText = readText(text);
  if (!finalText) return false;
  const now = safeNow();
  const pendingText = readText(session.pendingFinalText);
  if (!pendingText) {
    session.pendingFinalText = finalText;
    session.pendingFinalStartSec = session.partialStartSec;
    session.partialText = finalText;
    session.lastFinalHypothesisAtMs = now;
    return false;
  }

  const boundaryElapsedMs = Math.max(0, now - session.lastFinalHypothesisAtMs);
  session.lastFinalHypothesisAtMs = now;

  if (finalText === pendingText) {
    return commitPendingFinal(session, endSec);
  }

  const pendingAsPrefix = finalText.startsWith(`${pendingText} `) || finalText.startsWith(pendingText);
  if (pendingAsPrefix && boundaryElapsedMs <= FINAL_HYPOTHESIS_BOUNDARY_WINDOW_MS) {
    session.pendingFinalText = finalText;
    session.partialText = finalText;
    return false;
  }

  const committed = commitPendingFinal(session, endSec);
  session.pendingFinalText = finalText;
  session.pendingFinalStartSec = session.partialStartSec;
  session.partialText = finalText;
  return committed;
}

function buildSnapshot(session: ActiveTranscriptSession): RecordingTranscriptSnapshot {
  return {
    schema_version: 1,
    capture_session_id: session.captureSessionId,
    workpiece_id: session.target?.ok ? session.target.workpieceId : null,
    started_at: session.startedAtIso,
    updated_at: new Date().toISOString(),
    status: session.status,
    degraded_reason: session.degradedReason,
    live_path: session.livePath,
    final_path: session.finalized ? session.finalPath : null,
    partial_text: session.partialText,
    segment_count: session.segments.length,
    segments: session.segments,
    recording_medium: session.strategy.recordingMedium,
  };
}

function buildFinalArtifact(args: {
  session: ActiveTranscriptSession;
  mediaPath: string | null;
  contentType: string | null;
}): RecordingTranscriptArtifact {
  return {
    schema_version: 1,
    transcript_id: args.session.captureSessionId,
    media_id: `capture-session:${args.session.captureSessionId}`,
    media_signature: null,
    prepared_at: new Date().toISOString(),
    structure: "speaker_turns",
    source_media_ref: args.mediaPath
      ? {
          kind: "workpiece",
          path: args.mediaPath,
          content_type: args.contentType,
        }
      : null,
    diarization: {
      label_scheme: "forge-neutral-speakers.v1",
      labels: [DEFAULT_SPEAKER],
      raw_labels: [DEFAULT_SPEAKER],
      version: "anvil-live-transcript.v1",
      provider: "anvil-live-asr",
      provider_request_id: null,
      model: null,
    },
    confidence_flags: [],
    segments: args.session.segments,
  };
}

export class RecordingTranscriptController {
  private readonly deps: RecordingTranscriptControllerDeps;

  private session: ActiveTranscriptSession | null = null;

  private persistChain: Promise<void> = Promise.resolve();

  private readonly transcriptListener = (event: Event): void => {
    const detail = (event as CustomEvent<TranscriptPayload>).detail;
    const session = this.session;
    if (!session || session.finalized) return;
    if (readBoolean(detail?.meta)) return;
    const text = readText(detail?.text);
    if (!text) return;

    session.eventCount += 1;
    const isFinal = readBoolean(detail?.final) || readBoolean(detail?.isFinal);
    const endSec = toSeconds(safeTimestampMs(session.recordingStartedAtMs));
    if (isFinal) {
      absorbFinalHypothesis(session, text, endSec);
      session.status = "live";
      session.degradedReason = null;
      this.emitState();
      void this.persistSnapshot(true);
      return;
    }

    session.partialText = text;
    if (session.partialStartSec == null) {
      session.partialStartSec = session.segments[session.segments.length - 1]?.end_sec ?? Math.max(0, endSec - 0.35);
    }
    session.status = "partial";
    this.emitState();
    void this.persistSnapshot(false);
  };

  constructor(deps: RecordingTranscriptControllerDeps) {
    this.deps = deps;
  }

  async startSession(args: {
    captureSessionId: string;
    recordingStartedAtMs: number;
    strategy: RecordingCaptureStrategy;
  }): Promise<RecordingTranscriptStartResult> {
    await this.disposeSession();

    const target = await this.deps.ensureCaptureTarget();
    const livePath = `${LIVE_SNAPSHOT_PREFIX}/${args.captureSessionId}.snapshot.v1.json`;
    const finalPath = `${FINAL_TRANSCRIPT_PREFIX}/${args.captureSessionId}.structured.v1.json`;
    this.session = {
      captureSessionId: args.captureSessionId,
      recordingStartedAtMs: args.recordingStartedAtMs,
      strategy: args.strategy,
      startedAtIso: new Date(args.recordingStartedAtMs).toISOString(),
      livePath,
      finalPath,
      status: "starting",
      degradedReason: null,
      target,
      segments: [],
      partialText: null,
      partialStartSec: null,
      pendingFinalText: null,
      pendingFinalStartSec: null,
      lastFinalHypothesisAtMs: 0,
      eventCount: 0,
      lastPersistedAtMs: 0,
      finalized: false,
    };
    this.emitState();
    window.addEventListener("tp:speech:transcript", this.transcriptListener as EventListener);
    void this.persistSnapshot(true);

    const started = await this.deps.startSpeech({
      reason: "recording-transcript",
      mode: "asr",
    }).catch(() => false);

    const session = this.session;
    if (!session) {
      return {
        captureSessionId: args.captureSessionId,
        workpieceId: null,
        status: "degraded",
        degradedReason: "transcript-session-released",
        livePath,
      };
    }

    if (!started) {
      session.status = "degraded";
      session.degradedReason = "speech-backend-unavailable";
      this.emitState();
      void this.persistSnapshot(true);
    } else {
      session.status = "live";
      session.degradedReason = null;
      this.emitState();
      void this.persistSnapshot(true);
    }

    return {
      captureSessionId: args.captureSessionId,
      workpieceId: session.target?.ok ? session.target.workpieceId : null,
      status: session.status,
      degradedReason: session.degradedReason,
      livePath,
    };
  }

  async stopSession(args: {
    mediaDurationMs: number | null;
    mediaPath?: string | null;
    contentType?: string | null;
  }): Promise<RecordingTranscriptFinalizeResult> {
    const session = this.session;
    if (!session) {
      return {
        captureSessionId: "",
        workpieceId: null,
        status: "idle",
        degradedReason: null,
        livePath: null,
        finalPath: null,
        finalArtifact: null,
        segmentCount: 0,
      };
    }

    session.status = "finalizing";
    this.emitState();

    try {
      this.deps.stopSpeech("recording-stop");
    } catch {}

    window.removeEventListener("tp:speech:transcript", this.transcriptListener as EventListener);

    const stopEndSec = toSeconds(args.mediaDurationMs ?? safeTimestampMs(session.recordingStartedAtMs));
    commitPendingFinal(session, stopEndSec);

    if (session.partialText) {
      const durationMs = args.mediaDurationMs ?? safeTimestampMs(session.recordingStartedAtMs);
      pushFinalSegment(session, session.partialText, toSeconds(durationMs));
      session.partialText = null;
      session.partialStartSec = null;
    }

    const finalArtifact = session.segments.length > 0
      ? buildFinalArtifact({
          session,
          mediaPath: args.mediaPath ?? null,
          contentType: args.contentType ?? null,
        })
      : null;

    let finalCommitFailed = false;
    const captureTarget = session.target;
    if (finalArtifact && captureTarget?.ok) {
      const commitResult = await this.deps.commitJsonArtifact({
        workpieceId: captureTarget.workpieceId,
        path: session.finalPath,
        data: finalArtifact,
        eventName: "take_transcript_finalized",
        eventPayload: {
          source: "anvil.recording-transcript",
          transcript_path: session.finalPath,
          anvil_capture_session_id: session.captureSessionId,
          recording_session_id: captureTarget.plannerRecordingSessionId,
          segment_count: session.segments.length,
          transcript_status: "ready",
        },
      });
      if (!commitResult.ok) {
        finalCommitFailed = true;
      }
    }

    session.finalized = true;
    session.status = finalArtifact && !finalCommitFailed ? "ready" : "degraded";
    session.degradedReason = finalArtifact
      ? finalCommitFailed
        ? "transcript-final-commit-failed"
        : null
      : "no-transcript-captured";
    await this.persistSnapshot(true);
    this.emitState();

    return {
      captureSessionId: session.captureSessionId,
      workpieceId: session.target?.ok ? session.target.workpieceId : null,
      status: session.status,
      degradedReason: session.degradedReason,
      livePath: session.livePath,
      finalPath: finalArtifact ? session.finalPath : null,
      finalArtifact,
      segmentCount: session.segments.length,
    };
  }

  async disposeSession(): Promise<void> {
    window.removeEventListener("tp:speech:transcript", this.transcriptListener as EventListener);
    await this.persistChain.catch(() => undefined);
    this.session = null;
  }

  private emitState(): void {
    const session = this.session;
    const detail = {
      captureSessionId: session?.captureSessionId ?? null,
      workpieceId: session?.target?.ok ? session.target.workpieceId : null,
      status: session?.status ?? "idle",
      degradedReason: session?.degradedReason ?? null,
      livePath: session?.livePath ?? null,
      finalPath: session?.finalized ? session.finalPath : null,
      segmentCount: session?.segments.length ?? 0,
      partialText: session?.partialText ?? null,
    };
    try { window.dispatchEvent(new CustomEvent("tp:recording:transcript-state", { detail })); } catch {}
    try { (window as any).__tpBus?.emit?.("tp:recording:transcript-state", detail); } catch {}
  }

  private async persistSnapshot(force: boolean): Promise<void> {
    const session = this.session;
    if (!session) return;
    const now = safeNow();
    if (!force && now - session.lastPersistedAtMs < SNAPSHOT_PERSIST_INTERVAL_MS) {
      return;
    }
    session.lastPersistedAtMs = now;
    const snapshot = buildSnapshot(session);
    try {
      this.deps.localStorage.setItem(buildLocalSnapshotKey(session.captureSessionId), JSON.stringify(snapshot));
    } catch {}
    const captureTarget = session.target;
    if (!captureTarget?.ok) return;

    this.persistChain = this.persistChain
      .catch(() => undefined)
      .then(async () => {
        await this.deps.commitJsonArtifact({
          workpieceId: captureTarget.workpieceId,
          path: session.livePath,
          data: snapshot,
          eventName: "take_transcript_snapshot",
          eventPayload: {
            source: "anvil.recording-transcript",
            transcript_path: session.livePath,
            transcript_status: session.status,
            anvil_capture_session_id: session.captureSessionId,
            recording_session_id: captureTarget.plannerRecordingSessionId,
            segment_count: session.segments.length,
          },
        });
      });
    await this.persistChain;
  }
}
