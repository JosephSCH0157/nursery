import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import { normalizeHammerOrchestrationState } from "../../../../packages/tongs/src/hammer-orchestration-contract";
import { HAMMER_PASS_ORDER_VERSION } from "../../../../packages/tongs/src/hammer-orchestration-contract";
import HammerWorkspaceShell from "./HammerWorkspaceShell";
import type { HammerWorkspaceSnapshot } from "./hammerWorkspaceSnapshot";
import "./HammerWorkspaceEditor.css";
import {
  buildHammerPreparedHandoffModel,
  type HammerPreparedNextStepActionId,
} from "./hammerPreparedHandoff";
import { applyHammerSessionAction } from "./hammerSessionActions";
import {
  resolveHammerReloadFailure,
  resolveHammerReloadSuccess,
  resolveHammerSaveFailure,
  resolveHammerSaveSuccess,
} from "./hammerSessionHostLoop";
import { deriveHammerSessionState, deriveHammerSessionStateActions } from "./hammerSessionState";
import { buildHammerMediaPrepOutputsPackage } from "../lib/hammerMediaPrepOutputsPackage";
import {
  buildHammerPersistenceSaveRequest,
  loadHammerPresence,
  readHammerPersistenceTarget,
  upsertHammerPresence,
} from "../persistence/hammerPersistence";
import type { HammerPersistenceSnapshot, HammerPersistenceTarget, HammerPresenceRow } from "../persistence/hammerPersistenceContract";
import {
  loadHammerCanonicalBaselineArtifacts,
  loadHammerRecordingRevisionArtifacts,
  loadLegacyHammerTranscriptArtifacts,
  openHammerRecordingSession,
  resetHammerRecordingRevision,
  saveHammerRecordingRevision,
  sealHammerCanonicalBaseline,
  type HammerCanonicalRecordingRecord,
  type HammerRecordingRevisionRecord,
} from "../persistence/hammerRecordingRevisionPersistence";
import {
  applyPreparedTranscriptToLaunchContext,
  buildHammerPrepOverlayViewModel,
  buildHammerPrepPersistenceSaveRequest,
  buildPreparedTranscript,
  createHammerPrepState,
  ensureHammerLaunchSessionId,
  resolveHammerPrepOpenDecision,
  resolveHammerPrepSource,
  type HammerPrepState,
} from "../prep/hammerPrep";
import {
  buildHammerPrepAiNoticeModel,
  shouldShowHammerPrepAiNotice,
  type HammerPrepAiEffectiveLane,
} from "../prep/hammerPrepAiNotice";
import {
  buildFailedHammerAudioPolish,
  buildPreparedHammerAudioPolish,
  buildPreparingHammerAudioPolish,
  isReusableHammerAudioPolish,
} from "../prep/hammerAudioPolish";
import {
  requestHammerAudioPolish,
  requestHammerAudioPolishProgress,
  type HammerAudioPolishPhase,
} from "../prep/hammerAudioPolishApi";
import { requestHammerTranscriptPrep } from "../prep/hammerPrepApi";
import {
  clearHammerTranscriptPrepNonAiMissingBehavior,
  readHammerTranscriptPrepNonAiMissingBehavior,
  saveHammerTranscriptPrepNonAiMissingBehavior,
  type HammerTranscriptPrepNonAiMissingBehavior,
} from "../prep/hammerTranscriptPrepPromptPreference";
import {
  buildHammerLaunchContextFromRecordingTruth,
  loadHammerWorkpieceRecordingTruth,
} from "../app/hammerRuntimeData";
import {
  buildUnavailableHammerVisualPlacements,
  deriveHammerVisualPlacements,
  isReusableHammerVisualPlacements,
  loadHammerWorkpieceVisualPackage,
} from "../lib/hammerVisualPlacements";
import { loadHammerVisualTimelineStateFromSnapshot } from "../visuals/persistence/hammerVisualTimelinePersistence";
import { hasTongsUserAccessToken } from "../lib/tongsFetch";
import { loadWorkspaceMapping } from "../media/workspaceMapping";
import { hydrateHammerOpenLaunchContext } from "./hammerOpenHydration";

export interface HammerWorkspaceEditorProps {
  launchContext?: HammerLaunchContext;
  routeSearch?: string;
  persistenceMode?: "canonical" | "disabled";
  releasePrepHref?: string | null;
  allowDevLaunchFallback?: boolean;
  prepAiNoticeEffectiveLane?: HammerPrepAiEffectiveLane;
  prepAiNoticeAcknowledgedLaneSignature?: string | null;
  prepAiNoticeResolutionState?: "ready" | "loading" | "error";
  prepAiNoticeResolutionError?: string | null;
  onPrepAiNoticeAcknowledgeLane?: (laneSignature: string) => void | Promise<void>;
  onRequestAiSettings?: () => void;
}

const HEARTBEAT_INTERVAL_MS = 30_000;
const READY_HANDOFF_DELAY_MS = 320;
const SAVE_DEBOUNCE_MS = 400;

type HammerPreparedActionIntent = {
  id: Exclude<
    HammerPreparedNextStepActionId,
    "export_later"
  >;
  token: number;
};

function buildTargetKey(workspaceId: string, workpieceId: string): string {
  return `${workspaceId}:${workpieceId}`;
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function withSessionId(launchContext?: HammerLaunchContext): HammerLaunchContext | undefined {
  return launchContext ? ensureHammerLaunchSessionId(launchContext) : undefined;
}

function emitPrepAiNoticeTelemetry(eventName: string, detail: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  } catch {
    // keep telemetry best-effort
  }
}

function mapAudioPolishPhaseToPrepStep(
  phase: HammerAudioPolishPhase,
): Extract<HammerPrepState["step"], "extracting_working_audio" | "analyzing_loudness" | "detecting_silence" | "building_chunk_map" | "finalizing_audio_prep"> {
  switch (phase) {
    case "extracting_working_audio":
      return "extracting_working_audio";
    case "analyzing_loudness":
      return "analyzing_loudness";
    case "detecting_silence":
      return "detecting_silence";
    case "building_chunk_map":
      return "building_chunk_map";
    case "finalizing_audio_prep":
      return "finalizing_audio_prep";
    default:
      return "extracting_working_audio";
  }
}

async function loadCanonicalBootstrapLaunchContext(
  workspaceId: string,
  workpieceId: string,
): Promise<HammerLaunchContext | null> {
  const [recordingTruth, workspaceMapping] = await Promise.all([
    loadHammerWorkpieceRecordingTruth(workpieceId),
    loadWorkspaceMapping(workspaceId),
  ]);

  return buildHammerLaunchContextFromRecordingTruth({
    workspaceId,
    workpieceId,
    recordingTruth,
    workspaceMapping,
  });
}

function useDynamicCssText(scopeId: string, cssText: string): void {
  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const styleElement = document.createElement("style");
    styleElement.setAttribute("data-hammer-workspace-editor-dynamic", scopeId);
    styleElement.textContent = cssText;
    document.head.appendChild(styleElement);

    return () => {
      styleElement.remove();
    };
  }, [cssText, scopeId]);
}

