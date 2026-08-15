import type {
  HammerPersistedArtifact,
  HammerPersistedStructuredTranscript,
} from "../persistence/hammerPersistenceContract";
import type { HammerIngestFinalStatus } from "../diagnostics/hammerIngestDiagnostics";

export type RegisteredTranscriptPointerEvaluation = {
  pointer_path: string | null;
  load_ok: boolean;
  segment_count: number | null;
  definitive_failure: boolean;
  rejection_reason: string | null;
  transcript: HammerPersistedStructuredTranscript | null;
};

export function evaluateRegisteredTranscriptPointer(args: {
  pointerPath: string | null;
  artifact: HammerPersistedArtifact<HammerPersistedStructuredTranscript> | null;
  canonicalMediaId?: string | null;
}): RegisteredTranscriptPointerEvaluation {
  if (!args.pointerPath) {
    return {
      pointer_path: null,
      load_ok: false,
      segment_count: null,
      definitive_failure: false,
      rejection_reason: null,
      transcript: null,
    };
  }

  if (!args.artifact) {
    return {
      pointer_path: args.pointerPath,
      load_ok: false,
      segment_count: null,
      definitive_failure: false,
      rejection_reason: "missing_artifact_snapshot",
      transcript: null,
    };
  }

  if (args.artifact.updated_at == null && args.artifact.data == null) {
    return {
      pointer_path: args.pointerPath,
      load_ok: false,
      segment_count: null,
      definitive_failure: true,
      rejection_reason: "missing_file",
      transcript: null,
    };
  }

  const transcript = args.artifact.data;
  if (!transcript || !Array.isArray((transcript as unknown as { segments?: unknown }).segments)) {
    return {
      pointer_path: args.pointerPath,
      load_ok: false,
      segment_count: null,
      definitive_failure: true,
      rejection_reason: "invalid_content",
      transcript: null,
    };
  }

  if (!transcriptMatchesCanonicalMedia(transcript, args.canonicalMediaId)) {
    return {
      pointer_path: args.pointerPath,
      load_ok: false,
      segment_count: transcript.segments.length,
      definitive_failure: true,
      rejection_reason: "media_identity_mismatch",
      transcript: null,
    };
  }

  const segmentCount = transcript.segments.length;
  return {
    pointer_path: args.pointerPath,
    load_ok: true,
    segment_count: segmentCount,
    definitive_failure: segmentCount === 0,
    rejection_reason: segmentCount === 0 ? "empty_segments" : null,
    transcript,
  };
}

export function transcriptMatchesCanonicalMedia(
  transcript: HammerPersistedStructuredTranscript | null | undefined,
  canonicalMediaId: string | null | undefined,
): boolean {
  const expected = canonicalMediaId?.trim() ?? "";
  if (!expected || !transcript) return true;
  const actual = transcript.media_id?.trim()
    || transcript.source_media_ref?.media_id?.trim()
    || "";
  return actual === expected;
}

export function isSealRaceRecoverable(code: string | null | undefined): boolean {
  return code === "canonical_recording_already_sealed" || code === "file_conflict";
}

export function computeIngestFinalStatus(args: {
  base: Exclude<HammerIngestFinalStatus, "degraded">;
  audioStatus: string | null;
  visualStatus: string | null;
}): HammerIngestFinalStatus {
  if (args.base === "blocked") return "blocked";
  if (args.audioStatus === "failed" || args.visualStatus === "not_started") return "degraded";
  return args.base;
}

