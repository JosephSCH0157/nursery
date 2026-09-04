import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import type { HammerPersistedAudioPolish, HammerPersistedEditorSession, HammerPersistedStructuredTranscript, HammerPersistedVisualPlacements } from "../persistence/hammerPersistenceContract";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import type { HammerStudioRackState } from "./hammerStudioRack";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerShortCandidateV1, HammerShortsDurationPreset, HammerShortsGoal } from "../../../../packages/contracts/hammer/shorts.contract";
import { HAMMER_SHORTS_DURATION_RANGES } from "../../../../packages/contracts/hammer/shorts.contract";
import { tongsFetch } from "../lib/tongsFetch";
import { fingerprintHammerShortsValue, type HammerShortsOutputSegment } from "./hammerShortsResolver";
import { projectHammerShortArtifacts, type HammerShortTimingInterval } from "./hammerShortsProjection";

type JsonRow = Record<string, unknown>;
export interface HammerShortsToolBayAuthority {
  workspaceId: string; workpieceId: string; parentLabel: string; canonicalRecordingId: string; recordingRevisionId: string;
  historyEpochId: string; historyHeadId: string; historySequence: number; editorStateHash: string;
  transcriptFingerprint: string; timelineFingerprint: string; renderAssemblyFingerprint: string;
  outputSegments: HammerShortsOutputSegment[]; timingMap: HammerShortTimingInterval[];
  structuredTranscript: HammerPersistedStructuredTranscript; transcriptSegments: HammerTranscriptSegment[];
  editorSession: HammerPersistedEditorSession; visualTimeline: HammerVisualTimelineState | null;
  visualPlacements: HammerPersistedVisualPlacements | null; audioPolish: HammerPersistedAudioPolish | null; studioRack: HammerStudioRackState;
}

async function request(path: string, options?: { method?: string; json?: unknown }): Promise<unknown> {
  const response = await tongsFetch(path, { method: options?.method ?? "GET", ...(typeof options?.json === "undefined" ? {} : { json: options.json }), timeoutMs: 120_000 });
  const payload = await response.json().catch(() => null) as JsonRow | null;
  if (!response.ok || payload?.ok !== true) throw new Error(String((payload?.error as JsonRow | undefined)?.message ?? (payload?.error as JsonRow | undefined)?.code ?? `Request failed (${response.status}).`));
  return payload.data;
}

function candidatesFrom(value: unknown): HammerShortCandidateV1[] {
  const row = value && typeof value === "object" ? value as JsonRow : null;
  return Array.isArray(row?.candidates) ? row.candidates as unknown as HammerShortCandidateV1[] : [];
}

