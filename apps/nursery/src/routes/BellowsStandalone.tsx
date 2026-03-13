import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type {
  BellowsLifecycleState,
  BellowsOperatorConsoleHarness,
  BellowsOperatorConsoleSnapshot,
  BellowsSession,
  ParticipantId,
  SessionEventId,
  SessionId,
  UserId,
  WorkspaceId,
} from "@forge/bellows";
import { createBellowsOperatorConsoleHarness } from "@forge/bellows";
import "./BellowsStandalone.css";

type ActionRunner = () => Promise<{ transition: { kind: "accepted" | "rejected" } }>;

function asParticipantId(value: string): ParticipantId {
  return value as ParticipantId;
}

function asSessionId(value: string): SessionId {
  return value as SessionId;
}

function asUserId(value: string): UserId {
  return value as UserId;
}

function asWorkspaceId(value: string): WorkspaceId {
  return value as WorkspaceId;
}

function createDemoSession(): {
  readonly session: BellowsSession;
  readonly hostParticipantId: ParticipantId;
} {
  const sessionId = asSessionId("bellows-operator-session");
  const workspaceId = asWorkspaceId("forge-workspace-bellows");
  const hostUserId = asUserId("bellows-host-user");
  const hostParticipantId = asParticipantId("bellows-host-participant");
  const coHostParticipantId = asParticipantId("bellows-cohost-participant");

  return {
    hostParticipantId,
    session: {
      sessionId,
      workspaceId,
      hostUserId,
      authorityState: {
        actingAuthorityState: "host_present",
        hostParticipantId,
        actingHostParticipantId: hostParticipantId,
        coHostParticipantIds: [coHostParticipantId],
      },
      draft: {
        sessionId,
        workspaceId,
        hostUserId,
        mode: "live",
        sessionType: "remote",
        title: "Bellows Phase Six Operator Session",
        participantSlots: [
          { roleCode: "S1", participantId: hostParticipantId },
          { roleCode: "S2", participantId: coHostParticipantId },
        ],
        scriptReference: null,
        broadcastIntent: "single_platform",
        broadcastTargets: [
          {
            broadcastTargetId: "bellows-target-youtube" as never,
            platform: "youtube",
            enabled: true,
            credentialRef: null,
            displayLabel: "YouTube",
          },
        ],
        scheduledTimeUtc: null,
      },
      participants: {
        [hostParticipantId]: {
          participantId: hostParticipantId,
          userId: hostUserId,
          displayName: "Host",
          roleCode: "S1",
          authorityTier: "host",
          presenceState: "ready",
          joinState: "approved",
          joinedAtOffsetMs: 0 as never,
          leftAtOffsetMs: null,
        },
        [coHostParticipantId]: {
          participantId: coHostParticipantId,
          userId: asUserId("bellows-cohost-user"),
          displayName: "Co-host",
          roleCode: "S2",
          authorityTier: "co_host",
          presenceState: "ready",
          joinState: "approved",
          joinedAtOffsetMs: 0 as never,
          leftAtOffsetMs: null,
        },
      } as BellowsSession["participants"],
      tracks: {},
      segments: {},
      machineState: {
        lifecycle: "idle",
        broadcast: "not_broadcasting",
        outcome: null,
      },
      recordingState: "idle",
      broadcastState: "not_broadcasting",
      uploadState: "not_started",
      sealState: "not_started",
      timeline: {
        t0OffsetMs: null,
        startTimeUtc: null,
        endTimeUtc: null,
        trackIds: [],
        segmentIds: [],
        syncMarkers: [],
      },
      integrityFlags: [],
      events: [],
    },
  };
}

function createDemoHarness(): BellowsOperatorConsoleHarness {
  const { session, hostParticipantId } = createDemoSession();
  let eventCounter = 0;

  return createBellowsOperatorConsoleHarness({
    initialState: session,
    engineContext: {
      nextEventId: () => `bellows-ui-evt-${++eventCounter}` as SessionEventId,
    },
    hostParticipantId,
  });
}

