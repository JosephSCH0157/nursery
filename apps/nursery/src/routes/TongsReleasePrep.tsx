import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useOutletContext } from "react-router-dom";
import type { HammerReleasePrepStatus } from "../../../hammer/src/lib/hammerReleasePrepPackage";
import type { AppShellContext } from "./AppShell";
import { parseForgeRouteContext } from "../lib/forge-route-context";
import {
  loadTongsHammerReleaseAssembly,
  type TongsHammerReleaseAssembly,
  type TongsReleaseAssemblySummaryStatus,
} from "../lib/tongsReleaseAssembly";
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

export default function TongsReleasePrep() {
  const shell = useOutletContext<AppShellContext>();
  const location = useLocation();
  const routeContext = useMemo(() => parseForgeRouteContext(location.search), [location.search]);
  const workspaceId = shell.workspaceId;
  const [workpieceIdInput, setWorkpieceIdInput] = useState<string>(routeContext.workpieceId ?? "");
  const [assembly, setAssembly] = useState<TongsHammerReleaseAssembly | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoLoadKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (routeContext.workpieceId) {
      setWorkpieceIdInput(routeContext.workpieceId);
    }
  }, [routeContext.workpieceId]);

  useEffect(() => {
    setAssembly(null);
    setError(null);
    autoLoadKeyRef.current = null;
  }, [workspaceId]);

  const loadAssembly = useCallback(async (requestedWorkpieceId?: string) => {
    if (!workspaceId) return;
    const normalizedWorkpieceId = normalizeWorkpieceId(requestedWorkpieceId ?? workpieceIdInput);
    if (!normalizedWorkpieceId) {
      setError("Provide a workpiece id to inspect Hammer release prep.");
      setAssembly(null);
      return;
    }

    setLoading(true);
    setError(null);
    const result = await loadTongsHammerReleaseAssembly({
      workspaceId,
      workpieceId: normalizedWorkpieceId,
    });
    if (!result.ok) {
      setAssembly(null);
      setError(result.error);
      setLoading(false);
      return;
    }

    setAssembly(result.assembly);
    setLoading(false);
  }, [workspaceId, workpieceIdInput]);

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
  const quenchPacketStub = assembly?.quench_packet_stub ?? null;
  const quenchPacketStubJson = quenchPacketStub ? JSON.stringify(quenchPacketStub, null, 2) : "";

  return (
    <section className="tongs-release-prep">
      <div className="tongs-release-prep__header">
        <div>
          <h2 className="tongs-release-prep__title">Tongs Release Prep</h2>
          <p className="tongs-release-prep__subtitle">
            Downstream reader for the canonical Hammer release-prep package. This consumes persisted Hammer state only.
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
            <div>{assembly.summary.message}</div>
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
                  <div className="tongs-release-prep__fact-label">output source</div>
                  <div>{releasePrep?.text_outputs?.output_selection.source_kind ?? "missing"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">output layer</div>
                  <div className="tongs-release-prep__mono">{releasePrep?.text_outputs?.output_selection.layer_id ?? "raw"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">output recipe</div>
                  <div>{releasePrep?.text_outputs?.output_selection.recipe_ref ?? "raw transcript"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">preferred playback</div>
                  <div>{releasePrep?.media_prep_outputs.audio.preferred_playback.reason ?? "none"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">audio plan</div>
                  <div>{releasePrep?.media_backbone.audio_polish_plan?.readiness ?? "none"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">blocking states</div>
                  <div>
                    {assembly.summary.blocking_states.length > 0
                      ? assembly.summary.blocking_states.map(formatStatusLabel).join(", ")
                      : "none"}
                  </div>
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
              <h3 className="tongs-release-prep__card-title">Quench Packet Stub</h3>
              <div className="tongs-release-prep__fact-grid">
                <div>
                  <div className="tongs-release-prep__fact-label">packet kind</div>
                  <div className="tongs-release-prep__mono">{quenchPacketStub?.packet_kind ?? "none"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">summary status</div>
                  <div>{quenchPacketStub?.readiness.summary_status ?? "none"}</div>
                </div>
                <div>
                  <div className="tongs-release-prep__fact-label">safe to publish</div>
                  <div>{quenchPacketStub?.readiness.safe_to_publish ? "true" : "false"}</div>
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
