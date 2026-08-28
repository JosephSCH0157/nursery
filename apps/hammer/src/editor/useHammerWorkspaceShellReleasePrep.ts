import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { HammerPreparedNextStepActionId } from "./hammerPreparedHandoff";
import type { HammerPassId } from "../persistence/hammerPersistenceContract";
import type { HammerWorkspaceFocusOverride } from "./hammerWorkspaceTimeline";
import {
  decideHammerQuenchHandoff,
  type HammerQuenchHandoffStatus,
  validateHammerQuenchPacketForHandoff,
} from "./hammerQuenchHandoff";
import type { HammerDialogueRenderExecutionResult } from "./hammerAudioProcessingBackend";
import { executeHammerFinalAudioRender } from "./hammerFinalAudioRenderExecution";
import type { HammerReadinessGateResult } from "./hammerReadinessGate";
import type { HammerRenderAssemblyResult } from "./hammerRenderAssembly";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerStudioRackState } from "./hammerStudioRack";
import type { HammerMediaBackboneRuntimeSummary } from "../media/hammerMediaBackbone";
import type { MediaRef } from "../../../../packages/contracts/hammer/media-resolver.contract";
import {
  type HammerPreparedReleaseOverallStatus,
  type HammerPreparedReleasePackage,
  buildHammerPreparedReleasePackage,
} from "../lib/hammerPreparedReleasePackage";
import { loadHammerPreparedReleasePackage, saveHammerPreparedReleasePackage } from "../lib/hammerPreparedReleasePackageApi";
import type { HammerReleasePrepPackage } from "../lib/hammerReleasePrepPackage";
import { buildHammerQuenchReleasePacket } from "../lib/hammerQuenchReleasePacket";
import { saveHammerQuenchReleasePacket } from "../lib/hammerQuenchReleasePacketApi";
import type { HammerEditorialAuthorityGraph } from "../../../../packages/contracts/hammer/editorial-authority.contract";
import { validateHammerReleasePrepPackageMedia } from "../lib/hammerPackageMediaAuthority";
import {
  buildHammerWorkspaceShellReleaseBasis,
  type HammerWorkspaceShellReleaseBasisInput,
  type HammerWorkspaceShellReleasePackageProjection,
} from "./hammerWorkspaceShellReleasePackage";

