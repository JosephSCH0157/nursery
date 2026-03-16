import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import TranscriptSeekMock from "../dev/TranscriptSeekMock";
import type { HammerWorkspaceSnapshot } from "./hammerWorkspaceSnapshot";
import "./HammerWorkspaceEditor.css";
import {
  buildHammerPreparedHandoffModel,
  type HammerPreparedNextStepActionId,
} from "./hammerPreparedHandoff";
import {
  buildHammerLaunchContextFromPersistence,
  buildHammerPersistenceSaveRequest,
  loadHammerPersistenceSnapshot,
  readHammerPersistenceTarget,
  saveHammerPersistenceSnapshot,
  upsertHammerPresence,
} from "../persistence/hammerPersistence";
import type { HammerPersistenceSnapshot } from "../persistence/hammerPersistenceContract";
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
import { requestHammerAudioPolish } from "../prep/hammerAudioPolishApi";
import { requestHammerTranscriptPrep } from "../prep/hammerPrepApi";
import {
  buildUnavailableHammerVisualPlacements,
  deriveHammerVisualPlacements,
  isReusableHammerVisualPlacements,
  loadHammerWorkpieceVisualPackage,
} from "../lib/hammerVisualPlacements";

export interface HammerWorkspaceEditorProps {
  launchContext?: HammerLaunchContext;
  routeSearch?: string;
  persistenceMode?: "canonical" | "disabled";
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
  const openedAtRef = useRef(new Date().toISOString());
  const saveTimerRef = useRef<number | null>(null);
  const readyTransitionTimerRef = useRef<number | null>(null);
  const lastSavedPayloadRef = useRef<string | null>(null);
  const prepRunKeyRef = useRef<string | null>(null);
  const dynamicStyleScopeIdRef = useRef(`hammer-workspace-editor-${Math.random().toString(36).slice(2, 10)}`);

