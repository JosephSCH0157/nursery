import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useOutletContext } from "react-router-dom";
import type { HammerReleasePrepStatus } from "../../../hammer/src/lib/hammerReleasePrepPackage";
import type {
  HammerPersistenceSnapshot,
  HammerPersistenceTarget,
} from "../../../hammer/src/persistence/hammerPersistenceContract";
import type { AppShellContext } from "./AppShell";
import { parseForgeRouteContext } from "../lib/forge-route-context";
import {
  buildTongsHammerReleaseAssembly,
  loadTongsHammerReleaseAssembly,
  type TongsHammerReleaseAssembly,
  type TongsReleaseAssemblySummaryStatus,
} from "../lib/tongsReleaseAssembly";
import { executeTongsReleaseOperatorAction } from "../lib/tongsReleaseOperatorActions";
import type {
  TongsReleaseOperatorActionStep,
  TongsReleaseOperatorExecutionAttempt,
  TongsReleaseOperatorAttemptResult,
} from "../lib/tongsReleaseOperatorExecution";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";
import "./TongsReleasePrep.css";

function normalizeWorkpieceId(value: string): string {
  return value.trim();
}

function formatStatusLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function getSummaryToneClass(status: TongsReleaseAssemblySummaryStatus): string {
  switch (status) {
    case "ready":
      return "tongs-release-prep__banner tongs-release-prep__banner--ready";
    case "blocked":
      return "tongs-release-prep__banner tongs-release-prep__banner--blocked";
    default:
      return "tongs-release-prep__banner tongs-release-prep__banner--attention";
  }
}

function getCheckClassName(status: HammerReleasePrepStatus): string {
  return `tongs-release-prep__check tongs-release-prep__check--${status}`;
}

function sameTarget(
  left: HammerPersistenceTarget | null,
  right: HammerPersistenceTarget,
): boolean {
  if (!left) return false;
  return left.workspaceId === right.workspaceId
    && left.workpieceId === right.workpieceId;
}

function buildAttemptId(actionId: string, attemptedAt: string): string {
  return `rxt1_${attemptedAt.replace(/[^0-9]/g, "").slice(0, 17)}_${actionId.slice(-8)}`;
}

