import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import HammerWorkspaceShell from "./HammerWorkspaceShell";
import type { HammerWorkspaceSnapshot } from "./hammerWorkspaceSnapshot";
import "./HammerWorkspaceEditor.css";
import {
  buildHammerPreparedHandoffModel,
  type HammerPreparedNextStepActionId,
} from "./hammerPreparedHandoff";
import { deriveHammerSessionState } from "./hammerSessionState";
import { buildHammerMediaPrepOutputsPackage } from "../lib/hammerMediaPrepOutputsPackage";
import {
  buildHammerLaunchContextFromPersistence,
  buildHammerPersistenceSaveRequest,
  loadHammerPresence,
  loadHammerPersistenceSnapshot,
  readHammerPersistenceTarget,
  saveHammerPersistenceSnapshot,
  upsertHammerPresence,
} from "../persistence/hammerPersistence";
import type { HammerPersistenceSnapshot, HammerPresenceRow } from "../persistence/hammerPersistenceContract";
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
  buildHammerLaunchContextFromRecordingTruth,
  loadHammerWorkpieceRecordingTruth,
} from "../app/hammerRuntimeData";
import {
  buildUnavailableHammerVisualPlacements,
  deriveHammerVisualPlacements,
  isReusableHammerVisualPlacements,
  loadHammerWorkpieceVisualPackage,
} from "../lib/hammerVisualPlacements";
import { hasTongsUserAccessToken } from "../lib/tongsFetch";
import { loadWorkspaceMapping } from "../media/workspaceMapping";

export interface HammerWorkspaceEditorProps {
  launchContext?: HammerLaunchContext;
  routeSearch?: string;
  persistenceMode?: "canonical" | "disabled";
  releasePrepHref?: string | null;
  allowDevLaunchFallback?: boolean;
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
  const [hasPendingSaveChanges, setHasPendingSaveChanges] = useState(false);
  const [saveInFlight, setSaveInFlight] = useState(false);
  const [saveFailureMessage, setSaveFailureMessage] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [historyRecoveryStatus, setHistoryRecoveryStatus] = useState<string | null>(null);
  const [presenceConflictDetail, setPresenceConflictDetail] = useState<string | null>(null);
  const openedAtRef = useRef(new Date().toISOString());
  const saveTimerRef = useRef<number | null>(null);
  const readyTransitionTimerRef = useRef<number | null>(null);
  const lastSavedPayloadRef = useRef<string | null>(null);
  const prepRunKeyRef = useRef<string | null>(null);
  const prepExecutionIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const dynamicStyleScopeIdRef = useRef(`hammer-workspace-editor-${Math.random().toString(36).slice(2, 10)}`);
  const handoffPanelRef = useRef<HTMLElement | null>(null);

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

