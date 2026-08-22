import { HAMMER_EDITOR_STATE_HASH_ALGORITHM, HAMMER_EDITOR_STATE_LEGACY_HASH_ALGORITHM, createHammerHistoryController, hashEditorState, type HammerEditorStateHashAlgorithm, type HammerEditorStateSerializable, type HammerHistoryController, type HammerHistoryDocumentV1 } from "./hammerWorkspaceHistory";
import { useMemo, useRef } from "react";
import {
  loadHammerRevisionHistoryHydration,
  startHammerHistoryEpoch,
  type HammerHistoryBoundary,
  type HammerHistoryComponentAuthority,
  type HammerHistoryComponentHashes,
  type HammerHistoryComponentPaths,
  type HammerHistoryEpochTransportRequest,
  type HammerHistoryRegistryTuple,
  type HammerHistoryTransitionResult,
  type HammerRevisionHistoryHydration,
} from "../lib/hammerHistoryEpochApi";
import { resolveTongsAuthenticatedUserId } from "../lib/tongsFetch";
import { commitHammerHistoryAtomic, fingerprintHammerHistoryAtomicRequest, hammerHistoryAtomicInternals,
  loadHammerHistoryAtomicComponentBasis, projectHammerHistoryAtomicComponents,
  type HammerHistoryAtomicComponentBasis, type HammerHistoryAtomicRequest } from "../lib/hammerHistoryAtomicApi";
import type { HammerPersistedStructuredTranscript } from "../persistence/hammerPersistenceContract";
import { serializeHammerCanonicalArtifact } from "../persistence/hammerAutosaveQuiescence";

const BOUNDARY: HammerHistoryBoundary = Object.freeze({
  prior_history_status: "unavailable", merged: false, traversable: false,
  statement: "Prior undo history is unavailable and was not merged into this epoch.",
});

export type HammerHistoryEpochDurableBasis = Readonly<{
  workspaceId: string; workpieceId: string; canonicalRecordingId: string; revisionId: string;
  epochId: string; epochAnchorPath: string; epochAnchorSha256: string;
  epochBaseHash: string; componentHashes: HammerHistoryComponentHashes;
  canonicalEpochBaseHash: string; epochBaseHashAlgorithm: HammerEditorStateHashAlgorithm;
  headId: string | null; historyPath: string; sequence: number;
  revisionUpdatedAt: string; registry: HammerHistoryRegistryTuple;
  componentAuthority: HammerHistoryComponentAuthority | null;
}>;

export type HammerHistoryEpochCommitDraft = Readonly<{
  document: HammerHistoryDocumentV1; state: HammerEditorStateSerializable;
  basis: HammerHistoryEpochDurableBasis; headId: string; idempotencyKey: string;
  createdAt: string; initiatingUserId: string; components: HammerHistoryAtomicComponentBasis;
  projectedComponents: Readonly<Record<keyof HammerHistoryComponentAuthority, unknown>>;
}>;

export type HammerHistoryEpochPersistenceAdapters = Readonly<{
  createId: () => string; now: () => string; initiatingUserId: () => string | Promise<string>;
  resolveComponents: (state: HammerEditorStateSerializable, basis: HammerHistoryEpochDurableBasis) => Promise<{ current: HammerHistoryAtomicComponentBasis; projected: Readonly<Record<keyof HammerHistoryComponentAuthority, unknown>> }>;
  commitAtomic?: typeof commitHammerHistoryAtomic;
  startEpoch?: typeof startHammerHistoryEpoch;
  onPendingChange?: (pending: boolean) => void;
}>;

export type HammerHistoryEpochPersistenceState = Readonly<{
  basis: HammerHistoryEpochDurableBasis; pending: boolean; lastConflict: string | null;
}>;

