import { useRef, useState, type JSX } from "react";
import { cloneEditorState, type HammerEditorStateSerializable } from "./hammerWorkspaceHistory";
import { buildHammerHistoryEpochRequest, loadHammerHistoryComponentAuthority, type HammerHistoryComponentPaths, type HammerHistoryEpochTransportRequest, type HammerHistoryRegistryTuple, type HammerHistoryTransitionResult } from "../lib/hammerHistoryEpochApi";
import { resolveTongsAuthenticatedUserId } from "../lib/tongsFetch";

export type HammerHistoryEpochStartCandidate = Readonly<{
  workspaceId: string; workpieceId: string; canonicalRecordingId: string; revisionId: string;
  revisionUpdatedAt: string; historyPath: string; registry: HammerHistoryRegistryTuple;
  canonicalBaseHash: string; canonicalState: HammerEditorStateSerializable; componentPaths: HammerHistoryComponentPaths;
}>;
type FrozenStart = Readonly<{ candidateKey: string; request: HammerHistoryEpochTransportRequest; canonicalState: HammerEditorStateSerializable }>;
export const historyEpochStartCandidateKey = (value: HammerHistoryEpochStartCandidate): string => JSON.stringify({ workspaceId: value.workspaceId, workpieceId: value.workpieceId, canonicalRecordingId: value.canonicalRecordingId, revisionId: value.revisionId, revisionUpdatedAt: value.revisionUpdatedAt, historyPath: value.historyPath, registry: value.registry, canonicalBaseHash: value.canonicalBaseHash, componentPaths: value.componentPaths });
export const isHammerHistoryEpochStartEligible = (args: { candidate: HammerHistoryEpochStartCandidate | null; workspaceRole: string | null; commandAvailable: boolean }): boolean => Boolean(args.candidate && args.commandAvailable && ["owner", "editor"].includes(args.workspaceRole?.toLowerCase() ?? ""));

export function HammerHistoryEpochStartWorkflow(props: {
  candidate: HammerHistoryEpochStartCandidate | null; workspaceRole: string | null; commandAvailable: boolean;
  getCurrentCandidate: () => HammerHistoryEpochStartCandidate | null;
  start: (request: HammerHistoryEpochTransportRequest, frozenState: HammerEditorStateSerializable) => Promise<HammerHistoryTransitionResult>;
  onPendingChange: (pending: boolean) => void; onSuccess: () => void; onRequireFreshReadback: () => void;
}): JSX.Element | null {
  const [frozen, setFrozen] = useState<FrozenStart | null>(null); const [preparing, setPreparing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null); const inFlight = useRef(false);
  const eligible = isHammerHistoryEpochStartEligible(props);
  const open = async (): Promise<void> => {
    if (!eligible || !props.candidate || preparing || inFlight.current) return;
    setPreparing(true); setFailure(null);
    try {
      const candidate = props.candidate; const authority = await loadHammerHistoryComponentAuthority({ workpieceId: candidate.workpieceId, paths: candidate.componentPaths });
      const userId = await resolveTongsAuthenticatedUserId(); const epochId = crypto.randomUUID();
      const componentSha256 = Object.fromEntries(Object.entries(authority).map(([key, row]) => [key, row.sha256])) as import("../lib/hammerHistoryEpochApi").HammerHistoryComponentHashes;
      const envelope = { schema: "forge.hammer-history-epoch", schema_version: 1, epoch_id: epochId,
        workspace_id: candidate.workspaceId, workpiece_id: candidate.workpieceId, canonical_recording_id: candidate.canonicalRecordingId, recording_revision_id: candidate.revisionId,
        base: { editor_state_hash: candidate.canonicalBaseHash, component_sha256: componentSha256 },
        creation: { reason: "legacy_history_unrecoverable", created_at: new Date().toISOString(), initiating_user_id: userId },
        predecessor: { original_path: candidate.historyPath, archive_path: `hammer/revisions/${candidate.revisionId}/history/archive/${candidate.registry.sha256}.history.v1.json`, sha256: candidate.registry.sha256, bytes: candidate.registry.bytes, registry_revision: candidate.registry.revision, registry_updated_at: candidate.registry.updated_at },
        history: { entries: [], undo_stack: [], redo_stack: [], checkpoints: [] }, boundary: { prior_history_status: "unavailable", merged: false, traversable: false, statement: "Prior undo history is unavailable and was not merged into this epoch." } } as const;
      setFrozen({ candidateKey: historyEpochStartCandidateKey(candidate), canonicalState: cloneEditorState(candidate.canonicalState), request: buildHammerHistoryEpochRequest({ canonical_recording_id: candidate.canonicalRecordingId, idempotency_key: `hammer-epoch:${crypto.randomUUID()}`, expected_revision_updated_at: candidate.revisionUpdatedAt, expected_history_path: candidate.historyPath, expected_predecessor: { revision: candidate.registry.revision, updated_at: candidate.registry.updated_at, sha256: candidate.registry.sha256, bytes: candidate.registry.bytes }, envelope }) });
    } catch { setFailure("Canonical history inputs could not be revalidated. Reload and try again."); }
    finally { setPreparing(false); }
  };
  const execute = async (): Promise<void> => {
    if (!frozen || inFlight.current) return; const current = props.getCurrentCandidate();
    if (!current || historyEpochStartCandidateKey(current) !== frozen.candidateKey || !isHammerHistoryEpochStartEligible({ candidate: current, workspaceRole: props.workspaceRole, commandAvailable: props.commandAvailable })) { setFrozen(null); props.onRequireFreshReadback(); setFailure("Canonical content changed. Reload before starting a new history."); return; }
    inFlight.current = true; props.onPendingChange(true); setFailure(null);
    try { const result = await props.start(frozen.request, frozen.canonicalState); if (result.outcome === "conflict") { props.onRequireFreshReadback(); setFailure(`New history was not created (${result.code}). Reload canonical state before trying again.`); return; } setFrozen(null); props.onSuccess(); }
    catch { props.onRequireFreshReadback(); setFailure("New history could not be confirmed. Reload canonical state before trying again."); }
    finally { inFlight.current = false; props.onPendingChange(false); }
  };
  if (!eligible && !frozen && !failure) return null;
  return <aside className="hammer-history-epoch-workflow" aria-live="polite">
    {failure ? <p role="alert">{failure}</p> : null}
    {!frozen ? <button type="button" disabled={!eligible || preparing} onClick={() => { void open(); }}>{preparing ? "Checking history…" : "Start new history from current state"}</button> : <div role="dialog" aria-modal="true" aria-labelledby="hammer-history-epoch-title">
      <h2 id="hammer-history-epoch-title">Start new history from this exact state?</h2>
      <ul><li>Existing content will not be changed.</li><li>The old history artifact will be preserved immutably.</li><li>Earlier undo and redo history will remain unavailable.</li><li>The new history begins from the exact current canonical state.</li><li>Undo cannot cross the new epoch boundary.</li></ul>
      <button type="button" disabled={inFlight.current} onClick={() => { setFrozen(null); setFailure(null); }}>Cancel</button>
      <button type="button" disabled={inFlight.current} onClick={() => { void execute(); }}>Start new history</button>
    </div>}
  </aside>;
}