export default function HammerShortsToolBay(props: { authority: HammerShortsToolBayAuthority | null; onPreview(startSec: number, endSec: number): void }): JSX.Element {
  const [basis, setBasis] = useState<JsonRow | null>(null);
  const [goal, setGoal] = useState<HammerShortsGoal>("drive_to_full_episode");
  const [durationPreset, setDurationPreset] = useState<HammerShortsDurationPreset>("about_60s");
  const [candidates, setCandidates] = useState<HammerShortCandidateV1[]>([]);
  const [discoveries, setDiscoveries] = useState<JsonRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [children, setChildren] = useState<Record<string, JsonRow>>({});
  const duration = durationPreset === "custom" ? { minimum: 20, maximum: 105 } : HAMMER_SHORTS_DURATION_RANGES[durationPreset];
  const ready = props.authority;
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const basisKey = `${ready?.recordingRevisionId ?? ""}:${ready?.historyHeadId ?? ""}:${ready?.editorStateHash ?? ""}`;
  useEffect(() => { setBasis(null); setCandidates([]); setChildren({}); setMessage(null); }, [basisKey]);
  useEffect(() => {
    const current = readyRef.current;
    if (!current) return;
    let active = true;
    void (async () => {
      try {
        const basisRows = await request(`/tongs/hammer/shorts/basis?parent_workpiece_id=${encodeURIComponent(current.workpieceId)}`) as JsonRow[];
        const matchingBasis = basisRows.find((row) => row.history_head_id === current.historyHeadId) ?? null;
        if (!active) return;
        setBasis(matchingBasis);
        const history = await request(`/tongs/hammer/shorts/discoveries?parent_workpiece_id=${encodeURIComponent(current.workpieceId)}`) as JsonRow[];
        if (!active) return;
        setDiscoveries(history);
        const latestCompleted = history.find((row) => row.state === "completed" && (!matchingBasis || row.basis_lock_id === matchingBasis.id));
        if (latestCompleted?.id) {
          const rows = await request(`/tongs/hammer/shorts/candidates?discovery_id=${encodeURIComponent(String(latestCompleted.id))}`) as HammerShortCandidateV1[];
          if (active) setCandidates(rows);
        }
        if (!matchingBasis && basisRows.length > 0 && active) setMessage("The parent edit changed after the prior discovery. Lock the current saved edit and discover again.");
      } catch (error) { if (active) setMessage(error instanceof Error ? error.message : String(error)); }
    })();
    return () => { active = false; };
  }, [basisKey]);
  const visibleCandidates = useMemo(() => candidates.filter((candidate) => !(candidate as unknown as JsonRow).rejected_at), [candidates]);

  async function lockBasis(): Promise<JsonRow> {
    if (!ready) throw new Error("Save the current edit before locking a Shorts basis.");
    setBusy("lock"); setMessage(null);
    try {
      const outputTimeMapFingerprint = await fingerprintHammerShortsValue(ready.timingMap);
      const unsigned = {
        schema_version: "HammerShortsBasisLockV1", workspace_id: ready.workspaceId, parent_workpiece_id: ready.workpieceId,
        canonical_recording_id: ready.canonicalRecordingId, recording_revision_id: ready.recordingRevisionId,
        history_epoch_id: ready.historyEpochId, history_head_id: ready.historyHeadId, history_sequence: ready.historySequence,
        editor_state_hash: ready.editorStateHash, transcript_fingerprint: ready.transcriptFingerprint, timeline_fingerprint: ready.timelineFingerprint,
        render_assembly_fingerprint: ready.renderAssemblyFingerprint, output_time_map_fingerprint: outputTimeMapFingerprint,
      };
      const locked = { ...unsigned, basis_fingerprint: await fingerprintHammerShortsValue(unsigned) };
      const operationId = `hammer-shorts-basis:${ready.workpieceId}:${ready.historyHeadId}`;
      const data = await request("/tongs/hammer/shorts/basis/lock", { method: "POST", json: { basis: locked, operation_id: operationId, operation_fingerprint: await fingerprintHammerShortsValue({ operationId, locked }) } }) as JsonRow;
      setBasis(data); setMessage("Saved edit locked as an immutable Shorts basis."); return data;
    } finally { setBusy(null); }
  }

  async function discover(): Promise<void> {
    if (!ready) return;
    setBusy("discover"); setMessage(null);
    try {
      const locked = basis ?? await lockBasis();
      const data = await request("/api/hammer/shorts/discover", { method: "POST", json: {
        workspace_id: ready.workspaceId, parent_workpiece_id: ready.workpieceId, basis_lock_id: locked.id,
        basis_fingerprint: locked.basis_fingerprint, goal, duration_preset: durationPreset,
        minimum_duration_sec: duration.minimum, maximum_duration_sec: duration.maximum, target_candidate_count: 4,
        output_segments: ready.outputSegments, operation_id: `hammer-shorts-discovery:${crypto.randomUUID()}`,
      } }) as JsonRow;
      const next = candidatesFrom(data);
      setCandidates(next);
      const discovery = data.discovery;
      if (discovery && typeof discovery === "object") setDiscoveries((current) => [discovery as JsonRow, ...current.filter((item) => item.id !== (discovery as JsonRow).id)]);
      setMessage(next.length === 0 ? "No strong candidates were found. Try another goal or duration." : next.length < 3 ? `Only ${next.length} strong candidate${next.length === 1 ? " was" : "s were"} found for these settings.` : `${next.length} strong candidates found.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(null); }
  }

  async function reject(candidate: HammerShortCandidateV1): Promise<void> {
    setBusy(candidate.candidate_id);
    try {
      await request("/tongs/hammer/shorts/candidate/reject", { method: "POST", json: { candidate_id: candidate.candidate_id } });
      setCandidates((current) => current.filter((item) => item.candidate_id !== candidate.candidate_id));
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(null); }
  }

  async function createShort(candidate: HammerShortCandidateV1): Promise<void> {
    if (!ready || !basis) return;
    setBusy(candidate.candidate_id); setMessage("Preparing Short…");
    let derivativeId: string | null = null;
    try {
      const operationId = `hammer-short-derivative:${candidate.candidate_id}`;
      const reserved = await request("/tongs/hammer/shorts/derivative/reserve", { method: "POST", json: { candidate_id: candidate.candidate_id, display_label: `${ready.parentLabel} — Short ${candidate.rank}`, operation_id: operationId, operation_fingerprint: await fingerprintHammerShortsValue({ operationId, candidate_fingerprint: candidate.candidate_fingerprint }) } }) as JsonRow;
      derivativeId = String(reserved.id);
      const projected = projectHammerShortArtifacts({
        childWorkpieceId: String(reserved.child_workpiece_id), childRevisionId: String(reserved.child_recording_revision_id), basisLockId: String(basis.id), candidateId: candidate.candidate_id,
        projectedAt: new Date().toISOString(), envelope: { start_sec: candidate.envelope_output_start_sec, end_sec: candidate.envelope_output_end_sec }, core: { start_sec: candidate.core_output_start_sec, end_sec: candidate.core_output_end_sec },
        transcript: ready.transcriptSegments, structuredTranscript: ready.structuredTranscript, timingMap: ready.timingMap, editorSession: ready.editorSession,
        visualTimeline: ready.visualTimeline, visualPlacements: ready.visualPlacements, audioEdit: ready.audioPolish?.audio_edit ?? null, studioRack: ready.studioRack,
      });
      const finalized = await request("/tongs/hammer/shorts/derivative/artifacts", { method: "POST", json: { derivative_id: derivativeId, artifacts: {
        transcript: projected.transcript, timing_map: projected.timing_map, editor_session: projected.editor_session, visual_timeline: projected.visual_timeline ?? { version: 2, clips: [], lanes: [], assets: [] },
        visual_placements: projected.visual_placements ?? { schema_version: 1, status: "not_started", source_refs: [], uncertainty_flags: [], placements: [] }, audio_polish: projected.audio_polish, history: projected.history,
      } } }) as JsonRow;
      setChildren((current) => ({ ...current, [candidate.candidate_id]: finalized })); setMessage("Short prepared and ready to edit independently.");
    } catch (error) {
      if (derivativeId) await request("/tongs/hammer/shorts/derivative/fail", { method: "POST", json: { derivative_id: derivativeId, failure_code: "projection_or_artifact_write_failed" } }).catch(() => undefined);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally { setBusy(null); }
  }

  return <section className="hammer-tool-card hammer-shorts-tool" data-hammer-tool-bay-surface="shorts">
    <header className="hammer-tool-card__head">Shorts</header>
    <div className="hammer-tool-hint">Find strong moments from this saved 16:9 edit. Each selected moment becomes an independent Hammer workpiece.</div>
    {!ready ? <div className="hammer-tool-hint">Save the current edit and wait for canonical history persistence before creating a Shorts basis.</div> : <>
      <button type="button" disabled={Boolean(busy) || Boolean(basis)} onClick={() => void lockBasis()}>{basis ? "Saved edit locked" : busy === "lock" ? "Locking…" : "Use this saved edit as the Shorts basis"}</button>
      <label>Goal<select value={goal} onChange={(event) => setGoal(event.target.value as HammerShortsGoal)}><option value="drive_to_full_episode">Drive to full episode</option><option value="standalone">Standalone</option></select></label>
      <label>Duration<select value={durationPreset} onChange={(event) => setDurationPreset(event.target.value as HammerShortsDurationPreset)}><option value="about_30s">20–40 seconds</option><option value="about_60s">45–75 seconds</option><option value="about_90s">75–105 seconds</option></select></label>
      <button type="button" disabled={Boolean(busy)} onClick={() => void discover()}>{busy === "discover" ? "Finding moments…" : "Find Short Moments"}</button>
    </>}
    {message ? <div className="hammer-tool-hint" role="status">{message}</div> : null}
    {discoveries.length > 0 ? <details><summary>Discovery history ({discoveries.length})</summary>{discoveries.map((discovery) => <div className="hammer-tool-hint" key={String(discovery.id)}>{String(discovery.outcome ?? discovery.state)} · {new Date(String(discovery.completed_at ?? discovery.created_at)).toLocaleString()}</div>)}</details> : null}
    <div className="hammer-source-list">{visibleCandidates.map((candidate) => {
      const child = children[candidate.candidate_id];
      const childId = typeof child?.child_workpiece_id === "string" ? child.child_workpiece_id : null;
      return <article key={candidate.candidate_id} className="hammer-source-card" data-short-candidate-id={candidate.candidate_id}>
        <header className="hammer-source-card__head"><strong>Moment {candidate.rank}</strong><span>{Math.round(candidate.duration_sec)}s</span></header>
        <p>{candidate.transcript_excerpt}</p><div className="hammer-tool-hint">{candidate.rationale}</div><div className="hammer-tool-hint">{candidate.goal_fit}</div>
        <div><button type="button" onClick={() => props.onPreview(candidate.core_output_start_sec, candidate.core_output_end_sec)}>Preview</button><button type="button" disabled={Boolean(busy) || Boolean(childId)} onClick={() => void reject(candidate)}>Reject</button><button type="button" disabled={Boolean(busy) || !basis || Boolean(childId)} onClick={() => void createShort(candidate)}>{busy === candidate.candidate_id ? "Preparing…" : childId ? "Created" : "Create Short"}</button></div>
        {childId ? <a href={`/app/hammer/editor?workspace_id=${encodeURIComponent(ready?.workspaceId ?? "")}&workpiece_id=${encodeURIComponent(childId)}`}>Open Short in Hammer</a> : null}
      </article>;
    })}</div>
  </section>;
}