export function useHammerWorkspaceShellReleaseBasis(
  input: HammerWorkspaceShellReleaseBasisInput,
): HammerWorkspaceShellReleasePackageProjection {
  const {
    launchContext, previewMode, transcriptSourceId, transcriptSegments, structuredTranscript,
    outputSelection, captionFormatting, selectedCaptionArtifactFormat, captionBuildState,
    captionEditedState, editorialAuthorityGraph, visualTimeline, visualPlacements, audioPolish,
    selectedSegmentId, selectedClipId, mediaRef, workspaceMapping, mediaSourceLabel,
    visualWhiteBalance, visualColorAmount, visualBackgroundBlur, visualEyeContactAssistEnabled,
    visualEyeContactAssistStrength, visualBackgroundBlurPx, visualBackgroundBlurFeatherPx,
    visualBackgroundBlurTemporalSmoothing, visualBackgroundBlurSubjectExpansionPx,
    visualBackgroundBlurQualityMode, visualBackgroundBlurFallbackMode, visualBackgroundBlurProviderId,
    visualBackgroundReplaceEnabled, visualBackgroundReplaceMode, visualBackgroundReplaceColor,
    visualBackgroundReplaceImageUrl, visualBackgroundReplaceImageAssetPath,
    selectedBackgroundReplacementAssetId, visualBackgroundWashEnabled,
    visualBackgroundWashDimAmount, visualBackgroundWashDesaturateAmount, ffmpegAvailable,
  } = input;
  return useMemo(() => buildHammerWorkspaceShellReleaseBasis({
    launchContext, previewMode, transcriptSourceId, transcriptSegments, structuredTranscript,
    outputSelection, captionFormatting, selectedCaptionArtifactFormat, captionBuildState,
    captionEditedState, editorialAuthorityGraph, visualTimeline, visualPlacements, audioPolish,
    selectedSegmentId, selectedClipId, mediaRef, workspaceMapping, mediaSourceLabel,
    visualWhiteBalance, visualColorAmount, visualBackgroundBlur, visualEyeContactAssistEnabled,
    visualEyeContactAssistStrength, visualBackgroundBlurPx, visualBackgroundBlurFeatherPx,
    visualBackgroundBlurTemporalSmoothing, visualBackgroundBlurSubjectExpansionPx,
    visualBackgroundBlurQualityMode, visualBackgroundBlurFallbackMode, visualBackgroundBlurProviderId,
    visualBackgroundReplaceEnabled, visualBackgroundReplaceMode, visualBackgroundReplaceColor,
    visualBackgroundReplaceImageUrl, visualBackgroundReplaceImageAssetPath,
    selectedBackgroundReplacementAssetId, visualBackgroundWashEnabled,
    visualBackgroundWashDimAmount, visualBackgroundWashDesaturateAmount, ffmpegAvailable,
  }), [
    captionBuildState,
    captionEditedState,
    captionFormatting, outputSelection,
    transcriptSegments,
    launchContext,
    mediaRef,
    mediaSourceLabel,
    previewMode,
    structuredTranscript,
    visualPlacements,
    audioPolish,
    selectedCaptionArtifactFormat,
    selectedSegmentId, selectedClipId, visualTimeline,
    visualBackgroundBlur,
    visualBackgroundBlurFallbackMode,
    visualBackgroundBlurFeatherPx,
    visualBackgroundBlurPx,
    visualBackgroundBlurProviderId,
    visualBackgroundBlurQualityMode,
    visualBackgroundBlurSubjectExpansionPx,
    visualBackgroundBlurTemporalSmoothing,
    visualBackgroundReplaceColor,
    visualBackgroundReplaceEnabled,
    visualBackgroundReplaceImageAssetPath,
    selectedBackgroundReplacementAssetId,
    visualBackgroundReplaceImageUrl,
    visualBackgroundReplaceMode,
    visualBackgroundWashEnabled, visualBackgroundWashDimAmount, visualBackgroundWashDesaturateAmount,
    visualColorAmount,
    visualEyeContactAssistEnabled,
    visualEyeContactAssistStrength,
    visualWhiteBalance,
    transcriptSourceId,
    workspaceMapping,
    editorialAuthorityGraph,
    ffmpegAvailable,
  ]);
}

export type HammerReleasePrepSaveState = {
  preparedAt: string;
  overallStatus: HammerPreparedReleaseOverallStatus;
  subtitleArtifactCount: number;
};

export type UseHammerWorkspaceShellReleasePrepArgs = {
  workpieceId: string;
  workspaceId: string;
  recordingRevisionId: string | null;
  prepHandoffAction?: {
    id: Exclude<HammerPreparedNextStepActionId, "export_later">;
    token: number;
  } | null;
  setStudioRackRenderStatus: Dispatch<SetStateAction<HammerDialogueRenderExecutionResult | null>>;
  selectPass: (passId: HammerPassId) => void;
  setFocusOverride: Dispatch<SetStateAction<HammerWorkspaceFocusOverride>>;
  toErrorMessage: (error: unknown, fallback: string) => string;
};

export type SendToQuenchArgs = {
  releasePrepPackage: HammerReleasePrepPackage;
  renderAssembly: HammerRenderAssemblyResult;
  canonicalGraph: HammerEditorialAuthorityGraph | null;
  subtitles: {
    srt: string | null;
    vtt: string | null;
  };
  timelineRevision: string | null;
  readinessGate: HammerReadinessGateResult;
  mediaRef: MediaRef | null;
  editableStudioRack: HammerStudioRackState;
  preferredPlayback: {
    kind: "raw" | "polished" | "none";
    local_relpath: string | null;
    workpiece_path: string | null;
    mime_type: string | null;
  };
  playbackLocalRootAbs: string | null;
  editableTranscriptSegments: HammerTranscriptSegment[];
  mediaBackboneRuntime: HammerMediaBackboneRuntimeSummary;
};

export type UseHammerWorkspaceShellReleasePrepResult = {
  releasePrepSaving: boolean;
  releasePrepLoading: boolean;
  releasePrepError: string | null;
  releasePrepSaved: HammerReleasePrepSaveState | null;
  quenchHandoffStatus: {
    status: HammerQuenchHandoffStatus;
    message: string;
  } | null;
  loadedPreparedPackage: HammerPreparedReleasePackage | null;
  sendToQuench: (args: SendToQuenchArgs) => Promise<void>;
};