export default function TongsReleasePrep() {
  const shell = useOutletContext<AppShellContext>();
  const location = useLocation();
  const routeContext = useMemo(() => parseForgeRouteContext(location.search), [location.search]);
  const workspaceId = shell.workspaceId;
  const [workpieceIdInput, setWorkpieceIdInput] = useState<string>(routeContext.workpieceId ?? "");
  const [loadedTarget, setLoadedTarget] = useState<HammerPersistenceTarget | null>(null);
  const [loadedSnapshot, setLoadedSnapshot] = useState<HammerPersistenceSnapshot | null>(null);
  const [executionAttempts, setExecutionAttempts] = useState<TongsReleaseOperatorExecutionAttempt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionInFlightId, setActionInFlightId] = useState<string | null>(null);
  const [executionNotice, setExecutionNotice] = useState<{
    tone: "error" | "success" | "subtle";
    text: string;
  } | null>(null);
  const autoLoadKeyRef = useRef<string | null>(null);
  const assembly = useMemo<TongsHammerReleaseAssembly | null>(() => {
    if (!loadedTarget || !loadedSnapshot) return null;
    return buildTongsHammerReleaseAssembly(loadedTarget, loadedSnapshot, {
      operatorExecution: {
        attempts: executionAttempts,
      },
    });
  }, [loadedTarget, loadedSnapshot, executionAttempts]);

  useEffect(() => {
    if (routeContext.workpieceId) {
      setWorkpieceIdInput(routeContext.workpieceId);
    }
  }, [routeContext.workpieceId]);

  useEffect(() => {
    setLoadedTarget(null);
    setLoadedSnapshot(null);
    setExecutionAttempts([]);
    setError(null);
    setExecutionNotice(null);
    setActionInFlightId(null);
    autoLoadKeyRef.current = null;
  }, [workspaceId]);

  const loadAssembly = useCallback(async (requestedWorkpieceId?: string) => {
    if (!workspaceId) return;
    const normalizedWorkpieceId = normalizeWorkpieceId(requestedWorkpieceId ?? workpieceIdInput);
    if (!normalizedWorkpieceId) {
      setError("Provide a workpiece id to inspect Hammer release prep.");
      setLoadedTarget(null);
      setLoadedSnapshot(null);
      return;
    }

    setLoading(true);
    setError(null);
    setExecutionNotice(null);
    const result = await loadTongsHammerReleaseAssembly({
      workspaceId,
      workpieceId: normalizedWorkpieceId,
    });
    if (!result.ok) {
      setLoadedTarget(null);
      setLoadedSnapshot(null);
      setError(result.error);
      setLoading(false);
      return;
    }

    const nextTarget = {
      workspaceId,
      workpieceId: normalizedWorkpieceId,
    };
    if (!sameTarget(loadedTarget, nextTarget)) {
      setExecutionAttempts([]);
    }
    setLoadedTarget(nextTarget);
    setLoadedSnapshot(result.snapshot);
    setLoading(false);
  }, [workspaceId, workpieceIdInput, loadedTarget]);

  const appendExecutionAttempt = useCallback((args: {
    step: TongsReleaseOperatorActionStep;
    attemptedAt: string;
    result: TongsReleaseOperatorAttemptResult;
    detail: string;
  }) => {
    setExecutionAttempts((current) => [...current, {
      attempt_id: buildAttemptId(args.step.action_id, args.attemptedAt),
      action_id: args.step.action_id,
      step_code: args.step.step_code,
      attempted_at: args.attemptedAt,
      actor_id: shell.session?.user?.id ?? null,
      actor_label: shell.session?.user?.email ?? null,
      result: args.result,
      detail: args.detail,
    }]);
  }, [shell.session?.user?.email, shell.session?.user?.id]);

  const runRecoveryStep = useCallback(async (step: TongsReleaseOperatorActionStep) => {
    if (!loadedTarget || !loadedSnapshot) return;

    const attemptedAt = new Date().toISOString();
    if (step.execution_kind !== "operator_triggerable" || step.eligibility !== "eligible") {
      const detail = step.blocked_by[0]?.detail
        ?? "This recovery step is currently blocked and cannot execute.";
      appendExecutionAttempt({
        step,
        attemptedAt,
        result: "blocked",
        detail,
      });
      setExecutionNotice({
        tone: "error",
        text: detail,
      });
      return;
    }

    setActionInFlightId(step.action_id);
    setExecutionNotice({
      tone: "subtle",
      text: `Running ${step.human_label.toLowerCase()}...`,
    });

    try {
      const result = await executeTongsReleaseOperatorAction({
        target: loadedTarget,
        snapshot: loadedSnapshot,
        step,
      });
      appendExecutionAttempt({
        step,
        attemptedAt,
        result: result.result,
        detail: result.message,
      });
      if (result.snapshot) {
        setLoadedSnapshot(result.snapshot);
      }
      setExecutionNotice({
        tone: result.result === "succeeded" ? "success" : "error",
        text: result.message,
      });
    } catch (error) {
      const detail = error instanceof Error && error.message.trim()
        ? error.message
        : "Operator execution failed.";
      appendExecutionAttempt({
        step,
        attemptedAt,
        result: "failed",
        detail,
      });
      setExecutionNotice({
        tone: "error",
        text: detail,
      });
    } finally {
      setActionInFlightId(null);
    }
  }, [appendExecutionAttempt, loadedSnapshot, loadedTarget]);

  useEffect(() => {
    if (!workspaceId || !routeContext.workpieceId) return;
    const key = `${workspaceId}:${routeContext.workpieceId}`;
    if (autoLoadKeyRef.current === key) return;
    autoLoadKeyRef.current = key;
    void loadAssembly(routeContext.workpieceId);
  }, [workspaceId, routeContext.workpieceId, loadAssembly]);

  if (!workspaceId) {
    return <WorkspaceRequiredNotice toolName="Tongs Release Prep" />;
  }

  const releasePrep = assembly?.release_prep ?? null;
  const authority = assembly?.authority ?? null;
  const recovery = assembly?.recovery ?? null;
  const execution = assembly?.execution ?? null;
  const quenchPacketStub = assembly?.quench_packet_stub ?? null;
  const quenchPacketStubJson = quenchPacketStub ? JSON.stringify(quenchPacketStub, null, 2) : "";

  return (
    <section className="tongs-release-prep">
      <div className="tongs-release-prep__header">
        <div>
          <h2 className="tongs-release-prep__title">Tongs Release Prep</h2>
          <p className="tongs-release-prep__subtitle">
            Downstream reader for Hammer release prep plus the canonical Tongs handoff authority verdict. This consumes persisted Hammer state only.
          </p>
        </div>
      </div>

      <div className="tongs-release-prep__controls">
        <label className="tongs-release-prep__field">
          <span className="tongs-release-prep__field-label">Workpiece ID</span>
          <input
            value={workpieceIdInput}
            onChange={(event) => setWorkpieceIdInput(event.target.value)}
            placeholder="Paste a workpiece_id"
            className="tongs-release-prep__input"
          />
        </label>
        <button
          type="button"
          className="tongs-release-prep__button"
          onClick={() => {
            autoLoadKeyRef.current = workspaceId && workpieceIdInput.trim()
              ? `${workspaceId}:${workpieceIdInput.trim()}`
              : null;
            void loadAssembly();
          }}
          disabled={loading}
        >
          {loading ? "Loading..." : "Load Release Prep"}
        </button>
      </div>

      {error ? (
        <div className="tongs-release-prep__message tongs-release-prep__message--error">{error}</div>
      ) : null}
      {executionNotice ? (
        <div className={`tongs-release-prep__message tongs-release-prep__message--${executionNotice.tone}`}>
          {executionNotice.text}
        </div>
      ) : null}

      {!assembly && !error ? (
        <div className="tongs-release-prep__message tongs-release-prep__message--subtle">
          {routeContext.workpieceId
            ? "Release prep will auto-load from the current route workpiece."
            : "Load a Hammer workpiece to inspect the downstream release-prep handoff."}
        </div>
      ) : null}

      {assembly ? (
        <div className="tongs-release-prep__stack">
          <div className={getSummaryToneClass(assembly.summary.status)}>
            <div className="tongs-release-prep__banner-head">
              <strong>{formatStatusLabel(assembly.summary.status)}</strong>
              <div className="tongs-release-prep__banner-meta">
                <span>{assembly.summary.ready_count} ready</span>
                <span>{assembly.summary.attention_count} attention</span>
                <span>{releasePrep?.readiness.fully_prepared ? "fully prepared" : "not fully prepared"}</span>
              </div>
            </div>
            <div>{authority?.message ?? assembly.summary.message}</div>
          </div>

          <div className="tongs-release-prep__grid">
            <article className="tongs-release-prep__card">
              <h3 className="tongs-release-prep__card-title">Identity</h3>
              <div className="tongs-release-prep__fact-grid">
                <div>
                  <div className="tongs-release-prep__fact-label">workspace</div>
                  <div className="tongs-release-prep__mono">{assembly.target.workspace_id}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">workpiece</div>
                  <div className="tongs-release-prep__mono">{assembly.target.workpiece_id}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">prep status</div>
                  <div>{releasePrep?.identity.prep_status ?? "none"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">alignment</div>
                  <div>{releasePrep?.identity.alignment_status ?? "none"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">source mode</div>
                  <div>{releasePrep?.identity.source_mode ?? "none"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">preview mode</div>
                  <div>{releasePrep?.identity.preview_mode ?? "none"}</div>
                </div>
              </div>
            </article>

            <article className="tongs-release-prep__card">
              <h3 className="tongs-release-prep__card-title">Authority</h3>
              <div className="tongs-release-prep__fact-grid">
                <div>
                  <div className="tongs-release-prep__fact-label">authority status</div>
                  <div>{authority?.status ?? "none"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">handoff safe</div>
                  <div>{authority?.safe_for_downstream_handoff ? "true" : "false"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">preview allowed</div>
                  <div>{authority?.allow_preview ? "true" : "false"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">do not publish</div>
                  <div>{authority?.do_not_publish ? "true" : "false"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">snapshot id</div>
                  <div className="tongs-release-prep__mono">{authority?.snapshot_id ?? "none"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">integrity hash</div>
                  <div className="tongs-release-prep__mono">{authority?.integrity_hash ?? "none"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">compatible consumers</div>
                  <div>{authority?.compatible_consumers.join(", ") || "none"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">recovery status</div>
                  <div>{recovery?.recovery_status ?? "none"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">execution status</div>
                  <div>{execution?.execution_status ?? "none"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">blocking states</div>
                  <div>{assembly.summary.blocking_states.length > 0 ? assembly.summary.blocking_states.map(formatStatusLabel).join(", ") : "none"}</div>
                </div>
              </div>
            </article>
          </div>

          <article className="tongs-release-prep__card">
            <h3 className="tongs-release-prep__card-title">Release Checks</h3>
            <div className="tongs-release-prep__check-list">
              {assembly.summary.checks.map((check) => (
                <div key={check.id} className={getCheckClassName(check.status)}>
                  <div className="tongs-release-prep__check-head">
                    <strong>{check.label}</strong>
                    <span>{formatStatusLabel(check.status)}</span>
                  </div>
                  <div className="tongs-release-prep__check-detail">{check.detail}</div>
                </div>
              ))}
            </div>
          </article>

          <div className="tongs-release-prep__grid">
            <article className="tongs-release-prep__card">
              <h3 className="tongs-release-prep__card-title">Recovery</h3>
              <div className="tongs-release-prep__fact-grid">
                <div>
                  <div className="tongs-release-prep__fact-label">status</div>
                  <div>{recovery?.recovery_status ?? "none"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">preview during recovery</div>
                  <div>{recovery?.preview_allowed_during_recovery ? "true" : "false"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">requires upstream prep</div>
                  <div>{recovery?.requires_upstream_prep ? "true" : "false"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">can auto recover</div>
                  <div>{recovery?.can_auto_recover ? "true" : "false"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">plan steps</div>
                  <div>{recovery?.recovery_plan.length ?? 0}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">recovery blockers</div>
                  <div>{recovery?.recovery_blockers.length ?? 0}</div>
                </div>
              </div>
            </article>

            <article className="tongs-release-prep__card">
              <h3 className="tongs-release-prep__card-title">Execution Controls</h3>
              <div className="tongs-release-prep__fact-grid">
                <div>
                  <div className="tongs-release-prep__fact-label">status</div>
                  <div>{execution?.execution_status ?? "none"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">can execute recovery</div>
                  <div>{execution?.can_execute_recovery ? "true" : "false"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">actionable steps</div>
                  <div>{execution?.actionable_steps.length ?? 0}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">attempted steps</div>
                  <div>{execution?.attempted_steps.length ?? 0}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">last attempt at</div>
                  <div>{execution?.last_attempt_at ?? "none"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">last attempt result</div>
                  <div>{execution?.last_attempt_result ?? "none"}</div>
                </div>
              </div>
              {execution?.actionable_steps.length ? (
                <div className="tongs-release-prep__execution-list">
                  {execution.actionable_steps.map((step) => (
                    <div key={step.action_id} className="tongs-release-prep__execution-step">
                      <div className="tongs-release-prep__execution-head">
                        <div>
                          <strong>{step.human_label}</strong>
                          <div className="tongs-release-prep__check-detail">{step.reason}</div>
                        </div>
                        <div className="tongs-release-prep__execution-badges">
                          <span className={`tongs-release-prep__execution-badge tongs-release-prep__execution-badge--${step.execution_kind}`}>
                            {formatStatusLabel(step.execution_kind)}
                          </span>
                          <span className={`tongs-release-prep__execution-badge tongs-release-prep__execution-badge--${step.eligibility}`}>
                            {formatStatusLabel(step.eligibility)}
                          </span>
                        </div>
                      </div>
                      <div className="tongs-release-prep__fact-grid">
                        <div>
                          <div className="tongs-release-prep__fact-label">step code</div>
                          <div className="tongs-release-prep__mono">{step.step_code}</div>
                        </div>
                        <div>
                          <div className="tongs-release-prep__fact-label">action type</div>
                          <div>{formatStatusLabel(step.machine_action_type)}</div>
                        </div>
                        <div>
                          <div className="tongs-release-prep__fact-label">preview safe</div>
                          <div>{step.preview_safe ? "true" : "false"}</div>
                        </div>
                        <div>
                          <div className="tongs-release-prep__fact-label">requires upstream prep</div>
                          <div>{step.requires_upstream_prep ? "true" : "false"}</div>
                        </div>
                        <div>
                          <div className="tongs-release-prep__fact-label">depends on</div>
                          <div>{step.depends_on.length > 0 ? step.depends_on.join(", ") : "none"}</div>
                        </div>
                        <div>
                          <div className="tongs-release-prep__fact-label">issue codes</div>
                          <div>{step.issue_codes.length > 0 ? step.issue_codes.join(", ") : "none"}</div>
                        </div>
                      </div>
                      {step.prerequisites.length > 0 ? (
                        <div className="tongs-release-prep__execution-detail">
                          <div className="tongs-release-prep__fact-label">prerequisites</div>
                          <div className="tongs-release-prep__execution-meta">
                            {step.prerequisites.map((prerequisite) => (
                              <div key={`${step.action_id}:${prerequisite.kind}:${prerequisite.code}`}>
                                <strong>{prerequisite.satisfied ? "ready" : "blocked"}</strong>
                                {" · "}
                                {prerequisite.code}
                                {" · "}
                                {prerequisite.detail}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {step.blocked_by.length > 0 ? (
                        <div className="tongs-release-prep__execution-detail">
                          <div className="tongs-release-prep__fact-label">blocked by</div>
                          <div className="tongs-release-prep__execution-meta">
                            {step.blocked_by.map((blocker) => (
                              <div key={`${step.action_id}:${blocker.code}:${blocker.dependency_code ?? "none"}`}>
                                <strong>{blocker.code}</strong>
                                {" · "}
                                {blocker.detail}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className="tongs-release-prep__execution-actions">
                        <button
                          type="button"
                          className="tongs-release-prep__button"
                          onClick={() => {
                            void runRecoveryStep(step);
                          }}
                          disabled={
                            actionInFlightId != null
                            || step.execution_kind !== "operator_triggerable"
                            || step.eligibility !== "eligible"
                          }
                        >
                          {actionInFlightId === step.action_id ? "Running..." : "Run recovery step"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="tongs-release-prep__message tongs-release-prep__message--subtle">
                  No explicit operator actions are exposed for the current recovery plan.
                </div>
              )}
              {execution?.operator_actions_blocked_by.length ? (
                <div className="tongs-release-prep__execution-detail">
                  <div className="tongs-release-prep__fact-label">operator actions blocked by</div>
                  <div className="tongs-release-prep__execution-meta">
                    {execution.operator_actions_blocked_by.map((reason) => (
                      <div key={`${reason.code}:${reason.detail}`}>
                        <strong>{reason.code}</strong>
                        {" · "}
                        {reason.detail}
                        {" · "}
                        {reason.step_codes.join(", ")}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {execution?.attempted_steps.length ? (
                <div className="tongs-release-prep__execution-detail">
                  <div className="tongs-release-prep__fact-label">attempt history</div>
                  <div className="tongs-release-prep__execution-meta">
                    {execution.attempted_steps.map((attempt) => (
                      <div key={attempt.attempt_id}>
                        <strong>{attempt.result}</strong>
                        {" · "}
                        {attempt.step_code}
                        {" · "}
                        {attempt.attempted_at}
                        {" · "}
                        {attempt.actor_label ?? attempt.actor_id ?? "operator"}
                        {" · "}
                        {attempt.detail}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </article>

            <article className="tongs-release-prep__card">
              <h3 className="tongs-release-prep__card-title">Quench Packet Stub</h3>
              <div className="tongs-release-prep__fact-grid">
                <div>
                  <div className="tongs-release-prep__fact-label">packet kind</div>
                  <div className="tongs-release-prep__mono">{quenchPacketStub?.packet_kind ?? "none"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">overall status</div>
                  <div>{quenchPacketStub?.readiness.overall_status ?? "none"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">execution status</div>
                  <div>{quenchPacketStub?.execution.execution_status ?? "none"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">preview safe</div>
                  <div>{quenchPacketStub?.summary_flags.safe_for_quench_preview ? "true" : "false"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">assembled from</div>
                  <div className="tongs-release-prep__mono">{quenchPacketStub?.assembly.deterministic_source_updated_at ?? "none"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">transcript source</div>
                  <div>{quenchPacketStub?.transcript_output.source_kind ?? "missing"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">subtitle statuses</div>
                  <div>
                    SRT {quenchPacketStub?.subtitles.srt.status ?? "missing"}
                    {" · "}
                    VTT {quenchPacketStub?.subtitles.vtt.status ?? "missing"}
                  </div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">media prep</div>
                  <div>
                    visuals {quenchPacketStub?.visuals.status ?? "missing"}
                    {" · "}
                    audio {quenchPacketStub?.audio.status ?? "missing"}
                  </div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">summary flags</div>
                  <div>
                    blockers {quenchPacketStub?.summary_flags.has_blockers ? "yes" : "no"}
                    {" · "}
                    current subtitles {quenchPacketStub?.summary_flags.has_current_subtitles ? "yes" : "no"}
                  </div>
                </div>
              </div>
              {quenchPacketStub ? (
                <pre className="tongs-release-prep__json">{quenchPacketStubJson}</pre>
              ) : null}
            </article>

            <article className="tongs-release-prep__card">
              <h3 className="tongs-release-prep__card-title">Artifact Refs</h3>
              <div className="tongs-release-prep__fact-grid">
                <div>
                  <div className="tongs-release-prep__fact-label">structured transcript</div>
                  <div className="tongs-release-prep__mono">{releasePrep?.artifact_refs.structured_transcript_path ?? "none"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">visual placements</div>
                  <div className="tongs-release-prep__mono">{releasePrep?.artifact_refs.visual_placements_path ?? "none"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">audio polish</div>
                  <div className="tongs-release-prep__mono">{releasePrep?.artifact_refs.audio_polish_path ?? "none"}</div>
                </div>
              </div>
            </article>

            <article className="tongs-release-prep__card">
              <h3 className="tongs-release-prep__card-title">Downstream Snapshot</h3>
              <div className="tongs-release-prep__fact-grid">
                <div>
                  <div className="tongs-release-prep__fact-label">resolved output</div>
                  <div>
                    {releasePrep?.text_outputs?.resolved_output.segment_count ?? 0} segments
                    {" · "}
                    {releasePrep?.text_outputs?.resolved_output.caption_preview_row_count ?? 0} preview rows
                  </div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">visuals</div>
                  <div>
                    {releasePrep?.media_prep_outputs.visuals.placement_count ?? 0} placements
                    {" · "}
                    {releasePrep?.media_prep_outputs.visuals.uncertain_placement_count ?? 0} uncertain
                  </div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">subtitles</div>
                  <div>
                    SRT {releasePrep?.readiness.subtitles.srt ?? "missing"}
                    {" · "}
                    VTT {releasePrep?.readiness.subtitles.vtt ?? "missing"}
                  </div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">audio</div>
                  <div>
                    {releasePrep?.media_prep_outputs.audio.polish.status ?? "missing"}
                    {" · "}
                    {releasePrep?.media_prep_outputs.audio.preferred_playback.kind ?? "none"}
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      ) : null}
    </section>
  );
}
