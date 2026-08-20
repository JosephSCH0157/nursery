import { createHammerHistoryController, hashEditorState, type HammerEditorStateSerializable, type HammerHistoryController, type HammerHistoryDocumentV1 } from "./hammerWorkspaceHistory";
import { useMemo } from "react";
import {
  buildHammerHistoryEpochHeadRequest,
  commitHammerHistoryEpochHead,
  loadHammerRevisionHistoryHydration,
  startHammerHistoryEpoch,
  type HammerHistoryBoundary,
  type HammerHistoryComponentAuthority,
  type HammerHistoryComponentHashes,
  type HammerHistoryComponentPaths,
  type HammerHistoryEpochHeadTransportRequest,
  type HammerHistoryEpochTransportRequest,
  type HammerHistoryRegistryTuple,
  type HammerHistoryTransitionResult,
  type HammerRevisionHistoryHydration,
} from "../lib/hammerHistoryEpochApi";
import { loadHammerHistoryComponentAuthority } from "../lib/hammerHistoryEpochApi";
import { resolveTongsAuthenticatedUserId } from "../lib/tongsFetch";

const BOUNDARY: HammerHistoryBoundary = Object.freeze({
  prior_history_status: "unavailable", merged: false, traversable: false,
  statement: "Prior undo history is unavailable and was not merged into this epoch.",
});

export type HammerHistoryEpochDurableBasis = Readonly<{
  workspaceId: string; workpieceId: string; canonicalRecordingId: string; revisionId: string;
  epochId: string; epochAnchorPath: string; epochAnchorSha256: string;
  epochBaseHash: string; componentHashes: HammerHistoryComponentHashes;
  headId: string | null; historyPath: string; sequence: number;
  revisionUpdatedAt: string; registry: HammerHistoryRegistryTuple;
  componentAuthority: HammerHistoryComponentAuthority | null;
}>;

export type HammerHistoryEpochCommitDraft = Readonly<{
  document: HammerHistoryDocumentV1; state: HammerEditorStateSerializable;
  basis: HammerHistoryEpochDurableBasis; headId: string; idempotencyKey: string;
  createdAt: string; initiatingUserId: string; componentAuthority: HammerHistoryComponentAuthority;
}>;

export type HammerHistoryEpochPersistenceAdapters = Readonly<{
  createId: () => string; now: () => string; initiatingUserId: () => string | Promise<string>;
  resolveComponentAuthority: (state: HammerEditorStateSerializable, basis: HammerHistoryEpochDurableBasis) => Promise<HammerHistoryComponentAuthority>;
  commitHead?: typeof commitHammerHistoryEpochHead;
  loadHydration?: typeof loadHammerRevisionHistoryHydration;
  startEpoch?: typeof startHammerHistoryEpoch;
}>;

export type HammerHistoryEpochPersistenceState = Readonly<{
  basis: HammerHistoryEpochDurableBasis; pending: boolean; lastConflict: string | null;
}>;

export interface HammerHistoryEpochPersistenceAuthority {
  install(hydration: Extract<HammerRevisionHistoryHydration, { kind: "epoch_anchor" | "epoch_head" }>, identity: { workspaceId: string; workpieceId: string; canonicalRecordingId: string; revisionId: string }): void;
  clear(): void;
  getState(): HammerHistoryEpochPersistenceState | null;
  enqueue(document: HammerHistoryDocumentV1, state: HammerEditorStateSerializable): Promise<HammerHistoryTransitionResult>;
  startEpoch(request: HammerHistoryEpochTransportRequest): Promise<HammerHistoryTransitionResult>;
}

export function durableBasisFromHydration(
  hydration: Extract<HammerRevisionHistoryHydration, { kind: "epoch_anchor" | "epoch_head" }>,
  identity: { workspaceId: string; workpieceId: string; canonicalRecordingId: string; revisionId: string },
): HammerHistoryEpochDurableBasis {
  if (hydration.kind === "epoch_anchor") return Object.freeze({
    ...identity, epochId: hydration.epoch.epoch_id, epochAnchorPath: hydration.pointer,
    epochAnchorSha256: hydration.durable_basis.registry.sha256,
    epochBaseHash: hydration.epoch.base.editor_state_hash, componentHashes: hydration.epoch.base.component_sha256,
    headId: null, historyPath: hydration.pointer, sequence: 0,
    revisionUpdatedAt: hydration.durable_basis.revision_updated_at,
    registry: hydration.durable_basis.registry, componentAuthority: null,
  });
  return Object.freeze({
    ...identity, epochId: hydration.epoch_id, epochAnchorPath: hydration.epoch_anchor.path,
    epochAnchorSha256: hydration.epoch_anchor.sha256, epochBaseHash: hydration.document.baseRevisionId,
    componentHashes: hydration.base.component_sha256,
    headId: hydration.head_id, historyPath: hydration.pointer, sequence: hydration.sequence,
    revisionUpdatedAt: hydration.durable_basis.revision_updated_at,
    registry: hydration.durable_basis.registry, componentAuthority: hydration.result.component_authority,
  });
}

