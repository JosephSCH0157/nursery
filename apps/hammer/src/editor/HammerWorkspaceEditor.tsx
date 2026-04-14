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
import { deriveHammerSessionState } from "./hammerSessionState";
import { deriveHammerIssueDiagnostics, type HammerIssueFixActionId } from "./hammerIssueDiagnostics";
import { HammerWorkspaceDiagnosticsBanner } from "./HammerWorkspaceDiagnosticsBanner";
import { HammerIngestDiagnosticsPanel } from "./HammerIngestDiagnosticsPanel";
import { buildHammerMediaPrepOutputsPackage } from "../lib/hammerMediaPrepOutputsPackage";
import {
  buildHammerPersistenceSaveRequest,
  clearHammerTranscriptPointer,
  loadHammerPersistenceSnapshot,
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
import { resolveAudioPolishInputSource } from "../prep/resolveAudioPolishInputSource";
import {
  requestHammerTranscriptPrep,
  type HammerTranscriptPrepError,
} from "../prep/hammerPrepApi";
import {
  type HammerIngestDiagnosticV1,
  writeHammerIngestDiagnostics,
} from "../diagnostics/hammerIngestDiagnostics";
import {
  computeIngestFinalStatus,
  evaluateRegisteredTranscriptPointer,
  isSealRaceRecoverable,
} from "../ingest/hammerIngestDecisions";
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
import {
  createHammerDevConsoleLogger,
  type HammerDevConsoleRun,
} from "../lib/hammerDevConsole";
import {
  createHammerVoicePicker,
  resolveHammerVoicePhase,
  type HammerVoicePhase,
} from "../prep/hammerVoiceSystem";

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
const PREP_DUPLICATE_KICK_WINDOW_MS = 2_000;

function shouldSkipDuplicatePrepKick(runKey: string): boolean {
  if (typeof window === "undefined") return false;
  const runtime = window as unknown as Record<string, unknown>;
  const raw = runtime.__forgeHammerPrepKickLedger__;
  const ledger = (raw && typeof raw === "object" && !Array.isArray(raw))
    ? raw as Record<string, number>
    : {};
  runtime.__forgeHammerPrepKickLedger__ = ledger;

  const now = Date.now();
  const last = ledger[runKey];
  ledger[runKey] = now;
  return typeof last === "number" && Number.isFinite(last) && (now - last) < PREP_DUPLICATE_KICK_WINDOW_MS;
}

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
  const ingestLog = useMemo(
    () => createHammerDevConsoleLogger({ scope: "HammerIngest", routeSearch: props.routeSearch }),
    [props.routeSearch],
  );
  const hammerRuntimeInstanceIdRef = useRef(
    (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
      ? crypto.randomUUID()
      : `inst_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`,
  );

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
  const [prepVoiceLine, setPrepVoiceLine] = useState<string | null>(null);
  const [prepVoiceOpacity, setPrepVoiceOpacity] = useState(1);
  const prepVoiceRunKeyRef = useRef<string | null>(null);
  const prepVoiceMythicShownRef = useRef(false);
  const prepVoiceLastLineRef = useRef<string | null>(null);
  const prepVoicePhaseRef = useRef<HammerVoicePhase | null>(null);
  const prepVoicePickerRef = useRef<ReturnType<typeof createHammerVoicePicker> | null>(null);
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
  const [, setTranscriptPrepPreferenceNonce] = useState(0);
  const [hasPendingSaveChanges, setHasPendingSaveChanges] = useState(false);
  const [saveInFlight, setSaveInFlight] = useState(false);
  const [saveFailureMessage, setSaveFailureMessage] = useState<string | null>(null);
  const prepTriggerEffectTickRef = useRef(0);

  useEffect(() => {
    if (!ingestLog.enabled) return;
    // eslint-disable-next-line no-console
    console.log("[HammerPrep] mount", { instance_id: hammerRuntimeInstanceIdRef.current });
    // eslint-disable-next-line no-console
    console.info("[HammerTranscriptPrep] instrumentation:active", {
      instance_id: hammerRuntimeInstanceIdRef.current,
      note: "If you do not see subsequent [HammerTranscriptPrep] stage logs, the client is not running the latest bundle or prep isn't reaching the transcript request.",
    });
    return () => {
      // eslint-disable-next-line no-console
      console.log("[HammerPrep] unmount", { instance_id: hammerRuntimeInstanceIdRef.current });
    };
  }, [ingestLog.enabled]);
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
  const ingestCorrelationIdRef = useRef<string | null>(null);
  const ingestDiagnosticRef = useRef<HammerIngestDiagnosticV1 | null>(null);
  const ingestPointerSelfHealAttemptedRef = useRef(false);
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
  const prepInFlightRunKeyRef = useRef<string | null>(null);
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

  const beginPrepExecution = useCallback((): number => {
    prepExecutionIdRef.current += 1;
    return prepExecutionIdRef.current;
  }, []);

  const logPrepDebug = useCallback((label: string, payload: Record<string, unknown>) => {
    if (!ingestLog.enabled) return;
    // eslint-disable-next-line no-console
    console.log(label, {
      instance_id: hammerRuntimeInstanceIdRef.current,
      ...payload,
    });
  }, [ingestLog.enabled]);

  const resetPrepRunKey = useCallback((reason: string, detail?: Record<string, unknown>) => {
    prepRunKeyRef.current = null;
    prepInFlightRunKeyRef.current = null;
    logPrepDebug("[HammerPrep] run_key_reset", {
      reason,
      ...(detail ?? {}),
    });
  }, [logPrepDebug]);

  const bumpPrepAttemptNonce = useCallback((reason: string, detail?: Record<string, unknown>) => {
    setPrepAttemptNonce((current) => {
      logPrepDebug("[HammerPrep] attempt_nonce_bump", {
        reason,
        current,
        next: current + 1,
        ...(detail ?? {}),
      });
      return current + 1;
    });
  }, [logPrepDebug]);

  const isPrepExecutionActive = (executionId: number): boolean => (
    isMountedRef.current && prepExecutionIdRef.current === executionId
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      prepExecutionIdRef.current += 1;
      prepInFlightRunKeyRef.current = null;
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
    logRun?: HammerDevConsoleRun;
  }): Promise<HammerPersistenceSnapshot> => {
    if (!persistenceTarget || !activeRevision) {
      throw new Error("Hammer visual placement persistence requires a canonical target.");
    }

    const visualPackageResult = await loadHammerWorkpieceVisualPackage(
      args.launchContext.workpiece_id,
      args.launchContext.workspace_id,
    );
    args.logRun?.log("visual_placements:package_loaded", {
      ok: visualPackageResult.ok,
      status: visualPackageResult.status,
    });
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
      args.logRun?.log("visual_placements:reused", {
        placements: args.currentSnapshot.visual_placements.data?.placements?.length ?? null,
      });
      return args.currentSnapshot;
    }

    const nextPlacementKey = JSON.stringify(visualPlacements);
    const currentPlacementKey = JSON.stringify(args.currentSnapshot?.visual_placements.data ?? null);
    if (nextPlacementKey === currentPlacementKey && args.currentSnapshot) {
      args.logRun?.log("visual_placements:unchanged");
      return args.currentSnapshot;
    }

    const saveResult = await saveHammerRecordingRevision(
      persistenceTarget,
      activeRevision.id,
      { visual_placements: { data: visualPlacements } },
    );
    if (!saveResult.ok) throw new Error(saveResult.error);
    setActiveRevision(saveResult.data.revision);
    args.logRun?.log("visual_placements:saved", {
      placements: visualPlacements.placements.length,
      path: saveResult.data.revision.visual_placements_path,
    });
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
    logRun?: HammerDevConsoleRun;
  }): Promise<HammerPersistenceSnapshot | null> => {
    if (!persistenceTarget || !activeRevision) {
      throw new Error("Hammer audio polish persistence requires a canonical target.");
    }

    const prepSource = resolveHammerPrepSource(args.launchContext);
    if (!prepSource) {
      args.logRun?.warn("audio_polish:prep_source_missing");
      return args.currentSnapshot;
    }

    const existingAudioPolish = args.currentSnapshot?.audio_polish.data ?? null;
    if (isReusableHammerAudioPolish(existingAudioPolish, prepSource)) {
      args.logRun?.log("audio_polish:reused", {
        prepared_at: existingAudioPolish?.prepared_at ?? null,
        output_workpiece_path: existingAudioPolish?.output_workpiece_path ?? null,
      });
      return args.currentSnapshot;
    }

    const audioPolishUpdatedAt = args.currentSnapshot?.audio_polish.updated_at ?? null;
    if (existingAudioPolish?.status === "preparing" && audioPolishUpdatedAt) {
      const updatedAtMs = Date.parse(audioPolishUpdatedAt);
      const staleAfterMs = 15 * 60 * 1000;
      if (Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs > staleAfterMs) {
        args.logRun?.warn("audio_polish:stuck_preparing_self_heal", {
          updated_at: audioPolishUpdatedAt,
          stale_after_ms: staleAfterMs,
        });
        const failureArtifact = buildFailedHammerAudioPolish({
          prepSource,
          failureCode: "stuck_preparing",
          failureReason: `Audio polish was stuck preparing (last updated at ${audioPolishUpdatedAt}).`,
          settingsSummary: {
            stale_after_ms: staleAfterMs,
          },
        });
        const failedSave = await saveHammerRecordingRevision(
          persistenceTarget,
          activeRevision.id,
          { audio_polish: { data: failureArtifact } },
        );
        if (!failedSave.ok) throw new Error(failedSave.error);
        setActiveRevision(failedSave.data.revision);
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
          audio_polish: {
            path: failedSave.data.revision.audio_polish_path,
            updated_at: new Date().toISOString(),
            data: failureArtifact,
          },
        } as HammerPersistenceSnapshot;
      }
    }

    const resolvedInput = resolveAudioPolishInputSource({
      workpiece_id: args.launchContext.workpiece_id,
      prepSource,
    });
    const resolved_input_type = resolvedInput.supported ? resolvedInput.resolved_input_type : resolvedInput.resolved_input_type;

    if (import.meta.env.DEV && typeof console !== "undefined") {
      console.log("[AudioPolish:input]", {
        source_kind: prepSource.source_kind,
        canonical_workpiece_path: prepSource.canonical_workpiece_path,
        local_relpath: prepSource.local_relpath,
        resolved_input_type,
      });
    }

    if (!resolvedInput.supported) {
      args.logRun?.error("audio_polish:input_unresolvable", {
        source_kind: prepSource.source_kind,
        canonical_workpiece_path: prepSource.canonical_workpiece_path,
        local_relpath: prepSource.local_relpath,
        reason: resolvedInput.reason,
      });
      const failureArtifact = buildFailedHammerAudioPolish({
        prepSource,
        failureCode: "unsupported_source",
        failureReason: resolvedInput.reason,
        settingsSummary: {
          source_kind: prepSource.source_kind,
          resolved_input_type: resolvedInput.resolved_input_type,
          attempted_sources_json: JSON.stringify(resolvedInput.attempted_sources),
        },
      });
      const failedSave = await saveHammerRecordingRevision(
        persistenceTarget,
        activeRevision.id,
        { audio_polish: { data: failureArtifact } },
      );
      if (!failedSave.ok) throw new Error(failedSave.error);
      setActiveRevision(failedSave.data.revision);
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
        audio_polish: {
          path: failedSave.data.revision.audio_polish_path,
          updated_at: new Date().toISOString(),
          data: failureArtifact,
        },
      } as HammerPersistenceSnapshot;
    }

    args.logRun?.log("audio_polish:starting", {
      media_kind: prepSource.mediaRef.kind,
      canonical_workpiece_path: prepSource.canonical_workpiece_path,
      local_relpath: prepSource.local_relpath,
    });
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
        let progressErrorCount = 0;
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
          } catch (error) {
            progressErrorCount += 1;
            if (progressErrorCount === 1 || progressErrorCount % 20 === 0) {
              args.logRun?.warn("audio_polish:progress_poll_failed", {
                failures: progressErrorCount,
                ...(error instanceof Error ? { message: error.message } : { error: String(error) }),
              });
            }
          }
          await new Promise((resolve) => window.setTimeout(resolve, 250));
        }
      };
      args.onPhaseChange?.("extracting_working_audio");
      void pollForProgress();

      const requestSpan = args.logRun?.span("audio_polish:request");
      const response = await requestHammerAudioPolish({
        workspace_id: args.launchContext.workspace_id,
        workpiece_id: args.launchContext.workpiece_id,
        media_kind: prepSource.mediaRef.kind,
        input: resolvedInput.source,
        tongs_origin: typeof window !== "undefined" ? window.location.origin : null,
        local_root_abs: prepSource.local_root_abs,
        local_relpath: prepSource.local_relpath,
        canonical_workpiece_path: prepSource.canonical_workpiece_path,
        mime_type: prepSource.mediaRef.kind === "recording_audio" ? "audio/wav" : null,
      });
      requestSpan?.end({
        status: response.status,
        phase: response.phase ?? null,
        failure_code: response.failure_code ?? null,
        failed_phase: response.failed_phase ?? null,
        processor_version: response.processor_version,
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

      args.logRun?.log("audio_polish:response_normalized", {
        status: response.status,
        failure_code: response.status === "failed" ? (response.failure_code ?? "processing_failed") : null,
        failure_reason: response.status === "failed" ? (response.failure_reason ?? null) : null,
        output_workpiece_path: response.output_workpiece_path ?? null,
        output_local_relpath: response.output_local_relpath ?? null,
        output_duration_ms: response.output_duration_ms ?? null,
        ...(response.status === "failed"
          ? (() => {
            const settings = response.settings_summary ?? {};
            const entries = Object.entries(settings);
            const focusEntries = entries
              .filter(([key]) => /ffmpeg|ffprobe|source|working|mime|duration|sample|channel|bit/i.test(key))
              .slice(0, 24);
            return {
              settings_keys: entries.length,
              settings_focus: Object.fromEntries(focusEntries),
            };
          })()
          : { processor_version: response.processor_version }),
      });

      const finalSave = await saveHammerRecordingRevision(
        persistenceTarget,
        activeRevision.id,
        { audio_polish: { data: audioPolish } },
      );
      if (!finalSave.ok) throw new Error(finalSave.error);
      setActiveRevision(finalSave.data.revision);
      args.logRun?.log("audio_polish:saved", {
        path: finalSave.data.revision.audio_polish_path,
        status: audioPolish.status,
        failure_code: audioPolish.status === "failed" ? audioPolish.failure_code : null,
      });
      return {
        ...baseSnapshot,
        audio_polish: {
          path: finalSave.data.revision.audio_polish_path,
          updated_at: new Date().toISOString(),
          data: audioPolish,
        },
      } as HammerPersistenceSnapshot;
    } catch (error) {
      args.logRun?.error("audio_polish:failed", {
        message: toErrorMessage(error, "Hammer could not produce a baseline audio polish artifact."),
      });
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
    prepInFlightRunKeyRef.current = null;
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
      ingestCorrelationIdRef.current = null;
      ingestDiagnosticRef.current = null;
      ingestPointerSelfHealAttemptedRef.current = false;
      setPrepState(createHammerPrepState("idle", null));
      setHydrationReady(true);
      setHasCanonicalBasis(Boolean(props.launchContext));
      return;
    }

    ingestPointerSelfHealAttemptedRef.current = false;
    ingestCorrelationIdRef.current = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `ingest_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    ingestDiagnosticRef.current = {
      schema_version: 1,
      timestamp: new Date().toISOString(),
      workspace_id: persistenceTarget.workspaceId,
      workpiece_id: persistenceTarget.workpieceId,
      revision_id: null,
      canonical_recording_id: null,
      final_status: "blocked",
      prep_source: null,
      transcript_sources_evaluated: [],
      pointers: {
        transcript_artifact_path: null,
        revision_transcript_path: null,
        baseline_transcript_path: null,
      },
      pointer_self_heal: {
        attempted: false,
        definitive_failure: false,
        action: "none",
        reason: null,
      },
      seal: {
        attempted: false,
        outcome: "skipped",
      },
      request_ids: {},
      extra: {
        phase: "pipeline_start",
        opened_at: openedAtRef.current,
      },
    };
    void writeHammerIngestDiagnostics({
      workpieceId: persistenceTarget.workpieceId,
      diagnostic: ingestDiagnosticRef.current,
      correlationId: ingestCorrelationIdRef.current,
    });

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

        if (!sessionResult.ok) {
          const message = mapSessionOpenErrorToUserMessage({
            code: sessionResult.error_code ?? null,
            message: sessionResult.error,
          });
          setPrepState(createHammerPrepState("prep_failed", null, message));
          setPrepFailureKind("ai_failed");
          setHasCanonicalBasis(false);
          if (ingestDiagnosticRef.current) {
            ingestDiagnosticRef.current.final_status = "blocked";
            ingestDiagnosticRef.current.timestamp = new Date().toISOString();
            ingestDiagnosticRef.current.extra = {
              ...(ingestDiagnosticRef.current.extra ?? {}),
              phase: "pipeline_end",
              session_open_error_code: sessionResult.error_code ?? null,
              session_open_status: sessionResult.status,
              session_open_message: sessionResult.error,
            };
            void writeHammerIngestDiagnostics({
              workpieceId: persistenceTarget.workpieceId,
              diagnostic: ingestDiagnosticRef.current,
              correlationId: ingestCorrelationIdRef.current,
            });
          }
          setHydrationReady(true);
          return;
        }

        if (sessionResult.ok) {
          setActiveCanonicalRecording(sessionResult.data.canonical_recording);
          setActiveRevision(sessionResult.data.revision);
          if (ingestDiagnosticRef.current) {
            ingestDiagnosticRef.current.canonical_recording_id = sessionResult.data.canonical_recording.id;
            ingestDiagnosticRef.current.revision_id = sessionResult.data.revision.id;
          }

          // --- Load all transcript sources in precedence order ---
          // 1. Registered transcript (from tongs.hammer_workpiece_state.transcript_artifact_path)
          // 2. Revision transcript
          // 3. Canonical baseline transcript

          const [baselineResult, revisionArtifactsResult, persistenceSnapshotResult] = await Promise.all([
            loadHammerCanonicalBaselineArtifacts(sessionResult.data.canonical_recording),
            loadHammerRecordingRevisionArtifacts(sessionResult.data.revision),
            loadHammerPersistenceSnapshot(persistenceTarget),
          ]);

          const canonicalTranscript = baselineResult.ok ? baselineResult.data.structured_transcript : null;
          const canonicalSpeakerMap = baselineResult.ok ? baselineResult.data.speaker_map : null;
          const revisionEditorSession = revisionArtifactsResult.ok ? revisionArtifactsResult.data.editor_session : null;
          const revisionTranscript = revisionArtifactsResult.ok ? revisionArtifactsResult.data.revision_transcript : null;
          const revisionAudioPolish = revisionArtifactsResult.ok ? revisionArtifactsResult.data.audio_polish : null;
          const revisionVisualTimeline = revisionArtifactsResult.ok ? revisionArtifactsResult.data.visual_timeline : null;
          const revisionVisualPlacements = revisionArtifactsResult.ok ? revisionArtifactsResult.data.visual_placements : null;

          // --- Registered transcript artifact ---
          const persistenceSnapshot = persistenceSnapshotResult.ok ? persistenceSnapshotResult.data : null;
          const registeredArtifact = persistenceSnapshot?.structured_transcript ?? null;
          const registeredTranscriptPath = persistenceSnapshot?.state?.transcript_artifact_path ?? null;
          const registeredEval = evaluateRegisteredTranscriptPointer({
            pointerPath: registeredTranscriptPath,
            artifact: registeredArtifact,
          });
          const registeredTranscript = registeredEval.transcript as any;
          const registeredTranscriptLoadOk = registeredEval.load_ok;
          const registeredTranscriptSegmentCount = registeredEval.segment_count;
          const registeredTranscriptDefinitiveFailure = registeredEval.definitive_failure;
          const registeredTranscriptRejectionReason = registeredEval.rejection_reason;

          // --- Revision transcript ---
          const revisionTranscriptLoadOk = !!(revisionTranscript && Array.isArray(revisionTranscript.segments));
          const revisionTranscriptSegmentCount = revisionTranscriptLoadOk ? revisionTranscript.segments.length : null;

          // --- Canonical baseline transcript ---
          const baselineTranscriptLoadOk = !!(canonicalTranscript && Array.isArray(canonicalTranscript.segments));
          const baselineTranscriptSegmentCount = baselineTranscriptLoadOk ? canonicalTranscript.segments.length : null;

          if (ingestDiagnosticRef.current) {
            ingestDiagnosticRef.current.pointers = {
              transcript_artifact_path: registeredTranscriptPath,
              revision_transcript_path: sessionResult.data.revision.revision_transcript_path ?? null,
              baseline_transcript_path: sessionResult.data.canonical_recording.baseline_transcript_path ?? null,
            };
          }

          if (
            persistenceTarget
            && registeredTranscriptPath
            && registeredTranscriptDefinitiveFailure
            && !ingestPointerSelfHealAttemptedRef.current
          ) {
            ingestPointerSelfHealAttemptedRef.current = true;
            if (ingestDiagnosticRef.current) {
              ingestDiagnosticRef.current.pointer_self_heal = {
                attempted: true,
                definitive_failure: true,
                action: "quarantined",
                reason: registeredTranscriptRejectionReason ?? "definitively_bad",
              };
              ingestDiagnosticRef.current.extra = {
                ...(ingestDiagnosticRef.current.extra ?? {}),
                registered_pointer_quarantined_path: registeredTranscriptPath,
              };
              void writeHammerIngestDiagnostics({
                workpieceId: persistenceTarget.workpieceId,
                diagnostic: ingestDiagnosticRef.current,
                correlationId: ingestCorrelationIdRef.current,
              });
            }

            const clearResult = await clearHammerTranscriptPointer(persistenceTarget, {
              reason: registeredTranscriptRejectionReason ?? "definitively_bad_registered_transcript_pointer",
            });
            if (clearResult.ok && clearResult.data.cleared && ingestDiagnosticRef.current) {
              ingestDiagnosticRef.current.pointer_self_heal = {
                attempted: true,
                definitive_failure: true,
                action: "cleared",
                reason: registeredTranscriptRejectionReason ?? "definitively_bad",
              };
              void writeHammerIngestDiagnostics({
                workpieceId: persistenceTarget.workpieceId,
                diagnostic: ingestDiagnosticRef.current,
                correlationId: ingestCorrelationIdRef.current,
              });
            }
          }

          // --- Transcript selection logic ---
          let transcriptSource = "none";
          const transcriptEvaluations: HammerIngestDiagnosticV1["transcript_sources_evaluated"] = [];
          let hydratedTranscript = null;
          let rejectionReason = null;

          transcriptEvaluations.push({
            source: "registered",
            path: registeredTranscriptPath,
            segment_count: registeredTranscriptSegmentCount,
            load_ok: registeredTranscriptLoadOk,
            rejection_reason: registeredTranscriptDefinitiveFailure
              ? (registeredTranscriptRejectionReason ?? "definitively_bad")
              : null,
          });
          transcriptEvaluations.push({
            source: "revision",
            path: sessionResult.data.revision.revision_transcript_path ?? null,
            segment_count: revisionTranscriptSegmentCount,
            load_ok: revisionTranscriptLoadOk,
            rejection_reason: null,
          });
          transcriptEvaluations.push({
            source: "baseline",
            path: sessionResult.data.canonical_recording.baseline_transcript_path ?? null,
            segment_count: baselineTranscriptSegmentCount,
            load_ok: baselineTranscriptLoadOk,
            rejection_reason: null,
          });

          if (registeredTranscriptLoadOk && !registeredTranscriptDefinitiveFailure && (registeredTranscriptSegmentCount ?? 0) > 0) {
            hydratedTranscript = registeredTranscript;
            transcriptSource = "registered_transcript";
          } else if (revisionTranscriptLoadOk && (revisionTranscriptSegmentCount ?? 0) > 0) {
            hydratedTranscript = revisionTranscript;
            transcriptSource = "revision_transcript";
          } else if (baselineTranscriptLoadOk && (baselineTranscriptSegmentCount ?? 0) > 0) {
            hydratedTranscript = canonicalTranscript;
            transcriptSource = "canonical_baseline";
          } else {
            rejectionReason = "No valid transcript found in any source (registered, revision, baseline)";
          }

          if (ingestDiagnosticRef.current) {
            ingestDiagnosticRef.current.transcript_sources_evaluated = transcriptEvaluations;
            ingestDiagnosticRef.current.extra = {
              ...(ingestDiagnosticRef.current.extra ?? {}),
              selected_transcript_source: transcriptSource,
            };
          }

          // --- Logging ---
          // eslint-disable-next-line no-console
          console.info("[HammerTranscriptReuse]", {
            registered_transcript_artifact_path: registeredTranscriptPath,
            registered_transcript_definitively_bad: registeredTranscriptDefinitiveFailure,
            registered_transcript_load_ok: registeredTranscriptLoadOk,
            registered_segment_count: registeredTranscriptSegmentCount,
            revision_transcript_load_ok: revisionTranscriptLoadOk,
            revision_segment_count: revisionTranscriptSegmentCount,
            baseline_transcript_load_ok: baselineTranscriptLoadOk,
            baseline_segment_count: baselineTranscriptSegmentCount,
            selected_transcript_source: transcriptSource,
            reuse_decision: transcriptSource !== "none" ? "reused" : "rejected",
            rejection_reason: rejectionReason,
          });

          const nextHydratedSnapshot = buildHydratedSnapshot({
            target: persistenceTarget,
            canonicalRecording: sessionResult.data.canonical_recording,
            revision: sessionResult.data.revision,
            canonicalTranscript,
            canonicalSpeakerMap,
            revisionEditorSession,
            revisionTranscript: hydratedTranscript,
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
      .catch(async (error) => {
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
        if (ingestDiagnosticRef.current && persistenceTarget) {
          ingestDiagnosticRef.current.final_status = "blocked";
          ingestDiagnosticRef.current.timestamp = new Date().toISOString();
          ingestDiagnosticRef.current.extra = {
            ...(ingestDiagnosticRef.current.extra ?? {}),
            phase: "pipeline_end",
            session_open_exception: error instanceof Error ? error.message : String(error),
          };
          void writeHammerIngestDiagnostics({
            workpieceId: persistenceTarget.workpieceId,
            diagnostic: ingestDiagnosticRef.current,
            correlationId: ingestCorrelationIdRef.current,
          });
        }
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

    prepTriggerEffectTickRef.current += 1;
    const triggerTick = prepTriggerEffectTickRef.current;
    const openDecision = resolveHammerPrepOpenDecision(
      effectiveLaunchContext,
      loadedPersistenceSnapshot,
    );
    if (openDecision.action === "reuse") {
      // Avoid keeping a stale "prep_failed" state when we have a reusable transcript.
      // This can happen when a previous attempt failed but a new hydration finds transcript truth.
      if (prepState.status === "prep_failed") {
        setPrepFailureKind(null);
        setShowPreparedHandoff(false);
        setPrepState(createHammerPrepState("preparing", "placing_initial_visuals"));
      }
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
      if (shouldSkipDuplicatePrepKick(reuseRunKey)) {
        logPrepDebug("[HammerPrep] skip_duplicate_kick", { run_key: reuseRunKey });
        return;
      }

      if (ingestLog.enabled) {
        const launchHasStubTranscript = Boolean(
          effectiveLaunchContext
          && effectiveLaunchContext.transcript.kind === "tongs-stub"
          && effectiveLaunchContext.transcript.segments.length > 0,
        );
        const prepStatusWasOverridden = prepState.status === "prep_failed";
        const prepStatusForLog = prepStatusWasOverridden ? "preparing" : prepState.status;
        const prepStepForLog = prepStatusWasOverridden ? "placing_initial_visuals" : prepState.step;
        // eslint-disable-next-line no-console
        console.log("[HammerPrep] trigger_reason", {
          instance_id: hammerRuntimeInstanceIdRef.current,
          tick: triggerTick,
          action: openDecision.action,
          reason: openDecision.reason,
          run_key: reuseRunKey,
        });
        // eslint-disable-next-line no-console
        console.log("[HammerPrep] dependency_snapshot", {
          instance_id: hammerRuntimeInstanceIdRef.current,
          tick: triggerTick,
          persistence_mode: persistenceMode,
          hydration_ready: hydrationReady,
          prep_status: prepStatusForLog,
          prep_step: prepStepForLog,
          prep_status_overridden: prepStatusWasOverridden,
          prep_attempt_nonce: prepAttemptNonce,
          ai_fallback_requested: prepAiFallbackRequested,
          workspace_id: effectiveLaunchContext.workspace_id,
          workpiece_id: effectiveLaunchContext.workpiece_id,
          target_key: targetKey,
          snapshot_has_transcript: Boolean(loadedPersistenceSnapshot?.structured_transcript.data?.segments.length) || launchHasStubTranscript,
          snapshot_audio_polish_status: loadedPersistenceSnapshot?.audio_polish.data?.status ?? null,
        });
      }

      if (prepInFlightRunKeyRef.current) {
        logPrepDebug("[HammerPrep] skip_trigger_in_flight", {
          tick: triggerTick,
          action: openDecision.action,
          reason: openDecision.reason,
          run_key: reuseRunKey,
          in_flight_run_key: prepInFlightRunKeyRef.current,
        });
        return;
      }

      prepRunKeyRef.current = reuseRunKey;
      prepInFlightRunKeyRef.current = reuseRunKey;
      const executionId = beginPrepExecution();
      const run = ingestLog.run("reuse_stub_transcript", {
        run_key: reuseRunKey,
        execution_id: executionId,
        workspace_id: effectiveLaunchContext.workspace_id,
        workpiece_id: effectiveLaunchContext.workpiece_id,
        transcript_id: reusableTranscript.transcript_id,
      });

      const runReuse = async () => {
        clearReadyTransitionTimer();
        setShowPreparedHandoff(false);
        setPrepState(createHammerPrepState("preparing", "placing_initial_visuals"));

        let outcome: "prepared" | "failed" = "failed";
        let audioPolishStatus: string | null = null;
        let audioPolishFailureCode: string | null = null;
        let finalSnapshot: HammerPersistenceSnapshot | null = loadedPersistenceSnapshot;
        try {
          const visualsSpan = run.span("visual_placements:ensure");
          let nextSnapshot = await ensureVisualPlacements({
            launchContext: effectiveLaunchContext,
            transcriptSourceId: reusableTranscript.transcript_id,
            transcriptSegments: loadedPersistenceSnapshot?.structured_transcript.data?.segments
              ?? reusableTranscript.segments,
            currentSnapshot: loadedPersistenceSnapshot,
            logRun: run,
          });
          visualsSpan.end({ ok: Boolean(nextSnapshot) });
          if (!isPrepExecutionActive(executionId)) return;

          setLoadedPersistenceSnapshot(nextSnapshot);
          finalSnapshot = nextSnapshot;
          setPrepState(createHammerPrepState("preparing", "extracting_working_audio"));
          try {
            const audioSpan = run.span("audio_polish:ensure");
            nextSnapshot = await ensureAudioPolish({
              launchContext: effectiveLaunchContext,
              currentSnapshot: nextSnapshot,
              onPhaseChange: (phase) => {
                if (!isPrepExecutionActive(executionId)) return;
                setPrepState(createHammerPrepState("preparing", mapAudioPolishPhaseToPrepStep(phase)));
              },
              logRun: run,
            }) ?? nextSnapshot;
            audioSpan.end({ ok: true });
            audioPolishStatus = nextSnapshot.audio_polish.data?.status ?? null;
            audioPolishFailureCode = nextSnapshot.audio_polish.data?.status === "failed"
              ? (nextSnapshot.audio_polish.data.failure_code ?? null)
              : null;
            finalSnapshot = nextSnapshot;
          } catch (error) {
            // Audio polish falls back to raw playback without blocking workspace open.
            run.warn("audio_polish:skipped_after_error", {
              message: toErrorMessage(error, "Hammer could not produce a baseline audio polish artifact."),
            });
          }
          if (!isPrepExecutionActive(executionId)) return;

          setLoadedPersistenceSnapshot(nextSnapshot);
          finalSnapshot = nextSnapshot;
          setPrepState(createHammerPrepState("preparing", "ready_for_next_step"));
          readyTransitionTimerRef.current = window.setTimeout(() => {
            if (!isPrepExecutionActive(executionId)) return;
            setPrepState(createHammerPrepState("prepared", "ready_for_next_step"));
            setShowPreparedHandoff(true);
            readyTransitionTimerRef.current = null;
          }, READY_HANDOFF_DELAY_MS);
          outcome = "prepared";
        } catch (error) {
          if (!isPrepExecutionActive(executionId)) return;
          const message = toErrorMessage(error, "Hammer could not prepare initial visual placements.");
          setPrepState(createHammerPrepState("prep_failed", null, message));
          setShowPreparedHandoff(false);
          run.error("reuse_stub_transcript:failed", { message });
        } finally {
          if (ingestDiagnosticRef.current && persistenceTarget) {
            const visualStatus = finalSnapshot?.visual_placements.data?.status ?? null;
            const audioStatus = finalSnapshot?.audio_polish.data?.status ?? null;
            const baseStatus: Exclude<HammerIngestDiagnosticV1["final_status"], "degraded"> = outcome !== "prepared"
              ? "blocked"
              : "reused_transcript";
            const finalStatus = computeIngestFinalStatus({ base: baseStatus, audioStatus, visualStatus });
            ingestDiagnosticRef.current.final_status = finalStatus;
            ingestDiagnosticRef.current.timestamp = new Date().toISOString();
            ingestDiagnosticRef.current.extra = {
              ...(ingestDiagnosticRef.current.extra ?? {}),
              phase: "pipeline_end",
              reuse_stub_transcript: true,
              audio_polish_status: audioStatus,
              visual_placements_status: visualStatus,
            };
            void writeHammerIngestDiagnostics({
              workpieceId: persistenceTarget.workpieceId,
              diagnostic: ingestDiagnosticRef.current,
              correlationId: ingestCorrelationIdRef.current,
            });
          }
          run.end({
            outcome,
            audio_polish_status: audioPolishStatus,
            audio_polish_failure_code: audioPolishFailureCode,
          });
          if (isPrepExecutionActive(executionId) && prepInFlightRunKeyRef.current === reuseRunKey) {
            prepInFlightRunKeyRef.current = null;
          }
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
      ingestLog.error("prep_source_missing", {
        workspace_id: effectiveLaunchContext.workspace_id,
        workpiece_id: effectiveLaunchContext.workpiece_id,
      });
      return;
    }

    const prepRunKey = `${targetKey ?? "hammer"}:${prepSource.media_signature}:${prepAttemptNonce}`;
    lastPrepRunKeyRef.current = prepRunKey;
    if (prepRunKeyRef.current === prepRunKey) {
      return;
    }
    if (shouldSkipDuplicatePrepKick(prepRunKey)) {
      logPrepDebug("[HammerPrep] skip_duplicate_kick", { run_key: prepRunKey });
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
      // eslint-disable-next-line no-console
      console.info("[HammerTranscriptPrep] gate:policy_resolution_loading", {
        instance_id: hammerRuntimeInstanceIdRef.current,
        run_key: prepRunKey,
        workspace_id: effectiveLaunchContext.workspace_id,
        workpiece_id: effectiveLaunchContext.workpiece_id,
        effective_lane: prepAiNoticeModel.laneSignature,
      });
      return;
    }

    if (prepAiFallbackRequested && prepAiNoticeResolutionState === "error") {
      // eslint-disable-next-line no-console
      console.warn("[HammerTranscriptPrep] gate:policy_resolution_error", {
        instance_id: hammerRuntimeInstanceIdRef.current,
        run_key: prepRunKey,
        workspace_id: effectiveLaunchContext.workspace_id,
        workpiece_id: effectiveLaunchContext.workpiece_id,
        effective_lane: prepAiNoticeModel.laneSignature,
        message: props.prepAiNoticeResolutionError?.trim() || null,
      });
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
      // eslint-disable-next-line no-console
      console.info("[HammerTranscriptPrep] gate:ai_notice_required", {
        instance_id: hammerRuntimeInstanceIdRef.current,
        run_key: prepRunKey,
        workspace_id: effectiveLaunchContext.workspace_id,
        workpiece_id: effectiveLaunchContext.workpiece_id,
        effective_lane: prepAiNoticeModel.laneSignature,
        acknowledged_lane: props.prepAiNoticeAcknowledgedLaneSignature ?? null,
      });
      setShowPrepAiNotice(true);
      return;
    }

    if (ingestLog.enabled) {
      // eslint-disable-next-line no-console
      console.log("[HammerPrep] trigger_reason", {
        instance_id: hammerRuntimeInstanceIdRef.current,
        tick: triggerTick,
        action: openDecision.action,
        reason: openDecision.reason,
        run_key: prepRunKey,
      });
      // eslint-disable-next-line no-console
      console.log("[HammerPrep] dependency_snapshot", {
        instance_id: hammerRuntimeInstanceIdRef.current,
        tick: triggerTick,
        persistence_mode: persistenceMode,
        hydration_ready: hydrationReady,
        prep_status: prepState.status,
        prep_step: prepState.step,
        prep_attempt_nonce: prepAttemptNonce,
        ai_fallback_requested: prepAiFallbackRequested,
        prep_source_kind: prepSource.source_kind,
        media_kind: prepSource.mediaRef.kind,
        local_relpath: prepSource.local_relpath,
        canonical_workpiece_path: prepSource.canonical_workpiece_path,
        workspace_id: effectiveLaunchContext.workspace_id,
        workpiece_id: effectiveLaunchContext.workpiece_id,
        target_key: targetKey,
        snapshot_has_transcript: Boolean(loadedPersistenceSnapshot?.structured_transcript.data?.segments.length),
        snapshot_audio_polish_status: loadedPersistenceSnapshot?.audio_polish.data?.status ?? null,
      });
    }

    if (prepInFlightRunKeyRef.current) {
      logPrepDebug("[HammerPrep] skip_trigger_in_flight", {
        tick: triggerTick,
        action: openDecision.action,
        reason: openDecision.reason,
        run_key: prepRunKey,
        in_flight_run_key: prepInFlightRunKeyRef.current,
      });
      return;
    }

    prepRunKeyRef.current = prepRunKey;
    prepInFlightRunKeyRef.current = prepRunKey;
    const executionId = beginPrepExecution();
    const run = ingestLog.run("prep", {
      run_key: prepRunKey,
      execution_id: executionId,
      workspace_id: effectiveLaunchContext.workspace_id,
      workpiece_id: effectiveLaunchContext.workpiece_id,
      persistence_mode: persistenceMode,
      ai_fallback_requested: prepAiFallbackRequested,
      media_kind: prepSource.mediaRef.kind,
      local_relpath: prepSource.local_relpath,
      canonical_workpiece_path: prepSource.canonical_workpiece_path,
    });

    const runPrep = async () => {
      clearReadyTransitionTimer();
      setShowPreparedHandoff(false);
      setPrepState(createHammerPrepState("preparing", "loading_context"));
      setPrepFailureKind(null);

      const transcriptPipelineStartedAt = typeof performance !== "undefined" ? performance.now() : null;
      const transcriptElapsedMs = (): number | null => (
        transcriptPipelineStartedAt == null || typeof performance === "undefined"
          ? null
          : Math.round(performance.now() - transcriptPipelineStartedAt)
      );
      const logTranscriptStage = (
        stage: string,
        detail?: Record<string, unknown>,
        level: "info" | "warn" | "error" = "info",
      ): void => {
        // eslint-disable-next-line no-console
        (level === "error" ? console.error : level === "warn" ? console.warn : console.info)(
          "[HammerTranscriptPrep]",
          {
            elapsed_ms: transcriptElapsedMs(),
            run_key: prepRunKey,
            execution_id: executionId,
            workspace_id: effectiveLaunchContext.workspace_id,
            workpiece_id: effectiveLaunchContext.workpiece_id,
            stage,
            ...(detail ?? {}),
          },
        );
      };
      logTranscriptStage("pipeline:start", {
        ai_fallback_requested: prepAiFallbackRequested,
        attempt_nonce: prepAttemptNonce,
        media_kind: prepSource.mediaRef.kind,
        local_relpath: prepSource.local_relpath,
        canonical_workpiece_path: prepSource.canonical_workpiece_path,
      });

      let outcome: "prepared" | "failed" | "non_ai_missing" | "error" = "error";
      let audioPolishStatus: string | null = null;
      let audioPolishFailureCode: string | null = null;
      let finalSnapshot: HammerPersistenceSnapshot | null = loadedPersistenceSnapshot;
      let usedAiPrep = false;
      try {
        // Non-AI attempt first: reuse any existing transcript artifacts before starting AI transcription.
        if (!prepAiFallbackRequested && persistenceTarget && activeCanonicalRecording && !activeCanonicalRecording.sealed_at) {
          logTranscriptStage("legacy:load:start", {
            canonical_recording_id: activeCanonicalRecording.id,
            sealed_at: activeCanonicalRecording.sealed_at ?? null,
          });
          const legacySpan = run.span("legacy_transcript:load");
          const legacyResult = await loadLegacyHammerTranscriptArtifacts(activeCanonicalRecording.workpiece_id);
          legacySpan.end({
            ok: legacyResult.ok,
            status: legacyResult.status,
            has_structured_transcript: Boolean(legacyResult.ok && legacyResult.data.structured_transcript),
            has_speaker_map: Boolean(legacyResult.ok && legacyResult.data.speaker_map),
          });
          if (legacyResult.ok && legacyResult.data.structured_transcript && legacyResult.data.speaker_map) {
            logTranscriptStage("legacy:load:ok", {
              structured_segments: legacyResult.data.structured_transcript.segments.length,
              has_speaker_map: true,
            });
            const sealSpan = run.span("legacy_transcript:seal");
            const sealResult = await sealHammerCanonicalBaseline(
              persistenceTarget,
              activeCanonicalRecording.id,
              {
                structured_transcript: legacyResult.data.structured_transcript,
                speaker_map: legacyResult.data.speaker_map,
              },
            );
            let canonicalAfterSeal = activeCanonicalRecording;
            if (!sealResult.ok) {
              const sealCode = sealResult.error_code ?? null;
              if (isSealRaceRecoverable(sealCode)) {
                if (ingestDiagnosticRef.current) {
                  ingestDiagnosticRef.current.seal = {
                    attempted: true,
                    outcome: sealCode === "canonical_recording_already_sealed" ? "already_sealed" : "conflict_recovered",
                    error_code: sealCode ?? undefined,
                    error_message: sealResult.error,
                  };
                }
                const refreshed = await openHammerRecordingSession(persistenceTarget);
                if (!refreshed.ok) {
                  sealSpan.end({ ok: false, status: refreshed.status, code: refreshed.error_code ?? null });
                  throw new Error(refreshed.error);
                }
                canonicalAfterSeal = refreshed.data.canonical_recording;
                setActiveCanonicalRecording(refreshed.data.canonical_recording);
                setActiveRevision(refreshed.data.revision);
                sealSpan.end({ ok: true, recovered: true, sealed_at: canonicalAfterSeal.sealed_at ?? null });
                logTranscriptStage("legacy:seal:recovered", {
                  code: sealCode,
                  sealed_at: canonicalAfterSeal.sealed_at ?? null,
                }, "warn");
              } else {
                if (ingestDiagnosticRef.current) {
                  ingestDiagnosticRef.current.seal = {
                    attempted: true,
                    outcome: "failed",
                    error_code: sealCode ?? undefined,
                    error_message: sealResult.error,
                  };
                }
                sealSpan.end({ ok: false, status: sealResult.status, code: sealCode });
                throw new Error(sealResult.error);
              }
            } else {
              canonicalAfterSeal = sealResult.data.canonical_recording;
              if (ingestDiagnosticRef.current) {
                ingestDiagnosticRef.current.seal = {
                  attempted: true,
                  outcome: "sealed",
                };
              }
              sealSpan.end({ ok: true, sealed_at: sealResult.data.canonical_recording.sealed_at ?? null });
              logTranscriptStage("legacy:seal:ok", { sealed_at: sealResult.data.canonical_recording.sealed_at ?? null });
              setActiveCanonicalRecording(sealResult.data.canonical_recording);
            }

            const hydrateSpan = run.span("legacy_transcript:hydrate");
            const [baselineResult, revisionArtifactsResult] = await Promise.all([
              loadHammerCanonicalBaselineArtifacts(canonicalAfterSeal),
              activeRevision ? loadHammerRecordingRevisionArtifacts(activeRevision) : Promise.resolve({ ok: true as const, status: 200, data: null as any }),
            ]);
            hydrateSpan.end({
              baseline_ok: baselineResult.ok,
              baseline_status: baselineResult.status,
              revision_ok: revisionArtifactsResult.ok,
              revision_status: revisionArtifactsResult.status,
            });
            const canonicalTranscript = baselineResult.ok ? baselineResult.data.structured_transcript : null;
            const canonicalSpeakerMap = baselineResult.ok ? baselineResult.data.speaker_map : null;
            if (canonicalTranscript && canonicalSpeakerMap) {
              logTranscriptStage("legacy:hydrate:ok", { structured_segments: canonicalTranscript.segments.length });
              const hydratedSnapshot = buildHydratedSnapshot({
                target: persistenceTarget,
                canonicalRecording: canonicalAfterSeal,
                revision: activeRevision ?? {
                  id: "revision_missing",
                  workspace_id: persistenceTarget.workspaceId,
                  workpiece_id: persistenceTarget.workpieceId,
                  canonical_recording_id: canonicalAfterSeal.id,
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
              finalSnapshot = hydratedSnapshot;
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

              const visualsSpan = run.span("visual_placements:ensure");
              const nextSnapshot = await ensureVisualPlacements({
                launchContext: nextLaunchContext,
                transcriptSourceId,
                transcriptSegments: canonicalTranscript.segments,
                currentSnapshot: hydratedSnapshot,
                logRun: run,
              });
              visualsSpan.end({ ok: Boolean(nextSnapshot) });
              if (!isPrepExecutionActive(executionId)) return;
              setLoadedPersistenceSnapshot(nextSnapshot);
              finalSnapshot = nextSnapshot;

              setPrepState(createHammerPrepState("preparing", "extracting_working_audio"));
              const audioSpan = run.span("audio_polish:ensure");
              const audioSnapshot = await ensureAudioPolish({
                launchContext: nextLaunchContext,
                currentSnapshot: nextSnapshot,
                onPhaseChange: (phase) => {
                  if (!isPrepExecutionActive(executionId)) return;
                  setPrepState(createHammerPrepState("preparing", mapAudioPolishPhaseToPrepStep(phase)));
                },
                logRun: run,
              });
              audioSpan.end({ ok: Boolean(audioSnapshot) });
              audioPolishStatus = audioSnapshot?.audio_polish.data?.status ?? null;
              audioPolishFailureCode = audioSnapshot?.audio_polish.data?.status === "failed"
                ? (audioSnapshot.audio_polish.data.failure_code ?? null)
                : null;
              if (!isPrepExecutionActive(executionId)) return;
              if (audioSnapshot) {
                setLoadedPersistenceSnapshot(audioSnapshot);
                finalSnapshot = audioSnapshot;
              }

              setPrepState(createHammerPrepState("prepared", "ready_for_next_step"));
              setShowPreparedHandoff(true);
              outcome = "prepared";
              return;
            }
          }

          // Legacy transcript not available: stop here and offer AI fallback explicitly.
          logTranscriptStage("legacy:missing", {}, "warn");
          run.log("legacy_transcript:missing", {
            ai_fallback_requested: prepAiFallbackRequested,
            canonical_recording_id: activeCanonicalRecording?.id ?? null,
            sealed_at: activeCanonicalRecording?.sealed_at ?? null,
            note: "No legacy transcript artifacts were found to seal. Offer AI fallback.",
          });
          setPrepState(createHammerPrepState(
            "prep_failed",
            null,
            "No reusable transcript was found yet. Retry without AI, or choose AI fallback to generate one.",
          ));
          setPrepFailureKind("non_ai_missing");
          outcome = "non_ai_missing";
          logTranscriptStage("pipeline:done", { outcome }, "warn");
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
          logTranscriptStage("legacy:missing", {}, "warn");
          run.log("legacy_transcript:missing", {
            ai_fallback_requested: prepAiFallbackRequested,
            canonical_recording_id: activeCanonicalRecording?.id ?? null,
            sealed_at: activeCanonicalRecording?.sealed_at ?? null,
            note: "No legacy transcript artifacts were found; AI fallback not requested.",
          });
          setPrepState(createHammerPrepState(
            "prep_failed",
            null,
            "No reusable transcript was found yet. Retry without AI, or choose AI fallback to generate one.",
          ));
          setPrepFailureKind("non_ai_missing");
          outcome = "non_ai_missing";
          logTranscriptStage("pipeline:done", { outcome }, "warn");
          return;
        }

        setPrepState(createHammerPrepState("preparing", "transcribing_audio"));
        logTranscriptStage("request:start");
        const transcriptSpan = run.span("transcript_prep:request", {
          media_kind: prepSource.mediaRef.kind,
          local_relpath: prepSource.local_relpath,
          canonical_workpiece_path: prepSource.canonical_workpiece_path,
        });
        const transcriptClientRequestId = typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `prep_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        if (ingestDiagnosticRef.current) {
          ingestDiagnosticRef.current.request_ids = {
            ...(ingestDiagnosticRef.current.request_ids ?? {}),
            client_request_id: transcriptClientRequestId,
          };
          ingestDiagnosticRef.current.prep_source = {
            media_kind: prepSource.mediaRef.kind,
            source_kind: prepSource.source_kind,
            canonical_workpiece_path: prepSource.canonical_workpiece_path,
            local_relpath: prepSource.local_relpath,
            media_signature: prepSource.media_signature ?? null,
            media_id: prepSource.mediaRef.media_id ?? null,
          };
        }

        const preparedResult = await requestHammerTranscriptPrep({
          workspace_id: effectiveLaunchContext.workspace_id,
          workpiece_id: effectiveLaunchContext.workpiece_id,
          client_request_id: transcriptClientRequestId,
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
        if (!preparedResult.ok) {
          transcriptSpan.end({
            ok: false,
            status: preparedResult.status,
            code: preparedResult.error.code,
            retryable: preparedResult.error.retryable,
            provider_request_id: preparedResult.meta?.provider_request_id ?? null,
          });
          if (ingestDiagnosticRef.current) {
            ingestDiagnosticRef.current.request_ids = {
              ...(ingestDiagnosticRef.current.request_ids ?? {}),
              provider_request_id: preparedResult.meta?.provider_request_id ?? undefined,
            };
            ingestDiagnosticRef.current.extra = {
              ...(ingestDiagnosticRef.current.extra ?? {}),
              prep_error_code: preparedResult.error.code,
              prep_error_message: preparedResult.error.message,
              prep_error_retryable: preparedResult.error.retryable,
              prep_error_status: preparedResult.status,
            };
          }
          const message = mapTranscriptPrepErrorToUserMessage(preparedResult.error);
          logTranscriptStage("request:failed", {
            status: preparedResult.status,
            code: preparedResult.error.code,
            retryable: preparedResult.error.retryable,
            provider_request_id: preparedResult.meta?.provider_request_id ?? null,
            message,
          }, "error");
          throw new Error(message);
        }

        const preparedResponse = preparedResult.data;
        usedAiPrep = true;
        if (ingestDiagnosticRef.current) {
          ingestDiagnosticRef.current.extra = {
            ...(ingestDiagnosticRef.current.extra ?? {}),
            prep_provider: preparedResponse.provider,
            prep_model: preparedResponse.model,
            prep_segments: preparedResponse.segments.length,
          };
        }
        transcriptSpan.end({
          ok: true,
          provider: preparedResponse.provider,
          model: preparedResponse.model,
          provider_request_id: preparedResponse.provider_request_id,
          segments: preparedResponse.segments.length,
          has_text: Boolean(preparedResponse.text),
        });
        if (ingestDiagnosticRef.current) {
          ingestDiagnosticRef.current.request_ids = {
            ...(ingestDiagnosticRef.current.request_ids ?? {}),
            provider_request_id: preparedResponse.provider_request_id ?? undefined,
          };
        }
        logTranscriptStage("request:ok", {
          provider: preparedResponse.provider,
          model: preparedResponse.model,
          provider_request_id: preparedResponse.provider_request_id ?? null,
          segments: preparedResponse.segments.length,
          has_text: Boolean(preparedResponse.text),
        });
        if (!isPrepExecutionActive(executionId)) return;

        setPrepState(createHammerPrepState("preparing", "identifying_speaker_turns"));
        logTranscriptStage("normalize:start");
        let preparedTranscript = buildPreparedTranscript(effectiveLaunchContext, preparedResponse);
        logTranscriptStage("normalize:ok", {
          transcript_id: preparedTranscript.transcriptId,
          turns: preparedTranscript.turns.length,
        });
        let nextLaunchContext = applyPreparedTranscriptToLaunchContext(
          effectiveLaunchContext,
          preparedTranscript,
        );
        if (!isPrepExecutionActive(executionId)) return;

        let canonicalAfterSeal: HammerCanonicalRecordingRecord | null = activeCanonicalRecording;
        if (!persistenceTarget) {
          logTranscriptStage("seal:skipped", { reason: "missing_persistence_target" }, "warn");
        } else if (!activeCanonicalRecording) {
          logTranscriptStage("seal:skipped", { reason: "missing_canonical_recording" }, "warn");
        } else if (activeCanonicalRecording.sealed_at) {
          logTranscriptStage("seal:skipped", {
            reason: "already_sealed",
            canonical_recording_id: activeCanonicalRecording.id,
            sealed_at: activeCanonicalRecording.sealed_at ?? null,
            note: "Skipping baseline seal; transcript must already exist on the canonical recording baseline for non-AI reuse.",
          }, "warn");
        } else {
          logTranscriptStage("seal:start", { canonical_recording_id: activeCanonicalRecording.id });
          const sealSpan = run.span("canonical:seal_transcript");
          const sealResult = await sealHammerCanonicalBaseline(
            persistenceTarget,
            activeCanonicalRecording.id,
            {
              structured_transcript: preparedTranscript.structuredTranscript,
              speaker_map: preparedTranscript.speakerMap,
            },
          );
          if (!sealResult.ok) {
            const sealCode = sealResult.error_code ?? null;
            if (isSealRaceRecoverable(sealCode)) {
              if (ingestDiagnosticRef.current) {
                ingestDiagnosticRef.current.seal = {
                  attempted: true,
                  outcome: sealCode === "canonical_recording_already_sealed" ? "already_sealed" : "conflict_recovered",
                  error_code: sealCode ?? undefined,
                  error_message: sealResult.error,
                };
              }
              const refreshed = await openHammerRecordingSession(persistenceTarget);
              if (refreshed.ok) {
                canonicalAfterSeal = refreshed.data.canonical_recording;
                setActiveCanonicalRecording(refreshed.data.canonical_recording);
                setActiveRevision(refreshed.data.revision);
                const baselineReload = await loadHammerCanonicalBaselineArtifacts(refreshed.data.canonical_recording);
                const baselineTranscript = baselineReload.ok ? baselineReload.data.structured_transcript : null;
                const baselineSpeakerMap = baselineReload.ok ? baselineReload.data.speaker_map : null;
                if (baselineTranscript && baselineSpeakerMap && baselineTranscript.segments.length > 0) {
                  preparedTranscript = {
                    transcriptId: baselineTranscript.transcript_id,
                    preparedAt: baselineTranscript.prepared_at,
                    turns: baselineTranscript.segments,
                    structuredTranscript: baselineTranscript,
                    speakerMap: baselineSpeakerMap,
                  };
                }
              }
              sealSpan.end({ ok: true, recovered: true, code: sealCode, sealed_at: canonicalAfterSeal?.sealed_at ?? null });
              logTranscriptStage("seal:recovered", {
                code: sealCode,
                sealed_at: canonicalAfterSeal?.sealed_at ?? null,
              }, "warn");
            } else {
              if (ingestDiagnosticRef.current) {
                ingestDiagnosticRef.current.seal = {
                  attempted: true,
                  outcome: "failed",
                  error_code: sealCode ?? undefined,
                  error_message: sealResult.error,
                };
              }
              sealSpan.end({ ok: false, status: sealResult.status, code: sealCode });
              throw new Error(sealResult.error);
            }
          } else {
            if (ingestDiagnosticRef.current) {
              ingestDiagnosticRef.current.seal = {
                attempted: true,
                outcome: "sealed",
              };
            }
            sealSpan.end({ ok: true, sealed_at: sealResult.data.canonical_recording.sealed_at ?? null });
            logTranscriptStage("seal:ok", { sealed_at: sealResult.data.canonical_recording.sealed_at ?? null });
            canonicalAfterSeal = sealResult.data.canonical_recording;
            setActiveCanonicalRecording(canonicalAfterSeal);
          }
        }

        nextLaunchContext = applyPreparedTranscriptToLaunchContext(effectiveLaunchContext, preparedTranscript);
        if (!isPrepExecutionActive(executionId)) return;

        setPrepState(createHammerPrepState("preparing", "placing_initial_visuals"));
        const visualPackageSpan = run.span("visual_package:load");
        const visualPackageResult = await loadHammerWorkpieceVisualPackage(
          nextLaunchContext.workpiece_id,
          nextLaunchContext.workspace_id,
        );
        visualPackageSpan.end({ ok: visualPackageResult.ok, status: visualPackageResult.status });
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

        const saveSpan = run.span("revision:save_prepared");
        let preparedSaveRevision = await saveHammerRecordingRevision(
          persistenceTarget,
          activeRevision.id,
          {
            editor_session: preparedRequest.editor_session,
            revision_transcript: { data: preparedTranscript.structuredTranscript },
            visual_placements: preparedRequest.visual_placements,
          },
        );
        if (!preparedSaveRevision.ok) throw new Error(preparedSaveRevision.error);
        saveSpan.end({
          ok: true,
          visual_placements_path: preparedSaveRevision.data.revision.visual_placements_path,
          editor_session_path: preparedSaveRevision.data.revision.editor_session_path,
          revision_transcript_path: preparedSaveRevision.data.revision.revision_transcript_path ?? null,
        });
        logTranscriptStage("persist:ok", {
          visual_placements_path: preparedSaveRevision.data.revision.visual_placements_path,
          editor_session_path: preparedSaveRevision.data.revision.editor_session_path,
          revision_transcript_path: preparedSaveRevision.data.revision.revision_transcript_path ?? null,
        });
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
        finalSnapshot = hydratedAfterPrep;
        logTranscriptStage("hydrate:ok", {
          transcript_id: preparedTranscript.transcriptId,
          structured_segments: preparedTranscript.structuredTranscript.segments.length,
        });
        if (!isPrepExecutionActive(executionId)) return;

        setPrepState(createHammerPrepState("preparing", "extracting_working_audio"));
        try {
          const audioSpan = run.span("audio_polish:ensure");
          const audioSnapshot = await ensureAudioPolish({
            launchContext: nextLaunchContext,
            currentSnapshot: hydratedAfterPrep,
            onPhaseChange: (phase) => {
              if (!isPrepExecutionActive(executionId)) return;
              setPrepState(createHammerPrepState("preparing", mapAudioPolishPhaseToPrepStep(phase)));
            },
            logRun: run,
          });
          audioSpan.end({ ok: Boolean(audioSnapshot) });
          audioPolishStatus = audioSnapshot?.audio_polish.data?.status ?? null;
          audioPolishFailureCode = audioSnapshot?.audio_polish.data?.status === "failed"
            ? (audioSnapshot.audio_polish.data.failure_code ?? null)
            : null;
          if (audioSnapshot) {
            setLoadedPersistenceSnapshot(audioSnapshot);
            finalSnapshot = audioSnapshot;
          }
        } catch (error) {
          // Audio polish falls back to raw playback without blocking workspace open.
          run.warn("audio_polish:skipped_after_error", {
            message: toErrorMessage(error, "Hammer could not produce a baseline audio polish artifact."),
          });
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
        outcome = "prepared";
        logTranscriptStage("pipeline:done", { outcome });
      } catch (error) {
        if (!isPrepExecutionActive(executionId)) return;
        const message = toErrorMessage(error, "Hammer could not prepare the transcript.");
        setPrepState(createHammerPrepState("prep_failed", null, message));
        setShowPreparedHandoff(false);
        setPrepFailureKind("ai_failed");
        outcome = "failed";
        logTranscriptStage("pipeline:done", { outcome, message }, "error");
        run.error("prep:failed", { message });

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
      } finally {
        if (ingestDiagnosticRef.current && persistenceTarget) {
          const visualStatus = finalSnapshot?.visual_placements.data?.status ?? null;
          const audioStatus = finalSnapshot?.audio_polish.data?.status ?? null;
          const baseStatus: Exclude<HammerIngestDiagnosticV1["final_status"], "degraded"> = outcome === "prepared"
            ? (usedAiPrep ? "prepared_transcript" : "reused_transcript")
            : "blocked";
          const finalStatus = computeIngestFinalStatus({ base: baseStatus, audioStatus, visualStatus });
          ingestDiagnosticRef.current.final_status = finalStatus;
          ingestDiagnosticRef.current.timestamp = new Date().toISOString();
          ingestDiagnosticRef.current.extra = {
            ...(ingestDiagnosticRef.current.extra ?? {}),
            phase: "pipeline_end",
            used_ai_prep: usedAiPrep,
            outcome,
            audio_polish_status: audioStatus,
            visual_placements_status: visualStatus,
          };
          void writeHammerIngestDiagnostics({
            workpieceId: persistenceTarget.workpieceId,
            diagnostic: ingestDiagnosticRef.current,
            correlationId: ingestCorrelationIdRef.current,
          });
        }
        run.end({
          outcome,
          audio_polish_status: audioPolishStatus,
          audio_polish_failure_code: audioPolishFailureCode,
        });
        if (isPrepExecutionActive(executionId) && prepInFlightRunKeyRef.current === prepRunKey) {
          prepInFlightRunKeyRef.current = null;
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
  const voiceRunKey = lastPrepRunKeyRef.current ?? targetKey ?? "hammer";
  const voicePhase: HammerVoicePhase = resolveHammerVoicePhase(prepState.step);

  useEffect(() => {
    if (prepState.status !== "preparing") {
      setPrepVoiceLine(null);
      setPrepVoiceOpacity(1);
      prepVoiceRunKeyRef.current = null;
      prepVoiceMythicShownRef.current = false;
      prepVoiceLastLineRef.current = null;
      prepVoicePickerRef.current = null;
      return;
    }

    const shouldResetRun = prepVoiceRunKeyRef.current !== voiceRunKey;
    if (shouldResetRun) {
      prepVoiceRunKeyRef.current = voiceRunKey;
      prepVoiceMythicShownRef.current = false;
      prepVoiceLastLineRef.current = null;
      prepVoicePickerRef.current = createHammerVoicePicker(voiceRunKey);
    } else if (!prepVoicePickerRef.current) {
      prepVoicePickerRef.current = createHammerVoicePicker(voiceRunKey);
    }

    let cancelled = false;
    let timer: number | null = null;
    const picker = prepVoicePickerRef.current;
    const voiceDebugEnabled = ingestLog.enabled;

    if (voiceDebugEnabled) {
      const previousPhase = (prepVoicePhaseRef.current as HammerVoicePhase | null) ?? null;
      if (shouldResetRun || previousPhase !== voicePhase) {
        // eslint-disable-next-line no-console
        console.log("[HammerVoice] phase_change", {
          instance_id: hammerRuntimeInstanceIdRef.current,
          run_key: voiceRunKey,
          phase: voicePhase,
          previous_phase: previousPhase,
          reset_run: shouldResetRun,
        });
      }
      prepVoicePhaseRef.current = voicePhase;
    }

    const fadeTo = (nextLine: string) => {
      if (cancelled) return;
      setPrepVoiceOpacity(0);
      window.setTimeout(() => {
        if (cancelled) return;
        setPrepVoiceLine(nextLine);
        setPrepVoiceOpacity(1);
      }, 140);
    };

    const pickNextLine = () => {
      if (!picker) return "Preparing…";
      const picked = picker({
        phase: voicePhase,
        lastLine: prepVoiceLastLineRef.current,
        mythicShown: prepVoiceMythicShownRef.current,
      });
      prepVoiceLastLineRef.current = picked.line;
      prepVoiceMythicShownRef.current = picked.mythicShown;
      return picked.line;
    };

    const scheduleRotation = () => {
      if (timer != null) window.clearTimeout(timer);
      const jitterMs = 2500 + Math.floor(Math.random() * 500);
      timer = window.setTimeout(() => {
        if (cancelled) return;
        if (voiceDebugEnabled) {
          // eslint-disable-next-line no-console
          console.log("[HammerVoice] timer_tick", {
            instance_id: hammerRuntimeInstanceIdRef.current,
            run_key: voiceRunKey,
            phase: voicePhase,
            ms: jitterMs,
          });
        }
        fadeTo(pickNextLine());
        scheduleRotation();
      }, jitterMs);
    };

    // Immediately update on phase change / new run.
    fadeTo(pickNextLine());
    scheduleRotation();

    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [ingestLog.enabled, prepState.status, voicePhase, voiceRunKey]);

  const effectiveOverlayViewModel = useMemo(
    () => (overlayViewModel.visible && prepVoiceLine
      ? { ...overlayViewModel, message: prepVoiceLine }
      : overlayViewModel),
    [overlayViewModel, prepVoiceLine],
  );
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
  const [diagnosticsFixInFlight, setDiagnosticsFixInFlight] = useState<HammerIssueFixActionId | null>(null);
  const [diagnosticsFixErrorMessage, setDiagnosticsFixErrorMessage] = useState<string | null>(null);
  const diagnosticsIssues = useMemo(() => deriveHammerIssueDiagnostics({
    sessionState,
    mediaPrepOutputs: handoffMediaPrepOutputs,
    mediaLabelMismatchWarning: workspaceSnapshot?.diagnostics?.mediaLabelMismatchWarning ?? null,
  }), [
    handoffMediaPrepOutputs,
    sessionState,
    workspaceSnapshot?.diagnostics?.mediaLabelMismatchWarning,
  ]);
  const progressFillClassName = useMemo(
    () => `${dynamicStyleScopeIdRef.current}__progress-fill`,
    [],
  );
  const prepProgressWidth = Math.max(8, effectiveOverlayViewModel.progress_ratio * 100);
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
      beginPrepExecution();
      resetPrepRunKey("restart_transcript_prep:retry_non_ai", { behavior });
      setPrepAiFallbackRequested(false);
      setShowPreparedHandoff(false);
      setPrepState(createHammerPrepState("preparing", "loading_context"));
      bumpPrepAttemptNonce("restart_transcript_prep:retry_non_ai", { behavior });
      return;
    }

    const runKey = lastPrepRunKeyRef.current;
    prepAiNoticePendingRunKeyRef.current = runKey ?? `manual_ai_fallback:${Date.now()}`;
    setPrepAiFallbackRequested(true);
    // Always restart prep; the prep effect is the single authority for showing AI consent and starting AI transcription.
    beginPrepExecution();
    resetPrepRunKey("restart_transcript_prep:use_ai_fallback", { behavior });
    setShowPrepAiNotice(false);
    setPrepState(createHammerPrepState("preparing", "loading_context"));
    bumpPrepAttemptNonce("restart_transcript_prep:use_ai_fallback", { behavior });
  }, [
    beginPrepExecution,
    setPrepAiFallbackRequested,
    setPrepState,
    setShowPreparedHandoff,
    setShowPrepAiNotice,
    setTranscriptPrepPreferenceNotice,
    setTranscriptPrepPreferenceNonce,
    bumpPrepAttemptNonce,
    resetPrepRunKey,
  ]);

  // Note: We intentionally do not auto-apply saved transcript-prep preferences (non-AI missing) via an effect.
  // Auto-retrying can create tight restart loops (and React "maximum update depth exceeded") when no transcript exists yet.

  function mapTranscriptPrepErrorToUserMessage(error: HammerTranscriptPrepError): string {
    switch (error.code) {
      case "AUTH_REQUIRED":
        return "Sign in required to prepare a transcript. Refresh and sign in, then retry.";
      case "POLICY_DENIED":
        return `AI policy denied transcript prep. ${error.message}`;
      case "SERVER_NOT_CONFIGURED":
        return `Server is not configured for transcript prep. ${error.message}`;
      case "SOURCE_TOO_LARGE": {
        const detail = error.detail && typeof error.detail === "object" ? error.detail as Record<string, unknown> : null;
        const maxBytes = typeof detail?.max_source_bytes === "number" ? detail.max_source_bytes as number : null;
        const observedBytes = typeof detail?.observed_bytes === "number" ? detail.observed_bytes as number : null;
        const extras = maxBytes || observedBytes
          ? ` (max ${maxBytes ?? "unknown"} bytes, observed ${observedBytes ?? "unknown"} bytes)`
          : "";
        return `Media source is too large for transcript prep${extras}. Downmix/downsample to a smaller file (e.g. mono, 16k–48kHz) and retry.`;
      }
      case "MEDIA_READ_FORBIDDEN":
        return `Hammer does not have permission to read the media source. ${error.message}`;
      case "MEDIA_READ_TIMEOUT":
        return "Timed out while reading the media source. Retry; if it keeps timing out, check network/storage access.";
      case "MEDIA_READ_FAILED":
        return `Failed to read the media source. ${error.message}`;
      case "OPENAI_TIMEOUT":
        return "OpenAI timed out while transcribing. Retry transcript prep.";
      case "OPENAI_UPSTREAM_ERROR":
        return `OpenAI transcription failed. ${error.message}`;
      case "NORMALIZE_EMPTY":
        return "Transcript prep returned no usable segments. Retry; if it keeps happening, check the input audio.";
      case "INVALID_REQUEST":
        return `Transcript prep request was invalid. ${error.message}`;
      case "UNKNOWN_ERROR":
      default:
        return error.message || "Hammer transcript prep failed unexpectedly. Retry, then check the Nursery server logs if it keeps failing.";
    }
  }

  function mapSessionOpenErrorToUserMessage(args: { code: string | null; message: string }): string {
    switch (args.code) {
      case "canonical_recording_missing_take":
        return "No kept take is available for this workpiece. Record a take in Anvil, keep it, then reopen Hammer.";
      case "canonical_recording_missing_media_path":
        return "Kept take receipt is missing a media path. Re-record the take (or repair the receipt) and retry.";
      case "canonical_recording_missing":
        return "Canonical recording is missing for this revision. Reload Hammer; if it persists, contact support.";
      case "AUTH_REQUIRED":
      case "auth_required":
        return "Sign in required to open this Hammer session. Refresh and sign in, then retry.";
      default:
        return args.message || "Failed to open Hammer session.";
    }
  }

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

  const runDiagnosticsFixAction = useCallback(async (actionId: HammerIssueFixActionId): Promise<void> => {
    if (diagnosticsFixInFlight) return;
    setDiagnosticsFixErrorMessage(null);

    if (actionId === "reload_latest" || actionId === "retry_save") {
      handleSessionAction(actionId);
      return;
    }

    if (persistenceMode !== "canonical" || !persistenceTarget || !hydrationReady) {
      setDiagnosticsFixErrorMessage("Fix actions require canonical persistence to be available.");
      return;
    }

    if (!effectiveLaunchContext) {
      setDiagnosticsFixErrorMessage("Launch context is not available yet. Try again in a moment.");
      return;
    }

    if (!loadedPersistenceSnapshot) {
      setDiagnosticsFixErrorMessage("Canonical snapshot is not loaded yet. Try again in a moment.");
      return;
    }

    setDiagnosticsFixInFlight(actionId);
    try {
      if (actionId === "refresh_audio_prep") {
        const next = await ensureAudioPolish({
          launchContext: effectiveLaunchContext,
          currentSnapshot: loadedPersistenceSnapshot,
          onPhaseChange: undefined,
        });
        if (next) {
          setLoadedPersistenceSnapshot(next);
        }
        return;
      }

      if (actionId === "refresh_visual_placements") {
        const transcriptSourceId = workspaceSnapshot?.transcriptSourceId
          ?? loadedPersistenceSnapshot.structured_transcript.data?.transcript_id
          ?? null;
        const transcriptSegments = workspaceSnapshot?.transcriptSegments
          ?? loadedPersistenceSnapshot.structured_transcript.data?.segments
          ?? null;
        if (!transcriptSourceId || !transcriptSegments) {
          setDiagnosticsFixErrorMessage("Transcript data is not available yet. Try again in a moment.");
          return;
        }

        const next = await ensureVisualPlacements({
          launchContext: effectiveLaunchContext,
          transcriptSourceId,
          transcriptSegments,
          currentSnapshot: loadedPersistenceSnapshot,
        });
        setLoadedPersistenceSnapshot(next);
        return;
      }

      setDiagnosticsFixErrorMessage("That fix action is not implemented yet.");
    } catch (error) {
      setDiagnosticsFixErrorMessage(toErrorMessage(error, "Hammer could not apply that fix."));
    } finally {
      setDiagnosticsFixInFlight(null);
    }
  }, [
    diagnosticsFixInFlight,
    effectiveLaunchContext,
    ensureAudioPolish,
    ensureVisualPlacements,
    handleSessionAction,
    hydrationReady,
    loadedPersistenceSnapshot,
    persistenceMode,
    persistenceTarget,
    setLoadedPersistenceSnapshot,
    workspaceSnapshot?.transcriptSegments,
    workspaceSnapshot?.transcriptSourceId,
  ]);

  const runDiagnosticsFixAll = useCallback(async (actionIds: HammerIssueFixActionId[]): Promise<void> => {
    if (actionIds.length === 0) return;
    const unique = [...new Set(actionIds)];
    for (const actionId of unique) {
      if (actionId === "reload_latest") {
        await runDiagnosticsFixAction(actionId);
        return;
      }
      await runDiagnosticsFixAction(actionId);
    }
  }, [runDiagnosticsFixAction]);

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
              beginPrepExecution();
              resetPrepRunKey("prep_ai_notice:continue", { run_key: runKey });
              setPrepState(createHammerPrepState("preparing", "loading_context"));
              bumpPrepAttemptNonce("prep_ai_notice:continue", { run_key: runKey });
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
              <button
                type="button"
                className="hammer-prep-shell__action-button"
                onClick={() => restartTranscriptPrep(savedPreference, { announce: true })}
              >
                {savedPreference === "retry-non-ai" ? "Retry non-AI" : "Use AI fallback"}
              </button>
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
          >
            <HammerWorkspaceDiagnosticsBanner
              issues={diagnosticsIssues}
              fallbackTitle={sessionState.humanLabel}
              fallbackSummary={sessionState.detail}
              inFlightFixActionId={diagnosticsFixInFlight}
              fixErrorMessage={diagnosticsFixErrorMessage}
              onRunFixAction={runDiagnosticsFixAction}
              onRunFixAll={runDiagnosticsFixAll}
            />
          </div>
          <HammerIngestDiagnosticsPanel workpieceId={persistenceTarget?.workpieceId ?? null} />
          {transcriptPrepPreferenceNotice ? (
            <div className="hammer-prep-shell__preference-notice">
              <span>{transcriptPrepPreferenceNotice.label}</span>
              {props.onRequestAiSettings ? (
                <button
                  type="button"
                  onClick={() => props.onRequestAiSettings?.()}
                  aria-label="Change AI prep preference"
                >
                  Change
                </button>
              ) : null}
            </div>
          ) : null}
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

      {effectiveOverlayViewModel.visible ? (
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
              <div id="hammer-prep-shell-title" className="hammer-prep-shell__title">{effectiveOverlayViewModel.title}</div>
              <div
                className={`hammer-prep-shell__message ${prepVoiceOpacity === 0 ? "hammer-prep-shell__message--transparent" : "hammer-prep-shell__message--opaque"}`}
              >
                {effectiveOverlayViewModel.message}
              </div>
              <div id="hammer-prep-shell-note" className="hammer-prep-shell__note">{effectiveOverlayViewModel.note}</div>
            </div>

            <div className="hammer-prep-shell__progress">
              <div className="hammer-prep-shell__progress-bar">
                <span className={progressFillClassName} />
              </div>
              <div className="hammer-prep-shell__step-list" aria-hidden="true">
                {Array.from({ length: effectiveOverlayViewModel.step_count }).map((_, index) => (
                  <span
                    key={`prep-step-${index + 1}`}
                    className={`hammer-prep-shell__step${effectiveOverlayViewModel.progress_ratio * effectiveOverlayViewModel.step_count >= index + 1 ? " is-active" : ""}`}
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
