import {
  generateHammerSubtitleArtifact,
  setHammerSubtitleArtifact,
} from "../../../hammer/src/lib/hammerSubtitleExports";
import {
  deriveHammerVisualPlacements,
  isReusableHammerVisualPlacements,
  loadHammerWorkpieceVisualPackage,
} from "../../../hammer/src/lib/hammerVisualPlacements";
import {
  buildHammerLaunchContextFromPersistence,
  saveHammerPersistenceSnapshot,
} from "../../../hammer/src/persistence/hammerPersistence";
import type {
  HammerPersistenceSnapshot,
  HammerPersistenceTarget,
} from "../../../hammer/src/persistence/hammerPersistenceContract";
import {
  buildFailedHammerAudioPolish,
  buildPreparedHammerAudioPolish,
  buildPreparingHammerAudioPolish,
} from "../../../hammer/src/prep/hammerAudioPolish";
import { requestHammerAudioPolish } from "../../../hammer/src/prep/hammerAudioPolishApi";
import { resolveHammerPrepSource } from "../../../hammer/src/prep/hammerPrep";
import { resolveAudioPolishInputSource } from "../../../hammer/src/prep/resolveAudioPolishInputSource";
import type { TongsReleaseOperatorActionStep } from "./tongsReleaseOperatorExecution";

const TONGS_OPERATOR_WRITTEN_BY = {
  tool: "tongs",
  tool_version: "forge-v1.2.0/tongs-operator-execution",
  lane: "forge-managed",
} as const;

export interface ExecuteTongsReleaseOperatorActionResult {
  result: "succeeded" | "failed" | "blocked";
  message: string;
  snapshot: HammerPersistenceSnapshot | null;
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return fallback;
}

function buildBaseSaveRequest(snapshot: HammerPersistenceSnapshot, now: string) {
  return {
    written_by: TONGS_OPERATOR_WRITTEN_BY,
    active_session_id: snapshot.state?.active_session_id
      ?? snapshot.editor_session.data?.session_id
      ?? null,
    last_opened_at: now,
  };
}

async function saveStructuredTranscript(args: {
  target: HammerPersistenceTarget;
  snapshot: HammerPersistenceSnapshot;
  now: string;
  message: string;
  format: "srt" | "vtt";
}): Promise<ExecuteTongsReleaseOperatorActionResult> {
  const transcript = args.snapshot.structured_transcript.data;
  if (!transcript || transcript.segments.length === 0) {
    return {
      result: "blocked",
      message: "Structured transcript is required before subtitle regeneration can run.",
      snapshot: null,
    };
  }

  const artifact = generateHammerSubtitleArtifact({
    rawSegments: transcript.segments,
    transcript,
    format: args.format,
    generatedAt: args.now,
  });
  const updatedTranscript = setHammerSubtitleArtifact(transcript, artifact);
  const saveResult = await saveHammerPersistenceSnapshot(args.target, {
    ...buildBaseSaveRequest(args.snapshot, args.now),
    structured_transcript: {
      data: updatedTranscript,
    },
  });

  if (!saveResult.ok) {
    return {
      result: "failed",
      message: saveResult.error,
      snapshot: null,
    };
  }

  return {
    result: "succeeded",
    message: args.message,
    snapshot: saveResult.data,
  };
}

async function regenerateVisualPlacements(args: {
  target: HammerPersistenceTarget;
  snapshot: HammerPersistenceSnapshot;
  now: string;
}): Promise<ExecuteTongsReleaseOperatorActionResult> {
  const transcript = args.snapshot.structured_transcript.data;
  if (!transcript || transcript.segments.length === 0) {
    return {
      result: "blocked",
      message: "Structured transcript is required before visual placement regeneration can run.",
      snapshot: null,
    };
  }

  const visualPackageResult = await loadHammerWorkpieceVisualPackage(
    args.target.workpieceId,
    args.target.workspaceId,
  );
  if (!visualPackageResult.ok) {
    return {
      result: "failed",
      message: visualPackageResult.error,
      snapshot: null,
    };
  }

  const nextPlacements = deriveHammerVisualPlacements({
    transcriptSourceId: transcript.transcript_id,
    transcriptSegments: transcript.segments,
    visualPackage: visualPackageResult.data,
  });

  if (isReusableHammerVisualPlacements(
    args.snapshot.visual_placements.data,
    transcript.transcript_id,
    visualPackageResult.data,
  )) {
    return {
      result: "succeeded",
      message: "Visual placements were already current for the current transcript output.",
      snapshot: args.snapshot,
    };
  }

  const saveResult = await saveHammerPersistenceSnapshot(args.target, {
    ...buildBaseSaveRequest(args.snapshot, args.now),
    visual_placements: {
      data: nextPlacements,
    },
  });

  if (!saveResult.ok) {
    return {
      result: "failed",
      message: saveResult.error,
      snapshot: null,
    };
  }

  return {
    result: "succeeded",
    message: "Visual placements were regenerated from the current transcript output.",
    snapshot: saveResult.data,
  };
}