export interface HammerHistoryEpochPersistenceAuthority {
  install(hydration: Extract<HammerRevisionHistoryHydration, { kind: "epoch_anchor" | "epoch_head" }>, identity: { workspaceId: string; workpieceId: string; canonicalRecordingId: string; revisionId: string }, baseMatch?: { canonicalHash: string; algorithm: HammerEditorStateHashAlgorithm }): void;
  clear(): void;
  getState(): HammerHistoryEpochPersistenceState | null;
  enqueue(document: HammerHistoryDocumentV1, state: HammerEditorStateSerializable): Promise<HammerHistoryTransitionResult>;
  startEpoch(request: HammerHistoryEpochTransportRequest): Promise<HammerHistoryTransitionResult>;
}

export function durableBasisFromHydration(
  hydration: Extract<HammerRevisionHistoryHydration, { kind: "epoch_anchor" | "epoch_head" }>,
  identity: { workspaceId: string; workpieceId: string; canonicalRecordingId: string; revisionId: string },
  baseMatch?: { canonicalHash: string; algorithm: HammerEditorStateHashAlgorithm },
): HammerHistoryEpochDurableBasis {
  if (hydration.kind === "epoch_anchor") return Object.freeze({
    ...identity, epochId: hydration.epoch.epoch_id, epochAnchorPath: hydration.pointer,
    epochAnchorSha256: hydration.durable_basis.registry.sha256,
    epochBaseHash: hydration.epoch.base.editor_state_hash, componentHashes: hydration.epoch.base.component_sha256,
    canonicalEpochBaseHash: baseMatch?.canonicalHash ?? hydration.epoch.base.editor_state_hash,
    epochBaseHashAlgorithm: baseMatch?.algorithm ?? HAMMER_EDITOR_STATE_HASH_ALGORITHM,
    headId: null, historyPath: hydration.pointer, sequence: 0,
    revisionUpdatedAt: hydration.durable_basis.revision_updated_at,
    registry: hydration.durable_basis.registry, componentAuthority: null,
  });
  return Object.freeze({
    ...identity, epochId: hydration.epoch_id, epochAnchorPath: hydration.epoch_anchor.path,
    epochAnchorSha256: hydration.epoch_anchor.sha256, epochBaseHash: hydration.document.baseRevisionId,
    canonicalEpochBaseHash: hydration.base.canonical_editor_state_hash ?? hydration.document.baseRevisionId,
    epochBaseHashAlgorithm: hydration.base.hash_algorithm ?? HAMMER_EDITOR_STATE_HASH_ALGORITHM,
    componentHashes: hydration.base.component_sha256,
    headId: hydration.head_id, historyPath: hydration.pointer, sequence: hydration.sequence,
    revisionUpdatedAt: hydration.durable_basis.revision_updated_at,
    registry: hydration.durable_basis.registry, componentAuthority: hydration.result.component_authority,
  });
}