export function buildHammerHistoryEpochCommitDraft(args: HammerHistoryEpochCommitDraft): HammerHistoryEpochHeadTransportRequest {
  const envelope = {
    schema: "forge.hammer-history-epoch-head", schema_version: 1,
    workspace_id: args.basis.workspaceId, workpiece_id: args.basis.workpieceId,
    canonical_recording_id: args.basis.canonicalRecordingId, recording_revision_id: args.basis.revisionId,
    epoch_id: args.basis.epochId, head_id: args.headId, sequence: args.basis.sequence + 1,
    creation: { created_at: args.createdAt, initiating_user_id: args.initiatingUserId },
    epoch_anchor: { path: args.basis.epochAnchorPath, sha256: args.basis.epochAnchorSha256 },
    parent: { head_id: args.basis.headId, path: args.basis.historyPath, sha256: args.basis.registry.sha256, registry_revision: args.basis.registry.revision, registry_updated_at: args.basis.registry.updated_at },
    base: { editor_state_hash: args.basis.epochBaseHash, component_sha256: args.basis.componentHashes },
    result: { editor_state_hash: hashEditorState(args.state), component_authority: args.componentAuthority },
    history: args.document, boundary: BOUNDARY,
  } as const;
  return buildHammerHistoryEpochHeadRequest({
    canonical_recording_id: args.basis.canonicalRecordingId, idempotency_key: args.idempotencyKey,
    expected_revision_updated_at: args.basis.revisionUpdatedAt, expected_history_path: args.basis.historyPath,
    expected_parent: { head_id: args.basis.headId, sha256: args.basis.registry.sha256, revision: args.basis.registry.revision, updated_at: args.basis.registry.updated_at, sequence: args.basis.sequence },
    envelope,
  });
}

export function createHammerHistoryEpochPersistenceAuthority(adapters: HammerHistoryEpochPersistenceAdapters): HammerHistoryEpochPersistenceAuthority {
  let basis: HammerHistoryEpochDurableBasis | null = null;
  let generation = 0; let pendingCount = 0; let lastConflict: string | null = null;
  let tail: Promise<unknown> = Promise.resolve();
  const conflict = (code: string): HammerHistoryTransitionResult => ({ outcome: "conflict", code, terminal: true, retryable: false });
  return {
    install(hydration, identity) { generation += 1; basis = durableBasisFromHydration(hydration, identity); pendingCount = 0; lastConflict = null; tail = Promise.resolve(); },
    clear() { generation += 1; basis = null; pendingCount = 0; lastConflict = null; tail = Promise.resolve(); },
    getState: () => basis ? { basis, pending: pendingCount > 0, lastConflict } : null,
    enqueue(document, state) {
      const queuedGeneration = generation; pendingCount += 1;
      const operation = tail.then(async (): Promise<HammerHistoryTransitionResult> => {
        if (!basis || queuedGeneration !== generation) return conflict("history_epoch_head_stale_generation");
        const commitBasis = basis; const headId = adapters.createId(); const idempotencyKey = `hammer-head:${adapters.createId()}`;
        let authority: HammerHistoryComponentAuthority;
        try { authority = await adapters.resolveComponentAuthority(state, commitBasis); }
        catch { lastConflict = "history_epoch_head_component_authority_unavailable"; return conflict(lastConflict); }
        const initiatingUserId = await adapters.initiatingUserId();
        const request = buildHammerHistoryEpochCommitDraft({ document, state, basis: commitBasis, headId, idempotencyKey, createdAt: adapters.now(), initiatingUserId, componentAuthority: authority });
        const result = await (adapters.commitHead ?? commitHammerHistoryEpochHead)({ workspaceId: commitBasis.workspaceId, workpieceId: commitBasis.workpieceId, revisionId: commitBasis.revisionId, request });
        if (queuedGeneration !== generation) return conflict("history_epoch_head_stale_generation");
        if (result.outcome === "conflict") { lastConflict = result.code; return result; }
        const readback = await (adapters.loadHydration ?? loadHammerRevisionHistoryHydration)({
          workspaceId: commitBasis.workspaceId, workpieceId: commitBasis.workpieceId,
          canonicalRecordingId: commitBasis.canonicalRecordingId, revisionId: commitBasis.revisionId,
          historyPath: result.history_path, revisionUpdatedAt: result.revision_updated_at,
        });
        if (!readback.ok || readback.hydration.kind !== "epoch_head" || readback.hydration.head_id !== headId || readback.hydration.sequence !== commitBasis.sequence + 1) {
          lastConflict = "history_epoch_head_committed_readback_invalid"; return conflict(lastConflict);
        }
        basis = durableBasisFromHydration(readback.hydration, commitBasis);
        lastConflict = null; return result;
      });
      tail = operation.finally(() => { if (queuedGeneration === generation) pendingCount = Math.max(0, pendingCount - 1); });
      return operation;
    },
    async startEpoch(request) {
      return (adapters.startEpoch ?? startHammerHistoryEpoch)({ workspaceId: request.envelope.workspace_id,
        workpieceId: request.envelope.workpiece_id, revisionId: request.envelope.recording_revision_id, request });
    },
  };
}

