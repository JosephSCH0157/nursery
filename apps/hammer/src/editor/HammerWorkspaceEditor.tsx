import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import TranscriptSeekMock from "../dev/TranscriptSeekMock";
import type { HammerWorkspaceSnapshot } from "./hammerWorkspaceSnapshot";
import "./HammerWorkspaceEditor.css";
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
import { requestHammerTranscriptPrep } from "../prep/hammerPrepApi";

export interface HammerWorkspaceEditorProps {
  launchContext?: HammerLaunchContext;
  routeSearch?: string;
  persistenceMode?: "canonical" | "disabled";
}

const HEARTBEAT_INTERVAL_MS = 30_000;
const READY_HANDOFF_DELAY_MS = 320;
const SAVE_DEBOUNCE_MS = 400;

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
  const [prepAttemptNonce, setPrepAttemptNonce] = useState(0);
  const openedAtRef = useRef(new Date().toISOString());
  const saveTimerRef = useRef<number | null>(null);
  const readyTransitionTimerRef = useRef<number | null>(null);
  const lastSavedPayloadRef = useRef<string | null>(null);
  const prepRunKeyRef = useRef<string | null>(null);

  useEffect(() => {
    lastSavedPayloadRef.current = null;
    prepRunKeyRef.current = null;
    setWorkspaceSnapshot(null);
    setLoadedPersistenceSnapshot(null);
    setShowPreparedHandoff(false);
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

    const openDecision = resolveHammerPrepOpenDecision(
      effectiveLaunchContext,
      loadedPersistenceSnapshot,
    );
    if (openDecision.action === "reuse") {
      setPrepState(openDecision.state);
      setShowPreparedHandoff(true);
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

        setPrepState(createHammerPrepState("preparing", "finalizing_transcript"));
        const preparedRequest = buildHammerPrepPersistenceSaveRequest({
          launchContext: nextLaunchContext,
          status: "prepared",
          preparedTranscript,
        });
        const preparedSave = await saveHammerPersistenceSnapshot(persistenceTarget, preparedRequest);
        if (!preparedSave.ok) {
          throw new Error(preparedSave.error);
        }
        if (!active) return;

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
            onWorkspaceSnapshotChange={canPersistCanonicalState ? setWorkspaceSnapshot : undefined}
          />
        </div>
      ) : null}

      {overlayViewModel.visible ? (
        <div className="hammer-prep-shell__overlay" role="presentation">
          <section className="hammer-prep-shell__modal" aria-label="Hammer prep overlay" aria-modal="true">
            <div className="hammer-prep-shell__wheel-row">
              <div className="hammer-prep-shell__wheel" aria-hidden="true">
                <div className="hammer-prep-shell__wheel-outer" />
                <div className="hammer-prep-shell__wheel-inner" />
                <div className="hammer-prep-shell__wheel-hub" />
              </div>
              <div className="hammer-prep-shell__title">{overlayViewModel.title}</div>
              <div className="hammer-prep-shell__message">{overlayViewModel.message}</div>
              <div className="hammer-prep-shell__note">{overlayViewModel.note}</div>
            </div>

            <div className="hammer-prep-shell__progress">
              <div className="hammer-prep-shell__progress-bar">
                <span style={{ width: `${Math.max(8, overlayViewModel.progress_ratio * 100)}%` }} />
              </div>
              <div className="hammer-prep-shell__step-list" aria-hidden="true">
                {Array.from({ length: 5 }).map((_, index) => (
                  <span
                    key={`prep-step-${index + 1}`}
                    className={`hammer-prep-shell__step${overlayViewModel.progress_ratio * 5 >= index + 1 ? " is-active" : ""}`}
                  />
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {showPreparedHandoff ? (
        <section className="hammer-prep-shell__handoff" aria-label="Hammer prep handoff">
          <div className="hammer-prep-shell__handoff-title">Transcript Ready</div>
          <div className="hammer-prep-shell__handoff-body">
            Hammer finished the speaker-structured transcript. Review the turns, then choose the next
            edit you want to direct in Polish, Audio, Video, or Captions.
          </div>
          <div className="hammer-prep-shell__handoff-actions">
            <button
              type="button"
              className="hammer-prep-shell__button"
              onClick={() => setShowPreparedHandoff(false)}
            >
              Start editing
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