export default function HammerWorkspaceEditor(
  props: HammerWorkspaceEditorProps,
): JSX.Element {
  const persistenceMode = props.persistenceMode ?? "disabled";
  const persistenceTarget = useMemo(
    () => (persistenceMode === "canonical"
      ? readHammerPersistenceTarget(props.routeSearch ?? "", props.launchContext)
      : null),
    [persistenceMode, props.launchContext, props.routeSearch],
  );
  const targetKey = persistenceTarget
    ? buildTargetKey(persistenceTarget.workspaceId, persistenceTarget.workpieceId)
    : null;
  const [effectiveLaunchContext, setEffectiveLaunchContext] = useState<HammerLaunchContext | undefined>(
    () => withSessionId(props.launchContext),
  );
  const [loadedPersistenceSnapshot, setLoadedPersistenceSnapshot] = useState<HammerPersistenceSnapshot | null>(null);
  const [activeCanonicalRecording, setActiveCanonicalRecording] = useState<HammerCanonicalRecordingRecord | null>(null);
  const [activeRevision, setActiveRevision] = useState<HammerRecordingRevisionRecord | null>(null);
  const [hydrationReady, setHydrationReady] = useState(persistenceMode !== "canonical");
  const [hasCanonicalBasis, setHasCanonicalBasis] = useState(Boolean(props.launchContext));
  const [workspaceSnapshot, setWorkspaceSnapshot] = useState<HammerWorkspaceSnapshot | null>(null);
  const [prepState, setPrepState] = useState<HammerPrepState>(() => (
    persistenceMode === "canonical" && persistenceTarget
      ? createHammerPrepState("preparing", "loading_context")
      : createHammerPrepState("idle", null)
  ));
  const [showPreparedHandoff, setShowPreparedHandoff] = useState(false);
  const [preparedActionIntent, setPreparedActionIntent] = useState<HammerPreparedActionIntent | null>(null);
  const [prepAttemptNonce, setPrepAttemptNonce] = useState(0);
  const [prepFailureKind, setPrepFailureKind] = useState<"non_ai_missing" | "ai_failed" | null>(null);
  const [prepAiFallbackRequested, setPrepAiFallbackRequested] = useState(false);
  const [prepFailureDontAskAgain, setPrepFailureDontAskAgain] = useState(false);
  const [transcriptPrepPreferenceNotice, setTranscriptPrepPreferenceNotice] = useState<{
    label: string;
  } | null>(null);
  const [transcriptPrepPreferenceNonce, setTranscriptPrepPreferenceNonce] = useState(0);
  const [hasPendingSaveChanges, setHasPendingSaveChanges] = useState(false);
  const [saveInFlight, setSaveInFlight] = useState(false);
  const [saveFailureMessage, setSaveFailureMessage] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [historyRecoveryStatus, setHistoryRecoveryStatus] = useState<string | null>(null);
  const [presenceConflictDetail, setPresenceConflictDetail] = useState<string | null>(null);
  const [resetToRawInFlight, setResetToRawInFlight] = useState(false);
  const [resetToRawError, setResetToRawError] = useState<string | null>(null);
  const [reloadRequestNonce, setReloadRequestNonce] = useState(0);
  const [saveRetryNonce, setSaveRetryNonce] = useState(0);
  const [showPrepAiNotice, setShowPrepAiNotice] = useState(false);
  const [prepAiNoticeDontShowAgain, setPrepAiNoticeDontShowAgain] = useState(false);
  const [prepAiNoticeDecisionNonce, setPrepAiNoticeDecisionNonce] = useState(0);
  const openedAtRef = useRef(new Date().toISOString());
  const saveTimerRef = useRef<number | null>(null);
  const readyTransitionTimerRef = useRef<number | null>(null);
  const lastSavedPayloadRef = useRef<string | null>(null);
  const pendingSaveRef = useRef<{
    target: HammerPersistenceTarget;
    revisionId: string;
    request: {
      editor_session: unknown;
      revision_transcript: unknown;
      audio_polish?: unknown;
      visual_timeline?: unknown;
      visual_placements?: unknown;
    };
    payloadKey: string;
  } | null>(null);
  const prepRunKeyRef = useRef<string | null>(null);
  const prepAiNoticeApprovedRunKeyRef = useRef<string | null>(null);
  const prepAiNoticeCancelledRunKeyRef = useRef<string | null>(null);
  const prepAiNoticePendingRunKeyRef = useRef<string | null>(null);
  const prepAiNoticeShownRunKeyRef = useRef<string | null>(null);
  const lastPrepRunKeyRef = useRef<string | null>(null);
  const prepExecutionIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const dynamicStyleScopeIdRef = useRef(`hammer-workspace-editor-${Math.random().toString(36).slice(2, 10)}`);
  const handoffPanelRef = useRef<HTMLElement | null>(null);

  function applyHostLoopState(next: {
    hasPendingSaveChanges: boolean;
    saveFailureMessage: string | null;
    historyRecoveryStatus: string | null;
    presenceConflictDetail: string | null;
  }): void {
    setHasPendingSaveChanges(next.hasPendingSaveChanges);
    setSaveFailureMessage(next.saveFailureMessage);
    setHistoryRecoveryStatus(next.historyRecoveryStatus);
    setPresenceConflictDetail(next.presenceConflictDetail);
  }

  const clearReadyTransitionTimer = (): void => {
    if (readyTransitionTimerRef.current != null) {
      window.clearTimeout(readyTransitionTimerRef.current);
      readyTransitionTimerRef.current = null;
    }
  };

  const beginPrepExecution = (): number => {
    prepExecutionIdRef.current += 1;
    return prepExecutionIdRef.current;
  };

  const isPrepExecutionActive = (executionId: number): boolean => (
    isMountedRef.current && prepExecutionIdRef.current === executionId
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      prepExecutionIdRef.current += 1;
      clearReadyTransitionTimer();
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (prepState.status !== "prep_failed" || prepFailureKind !== "non_ai_missing") {
      setPrepFailureDontAskAgain(false);
    }
  }, [prepFailureKind, prepState.status]);

  const ensureVisualPlacements = async (args: {
    launchContext: HammerLaunchContext;
    transcriptSourceId: string;
    transcriptSegments: HammerWorkspaceSnapshot["transcriptSegments"];
    currentSnapshot: HammerPersistenceSnapshot | null;
  }): Promise<HammerPersistenceSnapshot> => {
    if (!persistenceTarget || !activeRevision) {
      throw new Error("Hammer visual placement persistence requires a canonical target.");
    }

    const visualPackageResult = await loadHammerWorkpieceVisualPackage(
      args.launchContext.workpiece_id,
      args.launchContext.workspace_id,
    );
    const visualPlacements = visualPackageResult.ok
      ? deriveHammerVisualPlacements({
        transcriptSourceId: args.transcriptSourceId,
        transcriptSegments: args.transcriptSegments,
        visualPackage: visualPackageResult.data,
      })
      : buildUnavailableHammerVisualPlacements(
        args.transcriptSourceId,
        `visual_package_unavailable:${visualPackageResult.status}`,
      );

    if (
      visualPackageResult.ok
      && isReusableHammerVisualPlacements(
        args.currentSnapshot?.visual_placements.data ?? null,
        args.transcriptSourceId,
        visualPackageResult.data,
      )
      && args.currentSnapshot
    ) {
      return args.currentSnapshot;
    }

    const nextPlacementKey = JSON.stringify(visualPlacements);
    const currentPlacementKey = JSON.stringify(args.currentSnapshot?.visual_placements.data ?? null);
    if (nextPlacementKey === currentPlacementKey && args.currentSnapshot) {
      return args.currentSnapshot;
    }

    const saveResult = await saveHammerRecordingRevision(
      persistenceTarget,
      activeRevision.id,
      { visual_placements: { data: visualPlacements } },
    );
    if (!saveResult.ok) throw new Error(saveResult.error);
    setActiveRevision(saveResult.data.revision);
    return {
      ...(args.currentSnapshot ?? {
        schema_version: 1,
        state: null,
        editor_session: { path: null, updated_at: null, data: null },
        structured_transcript: { path: null, updated_at: null, data: null },
        speaker_map: { path: null, updated_at: null, data: null },
        visual_placements: { path: null, updated_at: null, data: null },
        visual_timeline: { path: null, updated_at: null, data: null },
        audio_polish: { path: null, updated_at: null, data: null },
        edit_plan: { path: null, updated_at: null, data: null },
        editorial_authority: { path: null, updated_at: null, data: null },
        macro_hooks: { recipe_ref: null, last_run_ref: null },
      }),
      visual_placements: {
        path: saveResult.data.revision.visual_placements_path,
        updated_at: new Date().toISOString(),
        data: visualPlacements,
      },
    };
  };

  const ensureAudioPolish = async (args: {
    launchContext: HammerLaunchContext;
    currentSnapshot: HammerPersistenceSnapshot | null;
    onPhaseChange?: (phase: HammerAudioPolishPhase) => void;
  }): Promise<HammerPersistenceSnapshot | null> => {
    if (!persistenceTarget || !activeRevision) {
      throw new Error("Hammer audio polish persistence requires a canonical target.");
    }

    const prepSource = resolveHammerPrepSource(args.launchContext);
    if (!prepSource) {
      return args.currentSnapshot;
    }

    const existingAudioPolish = args.currentSnapshot?.audio_polish.data ?? null;
    if (isReusableHammerAudioPolish(existingAudioPolish, prepSource)) {
      return args.currentSnapshot;
    }

    const preparingSave = await saveHammerRecordingRevision(
      persistenceTarget,
      activeRevision.id,
      { audio_polish: { data: buildPreparingHammerAudioPolish(prepSource) } },
    );
    if (!preparingSave.ok) throw new Error(preparingSave.error);
    setActiveRevision(preparingSave.data.revision);

    const baseSnapshot: HammerPersistenceSnapshot = args.currentSnapshot ?? {
      schema_version: 1,
      state: null,
      editor_session: { path: null, updated_at: null, data: null },
      structured_transcript: { path: null, updated_at: null, data: null },
      speaker_map: { path: null, updated_at: null, data: null },
      visual_placements: { path: null, updated_at: null, data: null },
      visual_timeline: { path: null, updated_at: null, data: null },
      audio_polish: { path: null, updated_at: null, data: null },
      edit_plan: { path: null, updated_at: null, data: null },
      editorial_authority: { path: null, updated_at: null, data: null },
      macro_hooks: { recipe_ref: null, last_run_ref: null },
    };

    let pollingCancelled = false;
    try {
      const pollForProgress = async () => {
        while (!pollingCancelled) {
          try {
            const progress = await requestHammerAudioPolishProgress({
              workspace_id: args.launchContext.workspace_id,
              workpiece_id: args.launchContext.workpiece_id,
            });
            if (progress.phase) {
              args.onPhaseChange?.(progress.phase);
            }
            if (progress.status === "prepared" || progress.status === "failed") {
              break;
            }
          } catch {
            // keep polling best-effort until request resolves
          }
          await new Promise((resolve) => window.setTimeout(resolve, 250));
        }
      };
      args.onPhaseChange?.("extracting_working_audio");
      void pollForProgress();

      const response = await requestHammerAudioPolish({
        workspace_id: args.launchContext.workspace_id,
        workpiece_id: args.launchContext.workpiece_id,
        media_kind: prepSource.mediaRef.kind,
        local_root_abs: prepSource.local_root_abs,
        local_relpath: prepSource.local_relpath,
        canonical_workpiece_path: prepSource.canonical_workpiece_path,
        mime_type: prepSource.mediaRef.kind === "recording_audio" ? "audio/wav" : null,
      });
      if (response.phase) {
        args.onPhaseChange?.(response.phase);
      }

      const audioPolish = response.status === "prepared"
        ? buildPreparedHammerAudioPolish({
          prepSource,
          preparedAt: response.prepared_at ?? new Date().toISOString(),
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
          failureReason: response.failed_phase
            ? `[${response.failed_phase}] ${response.failure_reason ?? "Hammer could not produce a baseline audio polish artifact."}`
            : (response.failure_reason ?? "Hammer could not produce a baseline audio polish artifact."),
          settingsSummary: response.settings_summary,
        });

      const finalSave = await saveHammerRecordingRevision(
        persistenceTarget,
        activeRevision.id,
        { audio_polish: { data: audioPolish } },
      );
      if (!finalSave.ok) throw new Error(finalSave.error);
      setActiveRevision(finalSave.data.revision);
      return {
        ...baseSnapshot,
        audio_polish: {
          path: finalSave.data.revision.audio_polish_path,
          updated_at: new Date().toISOString(),
          data: audioPolish,
        },
      } as HammerPersistenceSnapshot;
    } catch (error) {
      const failureArtifact = buildFailedHammerAudioPolish({
        prepSource,
        failureCode: "processing_failed",
        failureReason: toErrorMessage(error, "Hammer could not produce a baseline audio polish artifact."),
      });
      const failedSave = await saveHammerRecordingRevision(
        persistenceTarget,
        activeRevision.id,
        { audio_polish: { data: failureArtifact } },
      );
      if (!failedSave.ok) throw new Error(failedSave.error);
      setActiveRevision(failedSave.data.revision);
      return {
        ...baseSnapshot,
        audio_polish: {
          path: failedSave.data.revision.audio_polish_path,
          updated_at: new Date().toISOString(),
          data: failureArtifact,
        },
      } as HammerPersistenceSnapshot;
    } finally {
      pollingCancelled = true;
    }
  };

  const buildHydratedSnapshot = (args: {
    target: HammerPersistenceTarget;
    canonicalRecording: HammerCanonicalRecordingRecord;
    revision: HammerRecordingRevisionRecord;
    canonicalTranscript: HammerPersistenceSnapshot["structured_transcript"]["data"];
    canonicalSpeakerMap: HammerPersistenceSnapshot["speaker_map"]["data"];
    revisionEditorSession: HammerPersistenceSnapshot["editor_session"]["data"];
    revisionTranscript: HammerPersistenceSnapshot["structured_transcript"]["data"];
    revisionAudioPolish: HammerPersistenceSnapshot["audio_polish"]["data"];
    revisionVisualTimeline: HammerPersistenceSnapshot["visual_timeline"]["data"];
    revisionVisualPlacements: HammerPersistenceSnapshot["visual_placements"]["data"];
  }): HammerPersistenceSnapshot => {
    const transcript = args.revisionTranscript ?? args.canonicalTranscript ?? null;
    const hasTranscript = Boolean(transcript?.segments?.length);
    const nowIso = new Date().toISOString();
    const orchestration = normalizeHammerOrchestrationState({
      prep_status: hasTranscript ? "prepared" : "idle",
      alignment_status: hasTranscript ? "aligned" : "not_started",
      current_pass: "transcript_cleanup",
      pass_order_version: HAMMER_PASS_ORDER_VERSION,
      pass_status: {},
      edit_plan_signature: null,
      macro_recipe_ref: null,
      last_macro_run_ref: null,
    });

    return {
      schema_version: 1,
      state: {
        workspace_id: args.target.workspaceId,
        workpiece_id: args.target.workpieceId,
        active_session_id: args.revisionEditorSession?.session_id ?? null,
        current_pass: orchestration.current_pass,
        pass_order_version: orchestration.pass_order_version,
        pass_status: orchestration.pass_status,
        editor_session_path: args.revision.editor_session_path,
        transcript_artifact_path: args.revision.revision_transcript_path ?? args.canonicalRecording.baseline_transcript_path,
        speaker_map_artifact_path: args.canonicalRecording.baseline_speaker_map_path,
        visual_placement_artifact_path: args.revision.visual_placements_path,
        visual_timeline_artifact_path: args.revision.visual_timeline_path,
        audio_polish_artifact_path: args.revision.audio_polish_path,
        edit_plan_artifact_path: null,
        editorial_authority_artifact_path: null,
        edit_plan_signature: orchestration.edit_plan_signature,
        prep_status: orchestration.prep_status,
        alignment_status: orchestration.alignment_status,
        macro_recipe_ref: orchestration.macro_recipe_ref,
        last_macro_run_ref: orchestration.last_macro_run_ref,
        last_opened_at: nowIso,
        updated_at: nowIso,
        updated_by: "revision",
      },
      editor_session: {
        path: args.revision.editor_session_path,
        updated_at: null,
        data: args.revisionEditorSession ?? null,
      },
      structured_transcript: {
        path: args.revision.revision_transcript_path ?? args.canonicalRecording.baseline_transcript_path,
        updated_at: null,
        data: transcript,
      },
      speaker_map: {
        path: args.canonicalRecording.baseline_speaker_map_path,
        updated_at: null,
        data: args.canonicalSpeakerMap ?? null,
      },
      visual_placements: {
        path: args.revision.visual_placements_path,
        updated_at: null,
        data: args.revisionVisualPlacements ?? null,
      },
      visual_timeline: {
        path: args.revision.visual_timeline_path,
        updated_at: null,
        data: args.revisionVisualTimeline ?? null,
      },
      audio_polish: {
        path: args.revision.audio_polish_path,
        updated_at: null,
        data: args.revisionAudioPolish ?? null,
      },
      edit_plan: {
        path: null,
        updated_at: null,
        data: null,
      },
      editorial_authority: {
        path: null,
        updated_at: null,
        data: null,
      },
      macro_hooks: {
        recipe_ref: null,
        last_run_ref: null,
      },
    };
  };

  useEffect(() => {
    beginPrepExecution();
    lastSavedPayloadRef.current = null;
    setSaveInFlight(false);
    setLastSavedAt(null);
    prepRunKeyRef.current = null;
    setPrepFailureKind(null);
    setPrepAiFallbackRequested(false);
    setWorkspaceSnapshot(null);
    setLoadedPersistenceSnapshot(null);
    setActiveCanonicalRecording(null);
    setActiveRevision(null);
    setShowPreparedHandoff(false);
    setShowPrepAiNotice(false);
    setPrepAiNoticeDontShowAgain(false);
    setPreparedActionIntent(null);
    openedAtRef.current = new Date().toISOString();
    setEffectiveLaunchContext(withSessionId(props.launchContext));

    clearReadyTransitionTimer();
    prepAiNoticeApprovedRunKeyRef.current = null;
    prepAiNoticeCancelledRunKeyRef.current = null;
    prepAiNoticePendingRunKeyRef.current = null;
    prepAiNoticeShownRunKeyRef.current = null;
    lastPrepRunKeyRef.current = null;

    if (persistenceMode !== "canonical" || !persistenceTarget) {
      setPrepState(createHammerPrepState("idle", null));
      setHydrationReady(true);
      setHasCanonicalBasis(Boolean(props.launchContext));
      return;
    }

    let active = true;
    setHydrationReady(false);
    setHasCanonicalBasis(Boolean(props.launchContext));
    setPrepState(createHammerPrepState("preparing", "loading_context"));

    void openHammerRecordingSession(persistenceTarget)
      .then(async (sessionResult) => {
        if (!active) return;

        let nextLaunchContext = withSessionId(props.launchContext);
        let nextHasCanonicalBasis = Boolean(nextLaunchContext);
        let hydratedSnapshot: HammerPersistenceSnapshot | null = null;

        if (sessionResult.ok) {
          setActiveCanonicalRecording(sessionResult.data.canonical_recording);
          setActiveRevision(sessionResult.data.revision);

          const [baselineResult, revisionArtifactsResult] = await Promise.all([
            loadHammerCanonicalBaselineArtifacts(sessionResult.data.canonical_recording),
            loadHammerRecordingRevisionArtifacts(sessionResult.data.revision),
          ]);

          const canonicalTranscript = baselineResult.ok ? baselineResult.data.structured_transcript : null;
          const canonicalSpeakerMap = baselineResult.ok ? baselineResult.data.speaker_map : null;
          const revisionEditorSession = revisionArtifactsResult.ok ? revisionArtifactsResult.data.editor_session : null;
          const revisionTranscript = revisionArtifactsResult.ok ? revisionArtifactsResult.data.revision_transcript : null;
          const revisionAudioPolish = revisionArtifactsResult.ok ? revisionArtifactsResult.data.audio_polish : null;
          const revisionVisualTimeline = revisionArtifactsResult.ok ? revisionArtifactsResult.data.visual_timeline : null;
          const revisionVisualPlacements = revisionArtifactsResult.ok ? revisionArtifactsResult.data.visual_placements : null;

          const nextHydratedSnapshot = buildHydratedSnapshot({
            target: persistenceTarget,
            canonicalRecording: sessionResult.data.canonical_recording,
            revision: sessionResult.data.revision,
            canonicalTranscript,
            canonicalSpeakerMap,
            revisionEditorSession,
            revisionTranscript,
            revisionAudioPolish,
            revisionVisualTimeline,
            revisionVisualPlacements,
          });
          hydratedSnapshot = nextHydratedSnapshot;
          setLoadedPersistenceSnapshot(nextHydratedSnapshot);

          const openHydration = hydrateHammerOpenLaunchContext({
            target: persistenceTarget,
            hydratedSnapshot: nextHydratedSnapshot,
            initialLaunchContext: nextLaunchContext,
            bootstrapLaunchContext: undefined,
          });
          nextLaunchContext = withSessionId(openHydration.launchContext);
          nextHasCanonicalBasis = openHydration.hasCanonicalBasis;
        }

        if (!nextLaunchContext) {
          try {
            const bootstrapLaunchContext = withSessionId(
              (await loadCanonicalBootstrapLaunchContext(
                persistenceTarget.workspaceId,
                persistenceTarget.workpieceId,
              )) ?? undefined,
            );
            const mergedHydration = hydrateHammerOpenLaunchContext({
              target: persistenceTarget,
              hydratedSnapshot,
              initialLaunchContext: undefined,
              bootstrapLaunchContext,
            });
            nextLaunchContext = withSessionId(mergedHydration.launchContext);
            nextHasCanonicalBasis = mergedHydration.hasCanonicalBasis;
          } catch {
            nextLaunchContext = undefined;
            nextHasCanonicalBasis = false;
          }
        }

        if (!active) return;
        startTransition(() => {
          setEffectiveLaunchContext(nextLaunchContext);
        });
        applyHostLoopState(resolveHammerReloadSuccess({
          hasPendingSaveChanges,
          saveFailureMessage,
          historyRecoveryStatus,
          presenceConflictDetail,
        }));
        setHasCanonicalBasis(nextHasCanonicalBasis);
        setHydrationReady(true);
      })
      .catch(async () => {
        if (!active) return;

        let nextLaunchContext = withSessionId(props.launchContext);
        let nextHasCanonicalBasis = Boolean(nextLaunchContext);

        if (!nextLaunchContext) {
          try {
            nextLaunchContext = withSessionId(
              (await loadCanonicalBootstrapLaunchContext(
                persistenceTarget.workspaceId,
                persistenceTarget.workpieceId,
              )) ?? undefined,
            );
            nextHasCanonicalBasis = Boolean(nextLaunchContext);
          } catch {
            nextLaunchContext = undefined;
            nextHasCanonicalBasis = false;
          }
        }

        if (!active) return;
        startTransition(() => {
          setEffectiveLaunchContext(nextLaunchContext);
        });
        applyHostLoopState(resolveHammerReloadFailure({
          hasPendingSaveChanges,
          saveFailureMessage,
          historyRecoveryStatus,
          presenceConflictDetail,
        }));
        setHasCanonicalBasis(nextHasCanonicalBasis);
        setHydrationReady(true);
      });

    return () => {
      active = false;
    };
  }, [persistenceMode, persistenceTarget, props.launchContext, reloadRequestNonce]);

  const canPersistCanonicalState = persistenceMode === "canonical"
    && hydrationReady
    && Boolean(persistenceTarget)
    && hasCanonicalBasis;

  useEffect(() => {
    if (persistenceMode !== "canonical" || !persistenceTarget || !hydrationReady) {
      return;
    }
    if (prepState.status === "preparing" && prepState.step !== "loading_context") {
      return;
    }

    const openDecision = resolveHammerPrepOpenDecision(
      effectiveLaunchContext,
      loadedPersistenceSnapshot,
    );
    if (openDecision.action === "reuse") {
      if (!effectiveLaunchContext || effectiveLaunchContext.transcript.kind !== "tongs-stub") {
        setPrepState(openDecision.state);
        setShowPreparedHandoff(true);
        return;
      }
      const reusableTranscript = effectiveLaunchContext.transcript;

      const reuseRunKey = `${targetKey ?? "hammer"}:reuse:${reusableTranscript.transcript_id}:${prepAttemptNonce}`;
      if (prepRunKeyRef.current === reuseRunKey) {
        return;
      }

      prepRunKeyRef.current = reuseRunKey;
      const executionId = beginPrepExecution();

      const runReuse = async () => {
        clearReadyTransitionTimer();
        setShowPreparedHandoff(false);
        setPrepState(createHammerPrepState("preparing", "placing_initial_visuals"));

        try {
          let nextSnapshot = await ensureVisualPlacements({
            launchContext: effectiveLaunchContext,
            transcriptSourceId: reusableTranscript.transcript_id,
            transcriptSegments: loadedPersistenceSnapshot?.structured_transcript.data?.segments
              ?? reusableTranscript.segments,
            currentSnapshot: loadedPersistenceSnapshot,
          });
          if (!isPrepExecutionActive(executionId)) return;

          setLoadedPersistenceSnapshot(nextSnapshot);
          setPrepState(createHammerPrepState("preparing", "extracting_working_audio"));
          try {
            nextSnapshot = await ensureAudioPolish({
              launchContext: effectiveLaunchContext,
              currentSnapshot: nextSnapshot,
              onPhaseChange: (phase) => {
                if (!isPrepExecutionActive(executionId)) return;
                setPrepState(createHammerPrepState("preparing", mapAudioPolishPhaseToPrepStep(phase)));
              },
            }) ?? nextSnapshot;
          } catch {
            // Audio polish falls back to raw playback without blocking workspace open.
          }
          if (!isPrepExecutionActive(executionId)) return;

          setLoadedPersistenceSnapshot(nextSnapshot);
          setPrepState(createHammerPrepState("preparing", "ready_for_next_step"));
          readyTransitionTimerRef.current = window.setTimeout(() => {
            if (!isPrepExecutionActive(executionId)) return;
            setPrepState(createHammerPrepState("prepared", "ready_for_next_step"));
            setShowPreparedHandoff(true);
            readyTransitionTimerRef.current = null;
          }, READY_HANDOFF_DELAY_MS);
        } catch (error) {
          if (!isPrepExecutionActive(executionId)) return;
          const message = toErrorMessage(error, "Hammer could not prepare initial visual placements.");
          setPrepState(createHammerPrepState("prep_failed", null, message));
          setShowPreparedHandoff(false);
        }
      };

      void runReuse();
      return;
    }
    if (openDecision.action === "blocked" || !effectiveLaunchContext) {
      setPrepState(openDecision.state);
      return;
    }

    const prepSource = resolveHammerPrepSource(effectiveLaunchContext);
    if (!prepSource) {
      setPrepState(createHammerPrepState("prep_failed", null, "Hammer could not resolve prep media."));
      return;
    }

    const prepRunKey = `${targetKey ?? "hammer"}:${prepSource.media_signature}:${prepAttemptNonce}`;
    lastPrepRunKeyRef.current = prepRunKey;
    if (prepRunKeyRef.current === prepRunKey) {
      return;
    }
    if (!prepAiFallbackRequested && prepAiNoticeCancelledRunKeyRef.current === prepRunKey) {
      return;
    }

    const prepAiNoticeEffectiveLane = props.prepAiNoticeEffectiveLane ?? "forge-managed";
    const prepAiNoticeResolutionState = props.prepAiNoticeResolutionState ?? "ready";
    const prepAiNoticeModel = buildHammerPrepAiNoticeModel(prepAiNoticeEffectiveLane);
    const shouldPromptPrepAiNotice = shouldShowHammerPrepAiNotice({
      effectiveLane: prepAiNoticeModel.laneSignature,
      acknowledgedLaneSignature: props.prepAiNoticeAcknowledgedLaneSignature ?? null,
    });

    if (prepAiFallbackRequested && prepAiNoticeResolutionState === "loading") {
      return;
    }

    if (prepAiFallbackRequested && prepAiNoticeResolutionState === "error") {
      setPrepState(createHammerPrepState(
        "prep_failed",
        null,
        props.prepAiNoticeResolutionError?.trim() || "Hammer could not resolve AI policy state for prep.",
      ));
      return;
    }

    // AI consent prompt must only appear after the user explicitly selects AI fallback.
    // Once requested, show the consent modal (if required) and then proceed.
    if (prepAiFallbackRequested && shouldPromptPrepAiNotice && prepAiNoticeApprovedRunKeyRef.current !== prepRunKey) {
      prepAiNoticePendingRunKeyRef.current = prepRunKey;
      setShowPrepAiNotice(true);
      return;
    }

    prepRunKeyRef.current = prepRunKey;
    const executionId = beginPrepExecution();

    const runPrep = async () => {
      clearReadyTransitionTimer();
      setShowPreparedHandoff(false);
      setPrepState(createHammerPrepState("preparing", "loading_context"));
      setPrepFailureKind(null);

      try {
        // Non-AI attempt first: reuse any existing transcript artifacts before starting AI transcription.
        if (!prepAiFallbackRequested && persistenceTarget && activeCanonicalRecording && !activeCanonicalRecording.sealed_at) {
          const legacyResult = await loadLegacyHammerTranscriptArtifacts(activeCanonicalRecording.workpiece_id);
          if (legacyResult.ok && legacyResult.data.structured_transcript && legacyResult.data.speaker_map) {
            const sealResult = await sealHammerCanonicalBaseline(
              persistenceTarget,
              activeCanonicalRecording.id,
              {
                structured_transcript: legacyResult.data.structured_transcript,
                speaker_map: legacyResult.data.speaker_map,
              },
            );
            if (!sealResult.ok) {
              throw new Error(sealResult.error);
            }
            setActiveCanonicalRecording(sealResult.data.canonical_recording);

            const [baselineResult, revisionArtifactsResult] = await Promise.all([
              loadHammerCanonicalBaselineArtifacts(sealResult.data.canonical_recording),
              activeRevision ? loadHammerRecordingRevisionArtifacts(activeRevision) : Promise.resolve({ ok: true as const, status: 200, data: null as any }),
            ]);
            const canonicalTranscript = baselineResult.ok ? baselineResult.data.structured_transcript : null;
            const canonicalSpeakerMap = baselineResult.ok ? baselineResult.data.speaker_map : null;
            if (canonicalTranscript && canonicalSpeakerMap) {
              const hydratedSnapshot = buildHydratedSnapshot({
                target: persistenceTarget,
                canonicalRecording: sealResult.data.canonical_recording,
                revision: activeRevision ?? {
                  id: "revision_missing",
                  workspace_id: persistenceTarget.workspaceId,
                  workpiece_id: persistenceTarget.workpieceId,
                  canonical_recording_id: sealResult.data.canonical_recording.id,
                  status: "active",
                  label: null,
                  editor_session_path: null,
                  revision_transcript_path: null,
                  audio_polish_path: null,
                  visual_timeline_path: null,
                  visual_placements_path: null,
                  history_path: null,
                  snapshots_manifest_path: null,
                },
                canonicalTranscript,
                canonicalSpeakerMap,
                revisionEditorSession: revisionArtifactsResult.ok ? revisionArtifactsResult.data?.editor_session ?? null : null,
                revisionTranscript: revisionArtifactsResult.ok ? revisionArtifactsResult.data?.revision_transcript ?? null : null,
                revisionAudioPolish: revisionArtifactsResult.ok ? revisionArtifactsResult.data?.audio_polish ?? null : null,
                revisionVisualTimeline: revisionArtifactsResult.ok ? revisionArtifactsResult.data?.visual_timeline ?? null : null,
                revisionVisualPlacements: revisionArtifactsResult.ok ? revisionArtifactsResult.data?.visual_placements ?? null : null,
              });

              setLoadedPersistenceSnapshot(hydratedSnapshot);
              setHasCanonicalBasis(true);
              startTransition(() => {
                setEffectiveLaunchContext((current) => current ?? effectiveLaunchContext);
              });

              // Continue the normal prep pipeline (visual placements + audio polish) without starting any AI STT.
              const transcriptSourceId = canonicalTranscript.transcript_id;
              const preparedTranscript = {
                transcriptId: transcriptSourceId,
                preparedAt: canonicalTranscript.prepared_at,
                turns: canonicalTranscript.segments,
                structuredTranscript: canonicalTranscript,
                speakerMap: canonicalSpeakerMap,
              };
              const nextLaunchContext = applyPreparedTranscriptToLaunchContext(effectiveLaunchContext, preparedTranscript);
              setPrepState(createHammerPrepState("preparing", "placing_initial_visuals"));

              const nextSnapshot = await ensureVisualPlacements({
                launchContext: nextLaunchContext,
                transcriptSourceId,
                transcriptSegments: canonicalTranscript.segments,
                currentSnapshot: hydratedSnapshot,
              });
              if (!isPrepExecutionActive(executionId)) return;
              setLoadedPersistenceSnapshot(nextSnapshot);

              setPrepState(createHammerPrepState("preparing", "extracting_working_audio"));
              const audioSnapshot = await ensureAudioPolish({
                launchContext: nextLaunchContext,
                currentSnapshot: nextSnapshot,
                onPhaseChange: (phase) => {
                  if (!isPrepExecutionActive(executionId)) return;
                  setPrepState(createHammerPrepState("preparing", mapAudioPolishPhaseToPrepStep(phase)));
                },
              });
              if (!isPrepExecutionActive(executionId)) return;
              if (audioSnapshot) setLoadedPersistenceSnapshot(audioSnapshot);

              setPrepState(createHammerPrepState("prepared", "ready_for_next_step"));
              setShowPreparedHandoff(true);
              return;
            }
          }

          // Legacy transcript not available: stop here and offer AI fallback explicitly.
          setPrepState(createHammerPrepState(
            "prep_failed",
            null,
            "No reusable transcript was found yet. Retry without AI, or choose AI fallback to generate one.",
          ));
          setPrepFailureKind("non_ai_missing");
          return;
        }

        const preparingRequest = buildHammerPrepPersistenceSaveRequest({
          launchContext: effectiveLaunchContext,
          status: "preparing",
        });
        if (activeRevision) {
          const preparingSave = await saveHammerRecordingRevision(
            persistenceTarget,
            activeRevision.id,
            {
              editor_session: preparingRequest.editor_session,
            },
          );
          if (preparingSave.ok) {
            setActiveRevision(preparingSave.data.revision);
          }
        }

        if (!prepAiFallbackRequested) {
          setPrepState(createHammerPrepState(
            "prep_failed",
            null,
            "No reusable transcript was found yet. Retry without AI, or choose AI fallback to generate one.",
          ));
          setPrepFailureKind("non_ai_missing");
          return;
        }

        setPrepState(createHammerPrepState("preparing", "transcribing_audio"));
        const preparedResponse = await requestHammerTranscriptPrep({
          workspace_id: effectiveLaunchContext.workspace_id,
          workpiece_id: effectiveLaunchContext.workpiece_id,
          media_kind: prepSource.mediaRef.kind,
          ...(prepSource.local_root_abs
            ? {
              local_root_abs: prepSource.local_root_abs,
              local_relpath: prepSource.local_relpath,
            }
            : {
              canonical_workpiece_path: prepSource.canonical_workpiece_path,
            }),
          mime_type: prepSource.mediaRef.kind === "recording_audio" ? "audio/wav" : null,
        });
        if (!isPrepExecutionActive(executionId)) return;

        setPrepState(createHammerPrepState("preparing", "identifying_speaker_turns"));
        const preparedTranscript = buildPreparedTranscript(effectiveLaunchContext, preparedResponse);
        const nextLaunchContext = applyPreparedTranscriptToLaunchContext(
          effectiveLaunchContext,
          preparedTranscript,
        );
        if (!isPrepExecutionActive(executionId)) return;

        let canonicalAfterSeal: HammerCanonicalRecordingRecord | null = activeCanonicalRecording;
        if (persistenceTarget && activeCanonicalRecording && !activeCanonicalRecording.sealed_at) {
          const sealResult = await sealHammerCanonicalBaseline(
            persistenceTarget,
            activeCanonicalRecording.id,
            {
              structured_transcript: preparedTranscript.structuredTranscript,
              speaker_map: preparedTranscript.speakerMap,
            },
          );
          if (!sealResult.ok) {
            throw new Error(sealResult.error);
          }
          canonicalAfterSeal = sealResult.data.canonical_recording;
          setActiveCanonicalRecording(canonicalAfterSeal);
        }

        setPrepState(createHammerPrepState("preparing", "placing_initial_visuals"));
        const visualPackageResult = await loadHammerWorkpieceVisualPackage(
          nextLaunchContext.workpiece_id,
          nextLaunchContext.workspace_id,
        );
        if (!isPrepExecutionActive(executionId)) return;

        const visualPlacements = visualPackageResult.ok
          ? deriveHammerVisualPlacements({
            transcriptSourceId: preparedTranscript.transcriptId,
            transcriptSegments: preparedTranscript.turns,
            visualPackage: visualPackageResult.data,
          })
          : buildUnavailableHammerVisualPlacements(
            preparedTranscript.transcriptId,
            `visual_package_unavailable:${visualPackageResult.status}`,
          );

        const preparedRequest = buildHammerPrepPersistenceSaveRequest({
          launchContext: nextLaunchContext,
          status: "prepared",
          preparedTranscript,
          visualPlacements,
        });
        if (!activeRevision) {
          throw new Error("Hammer prep requires an active revision.");
        }

        let preparedSaveRevision = await saveHammerRecordingRevision(
          persistenceTarget,
          activeRevision.id,
          {
            editor_session: preparedRequest.editor_session,
            visual_placements: preparedRequest.visual_placements,
          },
        );
        if (!preparedSaveRevision.ok) throw new Error(preparedSaveRevision.error);
        setActiveRevision(preparedSaveRevision.data.revision);
        const effectiveCanonical = canonicalAfterSeal ?? activeCanonicalRecording ?? {
          id: "canonical_missing",
          workspace_id: persistenceTarget.workspaceId,
          workpiece_id: persistenceTarget.workpieceId,
          status: "draft" as const,
          media_path: "",
          sealed_at: null,
          baseline_transcript_path: null,
          baseline_speaker_map_path: null,
          baseline_timing_path: null,
        };

        const hydratedAfterPrep = buildHydratedSnapshot({
          target: persistenceTarget,
          canonicalRecording: effectiveCanonical,
          revision: preparedSaveRevision.data.revision,
          canonicalTranscript: preparedTranscript.structuredTranscript,
          canonicalSpeakerMap: preparedTranscript.speakerMap,
          revisionEditorSession: preparedRequest.editor_session?.data ?? null,
          revisionTranscript: null,
          revisionAudioPolish: null,
          revisionVisualTimeline: null,
          revisionVisualPlacements: visualPlacements,
        });
        setLoadedPersistenceSnapshot(hydratedAfterPrep);
        if (!isPrepExecutionActive(executionId)) return;

        setPrepState(createHammerPrepState("preparing", "extracting_working_audio"));
        try {
          const audioSnapshot = await ensureAudioPolish({
            launchContext: nextLaunchContext,
            currentSnapshot: hydratedAfterPrep,
            onPhaseChange: (phase) => {
              if (!isPrepExecutionActive(executionId)) return;
              setPrepState(createHammerPrepState("preparing", mapAudioPolishPhaseToPrepStep(phase)));
            },
          });
          if (audioSnapshot) {
            setLoadedPersistenceSnapshot(audioSnapshot);
          }
        } catch {
          // Audio polish falls back to raw playback without blocking workspace open.
        }
        if (!isPrepExecutionActive(executionId)) return;

        prepRunKeyRef.current = `${targetKey ?? "hammer"}:reuse:${preparedTranscript.transcriptId}:${prepAttemptNonce}`;
        setHasCanonicalBasis(true);
        startTransition(() => {
          setEffectiveLaunchContext(nextLaunchContext);
        });
        setPrepState(createHammerPrepState("preparing", "ready_for_next_step"));
        readyTransitionTimerRef.current = window.setTimeout(() => {
          if (!isPrepExecutionActive(executionId)) return;
          setPrepState(createHammerPrepState("prepared", "ready_for_next_step"));
          setShowPreparedHandoff(true);
          readyTransitionTimerRef.current = null;
        }, READY_HANDOFF_DELAY_MS);
      } catch (error) {
        if (!isPrepExecutionActive(executionId)) return;
        const message = toErrorMessage(error, "Hammer could not prepare the transcript.");
        setPrepState(createHammerPrepState("prep_failed", null, message));
        setShowPreparedHandoff(false);
        setPrepFailureKind("ai_failed");

        try {
          const failedRequest = buildHammerPrepPersistenceSaveRequest({
            launchContext: effectiveLaunchContext,
            status: "prep_failed",
          });
          if (activeRevision) {
            await saveHammerRecordingRevision(
              persistenceTarget,
              activeRevision.id,
              { editor_session: failedRequest.editor_session },
            );
          }
        } catch {
          // Keep the user-facing failure stable even if persistence also failed.
        }
      }
    };

    void runPrep();
  }, [
    activeCanonicalRecording?.id,
    activeCanonicalRecording?.sealed_at,
    activeRevision?.id,
    effectiveLaunchContext,
    hydrationReady,
    loadedPersistenceSnapshot,
    persistenceMode,
    persistenceTarget,
    prepState.status,
    prepState.step,
    prepAttemptNonce,
    prepAiNoticeDecisionNonce,
    prepAiFallbackRequested,
    props.prepAiNoticeAcknowledgedLaneSignature,
    props.prepAiNoticeEffectiveLane,
    props.prepAiNoticeResolutionError,
    props.prepAiNoticeResolutionState,
    targetKey,
  ]);

  useEffect(() => {
    if (!canPersistCanonicalState || !persistenceTarget || !workspaceSnapshot || !activeRevision) {
      return;
    }

    const legacyRequest = buildHammerPersistenceSaveRequest(
      workspaceSnapshot,
      loadedPersistenceSnapshot?.structured_transcript.data ?? null,
      loadedPersistenceSnapshot?.audio_polish.data ?? null,
      openedAtRef.current,
    );
    const request = {
      editor_session: legacyRequest.editor_session,
      revision_transcript: legacyRequest.structured_transcript,
      audio_polish: legacyRequest.audio_polish,
      visual_timeline: legacyRequest.visual_timeline,
      visual_placements: legacyRequest.visual_placements,
    };
    const payloadKey = JSON.stringify({
      target: persistenceTarget,
      revisionId: activeRevision.id,
      request,
    });
    if (payloadKey === lastSavedPayloadRef.current) {
      setHasPendingSaveChanges(false);
      pendingSaveRef.current = null;
      return;
    }

    pendingSaveRef.current = {
      target: persistenceTarget,
      revisionId: activeRevision.id,
      request,
      payloadKey,
    };
    setHasPendingSaveChanges(true);
    setSaveFailureMessage(null);

    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      setSaveInFlight(true);
      void saveHammerRecordingRevision(persistenceTarget, activeRevision.id, request)
        .then((result) => {
          if (!result.ok) {
            applyHostLoopState(resolveHammerSaveFailure({
              hasPendingSaveChanges: true,
              saveFailureMessage,
              historyRecoveryStatus,
              presenceConflictDetail,
            }, result.error));
            return;
          }
          lastSavedPayloadRef.current = payloadKey;
          pendingSaveRef.current = null;
          setLastSavedAt(new Date().toISOString());
          setActiveRevision(result.data.revision);
          applyHostLoopState(resolveHammerSaveSuccess({
            hasPendingSaveChanges: true,
            saveFailureMessage,
            historyRecoveryStatus,
            presenceConflictDetail,
          }));
        })
        .finally(() => {
          setSaveInFlight(false);
          saveTimerRef.current = null;
        });
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [
    activeRevision?.id,
    canPersistCanonicalState,
    loadedPersistenceSnapshot,
    persistenceTarget,
    saveRetryNonce,
    targetKey,
    workspaceSnapshot,
  ]);

  useEffect(() => {
    if (!canPersistCanonicalState) return;
    if (typeof window === "undefined") return;

    const flushPendingSave = () => {
      const pending = pendingSaveRef.current;
      if (!pending) return;
      if (pending.payloadKey === lastSavedPayloadRef.current) {
        pendingSaveRef.current = null;
        return;
      }

      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      void saveHammerRecordingRevision(pending.target, pending.revisionId, pending.request as any)
        .then((result) => {
          if (!result.ok) return;
          lastSavedPayloadRef.current = pending.payloadKey;
          pendingSaveRef.current = null;
        })
        .catch(() => {
          // keep flush best-effort; normal save loop will retry on next interaction
        });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushPendingSave();
      }
    };

    window.addEventListener("pagehide", flushPendingSave);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushPendingSave);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [canPersistCanonicalState]);

  useEffect(() => {
    if (!canPersistCanonicalState || !persistenceTarget) return;

    const sessionId = workspaceSnapshot?.sessionId ?? effectiveLaunchContext?.session_id ?? null;
    if (!sessionId) return;

    let active = true;

    const updatePresenceConflict = (rows: HammerPresenceRow[]) => {
      const conflicting = rows.find((row) => (
        row.mode === "editing"
        && row.session_id
        && row.session_id !== sessionId
      )) ?? null;
      setPresenceConflictDetail(conflicting
        ? `Another editing session is active${conflicting.display_name ? ` (${conflicting.display_name})` : ""}. Reload before continuing.`
        : null);
    };

    const sendHeartbeat = async () => {
      const hasUserToken = await hasTongsUserAccessToken();
      if (!active || !hasUserToken) return;

      const result = await upsertHammerPresence(persistenceTarget, {
        mode: "editing",
        session_id: sessionId,
      });
      if (!active) return;
      if (result.ok) {
        updatePresenceConflict(result.data);
      }
    };

    void sendHeartbeat();
    void loadHammerPresence(persistenceTarget).then((result) => {
      if (!active || !result.ok) return;
      updatePresenceConflict(result.data);
    });
    const intervalId = window.setInterval(() => {
      void sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [
    canPersistCanonicalState,
    effectiveLaunchContext?.session_id,
    persistenceTarget,
    targetKey,
    workspaceSnapshot?.sessionId,
  ]);

  const overlayViewModel = buildHammerPrepOverlayViewModel(prepState);
  const prepAiNoticeModel = useMemo(
    () => buildHammerPrepAiNoticeModel(props.prepAiNoticeEffectiveLane ?? "forge-managed"),
    [props.prepAiNoticeEffectiveLane],
  );
  const canRenderPrepAiNoticeSettingsAction = Boolean(props.onRequestAiSettings);
  const shouldRenderEditor = persistenceMode !== "canonical" || prepState.status === "prepared";
  const visualPlacementData = loadedPersistenceSnapshot?.visual_placements.data ?? null;
  const visualTimelineData = useMemo(
    () => loadHammerVisualTimelineStateFromSnapshot(loadedPersistenceSnapshot),
    [loadedPersistenceSnapshot],
  );
  const audioPolishData = loadedPersistenceSnapshot?.audio_polish.data ?? null;
  const handoffMediaPrepOutputs = useMemo(
    () => buildHammerMediaPrepOutputsPackage({
      structuredTranscript: loadedPersistenceSnapshot?.structured_transcript.data ?? null,
      visualPlacements: visualPlacementData,
      audioPolish: audioPolishData,
      mediaRef: loadedPersistenceSnapshot?.editor_session.data?.media_ref ?? null,
      mediaSourceLabel: loadedPersistenceSnapshot?.editor_session.data?.media_source_label ?? null,
    }),
    [
      audioPolishData,
      loadedPersistenceSnapshot?.editor_session.data?.media_ref,
      loadedPersistenceSnapshot?.editor_session.data?.media_source_label,
      loadedPersistenceSnapshot?.structured_transcript.data,
      visualPlacementData,
    ],
  );
  const transcriptSegmentCount = loadedPersistenceSnapshot?.structured_transcript.data?.segments.length
    ?? (effectiveLaunchContext?.transcript.kind === "tongs-stub"
      ? effectiveLaunchContext.transcript.segments.length
      : 0);
  const handoffModel = buildHammerPreparedHandoffModel({
    transcriptSegmentCount,
    transcriptSourceId: loadedPersistenceSnapshot?.structured_transcript.data?.transcript_id
      ?? (effectiveLaunchContext?.transcript.kind === "tongs-stub"
        ? effectiveLaunchContext.transcript.transcript_id
        : null),
    visualPlacements: visualPlacementData,
    audioPolish: audioPolishData,
    mediaPrepOutputs: handoffMediaPrepOutputs,
  });
  const sessionState = useMemo(
    () => deriveHammerSessionState({
      prepState,
      saveState: {
        isSaving: saveInFlight,
        hasPendingChanges: hasPendingSaveChanges,
        failedMessage: saveFailureMessage,
        lastSavedAt,
      },
      recoveryState: {
        recoveryAvailable: Boolean(historyRecoveryStatus),
        reloadRequired: Boolean(presenceConflictDetail),
        conflictDetected: Boolean(presenceConflictDetail),
        detail: presenceConflictDetail ?? historyRecoveryStatus,
      },
      mediaPrepOutputs: handoffMediaPrepOutputs,
      editorVisible: shouldRenderEditor,
    }),
    [
      handoffMediaPrepOutputs,
      hasPendingSaveChanges,
      historyRecoveryStatus,
      lastSavedAt,
      presenceConflictDetail,
      prepState,
      saveFailureMessage,
      saveInFlight,
      shouldRenderEditor,
    ],
  );
  const sessionActions = useMemo(
    () => deriveHammerSessionStateActions(sessionState),
    [sessionState],
  );
  const progressFillClassName = useMemo(
    () => `${dynamicStyleScopeIdRef.current}__progress-fill`,
    [],
  );
  const prepProgressWidth = Math.max(8, overlayViewModel.progress_ratio * 100);
  useDynamicCssText(
    dynamicStyleScopeIdRef.current,
    `.${progressFillClassName} { width: ${prepProgressWidth}%; }`,
  );

  const restartTranscriptPrep = useCallback((
    behavior: HammerTranscriptPrepNonAiMissingBehavior,
    options?: { remember?: boolean; announce?: boolean },
  ): void => {
    if (options?.remember) {
      saveHammerTranscriptPrepNonAiMissingBehavior(behavior);
      setTranscriptPrepPreferenceNonce((current) => current + 1);
    }

    if (options?.announce) {
      setTranscriptPrepPreferenceNotice({
        label: `Using saved preference: ${behavior === "retry-non-ai" ? "Retry non-AI" : "Use AI fallback"}.`,
      });
    }

    if (behavior === "retry-non-ai") {
      prepRunKeyRef.current = null;
      setPrepAiFallbackRequested(false);
      setShowPreparedHandoff(false);
      setPrepState(createHammerPrepState("preparing", "loading_context"));
      setPrepAttemptNonce((current) => current + 1);
      return;
    }

    const runKey = lastPrepRunKeyRef.current;
    prepAiNoticePendingRunKeyRef.current = runKey ?? `manual_ai_fallback:${Date.now()}`;
    setPrepAiFallbackRequested(true);
    // Always restart prep; the prep effect is the single authority for showing AI consent and starting AI transcription.
    prepRunKeyRef.current = null;
    setShowPrepAiNotice(false);
    setPrepState(createHammerPrepState("preparing", "loading_context"));
    setPrepAttemptNonce((current) => current + 1);
  }, [
    setPrepAiFallbackRequested,
    setPrepAttemptNonce,
    setPrepState,
    setShowPreparedHandoff,
    setShowPrepAiNotice,
    setTranscriptPrepPreferenceNotice,
    setTranscriptPrepPreferenceNonce,
  ]);

  useEffect(() => {
    if (persistenceMode !== "canonical") return;
    if (prepState.status !== "prep_failed") return;
    if (prepFailureKind !== "non_ai_missing") return;

    const behavior = readHammerTranscriptPrepNonAiMissingBehavior();
    if (!behavior) return;

    restartTranscriptPrep(behavior, { announce: true });
  }, [persistenceMode, prepFailureKind, prepState.status, restartTranscriptPrep, transcriptPrepPreferenceNonce]);

  function handlePreparedHandoffAction(actionId: HammerPreparedNextStepActionId): void {
    if (actionId === "export_later") {
      return;
    }

    setPreparedActionIntent({
      id: actionId,
      token: Date.now(),
    });
    setShowPreparedHandoff(false);
  }

  function handlePreparedSummaryClick(summaryId: "transcript" | "visuals" | "audio"): void {
    if (summaryId === "transcript") {
      handlePreparedHandoffAction("review_transcript");
      return;
    }
    if (summaryId === "visuals") {
      handlePreparedHandoffAction("review_visuals");
      return;
    }
    handlePreparedHandoffAction("review_audio");
  }

  function handleSessionAction(actionId: "retry_save" | "reload_latest"): void {
    const next = applyHammerSessionAction({
      hasPendingSaveChanges,
      saveFailureMessage,
      reloadRequestNonce,
      saveRetryNonce,
    }, actionId);
    setSaveFailureMessage(next.saveFailureMessage);
    setReloadRequestNonce(next.reloadRequestNonce);
    setSaveRetryNonce(next.saveRetryNonce);
  }

  async function handleResetToRaw(): Promise<void> {
    if (resetToRawInFlight) return;
    if (persistenceMode !== "canonical" || !persistenceTarget) {
      setResetToRawError("Reset to Original is only available in canonical sessions.");
      return;
    }
    if (!activeRevision) {
      setResetToRawError("Reset to Original requires an active revision.");
      return;
    }

    setResetToRawInFlight(true);
    setResetToRawError(null);
    try {
      const result = await resetHammerRecordingRevision(
        persistenceTarget,
        activeRevision.id,
        { reason: "user_requested_reset" },
      );
      if (!result.ok) {
        setResetToRawError(result.error);
        return;
      }
      setActiveRevision(null);
      setLoadedPersistenceSnapshot(null);
      setReloadRequestNonce((current) => current + 1);
    } finally {
      setResetToRawInFlight(false);
    }
  }

  useEffect(() => {
    if (!showPreparedHandoff || !shouldRenderEditor) return;

    const dismissOnFirstInteraction = (event: PointerEvent | KeyboardEvent) => {
      const target = event.target as Node | null;
      if (target && handoffPanelRef.current?.contains(target)) return;
      setShowPreparedHandoff(false);
    };

    window.addEventListener("pointerdown", dismissOnFirstInteraction, true);
    window.addEventListener("keydown", dismissOnFirstInteraction, true);

    return () => {
      window.removeEventListener("pointerdown", dismissOnFirstInteraction, true);
      window.removeEventListener("keydown", dismissOnFirstInteraction, true);
    };
  }, [showPreparedHandoff, shouldRenderEditor]);

  const prepAiNoticeModal = showPrepAiNotice ? (
    <div className="hammer-prep-shell__overlay" role="presentation">
      <section
        className="hammer-prep-shell__notice-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hammer-prep-ai-notice-title"
        aria-describedby="hammer-prep-ai-notice-body"
      >
        <div id="hammer-prep-ai-notice-title" className="hammer-prep-shell__notice-title">
          {prepAiNoticeModel.title}
        </div>
        <div id="hammer-prep-ai-notice-body" className="hammer-prep-shell__notice-body">
          {prepAiNoticeModel.body}
        </div>
        <div className="hammer-prep-shell__notice-detail">
          {prepAiNoticeModel.laneDetail}
        </div>

        <label className="hammer-prep-shell__notice-checkbox">
          <input
            type="checkbox"
            checked={prepAiNoticeDontShowAgain}
            onChange={(event) => setPrepAiNoticeDontShowAgain(event.target.checked)}
          />
          <span>Don&apos;t show this again</span>
        </label>

        <div className="hammer-prep-shell__notice-actions">
          <button
            type="button"
            className="hammer-prep-shell__button"
            onClick={() => {
              const runKey = prepAiNoticePendingRunKeyRef.current;
              if (!runKey) return;
              prepAiNoticeApprovedRunKeyRef.current = runKey;
              prepAiNoticeCancelledRunKeyRef.current = null;
              emitPrepAiNoticeTelemetry("hammer_prep_ai_notice_continue", {
                lane: prepAiNoticeModel.laneSignature,
                prep_allowed: prepAiNoticeModel.prepAllowed,
                workpiece_id: effectiveLaunchContext?.workpiece_id ?? null,
                workspace_id: effectiveLaunchContext?.workspace_id ?? null,
              });
              if (prepAiNoticeDontShowAgain) {
                emitPrepAiNoticeTelemetry("hammer_prep_ai_notice_dont_show_again", {
                  lane: prepAiNoticeModel.laneSignature,
                  workpiece_id: effectiveLaunchContext?.workpiece_id ?? null,
                  workspace_id: effectiveLaunchContext?.workspace_id ?? null,
                });
                void props.onPrepAiNoticeAcknowledgeLane?.(prepAiNoticeModel.laneSignature);
              }
              setShowPrepAiNotice(false);
              prepRunKeyRef.current = null;
              setPrepState(createHammerPrepState("preparing", "loading_context"));
              setPrepAttemptNonce((current) => current + 1);
              setPrepAiNoticeDecisionNonce((current) => current + 1);
            }}
          >
            Continue
          </button>
          <button
            type="button"
            className="hammer-prep-shell__action-button hammer-prep-shell__action-button--dismiss"
            onClick={() => {
              const runKey = prepAiNoticePendingRunKeyRef.current;
              if (!runKey) return;
              prepAiNoticeCancelledRunKeyRef.current = runKey;
              prepAiNoticeApprovedRunKeyRef.current = null;
              emitPrepAiNoticeTelemetry("hammer_prep_ai_notice_cancel", {
                lane: prepAiNoticeModel.laneSignature,
                prep_allowed: prepAiNoticeModel.prepAllowed,
                workpiece_id: effectiveLaunchContext?.workpiece_id ?? null,
                workspace_id: effectiveLaunchContext?.workspace_id ?? null,
              });
              setPrepAiFallbackRequested(false);
              setShowPrepAiNotice(false);
            }}
          >
            Cancel
          </button>
          {canRenderPrepAiNoticeSettingsAction ? (
            <button
              type="button"
              className="hammer-prep-shell__action-button hammer-prep-shell__action-button--placeholder"
              onClick={() => props.onRequestAiSettings?.()}
            >
              AI Settings
            </button>
          ) : null}
        </div>
      </section>
    </div>
  ) : null;

  if (persistenceMode === "canonical" && prepState.status === "prep_failed") {
    const canOfferAiFallback = prepFailureKind === "non_ai_missing";
    const savedPreference = canOfferAiFallback
      ? readHammerTranscriptPrepNonAiMissingBehavior()
      : null;

    if (savedPreference) {
      return (
        <section className="hammer-prep-shell__failure">
          <div className="hammer-prep-shell__failure-card">
            <h2>Hammer transcript prep stopped.</h2>
            <p>{prepState.error ?? "Hammer could not prepare this episode transcript."}</p>
            <p>
              Using saved preference: {savedPreference === "retry-non-ai" ? "Retry non-AI" : "Use AI fallback"}.
            </p>
            <div className="hammer-prep-shell__handoff-actions">
              {canRenderPrepAiNoticeSettingsAction ? (
                <button
                  type="button"
                  className="hammer-prep-shell__action-button hammer-prep-shell__action-button--placeholder"
                  onClick={() => props.onRequestAiSettings?.()}
                >
                  Change
                </button>
              ) : null}
              <button
                type="button"
                className="hammer-prep-shell__action-button hammer-prep-shell__action-button--dismiss"
                onClick={() => {
                  clearHammerTranscriptPrepNonAiMissingBehavior();
                  setTranscriptPrepPreferenceNotice(null);
                  setTranscriptPrepPreferenceNonce((current) => current + 1);
                }}
              >
                Ask every time
              </button>
            </div>
          </div>
          {prepAiNoticeModal}
        </section>
      );
    }
    return (
      <section className="hammer-prep-shell__failure">
        <div className="hammer-prep-shell__failure-card">
          <h2>Hammer transcript prep stopped.</h2>
          <p>{prepState.error ?? "Hammer could not prepare this episode transcript."}</p>
          <p>
            Hammer will always try to reuse an existing transcript first. AI transcription only runs if you explicitly choose the AI fallback.
          </p>
          {canOfferAiFallback ? (
            <label>
              <input
                type="checkbox"
                checked={prepFailureDontAskAgain}
                onChange={(event) => setPrepFailureDontAskAgain(event.target.checked)}
              />
              Don&apos;t ask again
            </label>
          ) : null}
          <div className="hammer-prep-shell__handoff-actions">
            <button
              type="button"
              className="hammer-prep-shell__button"
              onClick={() => {
                restartTranscriptPrep("retry-non-ai", { remember: canOfferAiFallback && prepFailureDontAskAgain });
              }}
            >
              Retry non-AI
            </button>
            {canOfferAiFallback ? (
              <button
                type="button"
                className="hammer-prep-shell__button"
                onClick={() => {
                  restartTranscriptPrep("use-ai-fallback", { remember: prepFailureDontAskAgain });
                }}
              >
                Use AI fallback
              </button>
            ) : null}
            {canOfferAiFallback ? (
              <button
                type="button"
                className="hammer-prep-shell__action-button hammer-prep-shell__action-button--dismiss"
                onClick={() => {
                  setPrepAiFallbackRequested(false);
                  setPrepFailureKind(null);
                  setPrepState(createHammerPrepState("prep_failed", null, "Prep cancelled. You can retry later."));
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
        {prepAiNoticeModal}
      </section>
    );
  }

  return (
    <div className="hammer-prep-shell hammer-workspace-editor-host">
      {shouldRenderEditor ? (
        <div className="hammer-prep-shell__editor">
          <div
            className={[
              "hammer-prep-shell__session-state",
              sessionState.isBlocking ? "is-blocking" : "",
              sessionState.isDegraded ? "is-degraded" : "",
            ].filter(Boolean).join(" ")}
            role="status"
            aria-live="polite"
          >
            <strong>{sessionState.humanLabel}</strong>
            {sessionState.detail ? <span>{sessionState.detail}</span> : null}
            {transcriptPrepPreferenceNotice ? (
              <span>
                {transcriptPrepPreferenceNotice.label}
                {props.onRequestAiSettings ? (
                  <button
                    type="button"
                    className="hammer-prep-shell__session-action"
                    onClick={() => props.onRequestAiSettings?.()}
                  >
                    Change
                  </button>
                ) : null}
              </span>
            ) : null}
            {sessionActions.length > 0 ? (
              <div className="hammer-prep-shell__session-actions">
                {sessionActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className="hammer-prep-shell__session-action"
                    onClick={() => handleSessionAction(action.id)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <HammerWorkspaceShell
            launchContext={effectiveLaunchContext}
            recordingRevisionId={activeRevision?.id ?? null}
            structuredTranscript={loadedPersistenceSnapshot?.structured_transcript.data ?? null}
            visualPlacements={visualPlacementData}
            visualTimeline={visualTimelineData}
            audioPolish={audioPolishData}
            initialVisualPreviewSettings={loadedPersistenceSnapshot?.editor_session.data?.visual_preview ?? null}
            initialCurrentPass={loadedPersistenceSnapshot?.state?.current_pass}
            initialSelectedSegmentId={loadedPersistenceSnapshot?.editor_session.data?.selected_segment_id ?? null}
            initialSelectedOverlayRowId={loadedPersistenceSnapshot?.editor_session.data?.selected_overlay_row_id ?? null}
            releasePrepHref={props.releasePrepHref}
            selectedMacroRecipeRef={loadedPersistenceSnapshot?.macro_hooks.recipe_ref ?? null}
            lastMacroRunRef={loadedPersistenceSnapshot?.macro_hooks.last_run_ref ?? null}
            prepHandoffAction={preparedActionIntent}
            aiInUse={prepState.status === "preparing"}
            resetToRawInFlight={resetToRawInFlight}
            resetToRawError={resetToRawError}
            onRequestResetToRaw={canPersistCanonicalState ? handleResetToRaw : undefined}
            onHistoryRecoveryStatusChange={setHistoryRecoveryStatus}
            onWorkspaceSnapshotChange={canPersistCanonicalState ? setWorkspaceSnapshot : undefined}
          />
        </div>
      ) : null}

      {overlayViewModel.visible ? (
        <div className="hammer-prep-shell__overlay" role="presentation">
          <section
            className="hammer-prep-shell__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hammer-prep-shell-title"
            aria-describedby="hammer-prep-shell-note"
          >
            <div className="hammer-prep-shell__wheel-row">
              <div className="hammer-prep-shell__wheel" aria-hidden="true">
                <div className="hammer-prep-shell__wheel-aura" />
                <div className="hammer-prep-shell__wheel-embers" />
                <div className="hammer-prep-shell__wheel-gear" />
                <div className="hammer-prep-shell__wheel-rim hammer-prep-shell__wheel-rim--outer" />
                <div className="hammer-prep-shell__wheel-rim hammer-prep-shell__wheel-rim--inner" />
                <div className="hammer-prep-shell__wheel-core">
                  <div className="hammer-prep-shell__wheel-arc hammer-prep-shell__wheel-arc--left" />
                  <div className="hammer-prep-shell__wheel-arc hammer-prep-shell__wheel-arc--right" />
                  <div className="hammer-prep-shell__wheel-spark-burst">
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="hammer-prep-shell__wheel-anvil">
                    <div className="hammer-prep-shell__wheel-anvil-top" />
                    <div className="hammer-prep-shell__wheel-anvil-body" />
                    <div className="hammer-prep-shell__wheel-anvil-base" />
                  </div>
                </div>
              </div>
              <div id="hammer-prep-shell-title" className="hammer-prep-shell__title">{overlayViewModel.title}</div>
              <div className="hammer-prep-shell__message">{overlayViewModel.message}</div>
              <div id="hammer-prep-shell-note" className="hammer-prep-shell__note">{overlayViewModel.note}</div>
            </div>

            <div className="hammer-prep-shell__progress">
              <div className="hammer-prep-shell__progress-bar">
                <span className={progressFillClassName} />
              </div>
              <div className="hammer-prep-shell__step-list" aria-hidden="true">
                {Array.from({ length: overlayViewModel.step_count }).map((_, index) => (
                  <span
                    key={`prep-step-${index + 1}`}
                    className={`hammer-prep-shell__step${overlayViewModel.progress_ratio * overlayViewModel.step_count >= index + 1 ? " is-active" : ""}`}
                  />
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {prepAiNoticeModal}

      {showPreparedHandoff ? (
        <section
          ref={handoffPanelRef}
          className="hammer-prep-shell__handoff"
          aria-label="Hammer prep handoff"
        >
          <div className="hammer-prep-shell__handoff-title">{handoffModel.title}</div>
          <div className="hammer-prep-shell__handoff-body">{handoffModel.body}</div>
          <div className="hammer-prep-shell__handoff-summary-list">
            {handoffModel.summaries.map((summary) => (
              <button
                key={summary.id}
                type="button"
                className={`hammer-prep-shell__handoff-summary-row hammer-prep-shell__handoff-summary-row--${summary.tone}`}
                onClick={() => handlePreparedSummaryClick(summary.id)}
              >
                <span className="hammer-prep-shell__handoff-summary-label">{summary.label}</span>
                <span className="hammer-prep-shell__handoff-summary-status">{summary.status_label}</span>
                <span className="hammer-prep-shell__handoff-summary-detail">{summary.detail}</span>
              </button>
            ))}
          </div>
          <div className="hammer-prep-shell__handoff-actions">
            {handoffModel.actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={`hammer-prep-shell__action-button hammer-prep-shell__action-button--${action.kind}`}
                onClick={() => handlePreparedHandoffAction(action.id)}
                disabled={!action.enabled}
              >
                <span className="hammer-prep-shell__action-label">
                  {action.label}
                  {action.recommended ? " Recommended" : ""}
                </span>
                <span className="hammer-prep-shell__action-detail">{action.detail}</span>
              </button>
            ))}
            <button
              type="button"
              className="hammer-prep-shell__action-button hammer-prep-shell__action-button--dismiss"
              onClick={() => setShowPreparedHandoff(false)}
            >
              <span className="hammer-prep-shell__action-label">Continue Editing</span>
              <span className="hammer-prep-shell__action-detail">Dismiss this briefing and enter the workspace.</span>
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