export function isReservedHammerHistoryPath(path: string): boolean {
  return /\/history\/epochs\/[0-9a-f-]+(?:\.v1\.json|\/heads\/[0-9a-f-]+\.history\.v1\.json)$/i.test(path);
}

export async function startAndHydrateHammerHistoryEpoch(args: { persistence: HammerHistoryEpochPersistenceAuthority; request: HammerHistoryEpochTransportRequest; canonicalState: HammerEditorStateSerializable; maxUndoSteps: number; loadHydration?: typeof loadHammerRevisionHistoryHydration }): Promise<{ result: HammerHistoryTransitionResult; hydration?: Extract<HammerRevisionHistoryHydration, { kind: "epoch_anchor" }>; controller?: HammerHistoryController }> {
  const result = await args.persistence.startEpoch(args.request); if (result.outcome === "conflict") return { result };
  const envelope = args.request.envelope;
  const loaded = await (args.loadHydration ?? loadHammerRevisionHistoryHydration)({ workspaceId: envelope.workspace_id, workpieceId: envelope.workpiece_id,
    canonicalRecordingId: envelope.canonical_recording_id, revisionId: envelope.recording_revision_id,
    historyPath: result.history_path, revisionUpdatedAt: result.revision_updated_at });
  if (!loaded.ok || loaded.hydration.kind !== "epoch_anchor" || hashEditorState(args.canonicalState) !== loaded.hydration.epoch.base.editor_state_hash) return { result: { outcome: "conflict", code: "history_epoch_install_readback_invalid", terminal: true, retryable: false } };
  return { result, hydration: loaded.hydration, controller: createHammerHistoryController({ document: loaded.hydration.document, initialState: args.canonicalState, maxUndoSteps: args.maxUndoSteps }) };
}

export function useHammerHistoryEpochPersistenceAuthority(args: { workpieceId: string; paths?: HammerHistoryComponentPaths; override?: HammerHistoryEpochPersistenceAuthority }): HammerHistoryEpochPersistenceAuthority | undefined {
  const { audio, editorial_authority, transcript, visual_placements, visual_timeline } = args.paths ?? {};
  return useMemo(() => args.override ?? (audio && editorial_authority && transcript && visual_placements && visual_timeline ? createHammerHistoryEpochPersistenceAuthority({
    createId: () => crypto.randomUUID(), now: () => new Date().toISOString(), initiatingUserId: resolveTongsAuthenticatedUserId,
    resolveComponentAuthority: () => loadHammerHistoryComponentAuthority({ workpieceId: args.workpieceId, paths: { audio, editorial_authority, transcript, visual_placements, visual_timeline } }),
  }) : undefined), [args.override, audio, editorial_authority, transcript, visual_placements, visual_timeline, args.workpieceId]);
}