  const ensureVisualPlacements = async (args: {
    launchContext: HammerLaunchContext;
    transcriptSourceId: string;
    transcriptSegments: HammerWorkspaceSnapshot["transcriptSegments"];
    currentSnapshot: HammerPersistenceSnapshot | null;
  }): Promise<HammerPersistenceSnapshot> => {
    if (!persistenceTarget) {
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

    const saveResult = await saveHammerPersistenceSnapshot(persistenceTarget, {
      written_by: {
        tool: "hammer",
        tool_version: "forge-v1.2.0/hammer-runtime",
        lane: "forge-managed",
      },
      active_session_id: args.launchContext.session_id ?? null,
      last_opened_at: openedAtRef.current,
      visual_placements: {
        data: visualPlacements,
      },
    });
    if (!saveResult.ok) {
      throw new Error(saveResult.error);
    }
    return saveResult.data;
  };

  const ensureAudioPolish = async (args: {
    launchContext: HammerLaunchContext;
    currentSnapshot: HammerPersistenceSnapshot | null;
    onPhaseChange?: (phase: HammerAudioPolishPhase) => void;
  }): Promise<HammerPersistenceSnapshot | null> => {
    if (!persistenceTarget) {
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

    const preparingSave = await saveHammerPersistenceSnapshot(persistenceTarget, {
      written_by: {
        tool: "hammer",
        tool_version: "forge-v1.2.0/hammer-runtime",
        lane: "forge-managed",
      },
      active_session_id: args.launchContext.session_id ?? null,
      last_opened_at: openedAtRef.current,
      audio_polish: {
        data: buildPreparingHammerAudioPolish(prepSource),
      },
    });
    if (!preparingSave.ok) {
      throw new Error(preparingSave.error);
    }

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

      const finalSave = await saveHammerPersistenceSnapshot(persistenceTarget, {
        written_by: {
          tool: "hammer",
          tool_version: "forge-v1.2.0/hammer-runtime",
          lane: "forge-managed",
        },
        active_session_id: args.launchContext.session_id ?? null,
        last_opened_at: openedAtRef.current,
        audio_polish: {
          data: audioPolish,
        },
      });
      if (!finalSave.ok) {
        throw new Error(finalSave.error);
      }
      return finalSave.data;
    } catch (error) {
      const failedSave = await saveHammerPersistenceSnapshot(persistenceTarget, {
        written_by: {
          tool: "hammer",
          tool_version: "forge-v1.2.0/hammer-runtime",
          lane: "forge-managed",
        },
        active_session_id: args.launchContext.session_id ?? null,
        last_opened_at: openedAtRef.current,
        audio_polish: {
          data: buildFailedHammerAudioPolish({
            prepSource,
            failureCode: "processing_failed",
            failureReason: toErrorMessage(error, "Hammer could not produce a baseline audio polish artifact."),
          }),
        },
      });
      if (!failedSave.ok) {
        throw new Error(failedSave.error);
      }
      return failedSave.data;
    } finally {
      pollingCancelled = true;
    }
  };

  useEffect(() => {
    beginPrepExecution();
    lastSavedPayloadRef.current = null;
    setHasPendingSaveChanges(false);
    setSaveInFlight(false);
    setSaveFailureMessage(null);
    setLastSavedAt(null);
    setHistoryRecoveryStatus(null);
    setPresenceConflictDetail(null);
    prepRunKeyRef.current = null;
    setWorkspaceSnapshot(null);
    setLoadedPersistenceSnapshot(null);
    setShowPreparedHandoff(false);
    setPreparedActionIntent(null);
    openedAtRef.current = new Date().toISOString();
    setEffectiveLaunchContext(withSessionId(props.launchContext));

    clearReadyTransitionTimer();

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

    void loadHammerPersistenceSnapshot(persistenceTarget)
      .then(async (result) => {
        if (!active) return;

        let nextLaunchContext = withSessionId(props.launchContext);
        let nextHasCanonicalBasis = Boolean(nextLaunchContext);

        if (result.ok) {
          setLoadedPersistenceSnapshot(result.data);
          const hydrated = buildHammerLaunchContextFromPersistence(
            persistenceTarget,
            result.data,
            nextLaunchContext,
          );
          if (hydrated) {
            nextLaunchContext = withSessionId(hydrated.launchContext);
            nextHasCanonicalBasis = true;
          }
        }

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
        setHasCanonicalBasis(nextHasCanonicalBasis);
        setHydrationReady(true);
      });

    return () => {
      active = false;
    };
  }, [persistenceMode, persistenceTarget, props.launchContext]);

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
    if (prepRunKeyRef.current === prepRunKey) {
      return;
    }

    prepRunKeyRef.current = prepRunKey;
    const executionId = beginPrepExecution();

    const runPrep = async () => {
      clearReadyTransitionTimer();
      setShowPreparedHandoff(false);
      setPrepState(createHammerPrepState("preparing", "transcribing_audio"));

      try {
        const preparingRequest = buildHammerPrepPersistenceSaveRequest({
          launchContext: effectiveLaunchContext,
          status: "preparing",
        });
        const preparingSave = await saveHammerPersistenceSnapshot(persistenceTarget, preparingRequest);
        if (isPrepExecutionActive(executionId) && preparingSave.ok) {
          setLoadedPersistenceSnapshot(preparingSave.data);
        }

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
        let preparedSave = await saveHammerPersistenceSnapshot(persistenceTarget, preparedRequest);
        if (!preparedSave.ok) {
          throw new Error(preparedSave.error);
        }
        if (!isPrepExecutionActive(executionId)) return;

        setPrepState(createHammerPrepState("preparing", "extracting_working_audio"));
        try {
          const audioSnapshot = await ensureAudioPolish({
            launchContext: nextLaunchContext,
            currentSnapshot: preparedSave.data,
            onPhaseChange: (phase) => {
              if (!isPrepExecutionActive(executionId)) return;
              setPrepState(createHammerPrepState("preparing", mapAudioPolishPhaseToPrepStep(phase)));
            },
          });
          if (audioSnapshot) {
            preparedSave = {
              ok: true,
              status: 200,
              data: audioSnapshot,
            };
          }
        } catch {
          // Audio polish falls back to raw playback without blocking workspace open.
        }
        if (!isPrepExecutionActive(executionId)) return;

        prepRunKeyRef.current = `${targetKey ?? "hammer"}:reuse:${preparedTranscript.transcriptId}:${prepAttemptNonce}`;
        setLoadedPersistenceSnapshot(preparedSave.data);
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

        try {
          const failedRequest = buildHammerPrepPersistenceSaveRequest({
            launchContext: effectiveLaunchContext,
            status: "prep_failed",
          });
          const failedSave = await saveHammerPersistenceSnapshot(persistenceTarget, failedRequest);
          if (isPrepExecutionActive(executionId) && failedSave.ok) {
            setLoadedPersistenceSnapshot(failedSave.data);
          }
        } catch {
          // Keep the user-facing failure stable even if persistence also failed.
        }
      }
    };

    void runPrep();
  }, [
    effectiveLaunchContext,
    hydrationReady,
    loadedPersistenceSnapshot,
    persistenceMode,
    persistenceTarget,
    prepState.status,
    prepState.step,
    prepAttemptNonce,
    targetKey,
  ]);

  useEffect(() => {
    if (!canPersistCanonicalState || !persistenceTarget || !workspaceSnapshot) {
      return;
    }

    const request = buildHammerPersistenceSaveRequest(
      workspaceSnapshot,
      loadedPersistenceSnapshot?.structured_transcript.data ?? null,
      loadedPersistenceSnapshot?.audio_polish.data ?? null,
      openedAtRef.current,
    );
    const payloadKey = JSON.stringify({
      target: persistenceTarget,
      request,
    });
    if (payloadKey === lastSavedPayloadRef.current) {
      setHasPendingSaveChanges(false);
      return;
    }

    setHasPendingSaveChanges(true);
    setSaveFailureMessage(null);

    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      setSaveInFlight(true);
      void saveHammerPersistenceSnapshot(persistenceTarget, request)
        .then((result) => {
          if (!result.ok) {
            setSaveFailureMessage(result.error);
            return;
          }
          lastSavedPayloadRef.current = payloadKey;
          setLastSavedAt(new Date().toISOString());
          setHasPendingSaveChanges(false);
          setLoadedPersistenceSnapshot(result.data);
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
  }, [canPersistCanonicalState, loadedPersistenceSnapshot, persistenceTarget, targetKey, workspaceSnapshot]);

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
  const shouldRenderEditor = persistenceMode !== "canonical" || prepState.status === "prepared";
  const visualPlacementData = loadedPersistenceSnapshot?.visual_placements.data ?? null;
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
  const progressFillClassName = useMemo(
    () => `${dynamicStyleScopeIdRef.current}__progress-fill`,
    [],
  );
  const prepProgressWidth = Math.max(8, overlayViewModel.progress_ratio * 100);
  useDynamicCssText(
    dynamicStyleScopeIdRef.current,
    `.${progressFillClassName} { width: ${prepProgressWidth}%; }`,
  );

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

  if (persistenceMode === "canonical" && prepState.status === "prep_failed") {
    return (
      <section className="hammer-prep-shell__failure">
        <div className="hammer-prep-shell__failure-card">
          <h2>Hammer transcript prep stopped.</h2>
          <p>{prepState.error ?? "Hammer could not prepare this episode transcript."}</p>
          <p>
            Hammer keeps transcript prep transcript-first in production runtime. Fix the media context
            or retry once the recording is available.
          </p>
          <div className="hammer-prep-shell__handoff-actions">
            <button
              type="button"
              className="hammer-prep-shell__button"
              onClick={() => {
                prepRunKeyRef.current = null;
                setShowPreparedHandoff(false);
                setPrepState(createHammerPrepState("preparing", "loading_context"));
                setPrepAttemptNonce((current) => current + 1);
              }}
            >
              Retry prep
            </button>
          </div>
        </div>
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
          </div>
          <HammerWorkspaceShell
            launchContext={effectiveLaunchContext}
            structuredTranscript={loadedPersistenceSnapshot?.structured_transcript.data ?? null}
            visualPlacements={visualPlacementData}
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