export async function buildHammerHistoryEpochCommitDraft(args: HammerHistoryEpochCommitDraft): Promise<HammerHistoryAtomicRequest> {
  const registryUpdatedAt = args.createdAt.endsWith("Z") ? `${args.createdAt.slice(0, -1)}+00:00` : args.createdAt;
  const componentNames = Object.keys(args.components) as Array<keyof HammerHistoryComponentAuthority>;
  const changes: Array<HammerHistoryAtomicRequest["component_changes"][number]> = [];
  const currentAuthority = Object.fromEntries(componentNames.map((component) => [component, args.components[component].authority])) as HammerHistoryComponentAuthority;
  const resultAuthority = structuredClone(currentAuthority) as Record<keyof HammerHistoryComponentAuthority, HammerHistoryComponentAuthority[keyof HammerHistoryComponentAuthority]>;
  for (const component of componentNames) {
    const current = args.components[component];
    const serializedBytes = hammerHistoryAtomicInternals.encode(args.projectedComponents[component]);
    const nextHash = await hammerHistoryAtomicInternals.sha256(serializedBytes);
    if (nextHash === current.registry.sha256 && serializedBytes.byteLength === current.registry.bytes) continue;
    const next = { sha256: nextHash, bytes: serializedBytes.byteLength, revision: current.registry.revision + 1,
      updated_at: registryUpdatedAt, storage_bucket: "forge-workpieces", storage_key: `workpieces/${args.basis.workpieceId}/hammer/staging/history-atomic/${args.headId}/${component}.json` };
    changes.push({ component, path: current.registry.path,
      expected: { sha256: current.registry.sha256, bytes: current.registry.bytes, revision: current.registry.revision, updated_at: current.registry.updated_at,
        storage_bucket: current.registry.storage_bucket, storage_key: current.registry.storage_key },
      next, content_type: "application/json", serialized_bytes: serializedBytes });
    resultAuthority[component] = { workpiece_id: args.basis.workpieceId, path: current.registry.path, sha256: nextHash, bytes: serializedBytes.byteLength,
      registry_revision: next.revision, registry_updated_at: next.updated_at, content_type: "application/json" };
  }
  if (changes.length === 0) throw new Error("history_epoch_atomic_no_component_change");
  const frozenChanges = changes.map(({ serialized_bytes: bytes, content_type: contentType, ...change }) => { void bytes; void contentType; return change; });
  const headPath = `hammer/revisions/${args.basis.revisionId}/history/epochs/${args.basis.epochId}/heads/${args.headId}.history.v1.json`;
  const envelope = {
    schema: "forge.hammer-history-epoch-head", schema_version: 1,
    workspace_id: args.basis.workspaceId, workpiece_id: args.basis.workpieceId,
    canonical_recording_id: args.basis.canonicalRecordingId, recording_revision_id: args.basis.revisionId,
    epoch_id: args.basis.epochId, head_id: args.headId, sequence: args.basis.sequence + 1,
    creation: { created_at: args.createdAt, initiating_user_id: args.initiatingUserId },
    epoch_anchor: { path: args.basis.epochAnchorPath, sha256: args.basis.epochAnchorSha256 },
    parent: { head_id: args.basis.headId, path: args.basis.historyPath, sha256: args.basis.registry.sha256, registry_revision: args.basis.registry.revision, registry_updated_at: args.basis.registry.updated_at },
    base: args.basis.epochBaseHashAlgorithm === HAMMER_EDITOR_STATE_LEGACY_HASH_ALGORITHM
      ? { editor_state_hash: args.basis.epochBaseHash, component_sha256: args.basis.componentHashes, hash_algorithm: HAMMER_EDITOR_STATE_LEGACY_HASH_ALGORITHM, canonical_editor_state_hash: args.basis.canonicalEpochBaseHash }
      : { editor_state_hash: args.basis.epochBaseHash, component_sha256: args.basis.componentHashes },
    result: { editor_state_hash: hashEditorState(args.state), component_authority: resultAuthority, hash_algorithm: HAMMER_EDITOR_STATE_HASH_ALGORITHM },
    history: args.document, boundary: BOUNDARY, component_changes: frozenChanges,
    artifact: { path: headPath, content_type: "application/json" },
  } as const;
  const headBytes = hammerHistoryAtomicInternals.encode(envelope); const headSha = await hammerHistoryAtomicInternals.sha256(headBytes);
  const request: HammerHistoryAtomicRequest = {
    workspace_id: args.basis.workspaceId, workpiece_id: args.basis.workpieceId, canonical_recording_id: args.basis.canonicalRecordingId,
    recording_revision_id: args.basis.revisionId, initiating_user_id: args.initiatingUserId, idempotency_key: args.idempotencyKey,
    operation_fingerprint: "0".repeat(64), expected_revision_updated_at: args.basis.revisionUpdatedAt, expected_history_path: args.basis.historyPath,
    parent: { head_id: args.basis.headId, path: args.basis.historyPath, sequence: args.basis.sequence, sha256: args.basis.registry.sha256,
      bytes: args.basis.registry.bytes, registry_revision: args.basis.registry.revision, registry_updated_at: args.basis.registry.updated_at, content_type: "application/json" },
    component_authority: currentAuthority, component_changes: changes,
    head: { head_id: args.headId, path: headPath, sha256: headSha, bytes: headBytes.byteLength, registry_revision: 1,
      registry_updated_at: registryUpdatedAt, content_type: "application/json", serialized_bytes: headBytes },
    envelope, history: args.document,
  };
  return { ...request, operation_fingerprint: await fingerprintHammerHistoryAtomicRequest(request) };
}