function canArchive(lifecycle: BellowsLifecycleState): boolean {
  return lifecycle === "sealed"
    || lifecycle === "incomplete_capture"
    || lifecycle === "failed_capture";
}

function canEndSession(lifecycle: BellowsLifecycleState): boolean {
  return lifecycle === "recording_active"
    || lifecycle === "recording_degraded"
    || lifecycle === "recording_offline_local"
    || lifecycle === "recording_rejoining";
}

function formatDispatchSummary(snapshot: BellowsOperatorConsoleSnapshot): string {
  const last = snapshot.dispatchLog.at(-1);

  if (!last) {
    return "No actions dispatched yet.";
  }

  if (last.transitionKind === "rejected") {
    return `${last.actionType} rejected: ${last.rejection?.message ?? "Unknown rejection."}`;
  }

  return `${last.actionType} accepted. Bellows settled in ${last.lifecycleAfter}.`;
}

export default function BellowsStandalone() {
  const [runtimeKey, setRuntimeKey] = useState(0);
  const harness = useMemo(() => createDemoHarness(), [runtimeKey]);
  const [snapshot, setSnapshot] = useState(() => harness.getSnapshot());
  const [draftTitle, setDraftTitle] = useState(() => harness.getState().draft.title);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState(() => formatDispatchSummary(harness.getSnapshot()));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const nextSnapshot = harness.getSnapshot();
    setSnapshot(nextSnapshot);
    setDraftTitle(nextSnapshot.session.draft.title);
    setStatusMessage(formatDispatchSummary(nextSnapshot));
    setErrorMessage(null);
    setBusyAction(null);
  }, [harness]);

  async function runAction(actionKey: string, runner: ActionRunner) {
    setBusyAction(actionKey);
    setErrorMessage(null);

    try {
      await runner();
      const nextSnapshot = harness.getSnapshot();
      setSnapshot(nextSnapshot);
      setStatusMessage(formatDispatchSummary(nextSnapshot));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Bellows action failed.");
    } finally {
      setBusyAction(null);
    }
  }

  const session = snapshot.session;
  const lifecycle = session.machineState.lifecycle;
  const terminal = canArchive(lifecycle);
  const manualSnapshot = useMemo(
    () => JSON.stringify(
      {
        lifecycle: session.machineState.lifecycle,
        recordingState: session.recordingState,
        broadcastState: session.broadcastState,
        uploadState: session.uploadState,
        sealState: session.sealState,
        outcome: session.machineState.outcome,
        integrityFlags: session.integrityFlags,
        eventCount: session.events.length,
      },
      null,
      2,
    ),
    [session],
  );

  return (
    <div className="bellows-standalone">
      <header className="bellows-standalone__header">
        <div>
          <div className="bellows-standalone__eyebrow">Forge Tool Surface</div>
          <h1 className="bellows-standalone__title">Bellows</h1>
          <p className="bellows-standalone__subtitle">
            Thin operator console over the real Bellows shell and persistence harnesses.
          </p>
        </div>

        <div className="bellows-standalone__header-actions">
          <span className="bellows-standalone__pill">
            Lifecycle: <strong>{lifecycle}</strong>
          </span>
          <span className="bellows-standalone__pill">
            Events: <strong>{session.events.length}</strong>
          </span>
          <Link to="/app" className="bellows-standalone__back-link">
            Back to Forge
          </Link>
        </div>
      </header>

      <main className="bellows-standalone__main">
        <section className="bellows-standalone__panel bellows-standalone__panel--wide">
          <div className="bellows-standalone__panel-header">
            <div>
              <h2>Runtime Status</h2>
              <p>Bellows is running real engine transitions and adapter effects under this console.</p>
            </div>
            <button type="button" onClick={() => setRuntimeKey((value) => value + 1)}>
              Reset demo
            </button>
          </div>

          <div className="bellows-standalone__status-banner" data-state={errorMessage ? "error" : "ok"}>
            {errorMessage ?? statusMessage}
          </div>

          <div className="bellows-standalone__state-grid">
            <article className="bellows-standalone__state-card">
              <span>Recording</span>
              <strong>{session.recordingState}</strong>
            </article>
            <article className="bellows-standalone__state-card">
              <span>Broadcast</span>
              <strong>{session.broadcastState}</strong>
            </article>
            <article className="bellows-standalone__state-card">
              <span>Upload</span>
              <strong>{session.uploadState}</strong>
            </article>
            <article className="bellows-standalone__state-card">
              <span>Seal</span>
              <strong>{session.sealState}</strong>
            </article>
            <article className="bellows-standalone__state-card">
              <span>Outcome</span>
              <strong>{session.machineState.outcome ?? "in_progress"}</strong>
            </article>
            <article className="bellows-standalone__state-card">
              <span>Integrity</span>
              <strong>{session.integrityFlags.length > 0 ? session.integrityFlags.join(", ") : "clean"}</strong>
            </article>
          </div>
        </section>

        <section className="bellows-standalone__panel">
          <div className="bellows-standalone__panel-header">
            <div>
              <h2>Host Controls</h2>
              <p>Only the smallest operator surface needed to exercise Bellows end to end.</p>
            </div>
          </div>

          <label className="bellows-standalone__label" htmlFor="bellows-draft-title">
            Draft title
          </label>
          <div className="bellows-standalone__draft-row">
            <input
              id="bellows-draft-title"
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              placeholder="Bellows session title"
            />
            <button
              type="button"
              disabled={busyAction !== null || lifecycle !== "configuring"}
              onClick={() => void runAction("update-draft", () => harness.host.updateDraft({
                ...session.draft,
                title: draftTitle.trim() || session.draft.title,
              }))}
            >
              Apply Draft
            </button>
          </div>

          <div className="bellows-standalone__control-grid">
            <button
              type="button"
              disabled={busyAction !== null || lifecycle !== "idle"}
              onClick={() => void runAction("begin-setup", () => harness.host.beginSetup())}
            >
              Begin Setup
            </button>
            <button
              type="button"
              disabled={busyAction !== null || lifecycle !== "configuring"}
              onClick={() => void runAction("wait-for-participants", () => harness.host.waitForParticipants())}
            >
              Wait for Participants
            </button>
            <button
              type="button"
              disabled={busyAction !== null || (lifecycle !== "waiting_for_participants" && lifecycle !== "preflight_ready")}
              onClick={() => void runAction("run-preflight", () => harness.host.runPreflight())}
            >
              Run Preflight
            </button>
            <button
              type="button"
              disabled={busyAction !== null || lifecycle !== "ready_to_start"}
              onClick={() => void runAction("start-show", () => harness.host.startShow())}
            >
              Start Show
            </button>
            <button
              type="button"
              disabled={busyAction !== null || lifecycle !== "countdown"}
              onClick={() => void runAction("abort-start", () => harness.host.abortStart())}
            >
              Abort Countdown
            </button>
            <button
              type="button"
              disabled={busyAction !== null || lifecycle !== "sync_initializing"}
              onClick={() => void runAction("confirm-capture", () => harness.system.confirmCaptureReady())}
            >
              Confirm Capture Ready
            </button>
            <button
              type="button"
              disabled={busyAction !== null || lifecycle !== "sync_initializing"}
              onClick={() => void runAction("confirm-capture-degraded", () => harness.system.confirmCaptureStartedDegraded())}
            >
              Confirm Capture Degraded
            </button>
            <button
              type="button"
              disabled={busyAction !== null || !canEndSession(lifecycle)}
              onClick={() => void runAction("end-session", () => harness.host.endSession())}
            >
              End Session
            </button>
            <button
              type="button"
              disabled={busyAction !== null || lifecycle !== "finalizing_local"}
              onClick={() => void runAction("finalize-local-segments", () => harness.system.finalizeLocalSegments())}
            >
              Finalize Local Segments
            </button>
            <button
              type="button"
              disabled={busyAction !== null || lifecycle !== "upload_complete_pending_verification"}
              onClick={() => void runAction("begin-integrity-verification", () => harness.system.beginIntegrityVerification())}
            >
              Begin Integrity Verification
            </button>
            <button
              type="button"
              disabled={busyAction !== null || !terminal}
              onClick={() => void runAction("archive-session", () => harness.system.archiveSession())}
            >
              Archive Session
            </button>
          </div>
        </section>

        <section className="bellows-standalone__panel">
          <div className="bellows-standalone__panel-header">
            <div>
              <h2>Studio Shell Observations</h2>
              <p>Concrete preflight and countdown adapter activity.</p>
            </div>
          </div>
          <ul className="bellows-standalone__log">
            {snapshot.studioShellObservations.length === 0 ? (
              <li className="bellows-standalone__log-empty">No shell effects dispatched yet.</li>
            ) : snapshot.studioShellObservations.map((observation, index) => (
              <li key={`${observation.effectType}-${index}`} className="bellows-standalone__log-item">
                <strong>{observation.effectType}</strong>
                <span>{observation.triggerActionType}</span>
                <span>{observation.lifecycleAtDispatch}</span>
                <code>{observation.followUpActionType ?? "manual"}</code>
              </li>
            ))}
          </ul>
        </section>

        <section className="bellows-standalone__panel">
          <div className="bellows-standalone__panel-header">
            <div>
              <h2>Persistence Observations</h2>
              <p>Durable seam-test memory of upload, verification, manifest, and sealing effects.</p>
            </div>
          </div>
          <ul className="bellows-standalone__log">
            {snapshot.persistenceObservations.length === 0 ? (
              <li className="bellows-standalone__log-empty">No persistence effects dispatched yet.</li>
            ) : snapshot.persistenceObservations.map((observation, index) => (
              <li key={`${observation.effectType}-${index}`} className="bellows-standalone__log-item">
                <strong>{observation.effectType}</strong>
                <span>{observation.triggerActionType}</span>
                <span>{observation.lifecycleAtDispatch}</span>
                <code>{observation.followUpActionType ?? "manual"}</code>
              </li>
            ))}
          </ul>
        </section>

        <section className="bellows-standalone__panel bellows-standalone__panel--wide">
          <div className="bellows-standalone__panel-header">
            <div>
              <h2>Dispatch Log</h2>
              <p>Every operator or system action resolved through the Bellows runtime.</p>
            </div>
          </div>
          <ul className="bellows-standalone__log bellows-standalone__log--dispatch">
            {snapshot.dispatchLog.length === 0 ? (
              <li className="bellows-standalone__log-empty">No actions dispatched yet.</li>
            ) : snapshot.dispatchLog.map((record, index) => (
              <li key={`${record.actionType}-${index}`} className="bellows-standalone__log-item">
                <strong>{record.actionType}</strong>
                <span>{record.actionSource}</span>
                <span>{record.lifecycleBefore} → {record.lifecycleAfter}</span>
                <span>{record.transitionKind}</span>
                <code>
                  {record.effectDispatches.length > 0
                    ? record.effectDispatches.map((dispatch) => `${dispatch.adapter}:${dispatch.effectType}`).join(", ")
                    : record.rejection?.code ?? "no_effects"}
                </code>
              </li>
            ))}
          </ul>
        </section>

        <section className="bellows-standalone__panel bellows-standalone__panel--wide">
          <div className="bellows-standalone__panel-header">
            <div>
              <h2>Snapshots</h2>
              <p>Bellows’ current session state plus the persistence adapter’s observed snapshots.</p>
            </div>
          </div>

          <div className="bellows-standalone__snapshot-grid">
            <div>
              <h3>Current session</h3>
              <pre>{manualSnapshot}</pre>
            </div>
            <div>
              <h3>Persistence snapshots</h3>
              <ul className="bellows-standalone__snapshot-list">
                {snapshot.persistenceSnapshots.length === 0 ? (
                  <li>No snapshots recorded yet.</li>
                ) : snapshot.persistenceSnapshots.map((entry, index) => (
                  <li key={`${entry.lifecycle}-${index}`}>
                    <strong>{entry.lifecycle}</strong>
                    <span>{entry.uploadState}</span>
                    <span>{entry.sealState}</span>
                    <span>events: {entry.eventCount}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
