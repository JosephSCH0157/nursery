import {
  buildHammerReleasePrepPackageFromSnapshot,
  type HammerReleasePrepPackage,
  type HammerReleasePrepStatus,
} from "../../../hammer/src/lib/hammerReleasePrepPackage";
import type { HammerMediaBackboneRuntimeSummary } from "../../../hammer/src/media/hammerMediaBackbone";
import {
  loadHammerPersistenceSnapshot,
} from "../../../hammer/src/persistence/hammerPersistence";
import type {
  HammerPersistenceSnapshot,
  HammerPersistenceTarget,
} from "../../../hammer/src/persistence/hammerPersistenceContract";

export type TongsReleaseAssemblySummaryStatus = "ready" | "attention" | "blocked";

export interface TongsReleaseAssemblyCheck {
  id: "transcript_output" | "subtitle_srt" | "subtitle_vtt" | "visuals" | "audio_polish";
  label: string;
  status: HammerReleasePrepStatus;
  detail: string;
}

export interface TongsHammerReleaseAssembly {
  schema_version: 1;
  target: {
    workspace_id: string;
    workpiece_id: string;
  };
  release_prep: HammerReleasePrepPackage;
  summary: {
    status: TongsReleaseAssemblySummaryStatus;
    ready_count: number;
    attention_count: number;
    blocking_states: Exclude<HammerReleasePrepStatus, "ready">[];
    message: string;
    checks: TongsReleaseAssemblyCheck[];
  };
}

export type LoadTongsHammerReleaseAssemblyResult =
  | {
    ok: true;
    status: number;
    snapshot: HammerPersistenceSnapshot;
    assembly: TongsHammerReleaseAssembly;
  }
  | {
    ok: false;
    status: number;
    error: string;
  };

function formatStatusLabel(status: HammerReleasePrepStatus): string {
  return status.replace(/_/g, " ");
}

function buildChecks(pkg: HammerReleasePrepPackage): TongsReleaseAssemblyCheck[] {
  return [
    {
      id: "transcript_output",
      label: "Transcript Output",
      status: pkg.readiness.transcript_output,
      detail: pkg.text_outputs
        ? `${pkg.text_outputs.resolved_output.segment_count} segments from ${pkg.text_outputs.output_selection.source_kind} output selection.`
        : "No resolved transcript output is available from persisted Hammer state.",
    },
    {
      id: "subtitle_srt",
      label: "SRT Subtitle",
      status: pkg.readiness.subtitles.srt,
      detail: pkg.text_outputs?.subtitles.srt.artifact
        ? `${pkg.text_outputs.subtitles.srt.artifact.entry_count} cues from ${pkg.text_outputs.subtitles.srt.artifact.source_kind} transcript output.`
        : "No SRT artifact has been generated yet.",
    },
    {
      id: "subtitle_vtt",
      label: "VTT Subtitle",
      status: pkg.readiness.subtitles.vtt,
      detail: pkg.text_outputs?.subtitles.vtt.artifact
        ? `${pkg.text_outputs.subtitles.vtt.artifact.entry_count} cues from ${pkg.text_outputs.subtitles.vtt.artifact.source_kind} transcript output.`
        : "No VTT artifact has been generated yet.",
    },
    {
      id: "visuals",
      label: "Visual Placements",
      status: pkg.readiness.visuals,
      detail: `${pkg.media_prep_outputs.visuals.placement_count} placements with ${pkg.media_prep_outputs.visuals.uncertain_placement_count} uncertain.`,
    },
    {
      id: "audio_polish",
      label: "Audio Polish",
      status: pkg.readiness.audio_polish,
      detail: pkg.media_backbone.audio_polish_plan?.detail
        ?? `${pkg.media_prep_outputs.audio.polish.status} with preferred playback ${pkg.media_prep_outputs.audio.preferred_playback.kind}.`,
    },
  ];
}

function summarizeStatus(
  checks: TongsReleaseAssemblyCheck[],
  blockingStates: Exclude<HammerReleasePrepStatus, "ready">[],
): {
  status: TongsReleaseAssemblySummaryStatus;
  message: string;
} {
  if (blockingStates.length === 0) {
    return {
      status: "ready",
      message: "Hammer release prep is current and downstream-consumable from persisted state.",
    };
  }

  if (blockingStates.some((state) => state === "failed" || state === "unsupported" || state === "requires_future_ffmpeg")) {
    return {
      status: "blocked",
      message: `Hammer release prep has blocking states: ${blockingStates.map(formatStatusLabel).join(", ")}.`,
    };
  }

  const nonReadyChecks = checks
    .filter((check) => check.status !== "ready")
    .map((check) => check.label.toLowerCase());

  return {
    status: "attention",
    message: `Hammer release prep loaded, but ${nonReadyChecks.join(", ")} need attention before downstream assembly should treat this as current.`,
  };
}

export function buildTongsHammerReleaseAssembly(
  target: HammerPersistenceTarget,
  snapshot: HammerPersistenceSnapshot,
  options?: {
    mediaBackboneRuntime?: HammerMediaBackboneRuntimeSummary | null;
  },
): TongsHammerReleaseAssembly {
  const releasePrep = buildHammerReleasePrepPackageFromSnapshot(snapshot, {
    mediaBackboneRuntime: options?.mediaBackboneRuntime ?? null,
  });
  const checks = buildChecks(releasePrep);
  const summary = summarizeStatus(checks, releasePrep.readiness.blocking_statuses);

  return {
    schema_version: 1,
    target: {
      workspace_id: target.workspaceId,
      workpiece_id: target.workpieceId,
    },
    release_prep: releasePrep,
    summary: {
      status: summary.status,
      ready_count: checks.filter((check) => check.status === "ready").length,
      attention_count: checks.filter((check) => check.status !== "ready").length,
      blocking_states: [...releasePrep.readiness.blocking_statuses],
      message: summary.message,
      checks,
    },
  };
}

export async function loadTongsHammerReleaseAssembly(
  target: HammerPersistenceTarget,
  options?: {
    mediaBackboneRuntime?: HammerMediaBackboneRuntimeSummary | null;
  },
): Promise<LoadTongsHammerReleaseAssemblyResult> {
  const snapshotResult = await loadHammerPersistenceSnapshot(target);
  if (!snapshotResult.ok) {
    return snapshotResult;
  }

  return {
    ok: true,
    status: snapshotResult.status,
    snapshot: snapshotResult.data,
    assembly: buildTongsHammerReleaseAssembly(target, snapshotResult.data, options),
  };
}