export function useHammerWorkspaceShellReleasePrep(
  args: UseHammerWorkspaceShellReleasePrepArgs,
): UseHammerWorkspaceShellReleasePrepResult {
  const [releasePrepSaving, setReleasePrepSaving] = useState(false);
  const [releasePrepLoading, setReleasePrepLoading] = useState(false);
  const [releasePrepError, setReleasePrepError] = useState<string | null>(null);
  const [releasePrepSaved, setReleasePrepSaved] = useState<HammerReleasePrepSaveState | null>(null);
  const [quenchHandoffStatus, setQuenchHandoffStatus] = useState<{
    status: HammerQuenchHandoffStatus;
    message: string;
  } | null>(null);
  const [loadedPreparedPackage, setLoadedPreparedPackage] = useState<HammerPreparedReleasePackage | null>(null);

  const lastHandledHandoffTokenRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    setReleasePrepLoading(true);
    setReleasePrepError(null);
    setLoadedPreparedPackage(null);
    setReleasePrepSaved(null);
    args.setStudioRackRenderStatus(null);

    void loadHammerPreparedReleasePackage(args.workpieceId)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setReleasePrepError(result.error);
          setReleasePrepLoading(false);
          return;
        }
        setLoadedPreparedPackage(result.exists ? (result.data ?? null) : null);
        setReleasePrepLoading(false);
      })
      .catch((error) => {
        if (!active) return;
        setReleasePrepError(args.toErrorMessage(error, "Hammer could not load prepared release package state."));
        setReleasePrepLoading(false);
      });

    return () => {
      active = false;
    };
  }, [args.setStudioRackRenderStatus, args.toErrorMessage, args.workpieceId]);

  const sendToQuench = useCallback(async (sendArgs: SendToQuenchArgs): Promise<void> => {
    if (releasePrepSaving) return;

    setReleasePrepSaving(true);
    setReleasePrepError(null);
    setReleasePrepSaved(null);
    setQuenchHandoffStatus(null);

    try {
      const releasePrepPackageSnapshot = await validateHammerReleasePrepPackageMedia(sendArgs.releasePrepPackage);
      const renderAssemblySnapshot = sendArgs.renderAssembly;
      const canonicalGraphSnapshot = sendArgs.canonicalGraph;
      const subtitlesSnapshot = sendArgs.subtitles;
      const timelineRevisionSnapshot = sendArgs.timelineRevision;
      const handoffDecision = decideHammerQuenchHandoff({
        releasePrepPackage: releasePrepPackageSnapshot,
        readinessGate: sendArgs.readinessGate,
      });
      if (handoffDecision.status === "blocked") {
        setQuenchHandoffStatus({
          status: "blocked",
          message: handoffDecision.reasons.join(" "),
        });
        return;
      }
      if (handoffDecision.status === "requires_confirmation") {
        const proceed = window.confirm(
          `This episode still needs review (${sendArgs.readinessGate.review_count} item${sendArgs.readinessGate.review_count === 1 ? "" : "s"}). Send to Quench anyway?`,
        );
        if (!proceed) {
          setQuenchHandoffStatus({
            status: "blocked",
            message: "Handoff cancelled. Resolve review items before sending.",
          });
          return;
        }
      }

      let renderExecution: HammerDialogueRenderExecutionResult;
      if (!sendArgs.mediaRef) {
        renderExecution = {
          status: "skipped",
          requestedBackend: sendArgs.editableStudioRack.backend_preference,
          resolvedBackend: "native",
          mode: "render",
          message: "No canonical source media is attached to this workpiece. Studio Rack render was skipped.",
          outputLocalRelpath: null,
          outputWorkpiecePath: null,
          outputMimeType: null,
          outputDurationMs: null,
          rawResponse: null,
        };
      } else {
        if (!args.recordingRevisionId) {
          throw new Error("Final audio rendering requires the canonical recording revision.");
        }
        renderExecution = await executeHammerFinalAudioRender({ workspaceId: args.workspaceId, workpieceId: args.workpieceId,
          recordingRevisionId: args.recordingRevisionId, timelineRevision: sendArgs.timelineRevision, mediaRef: sendArgs.mediaRef,
          preferredPlayback: sendArgs.preferredPlayback, playbackLocalRootAbs: sendArgs.playbackLocalRootAbs,
          transcriptSegments: sendArgs.editableTranscriptSegments, studioRack: sendArgs.editableStudioRack,
          canonicalGraph: sendArgs.canonicalGraph, renderAssembly: sendArgs.renderAssembly, runtimeSummary: sendArgs.mediaBackboneRuntime });
      }
      args.setStudioRackRenderStatus(renderExecution);

      const finalAudioMaster = renderExecution.rawResponse?.canonical_audio_master ?? null;
      if (!finalAudioMaster) {
        throw new Error(renderExecution.message || "Hammer did not produce a canonical final-audio master.");
      }

      const preparedPackage = buildHammerPreparedReleasePackage({
        current: releasePrepPackageSnapshot,
        timelineRevision: timelineRevisionSnapshot,
        finalAudioMaster,
      });

      const result = await saveHammerPreparedReleasePackage({
        workpieceId: args.workpieceId,
        pkg: preparedPackage,
        subtitles: subtitlesSnapshot,
      });
      if (!result.ok) {
        throw new Error(result.error);
      }

      const quenchPacket = buildHammerQuenchReleasePacket({
        releasePrepPackage: releasePrepPackageSnapshot,
        readinessGate: sendArgs.readinessGate,
        preparedAt: preparedPackage.preparedAt,
        canonicalGraph: canonicalGraphSnapshot,
        renderAssembly: renderAssemblySnapshot,
        finalAudioMaster,
      });
      const packetValidation = validateHammerQuenchPacketForHandoff({
        releasePrepPackage: releasePrepPackageSnapshot,
        packet: quenchPacket,
        renderAssembly: renderAssemblySnapshot,
        readinessGate: sendArgs.readinessGate,
      });
      if (!packetValidation.ok) {
        setQuenchHandoffStatus({
          status: "failed_validation",
          message: packetValidation.reasons.join(" "),
        });
        return;
      }
      const packetSave = await saveHammerQuenchReleasePacket({
        workpieceId: args.workpieceId,
        packet: quenchPacket,
      });
      if (!packetSave.ok) {
        setQuenchHandoffStatus({
          status: "failed_handoff",
          message: packetSave.error,
        });
        return;
      }

      const subtitleArtifactCount = Number(Boolean(preparedPackage.subtitles.srt.artifactPath))
        + Number(Boolean(preparedPackage.subtitles.vtt.artifactPath));

      setReleasePrepSaved({
        preparedAt: preparedPackage.preparedAt,
        overallStatus: preparedPackage.overallStatus,
        subtitleArtifactCount,
      });
      setLoadedPreparedPackage(result.data ?? preparedPackage);
      setQuenchHandoffStatus({
        status: "sent",
        message: "Sent to Quench successfully.",
      });
    } catch (error) {
      const message = args.toErrorMessage(error, "Hammer could not send the Quench release packet.");
      setReleasePrepError(message);
      setQuenchHandoffStatus({
        status: "failed_persistence",
        message,
      });
    } finally {
      setReleasePrepSaving(false);
    }
  }, [args.setStudioRackRenderStatus, args.toErrorMessage, args.workpieceId, args.workspaceId, releasePrepSaving]);

  useEffect(() => {
    if (!args.prepHandoffAction) return;
    if (args.prepHandoffAction.token === lastHandledHandoffTokenRef.current) return;

    lastHandledHandoffTokenRef.current = args.prepHandoffAction.token;

    switch (args.prepHandoffAction.id) {
      case "review_transcript":
      case "begin_manual_editing":
        args.selectPass("transcript_cleanup");
        args.setFocusOverride("source-focus");
        break;
      case "review_visuals":
        args.selectPass("image_placement");
        args.setFocusOverride("tool-focus");
        break;
      case "review_audio":
        args.selectPass("audio_finalization");
        args.setFocusOverride("tool-focus");
        break;
      case "review_macros":
        args.selectPass("packaging");
        args.setFocusOverride("tool-focus");
        break;
      default:
        break;
    }
  }, [args.prepHandoffAction, args.selectPass, args.setFocusOverride]);

  return {
    releasePrepSaving,
    releasePrepLoading,
    releasePrepError,
    releasePrepSaved,
    quenchHandoffStatus,
    loadedPreparedPackage,
    sendToQuench,
  };
}