  const ensureVisualPlacements = async (args: {
    launchContext: HammerLaunchContext;
    transcriptSourceId: string;
    transcriptSegments: HammerWorkspaceSnapshot["transcriptSegments"];
    currentSnapshot: HammerPersistenceSnapshot | null;
  }): Promise<HammerPersistenceSnapshot> => {
    if (!persistenceTarget) {
      throw new Error("Hammer visual placement persistence requires a canonical target.");
    }

    const visualPackageResult = await loadHammerWorkpieceVisualPackage(args.launchContext.workpiece_id);
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

    try {
      const response = await requestHammerAudioPolish({
        workspace_id: args.launchContext.workspace_id,
        workpiece_id: args.launchContext.workpiece_id,
        media_kind: prepSource.mediaRef.kind,
        local_root_abs: prepSource.local_root_abs,
        local_relpath: prepSource.local_relpath,
        mime_type: prepSource.mediaRef.kind === "recording_audio" ? "audio/wav" : null,
      });

      const audioPolish = response.status === "prepared"
        ? buildPreparedHammerAudioPolish({
          prepSource,
          preparedAt: response.prepared_at ?? new Date().toISOString(),
          outputLocalRelpath: response.output_local_relpath ?? prepSource.local_relpath,
          outputMimeType: response.output_mime_type ?? "audio/wav",
          outputDurationMs: response.output_duration_ms,
          settingsSummary: response.settings_summary,
          preparedPasses: response.prepared_passes,
        })
        : buildFailedHammerAudioPolish({
          prepSource,
          failureCode: response.failure_code ?? "processing_failed",
          failureReason: response.failure_reason ?? "Hammer could not produce a baseline audio polish artifact.",
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
    }
  };

  useEffect(() => {
    lastSavedPayloadRef.current = null;
    prepRunKeyRef.current = null;
    setWorkspaceSnapshot(null);
    setLoadedPersistenceSnapshot(null);
    setShowPreparedHandoff(false);
    setPreparedActionIntent(null);
    openedAtRef.current = new Date().toISOString();
    setEffectiveLaunchContext(withSessionId(props.launchContext));

    if (readyTransitionTimerRef.current != null) {
      window.clearTimeout(readyTransitionTimerRef.current);
      readyTransitionTimerRef.current = null;
    }

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
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          setLoadedPersistenceSnapshot(result.data);
          const hydrated = buildHammerLaunchContextFromPersistence(
            persistenceTarget,
            result.data,
            withSessionId(props.launchContext),
          );
          if (hydrated) {
            startTransition(() => {
              setEffectiveLaunchContext(withSessionId(hydrated.launchContext));
            });
            setHasCanonicalBasis(true);
          } else {
            setEffectiveLaunchContext(withSessionId(props.launchContext));
            setHasCanonicalBasis(Boolean(props.launchContext));
          }
        } else {
          setEffectiveLaunchContext(withSessionId(props.launchContext));
          setHasCanonicalBasis(Boolean(props.launchContext));
        }
        setHydrationReady(true);
      })
      .catch(() => {
        if (!active) return;
        setEffectiveLaunchContext(withSessionId(props.launchContext));
        setHasCanonicalBasis(Boolean(props.launchContext));
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
      let active = true;

      const runReuse = async () => {
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
          if (!active) return;

          setLoadedPersistenceSnapshot(nextSnapshot);
          setPrepState(createHammerPrepState("preparing", "polishing_audio"));
          try {
            nextSnapshot = await ensureAudioPolish({
              launchContext: effectiveLaunchContext,
              currentSnapshot: nextSnapshot,
            }) ?? nextSnapshot;
          } catch {
            // Audio polish falls back to raw playback without blocking workspace open.
          }
          if (!active) return;

          setLoadedPersistenceSnapshot(nextSnapshot);
          setPrepState(createHammerPrepState("preparing", "ready_for_next_step"));
          readyTransitionTimerRef.current = window.setTimeout(() => {
            if (!active) return;
            setPrepState(createHammerPrepState("prepared", "ready_for_next_step"));
            setShowPreparedHandoff(true);
            readyTransitionTimerRef.current = null;
          }, READY_HANDOFF_DELAY_MS);
        } catch (error) {
          if (!active) return;
          const message = toErrorMessage(error, "Hammer could not prepare initial visual placements.");
          setPrepState(createHammerPrepState("prep_failed", null, message));
          setShowPreparedHandoff(false);
        }
      };

      void runReuse();

      return () => {
        active = false;
        if (readyTransitionTimerRef.current != null) {
          window.clearTimeout(readyTransitionTimerRef.current);
          readyTransitionTimerRef.current = null;
        }
      };
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
    let active = true;

    const runPrep = async () => {
      setShowPreparedHandoff(false);
      setPrepState(createHammerPrepState("preparing", "transcribing_audio"));

      try {
        const preparingRequest = buildHammerPrepPersistenceSaveRequest({
          launchContext: effectiveLaunchContext,
          status: "preparing",
        });
        const preparingSave = await saveHammerPersistenceSnapshot(persistenceTarget, preparingRequest);
        if (active && preparingSave.ok) {
          setLoadedPersistenceSnapshot(preparingSave.data);
        }

        const preparedResponse = await requestHammerTranscriptPrep({
          workspace_id: effectiveLaunchContext.workspace_id,
          workpiece_id: effectiveLaunchContext.workpiece_id,
          media_kind: prepSource.mediaRef.kind,
          local_root_abs: prepSource.local_root_abs,
          local_relpath: prepSource.local_relpath,
          mime_type: prepSource.mediaRef.kind === "recording_audio" ? "audio/wav" : null,
        });
        if (!active) return;

        setPrepState(createHammerPrepState("preparing", "identifying_speaker_turns"));
        const preparedTranscript = buildPreparedTranscript(effectiveLaunchContext, preparedResponse);
        const nextLaunchContext = applyPreparedTranscriptToLaunchContext(
          effectiveLaunchContext,
          preparedTranscript,
        );
        if (!active) return;

        setPrepState(createHammerPrepState("preparing", "placing_initial_visuals"));
        const visualPackageResult = await loadHammerWorkpieceVisualPackage(nextLaunchContext.workpiece_id);
        if (!active) return;

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
        if (!active) return;

        setPrepState(createHammerPrepState("preparing", "polishing_audio"));
        try {
          const audioSnapshot = await ensureAudioPolish({
            launchContext: nextLaunchContext,
            currentSnapshot: preparedSave.data,
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
        if (!active) return;

        prepRunKeyRef.current = `${targetKey ?? "hammer"}:reuse:${preparedTranscript.transcriptId}:${prepAttemptNonce}`;
        setLoadedPersistenceSnapshot(preparedSave.data);
        setHasCanonicalBasis(true);
        startTransition(() => {
          setEffectiveLaunchContext(nextLaunchContext);
        });
        setPrepState(createHammerPrepState("preparing", "ready_for_next_step"));
        readyTransitionTimerRef.current = window.setTimeout(() => {
          if (!active) return;
          setPrepState(createHammerPrepState("prepared", "ready_for_next_step"));
          setShowPreparedHandoff(true);
          readyTransitionTimerRef.current = null;
        }, READY_HANDOFF_DELAY_MS);
      } catch (error) {
        if (!active) return;
        const message = toErrorMessage(error, "Hammer could not prepare the transcript.");
        setPrepState(createHammerPrepState("prep_failed", null, message));
        setShowPreparedHandoff(false);

        try {
          const failedRequest = buildHammerPrepPersistenceSaveRequest({
            launchContext: effectiveLaunchContext,
            status: "prep_failed",
          });
          const failedSave = await saveHammerPersistenceSnapshot(persistenceTarget, failedRequest);
          if (active && failedSave.ok) {
            setLoadedPersistenceSnapshot(failedSave.data);
          }
        } catch {
          // Keep the user-facing failure stable even if persistence also failed.
        }
      }
    };

    void runPrep();

    return () => {
      active = false;
      if (readyTransitionTimerRef.current != null) {
        window.clearTimeout(readyTransitionTimerRef.current);
        readyTransitionTimerRef.current = null;
      }
    };
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
      return;
    }

    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      void saveHammerPersistenceSnapshot(persistenceTarget, request)
        .then((result) => {
          if (!result.ok) return;
          lastSavedPayloadRef.current = payloadKey;
          setLoadedPersistenceSnapshot(result.data);
        })
        .finally(() => {
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

    const sendHeartbeat = () => {
      void upsertHammerPresence(persistenceTarget, {
        mode: "editing",
        session_id: sessionId,
      });
    };

    sendHeartbeat();
    const intervalId = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => {
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
  });
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

  if (persistenceMode === "canonical" && prepState.status === "prep_failed") {
    return (
      <section className="hammer-prep-shell__failure">
        <div className="hammer-prep-shell__failure-card">
          <h2>Hammer transcript prep stopped.</h2>
          <p>{prepState.error ?? "Hammer could not prepare this episode transcript."}</p>
          <p>
            Hammer keeps transcript prep transcript-first in production runtime. Fix the media context
            or retry once the local recording is available.
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
    <div className="hammer-prep-shell">
      {shouldRenderEditor ? (
        <div className="hammer-prep-shell__editor">
            <TranscriptSeekMock
              launchContext={effectiveLaunchContext}
              structuredTranscript={loadedPersistenceSnapshot?.structured_transcript.data ?? null}
              visualPlacements={visualPlacementData}
              audioPolish={audioPolishData}
              selectedMacroRecipeRef={loadedPersistenceSnapshot?.macro_hooks.recipe_ref ?? null}
              lastMacroRunRef={loadedPersistenceSnapshot?.macro_hooks.last_run_ref ?? null}
              prepHandoffAction={preparedActionIntent}
              allowDevLaunchFallback={props.allowDevLaunchFallback}
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
                <div className="hammer-prep-shell__wheel-outer" />
                <div className="hammer-prep-shell__wheel-inner" />
                <div className="hammer-prep-shell__wheel-hub" />
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
        <section className="hammer-prep-shell__handoff" aria-label="Hammer prep handoff">
          <div className="hammer-prep-shell__handoff-title">{handoffModel.title}</div>
          <div className="hammer-prep-shell__handoff-body">{handoffModel.body}</div>
          <div className="hammer-prep-shell__handoff-summary-grid">
            {handoffModel.summaries.map((summary) => (
              <article
                key={summary.id}
                className={`hammer-prep-shell__handoff-summary hammer-prep-shell__handoff-summary--${summary.tone}`}
              >
                <div className="hammer-prep-shell__handoff-summary-head">
                  <span className="hammer-prep-shell__handoff-summary-label">{summary.label}</span>
                  <span className="hammer-prep-shell__handoff-summary-status">{summary.status_label}</span>
                </div>
                <div className="hammer-prep-shell__handoff-summary-detail">{summary.detail}</div>
              </article>
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
          </div>
        </section>
      ) : null}
    </div>
  );
}
