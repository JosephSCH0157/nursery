import type { HammerLaunchSourceMode } from "../../../../packages/contracts/hammer/launch-context.contract";
import type { HammerPreviewMode } from "../../../../packages/contracts/hammer/edit-plan.contract";
import { buildHammerMediaPrepOutputsPackage } from "./hammerMediaPrepOutputsPackage";
import type { HammerMediaPrepOutputsPackage } from "./hammerMediaPrepOutputsPackage";
import { buildHammerTextOutputsPackage } from "./hammerTextOutputsPackage";
import type { HammerTextOutputPackage } from "./hammerTextOutputsPackage";
import {
  buildHammerMediaBackboneRuntimeSummary,
  resolveHammerAudioPolishExecutionPlan,
  type HammerAudioPolishExecutionPlan,
  type HammerMediaBackboneRuntimeSummary,
} from "../media/hammerMediaBackbone";
import type {
  HammerAlignmentStatus,
  HammerPersistenceSnapshot,
  HammerPersistedAudioPolish,
  HammerPersistedEditorSession,
  HammerPersistedStructuredTranscript,
  HammerPersistedVisualPlacements,
  HammerPrepStatus,
} from "../persistence/hammerPersistenceContract";
import type { HammerPackagingIntent } from "./hammerPackageMediaAuthority";
import type { HammerReleaseProfile } from "@forge/contracts/hammer/release-commit.contract";

export type HammerAudioVisualDeliverableIntent = "none" | "visual_deliverable";
export type HammerReleaseProfileAuthority = Readonly<{
  profile: HammerReleaseProfile;
  audio_visual_intent: HammerAudioVisualDeliverableIntent;
}>;
export const HAMMER_VIDEO_RELEASE_PROFILE_AUTHORITY: HammerReleaseProfileAuthority = Object.freeze({
  profile: "video_episode",
  audio_visual_intent: "none",
});

export type HammerReleasePrepStatus =
  | "ready"
  | "missing"
  | "stale"
  | "failed"
  | "unsupported"
  | "requires_future_ffmpeg";

export interface HammerReleasePrepPackage {
  schema_version: 1;
  release_profile_authority: HammerReleaseProfileAuthority;
  identity: {
    workspace_id: string | null;
    workpiece_id: string | null;
    prep_status: HammerPrepStatus | null;
    alignment_status: HammerAlignmentStatus | null;
    source_mode: HammerLaunchSourceMode | null;
    preview_mode: HammerPreviewMode | null;
    editor_session_id: string | null;
    transcript_source_id: string | null;
    media_id: string | null;
  };
  artifact_refs: {
    structured_transcript_path: string | null;
    visual_placements_path: string | null;
    audio_polish_path: string | null;
  };
  text_outputs: HammerTextOutputPackage | null;
  media_prep_outputs: HammerMediaPrepOutputsPackage;
  packaging_media: HammerPackagingIntent;
  media_backbone: {
    runtime: HammerMediaBackboneRuntimeSummary;
    audio_polish_plan: HammerAudioPolishExecutionPlan | null;
  };
  readiness: {
    transcript_output: HammerReleasePrepStatus;
    subtitles: {
      srt: HammerReleasePrepStatus;
      vtt: HammerReleasePrepStatus;
    };
    visuals: HammerReleasePrepStatus;
    audio_polish: HammerReleasePrepStatus;
    blocking_statuses: Exclude<HammerReleasePrepStatus, "ready">[];
    status_flags: {
      ready: boolean;
      missing: boolean;
      stale: boolean;
      failed: boolean;
      unsupported: boolean;
      requires_future_ffmpeg: boolean;
    };
    fully_prepared: boolean;
  };
}

export interface BuildHammerReleasePrepPackageArgs {
  releaseProfileAuthority?: HammerReleaseProfileAuthority;
  workspaceId?: string | null;
  workpieceId?: string | null;
  prepStatus?: HammerPrepStatus | null;
  alignmentStatus?: HammerAlignmentStatus | null;
  structuredTranscript?: HammerPersistedStructuredTranscript | null | undefined;
  visualPlacements?: HammerPersistedVisualPlacements | null | undefined;
  audioPolish?: HammerPersistedAudioPolish | null | undefined;
  editorSession?: HammerPersistedEditorSession | null | undefined;
  structuredTranscriptPath?: string | null;
  visualPlacementsPath?: string | null;
  audioPolishPath?: string | null;
  mediaBackboneRuntime?: HammerMediaBackboneRuntimeSummary | null | undefined;
  packagingMedia?: HammerPackagingIntent;
}