export function createHammerHistoryEpochPersistenceAuthority(adapters: HammerHistoryEpochPersistenceAdapters): HammerHistoryEpochPersistenceAuthority {
  let basis: HammerHistoryEpochDurableBasis | null = null;
  let generation = 0; let running = false; let lastConflict: string | null = null;
  type Waiter = { resolve: (result: HammerHistoryTransitionResult) => void };
  type Job = { document: HammerHistoryDocumentV1; state: HammerEditorStateSerializable; generation: number; waiters: Waiter[] };
  let pending: Job | null = null;
  const currentPending = (): Job | null => pending;
  const conflict = (code: string): HammerHistoryTransitionResult => ({ outcome: "conflict", code, terminal: true, retryable: false });
  const notifyPending = () => adapters.onPendingChange?.(running || pending !== null);
  const sameQueuedOperation = (left: Job, right: Job): boolean => hashEditorState(left.state) === hashEditorState(right.state)
    && serializeHammerCanonicalArtifact({ ...left.document, updatedAt: null }) === serializeHammerCanonicalArtifact({ ...right.document, updatedAt: null });
  const runJob = async (job: Job): Promise<HammerHistoryTransitionResult> => {
    if (!basis || job.generation !== generation) return conflict("history_epoch_head_stale_generation");
    const commitBasis = basis; const headId = adapters.createId(); const idempotencyKey = `hammer-head:${adapters.createId()}`;
    let resolved: Awaited<ReturnType<HammerHistoryEpochPersistenceAdapters["resolveComponents"]>>;
    try { resolved = await adapters.resolveComponents(job.state, commitBasis); }
    catch { lastConflict = "history_epoch_head_component_authority_unavailable"; return conflict(lastConflict); }
    if (job.generation !== generation) return conflict("history_epoch_head_stale_generation");
    const installedAuthority = commitBasis.componentAuthority;
    if (installedAuthority) {
      const loadedAuthority = Object.fromEntries(Object.entries(resolved.current).map(([key, value]) => [key, value.authority]));
      if (serializeHammerCanonicalArtifact(loadedAuthority) !== serializeHammerCanonicalArtifact(installedAuthority)) return conflict("history_epoch_atomic_component_basis_conflict");
    } else if (Object.entries(resolved.current).some(([key, value]) => value.registry.sha256 !== commitBasis.componentHashes[key as keyof HammerHistoryComponentHashes])) {
      return conflict("history_epoch_atomic_component_basis_conflict");
    }
    const initiatingUserId = await adapters.initiatingUserId(); const createdAt = adapters.now();
    let request: HammerHistoryAtomicRequest;
    try { request = await buildHammerHistoryEpochCommitDraft({ document: job.document, state: job.state, basis: commitBasis, headId, idempotencyKey, createdAt, initiatingUserId, components: resolved.current, projectedComponents: resolved.projected }); }
    catch (error) { const code = error instanceof Error ? error.message : "history_epoch_atomic_plan_invalid"; lastConflict = code; return conflict(code); }
    const result = await (adapters.commitAtomic ?? commitHammerHistoryAtomic)({ workspaceId: commitBasis.workspaceId, workpieceId: commitBasis.workpieceId, revisionId: commitBasis.revisionId, request });
    if (job.generation !== generation) return conflict("history_epoch_head_stale_generation");
    if (result.outcome === "conflict") { lastConflict = result.code; return result; }
    if (result.history_path !== request.head.path || result.operation_fingerprint !== request.operation_fingerprint || result.head_id !== request.head.head_id) {
      lastConflict = "history_epoch_atomic_committed_readback_invalid"; return conflict(lastConflict);
    }
    const resultAuthority = (request.envelope.result as { component_authority: HammerHistoryComponentAuthority }).component_authority;
    basis = Object.freeze({ ...commitBasis, headId: request.head.head_id, historyPath: request.head.path, sequence: commitBasis.sequence + 1,
      revisionUpdatedAt: result.revision_updated_at,
      registry: { path: request.head.path, sha256: request.head.sha256, bytes: request.head.bytes, revision: request.head.registry_revision,
        updated_at: request.head.registry_updated_at, storage_bucket: "forge-workpieces", storage_key: `workpieces/${commitBasis.workpieceId}/${request.head.path}` },
      componentAuthority: resultAuthority });
    lastConflict = null; return result;
  };
  const drain = async () => {
    if (running) return;
    running = true; notifyPending();
    try {
      while (pending) {
        const job = pending; pending = null; const result = await runJob(job);
        for (const waiter of job.waiters) waiter.resolve(result);
        const queuedAfterCommit = currentPending();
        if (result.outcome !== "conflict" && queuedAfterCommit && queuedAfterCommit.generation === job.generation && sameQueuedOperation(job, queuedAfterCommit)) {
          for (const waiter of queuedAfterCommit.waiters) waiter.resolve(result);
          pending = null;
        }
        if (result.outcome === "conflict" && result.code !== "history_epoch_head_stale_generation") {
          const queued = currentPending();
          if (queued) { for (const waiter of queued.waiters) waiter.resolve(result); pending = null; }
          break;
        }
      }
    } finally { running = false; notifyPending(); if (pending) void drain(); }
  };
  return {
    install(hydration, identity, baseMatch) { generation += 1; basis = durableBasisFromHydration(hydration, identity, baseMatch); lastConflict = null;
      if (pending) { const stale = conflict("history_epoch_head_stale_generation"); for (const waiter of pending.waiters) waiter.resolve(stale); pending = null; } notifyPending(); },
    clear() { generation += 1; basis = null; lastConflict = null;
      if (pending) { const stale = conflict("history_epoch_head_stale_generation"); for (const waiter of pending.waiters) waiter.resolve(stale); pending = null; } notifyPending(); },
    getState: () => basis ? { basis, pending: running || pending !== null, lastConflict } : null,
    enqueue(document, state) {
      return new Promise<HammerHistoryTransitionResult>((resolve) => {
        const waiter = { resolve }; const next = { document: structuredClone(document), state: structuredClone(state), generation, waiters: [waiter] };
        if (pending && pending.generation === generation) pending = { ...next, waiters: [...pending.waiters, waiter] };
        else pending = next;
        notifyPending(); void drain();
      });
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

export function useHammerHistoryEpochPersistenceAuthority(args: { workpieceId: string; paths?: HammerHistoryComponentPaths; override?: HammerHistoryEpochPersistenceAuthority;
  derivedTextLayers?: HammerPersistedStructuredTranscript["derived_text_layers"]; onPendingChange?: (pending: boolean) => void }): HammerHistoryEpochPersistenceAuthority | undefined {
  const { audio, editorial_authority, transcript, visual_placements, visual_timeline } = args.paths ?? {};
  const runtimeRef = useRef(args); runtimeRef.current = args;
  return useMemo(() => args.override ?? (audio && editorial_authority && transcript && visual_placements && visual_timeline ? createHammerHistoryEpochPersistenceAuthority({
    createId: () => crypto.randomUUID(), now: () => new Date().toISOString(), initiatingUserId: resolveTongsAuthenticatedUserId,
    resolveComponents: async (state, basis) => {
      const current = await loadHammerHistoryAtomicComponentBasis({ workpieceId: basis.workpieceId, paths: { audio, editorial_authority, transcript, visual_placements, visual_timeline } });
      return { current, projected: projectHammerHistoryAtomicComponents({ state, current,
        identity: { workspaceId: basis.workspaceId, workpieceId: basis.workpieceId, canonicalRecordingId: basis.canonicalRecordingId, revisionId: basis.revisionId },
        derivedTextLayers: runtimeRef.current.derivedTextLayers }) };
    },
    onPendingChange: (pending) => runtimeRef.current.onPendingChange?.(pending),
  }) : undefined), [args.override, audio, editorial_authority, transcript, visual_placements, visual_timeline]);
}