async function regenerateAudioPolish(args: {
  target: HammerPersistenceTarget;
  snapshot: HammerPersistenceSnapshot;
  now: string;
}): Promise<ExecuteTongsReleaseOperatorActionResult> {
  const hydrated = buildHammerLaunchContextFromPersistence(args.target, args.snapshot);
  const launchContext = hydrated?.launchContext ?? null;
  const prepSource = launchContext ? resolveHammerPrepSource(launchContext) : null;
  if (!prepSource) {
    return {
      result: "blocked",
      message: "Hammer needs a canonical or mapped media source before audio polish can run.",
      snapshot: null,
    };
  }

  const preparingSave = await saveHammerPersistenceSnapshot(args.target, {
    ...buildBaseSaveRequest(args.snapshot, args.now),
    audio_polish: {
      data: buildPreparingHammerAudioPolish(prepSource),
    },
  });
  if (!preparingSave.ok) {
    return {
      result: "failed",
      message: preparingSave.error,
      snapshot: null,
    };
  }

  try {
    const resolvedInput = resolveAudioPolishInputSource({
      workpiece_id: args.target.workpieceId,
      prepSource,
    });
    if (!resolvedInput.supported) {
      throw new Error(resolvedInput.reason);
    }
    const response = await requestHammerAudioPolish({
      workspace_id: args.target.workspaceId,
      workpiece_id: args.target.workpieceId,
      media_kind: prepSource.mediaRef.kind,
      input: resolvedInput.source,
      tongs_origin: typeof window !== "undefined" ? window.location.origin : null,
      local_root_abs: prepSource.local_root_abs,
      local_relpath: prepSource.local_relpath,
      canonical_workpiece_path: prepSource.canonical_workpiece_path,
      mime_type: prepSource.mediaRef.kind === "recording_audio" ? "audio/wav" : null,
    });

    const audioPolish = response.status === "prepared"
      ? buildPreparedHammerAudioPolish({
        prepSource,
        preparedAt: response.prepared_at ?? args.now,
        outputLocalRelpath: response.output_local_relpath,
        outputWorkpiecePath: response.output_workpiece_path,
        outputMimeType: response.output_mime_type ?? "audio/wav",
        outputDurationMs: response.output_duration_ms,
        settingsSummary: response.settings_summary,
        analysis: response.analysis,
        audioEdit: response.audio_edit,
        preparedPasses: response.prepared_passes,
      })
      : buildFailedHammerAudioPolish({
        prepSource,
        failureCode: response.failure_code ?? "processing_failed",
        failureReason: response.failure_reason ?? "Hammer could not produce an audio polish artifact.",
        settingsSummary: response.settings_summary,
      });

    const finalSave = await saveHammerPersistenceSnapshot(args.target, {
      ...buildBaseSaveRequest(preparingSave.data, args.now),
      audio_polish: {
        data: audioPolish,
      },
    });
    if (!finalSave.ok) {
      return {
        result: "failed",
        message: finalSave.error,
        snapshot: null,
      };
    }

    if (response.status === "prepared") {
      return {
        result: "succeeded",
        message: "Audio polish was regenerated from the current Hammer media source.",
        snapshot: finalSave.data,
      };
    }

    return {
      result: "failed",
      message: response.failure_reason ?? "Hammer audio polish failed during operator execution.",
      snapshot: finalSave.data,
    };
  } catch (error) {
    const failureReason = toErrorMessage(
      error,
      "Hammer audio polish failed during operator execution.",
    );
    const failedSave = await saveHammerPersistenceSnapshot(args.target, {
      ...buildBaseSaveRequest(preparingSave.data, args.now),
      audio_polish: {
        data: buildFailedHammerAudioPolish({
          prepSource,
          failureCode: "processing_failed",
          failureReason,
        }),
      },
    });

    if (!failedSave.ok) {
      return {
        result: "failed",
        message: failedSave.error,
        snapshot: null,
      };
    }

    return {
      result: "failed",
      message: failureReason,
      snapshot: failedSave.data,
    };
  }
}

export async function executeTongsReleaseOperatorAction(args: {
  target: HammerPersistenceTarget;
  snapshot: HammerPersistenceSnapshot;
  step: TongsReleaseOperatorActionStep;
}): Promise<ExecuteTongsReleaseOperatorActionResult> {
  if (args.step.execution_kind !== "operator_triggerable") {
    return {
      result: "blocked",
      message: "This recovery step is not operator-triggerable from Tongs.",
      snapshot: null,
    };
  }

  if (args.step.eligibility !== "eligible") {
    return {
      result: "blocked",
      message: args.step.blocked_by[0]?.detail
        ?? "This recovery step is currently blocked and cannot execute.",
      snapshot: null,
    };
  }

  const now = new Date().toISOString();
  switch (args.step.machine_action_type) {
    case "regenerate_subtitle_srt":
      return saveStructuredTranscript({
        target: args.target,
        snapshot: args.snapshot,
        now,
        format: "srt",
        message: "SRT subtitles were regenerated from the current transcript output.",
      });
    case "regenerate_subtitle_vtt":
      return saveStructuredTranscript({
        target: args.target,
        snapshot: args.snapshot,
        now,
        format: "vtt",
        message: "VTT subtitles were regenerated from the current transcript output.",
      });
    case "regenerate_visual_placements":
      return regenerateVisualPlacements({
        target: args.target,
        snapshot: args.snapshot,
        now,
      });
    case "regenerate_audio_polish":
      return regenerateAudioPolish({
        target: args.target,
        snapshot: args.snapshot,
        now,
      });
    default:
      return {
        result: "blocked",
        message: "No direct Tongs execution path is available for this recovery step.",
        snapshot: null,
      };
  }
}