function inferSourceExtension(pathLike: string | null | undefined): string | null {
  if (typeof pathLike !== "string") return null;
  const trimmed = pathLike.trim();
  if (!trimmed) return null;
  const normalized = trimmed.split(/[?#]/, 1)[0];
  const slashIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex < slashIndex) return null;
  return normalized.slice(dotIndex).toLowerCase();
}

function resolveTranscriptOutputStatus(
  textOutputs: HammerTextOutputPackage | null,
): HammerReleasePrepStatus {
  if (!textOutputs) return "missing";
  if (textOutputs.resolved_output.segment_count <= 0) return "missing";
  if (!textOutputs.resolved_output.full_text.trim()) return "missing";
  return "ready";
}

function resolveSubtitleStatus(
  freshness: HammerTextOutputPackage["subtitles"]["srt"]["freshness"] | undefined,
): HammerReleasePrepStatus {
  switch (freshness) {
    case "current":
      return "ready";
    case "stale":
      return "stale";
    default:
      return "missing";
  }
}

function resolveVisualStatus(
  mediaPrepOutputs: HammerMediaPrepOutputsPackage,
): HammerReleasePrepStatus {
  if (mediaPrepOutputs.visuals.freshness === "stale") return "stale";
  if (mediaPrepOutputs.visuals.status === "prepared") return "ready";
  return "missing";
}

function resolveAudioPolishStatus(args: {
  mediaPrepOutputs: HammerMediaPrepOutputsPackage;
  audioPlan: HammerAudioPolishExecutionPlan | null;
}): HammerReleasePrepStatus {
  const polish = args.mediaPrepOutputs.audio.polish;
  if (polish.freshness === "stale") return "stale";
  if (polish.status === "prepared") return "ready";

  if (polish.status === "failed") {
    if (polish.failure_code === "unsupported_source") {
      if (args.audioPlan?.readiness === "requires_future_ffmpeg") {
        return "requires_future_ffmpeg";
      }
      return args.audioPlan?.readiness === "unsupported"
        ? "unsupported"
        : "failed";
    }
    return "failed";
  }

  if (args.audioPlan?.readiness === "requires_future_ffmpeg") {
    return "requires_future_ffmpeg";
  }
  if (args.audioPlan?.readiness === "unsupported") {
    return "unsupported";
  }
  return "missing";
}

function buildBlockingStatuses(
  statuses: HammerReleasePrepStatus[],
): Exclude<HammerReleasePrepStatus, "ready">[] {
  const ordered: Array<Exclude<HammerReleasePrepStatus, "ready">> = [
    "missing",
    "stale",
    "failed",
    "unsupported",
    "requires_future_ffmpeg",
  ];
  return ordered.filter((status) => statuses.includes(status));
}

export function buildHammerReleasePrepPackage(
  args: BuildHammerReleasePrepPackageArgs,
): HammerReleasePrepPackage {
  const releaseProfileAuthority = args.releaseProfileAuthority ?? HAMMER_VIDEO_RELEASE_PROFILE_AUTHORITY;
  const runtime = args.mediaBackboneRuntime ?? buildHammerMediaBackboneRuntimeSummary();
  const textOutputs = buildHammerTextOutputsPackage(args.structuredTranscript);
  const mediaPrepOutputs = buildHammerMediaPrepOutputsPackage({
    structuredTranscript: args.structuredTranscript,
    visualPlacements: args.visualPlacements,
    audioPolish: args.audioPolish,
    mediaRef: args.editorSession?.media_ref ?? null,
    mediaSourceLabel: args.editorSession?.media_source_label ?? null,
  });
  const sourceExtension = inferSourceExtension(
    mediaPrepOutputs.audio.raw_source.local_relpath
      ?? mediaPrepOutputs.audio.raw_source.cloud_uri
      ?? null,
  );
  const audioPlan = mediaPrepOutputs.audio.raw_source.kind
    ? resolveHammerAudioPolishExecutionPlan({
      runtime,
      mediaKind: mediaPrepOutputs.audio.raw_source.kind,
      sourceExtension,
    })
    : null;

  const transcriptOutputStatus = resolveTranscriptOutputStatus(textOutputs);
  const subtitleSrtStatus = resolveSubtitleStatus(textOutputs?.subtitles.srt.freshness);
  const subtitleVttStatus = resolveSubtitleStatus(textOutputs?.subtitles.vtt.freshness);
  const visualsStatus = resolveVisualStatus(mediaPrepOutputs);
  const audioPolishStatus = resolveAudioPolishStatus({
    mediaPrepOutputs,
    audioPlan,
  });
  const readinessStatuses: HammerReleasePrepStatus[] = releaseProfileAuthority.profile === "video_episode"
    ? [transcriptOutputStatus, subtitleSrtStatus, subtitleVttStatus, visualsStatus, audioPolishStatus]
    : [
      transcriptOutputStatus,
      ...(releaseProfileAuthority.audio_visual_intent === "visual_deliverable" ? [visualsStatus] : []),
      audioPolishStatus,
    ];

  return {
    schema_version: 1,
    release_profile_authority: releaseProfileAuthority,
    identity: {
      workspace_id: args.workspaceId ?? null,
      workpiece_id: args.workpieceId ?? null,
      prep_status: args.prepStatus ?? null,
      alignment_status: args.alignmentStatus ?? null,
      source_mode: args.editorSession?.source_mode ?? null,
      preview_mode: args.editorSession?.preview_mode ?? null,
      editor_session_id: args.editorSession?.session_id ?? null,
      transcript_source_id: args.editorSession?.transcript_source_id
        ?? textOutputs?.transcript_source.transcript_id
        ?? null,
      media_id: textOutputs?.transcript_source.media_id
        ?? mediaPrepOutputs.audio.raw_source.media_id
        ?? null,
    },
    artifact_refs: {
      structured_transcript_path: args.structuredTranscriptPath ?? null,
      visual_placements_path: args.visualPlacementsPath ?? null,
      audio_polish_path: args.audioPolishPath ?? null,
    },
    text_outputs: textOutputs,
    media_prep_outputs: mediaPrepOutputs,
    packaging_media: args.packagingMedia ?? {
      schemaVersion: 1,
      workspaceId: args.workspaceId ?? "",
      workpieceId: args.workpieceId ?? "",
      media: [],
      readiness: { state: "ready", blockingPlacementIds: [] },
    },
    media_backbone: {
      runtime,
      audio_polish_plan: audioPlan,
    },
    readiness: {
      transcript_output: transcriptOutputStatus,
      subtitles: {
        srt: subtitleSrtStatus,
        vtt: subtitleVttStatus,
      },
      visuals: visualsStatus,
      audio_polish: audioPolishStatus,
      blocking_statuses: buildBlockingStatuses(readinessStatuses),
      status_flags: {
        ready: readinessStatuses.includes("ready"),
        missing: readinessStatuses.includes("missing"),
        stale: readinessStatuses.includes("stale"),
        failed: readinessStatuses.includes("failed"),
        unsupported: readinessStatuses.includes("unsupported"),
        requires_future_ffmpeg: readinessStatuses.includes("requires_future_ffmpeg"),
      },
      fully_prepared: readinessStatuses.every((status) => status === "ready"),
    },
  };
}

export function buildHammerReleasePrepPackageFromSnapshot(
  snapshot: HammerPersistenceSnapshot | null | undefined,
  options?: {
    mediaBackboneRuntime?: HammerMediaBackboneRuntimeSummary | null | undefined;
    releaseProfileAuthority: HammerReleaseProfileAuthority;
  },
): HammerReleasePrepPackage {
  return buildHammerReleasePrepPackage({
    releaseProfileAuthority: options?.releaseProfileAuthority ?? HAMMER_VIDEO_RELEASE_PROFILE_AUTHORITY,
    workspaceId: snapshot?.state?.workspace_id ?? null,
    workpieceId: snapshot?.state?.workpiece_id ?? null,
    prepStatus: snapshot?.state?.prep_status ?? null,
    alignmentStatus: snapshot?.state?.alignment_status ?? null,
    structuredTranscript: snapshot?.structured_transcript.data,
    visualPlacements: snapshot?.visual_placements.data,
    audioPolish: snapshot?.audio_polish.data,
    editorSession: snapshot?.editor_session.data,
    structuredTranscriptPath: snapshot?.structured_transcript.path ?? null,
    visualPlacementsPath: snapshot?.visual_placements.path ?? null,
    audioPolishPath: snapshot?.audio_polish.path ?? null,
    mediaBackboneRuntime: options?.mediaBackboneRuntime ?? null,
  });
}
