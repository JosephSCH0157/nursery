import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerEditorialAuthorityGraph } from "../../../../packages/contracts/hammer/editorial-authority.contract";
import type {
  HammerPersistedVisualPlacements,
  HammerVisualPlacementRecord,
} from "../persistence/hammerPersistenceContract";
import {
  cloneHammerStudioRackState,
  createDefaultHammerStudioRackState,
  normalizeHammerStudioRackState,
  type HammerStudioRackState,
} from "./hammerStudioRack";

export type JsonPatchLike = {
  op: "replace" | "add" | "remove";
  path: string;
  value?: unknown;
};

export type HammerHistoryKind =
  | "transcript_text_edit"
  | "speaker_edit"
  | "timing_adjustment"
  | "segment_structure"
  | "cleanup_tool"
  | "visual_adjustment"
  | "output_selection"
  | "editor_state_change";

export interface HammerOutputSelectionState {
  layerId: string | null;
  sourceRecipeRef: string | null;
}

export interface HammerCanonicalOperationDelta {
  operation_id: string;
  action: "add" | "update" | "remove";
  before_lifecycle: "active" | "reverted" | "superseded" | null;
  after_lifecycle: "active" | "reverted" | "superseded" | null;
}

export interface HammerEditorStateSerializable {
  transcriptSegments: HammerTranscriptSegment[];
  visualPlacements: HammerPersistedVisualPlacements | null;
  studioRack: HammerStudioRackState;
  editorialAuthorityGraph: HammerEditorialAuthorityGraph | null;
  outputSelection: HammerOutputSelectionState;
  selectedSegmentId: string | null;
  playheadSec: number;
  transcriptTimingHint: string | null;
}

export interface HammerHistoryEntry {
  id: string;
  parentEntryId: string | null;
  timestamp: string;
  kind: HammerHistoryKind;
  label: string;
  forwardPatch: JsonPatchLike[];
  inversePatch: JsonPatchLike[];
  affectedSegmentIds?: string[];
  affectedPlacementIds?: string[];
  canonicalOperationDeltas?: HammerCanonicalOperationDelta[];
  toolId?: string | null;
  baseStateHash?: string;
  resultStateHash?: string;
  transactionId?: string | null;
}

export interface HammerCheckpoint {
  id: string;
  createdAt: string;
  label: string;
  entryId: string;
  snapshotRef?: string | null;
}

export interface HammerHistoryDocumentV1 {
  version: 1;
  workpieceId: string;
  sessionId: string;
  baseRevisionId: string;
  createdAt: string;
  updatedAt: string;
  headEntryId: string | null;
  entries: HammerHistoryEntry[];
  checkpoints: HammerCheckpoint[];
  undoStack: string[];
  redoStack: string[];
  metadata?: {
    lastKnownSelectionSegmentId?: string | null;
    lastKnownTool?: string | null;
  };
}

type PendingTransaction = {
  id: string;
  label: string;
  kind: HammerHistoryKind;
  toolId: string | null;
  parentEntryId: string | null;
  startedAt: string;
  affectedSegmentIds: Set<string>;
  affectedPlacementIds: Set<string>;
  forwardPatch: JsonPatchLike[];
  inversePatch: JsonPatchLike[];
};

export interface ApplyMutationArgs {
  label: string;
  kind?: HammerHistoryKind;
  toolId?: string | null;
  affectedSegmentIds?: string[];
  affectedPlacementIds?: string[];
  transactionId?: string | null;
  nextState: HammerEditorStateSerializable;
  allowCoalesce?: boolean;
  coalesceWindowMs?: number;
}

export interface HammerHistoryController {
  document: HammerHistoryDocumentV1;
  beginTransaction(label: string, kind?: HammerHistoryKind, toolId?: string | null): string;
  recordPatch(
    forward: JsonPatchLike[],
    inverse: JsonPatchLike[],
    meta?: {
      affectedSegmentIds?: string[];
      affectedPlacementIds?: string[];
    },
  ): void;
  commitTransaction(transactionId?: string | null): HammerHistoryEntry | null;
  rollbackTransaction(): void;
  applyMutation(args: ApplyMutationArgs): HammerHistoryEntry | null;
  canUndo(): boolean;
  canRedo(): boolean;
  peekUndoEntry(): HammerHistoryEntry | null;
  peekRedoEntry(): HammerHistoryEntry | null;
  undo(): HammerHistoryEntry | null;
  redo(): HammerHistoryEntry | null;
  createCheckpoint(label: string): HammerCheckpoint | null;
  getState(): HammerEditorStateSerializable;
  replaceState(state: HammerEditorStateSerializable): void;
  getReplayStateFromBaseline(
    baseline: HammerEditorStateSerializable,
    afterEntryId?: string | null,
  ): HammerEditorStateSerializable;
}

function cloneSegments(segments: HammerTranscriptSegment[]): HammerTranscriptSegment[] {
  return segments.map((segment) => ({ ...segment }));
}

function clonePlacementRecords(placements: HammerVisualPlacementRecord[]): HammerVisualPlacementRecord[] {
  return placements.map((placement) => ({
    ...placement,
    matched_segment_ids: [...placement.matched_segment_ids],
    uncertainty_flags: [...placement.uncertainty_flags],
  }));
}

function cloneVisualPlacements(
  placements: HammerPersistedVisualPlacements | null,
): HammerPersistedVisualPlacements | null {
  if (!placements) return null;
  return {
    ...placements,
    source_refs: [...placements.source_refs],
    uncertainty_flags: [...placements.uncertainty_flags],
    placements: clonePlacementRecords(placements.placements),
  };
}

function cloneEditorialAuthorityGraph(
  graph: HammerEditorialAuthorityGraph | null,
): HammerEditorialAuthorityGraph | null {
  if (!graph) return null;
  return {
    ...graph,
    operation_order: [...graph.operation_order],
    operations: graph.operations.map((operation) => ({
      ...operation,
      instruction: { ...operation.instruction },
      capability_state: {
        ...operation.capability_state,
        reason_codes: [...operation.capability_state.reason_codes],
      },
      truth_posture: {
        preview: {
          ...operation.truth_posture.preview,
          reason_codes: [...operation.truth_posture.preview.reason_codes],
        },
        export: {
          ...operation.truth_posture.export,
          reason_codes: [...operation.truth_posture.export.reason_codes],
        },
        handoff: {
          ...operation.truth_posture.handoff,
          reason_codes: [...operation.truth_posture.handoff.reason_codes],
        },
      },
      provenance: { ...operation.provenance },
    })),
  };
}

export function cloneEditorState(state: HammerEditorStateSerializable): HammerEditorStateSerializable {
  return {
    transcriptSegments: cloneSegments(state.transcriptSegments),
    visualPlacements: cloneVisualPlacements(state.visualPlacements),
    studioRack: cloneHammerStudioRackState(state.studioRack),
    editorialAuthorityGraph: cloneEditorialAuthorityGraph(state.editorialAuthorityGraph),
    outputSelection: {
      layerId: state.outputSelection.layerId,
      sourceRecipeRef: state.outputSelection.sourceRecipeRef,
    },
    selectedSegmentId: state.selectedSegmentId,
    playheadSec: state.playheadSec,
    transcriptTimingHint: state.transcriptTimingHint,
  };
}

function clonePatchValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return value;
  }
}

function clonePatches(patches: JsonPatchLike[]): JsonPatchLike[] {
  return patches.map((patch) => ({
    op: patch.op,
    path: patch.path,
    ...(patch.op === "remove" ? {} : { value: clonePatchValue(patch.value) }),
  }));
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizePatches(value: unknown): JsonPatchLike[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = readJsonObject(item);
      const op = readString(row?.op);
      const path = readString(row?.path);
      if (!op || !path) return null;
      if (op !== "replace" && op !== "add" && op !== "remove") return null;
      return {
        op,
        path,
        ...(op === "remove" ? {} : { value: clonePatchValue(row?.value) }),
      } as JsonPatchLike;
    })
    .filter((patch): patch is JsonPatchLike => Boolean(patch));
}

function normalizeHistoryEntry(value: unknown): HammerHistoryEntry | null {
  const row = readJsonObject(value);
  if (!row) return null;

  const id = readString(row.id);
  const timestamp = readString(row.timestamp);
  const label = readString(row.label);
  const kind = readString(row.kind) as HammerHistoryKind | null;
  if (!id || !timestamp || !label || !kind) return null;

  const parentEntryId = readString(row.parentEntryId);
  const forwardPatch = normalizePatches(row.forwardPatch);
  const inversePatch = normalizePatches(row.inversePatch);

  if (!forwardPatch.length && !inversePatch.length) return null;

  return {
    id,
    parentEntryId,
    timestamp,
    kind,
    label,
    forwardPatch,
    inversePatch,
    affectedSegmentIds: Array.isArray(row.affectedSegmentIds)
      ? row.affectedSegmentIds.map((item) => readString(item)).filter((item): item is string => Boolean(item))
      : undefined,
    affectedPlacementIds: Array.isArray(row.affectedPlacementIds)
      ? row.affectedPlacementIds.map((item) => readString(item)).filter((item): item is string => Boolean(item))
      : undefined,
    canonicalOperationDeltas: Array.isArray(row.canonicalOperationDeltas)
      ? row.canonicalOperationDeltas
        .map((item) => {
          const delta = readJsonObject(item);
          if (!delta) return null;
          const operationId = readString(delta.operation_id);
          const action = readString(delta.action);
          const beforeLifecycle = readString(delta.before_lifecycle);
          const afterLifecycle = readString(delta.after_lifecycle);
          if (!operationId || !action) return null;
          if (action !== "add" && action !== "update" && action !== "remove") return null;
          return {
            operation_id: operationId,
            action,
            before_lifecycle: beforeLifecycle === "active" || beforeLifecycle === "reverted" || beforeLifecycle === "superseded"
              ? beforeLifecycle
              : null,
            after_lifecycle: afterLifecycle === "active" || afterLifecycle === "reverted" || afterLifecycle === "superseded"
              ? afterLifecycle
              : null,
          } as HammerCanonicalOperationDelta;
        })
        .filter((delta): delta is HammerCanonicalOperationDelta => Boolean(delta))
      : undefined,
    toolId: row.toolId == null ? null : readString(row.toolId),
    baseStateHash: readString(row.baseStateHash) ?? undefined,
    resultStateHash: readString(row.resultStateHash) ?? undefined,
    transactionId: row.transactionId == null ? null : readString(row.transactionId),
  };
}

function normalizeCheckpoint(value: unknown): HammerCheckpoint | null {
  const row = readJsonObject(value);
  if (!row) return null;
  const id = readString(row.id);
  const createdAt = readString(row.createdAt);
  const label = readString(row.label);
  const entryId = readString(row.entryId);
  if (!id || !createdAt || !label || !entryId) return null;
  return {
    id,
    createdAt,
    label,
    entryId,
    snapshotRef: row.snapshotRef == null ? null : readString(row.snapshotRef),
  };
}

function stableHashToken(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function hashEditorState(state: HammerEditorStateSerializable): string {
  const payload = JSON.stringify(state);
  return `hammer-state:${stableHashToken(payload)}`;
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

export function createHammerHistoryDocument(args: {
  workpieceId: string;
  sessionId: string;
  baseRevisionId: string;
}): HammerHistoryDocumentV1 {
  const now = new Date().toISOString();
  return {
    version: 1,
    workpieceId: args.workpieceId,
    sessionId: args.sessionId,
    baseRevisionId: args.baseRevisionId,
    createdAt: now,
    updatedAt: now,
    headEntryId: null,
    entries: [],
    checkpoints: [],
    undoStack: [],
    redoStack: [],
    metadata: {},
  };
}

export function normalizeHammerHistoryDocument(
  value: unknown,
  fallback: {
    workpieceId: string;
    sessionId: string;
    baseRevisionId: string;
  },
): HammerHistoryDocumentV1 {
  const root = readJsonObject(value);
  if (!root || root.version !== 1) {
    return createHammerHistoryDocument(fallback);
  }

  const workpieceId = readString(root.workpieceId) ?? fallback.workpieceId;
  const sessionId = readString(root.sessionId) ?? fallback.sessionId;
  const baseRevisionId = readString(root.baseRevisionId) ?? fallback.baseRevisionId;
  const createdAt = readString(root.createdAt) ?? new Date().toISOString();
  const updatedAt = readString(root.updatedAt) ?? createdAt;

  const entries = Array.isArray(root.entries)
    ? root.entries
      .map((item) => normalizeHistoryEntry(item))
      .filter((entry): entry is HammerHistoryEntry => Boolean(entry))
    : [];

  const entryIdSet = new Set(entries.map((entry) => entry.id));
  const checkpoints = Array.isArray(root.checkpoints)
    ? root.checkpoints
      .map((item) => normalizeCheckpoint(item))
      .filter((checkpoint): checkpoint is HammerCheckpoint => Boolean(checkpoint && entryIdSet.has(checkpoint.entryId)))
    : [];

  const undoStack = Array.isArray(root.undoStack)
    ? root.undoStack.map((item) => readString(item)).filter((item): item is string => Boolean(item && entryIdSet.has(item)))
    : [];
  const redoStack = Array.isArray(root.redoStack)
    ? root.redoStack.map((item) => readString(item)).filter((item): item is string => Boolean(item && entryIdSet.has(item)))
    : [];

  const metadataRow = readJsonObject(root.metadata);
  const metadata = metadataRow
    ? {
      lastKnownSelectionSegmentId: metadataRow.lastKnownSelectionSegmentId == null
        ? null
        : readString(metadataRow.lastKnownSelectionSegmentId),
      lastKnownTool: metadataRow.lastKnownTool == null
        ? null
        : readString(metadataRow.lastKnownTool),
    }
    : {};

  return {
    version: 1,
    workpieceId,
    sessionId,
    baseRevisionId,
    createdAt,
    updatedAt,
    headEntryId: undoStack.at(-1) ?? null,
    entries,
    checkpoints,
    undoStack,
    redoStack,
    metadata,
  };
}

function serializePatchPath(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  if (!parts.length) {
    throw new Error("Patch path cannot be root.");
  }
  return parts;
}

function readSegmentAt(state: HammerEditorStateSerializable, index: number): HammerTranscriptSegment {
  const segment = state.transcriptSegments[index];
  if (!segment) {
    throw new Error(`Segment index ${index} is out of bounds.`);
  }
  return { ...segment };
}

function normalizeVisualPlacementsFromValue(value: unknown): HammerPersistedVisualPlacements | null {
  if (value == null) return null;
  const row = readJsonObject(value);
  if (!row) return null;

  const sourceRefs = Array.isArray(row.source_refs)
    ? row.source_refs.map((item) => readString(item)).filter((item): item is string => Boolean(item))
    : [];
  const uncertaintyFlags = Array.isArray(row.uncertainty_flags)
    ? row.uncertainty_flags.map((item) => readString(item)).filter((item): item is string => Boolean(item))
    : [];

  const placementsRaw = Array.isArray(row.placements) ? row.placements : [];
  const placements = placementsRaw
    .map((item) => {
      const placement = readJsonObject(item);
      if (!placement) return null;
      const placementId = readString(placement.placement_id);
      const entryId = readString(placement.entry_id);
      const anchorSegmentId = readString(placement.anchor_segment_id);
      const assetRef = readString(placement.asset_ref);
      const timingSource = readString(placement.timing_source);
      const status = readString(placement.status);
      const startSec = Number(placement.start_sec);
      const endSec = Number(placement.end_sec);
      if (
        !placementId
        || !entryId
        || !anchorSegmentId
        || !assetRef
        || !timingSource
        || !status
        || !Number.isFinite(startSec)
        || !Number.isFinite(endSec)
      ) {
        return null;
      }
      return {
        placement_id: placementId,
        entry_id: entryId,
        anchor_segment_id: anchorSegmentId,
        matched_segment_ids: Array.isArray(placement.matched_segment_ids)
          ? placement.matched_segment_ids
            .map((segmentId) => readString(segmentId))
            .filter((segmentId): segmentId is string => Boolean(segmentId))
          : [],
        anchor_text: readString(placement.anchor_text),
        asset_ref: assetRef,
        asset_id: readString(placement.asset_id),
        asset_path: readString(placement.asset_path),
        storage_key: readString(placement.storage_key),
        label: readString(placement.label),
        visual_mode: readString(placement.visual_mode),
        start_sec: startSec,
        end_sec: endSec,
        confidence: Number.isFinite(Number(placement.confidence)) ? Number(placement.confidence) : null,
        timing_source: timingSource === "ordered_fallback" ? "ordered_fallback" : "transcript_match",
        status: status === "uncertain" ? "uncertain" : "placed",
        ingest_state: placement.ingest_state === "approved" ? "approved" : "suggested",
        uncertainty_flags: Array.isArray(placement.uncertainty_flags)
          ? placement.uncertainty_flags
            .map((flag) => readString(flag))
            .filter((flag): flag is string => Boolean(flag))
          : [],
      } as HammerVisualPlacementRecord;
    })
    .filter((placement): placement is HammerVisualPlacementRecord => Boolean(placement));

  return {
    schema_version: 1,
    status: row.status === "prepared" ? "prepared" : "not_started",
    source_refs: sourceRefs,
    uncertainty_flags: uncertaintyFlags,
    placements,
  };
}

function normalizeOutputSelectionFromValue(value: unknown): HammerOutputSelectionState {
  if (value == null) {
    return {
      layerId: null,
      sourceRecipeRef: null,
    };
  }

  const row = readJsonObject(value);
  if (!row) {
    return {
      layerId: null,
      sourceRecipeRef: null,
    };
  }

  return {
    layerId: readString(row.layerId),
    sourceRecipeRef: readString(row.sourceRecipeRef),
  };
}

function areOutputSelectionsEqual(
  left: HammerOutputSelectionState,
  right: HammerOutputSelectionState,
): boolean {
  return left.layerId === right.layerId
    && left.sourceRecipeRef === right.sourceRecipeRef;
}

function areVisualPlacementsEqual(
  left: HammerPersistedVisualPlacements | null,
  right: HammerPersistedVisualPlacements | null,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function areStudioRackEqual(
  left: HammerStudioRackState,
  right: HammerStudioRackState,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function areEditorialAuthorityGraphsEqual(
  left: HammerEditorialAuthorityGraph | null,
  right: HammerEditorialAuthorityGraph | null,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildCanonicalOperationDeltas(
  before: HammerEditorialAuthorityGraph | null,
  after: HammerEditorialAuthorityGraph | null,
): HammerCanonicalOperationDelta[] {
  const beforeOperations = new Map((before?.operations ?? []).map((operation) => [operation.operation_id, operation]));
  const afterOperations = new Map((after?.operations ?? []).map((operation) => [operation.operation_id, operation]));
  const operationIds = new Set<string>([
    ...beforeOperations.keys(),
    ...afterOperations.keys(),
  ]);
  const deltas: HammerCanonicalOperationDelta[] = [];
  for (const operationId of operationIds) {
    const beforeOperation = beforeOperations.get(operationId) ?? null;
    const afterOperation = afterOperations.get(operationId) ?? null;
    if (!beforeOperation && afterOperation) {
      deltas.push({
        operation_id: operationId,
        action: "add",
        before_lifecycle: null,
        after_lifecycle: afterOperation.lifecycle,
      });
      continue;
    }
    if (beforeOperation && !afterOperation) {
      deltas.push({
        operation_id: operationId,
        action: "remove",
        before_lifecycle: beforeOperation.lifecycle,
        after_lifecycle: null,
      });
      continue;
    }
    if (!beforeOperation || !afterOperation) continue;
    if (JSON.stringify(beforeOperation) === JSON.stringify(afterOperation)) continue;
    deltas.push({
      operation_id: operationId,
      action: "update",
      before_lifecycle: beforeOperation.lifecycle,
      after_lifecycle: afterOperation.lifecycle,
    });
  }
  return deltas;
}

function applyPatchToState(state: HammerEditorStateSerializable, patch: JsonPatchLike): HammerEditorStateSerializable {
  const next = cloneEditorState(state);
  const parts = serializePatchPath(patch.path);
  const root = parts[0];

  if (root === "transcriptSegments") {
    if (parts.length === 1) {
      if (patch.op === "remove") {
        next.transcriptSegments = [];
        return next;
      }
      if (!Array.isArray(patch.value)) {
        throw new Error("transcriptSegments patch requires array value.");
      }
      next.transcriptSegments = patch.value
        .map((item) => {
          const row = readJsonObject(item);
          if (!row) return null;
          const segmentId = readString(row.segment_id);
          const speaker = readString(row.speaker);
          const text = readString(row.text);
          const startSec = Number(row.start_sec);
          const endSec = Number(row.end_sec);
          const gainDb = Number(row.gain_db);
          const isDisabled = typeof row.is_disabled === "boolean" ? row.is_disabled : undefined;
          if (!segmentId || !speaker || text == null || !Number.isFinite(startSec) || !Number.isFinite(endSec)) {
            return null;
          }
          return {
            segment_id: segmentId,
            speaker,
            text,
            start_sec: startSec,
            end_sec: endSec,
            ...(isDisabled == null ? {} : { is_disabled: isDisabled }),
            ...(Number.isFinite(gainDb) ? { gain_db: gainDb } : {}),
          } as HammerTranscriptSegment;
        })
        .filter((segment): segment is HammerTranscriptSegment => Boolean(segment));
      return next;
    }

    const index = Number(parts[1]);
    if (!Number.isInteger(index) || index < 0) {
      throw new Error("Invalid transcript segment index path.");
    }

    if (parts.length === 2) {
      if (patch.op === "remove") {
        next.transcriptSegments.splice(index, 1);
        return next;
      }
      const row = readJsonObject(patch.value);
      if (!row) {
        throw new Error("Segment patch requires object value.");
      }
      const replacement = {
        segment_id: readString(row.segment_id) ?? readSegmentAt(state, Math.min(index, state.transcriptSegments.length - 1)).segment_id,
        speaker: readString(row.speaker) ?? "Speaker",
        text: readString(row.text) ?? "",
        start_sec: Number.isFinite(Number(row.start_sec)) ? Number(row.start_sec) : 0,
        end_sec: Number.isFinite(Number(row.end_sec)) ? Number(row.end_sec) : 0.1,
        ...(typeof row.is_disabled === "boolean" ? { is_disabled: row.is_disabled } : {}),
        ...(Number.isFinite(Number(row.gain_db)) ? { gain_db: Number(row.gain_db) } : {}),
      } as HammerTranscriptSegment;
      if (patch.op === "add") {
        next.transcriptSegments.splice(index, 0, replacement);
      } else {
        next.transcriptSegments[index] = replacement;
      }
      return next;
    }

    const field = parts[2];
    const target = readSegmentAt(next, index);
    switch (field) {
      case "segment_id": {
        if (patch.op === "remove") {
          target.segment_id = "";
        } else {
          target.segment_id = readString(patch.value) ?? "";
        }
        break;
      }
      case "speaker": {
        if (patch.op === "remove") {
          target.speaker = "";
        } else {
          target.speaker = readString(patch.value) ?? "";
        }
        break;
      }
      case "text": {
        if (patch.op === "remove") {
          target.text = "";
        } else {
          target.text = readString(patch.value) ?? "";
        }
        break;
      }
      case "start_sec":
      case "end_sec": {
        const numeric = Number(patch.value);
        if (!Number.isFinite(numeric)) {
          throw new Error(`Patch value for ${field} must be numeric.`);
        }
        if (field === "start_sec") {
          target.start_sec = numeric;
        } else {
          target.end_sec = numeric;
        }
        break;
      }
      case "is_disabled": {
        if (patch.op === "remove" || patch.value == null) {
          target.is_disabled = undefined;
        } else {
          target.is_disabled = Boolean(patch.value);
        }
        break;
      }
      case "gain_db": {
        if (patch.op === "remove" || patch.value == null) {
          target.gain_db = undefined;
        } else {
          const numeric = Number(patch.value);
          if (!Number.isFinite(numeric)) {
            throw new Error("Patch value for gain_db must be numeric.");
          }
          target.gain_db = numeric;
        }
        break;
      }
      default:
        throw new Error(`Unsupported transcript patch field: ${field}`);
    }
    next.transcriptSegments[index] = target;
    return next;
  }

  if (root === "selectedSegmentId") {
    next.selectedSegmentId = patch.op === "remove" ? null : (readString(patch.value) ?? null);
    return next;
  }

  if (root === "playheadSec") {
    if (patch.op === "remove") {
      next.playheadSec = 0;
      return next;
    }
    const numeric = Number(patch.value);
    if (!Number.isFinite(numeric)) {
      throw new Error("playheadSec patch requires numeric value.");
    }
    next.playheadSec = numeric;
    return next;
  }

  if (root === "transcriptTimingHint") {
    next.transcriptTimingHint = patch.op === "remove" ? null : (readString(patch.value) ?? null);
    return next;
  }

  if (root === "visualPlacements") {
    if (patch.op === "remove") {
      next.visualPlacements = null;
      return next;
    }
    next.visualPlacements = normalizeVisualPlacementsFromValue(patch.value);
    return next;
  }

  if (root === "studioRack") {
    if (patch.op === "remove") {
      next.studioRack = createDefaultHammerStudioRackState();
      return next;
    }
    next.studioRack = normalizeHammerStudioRackState(patch.value);
    return next;
  }

  if (root === "editorialAuthorityGraph") {
    if (patch.op === "remove") {
      next.editorialAuthorityGraph = null;
      return next;
    }
    const row = readJsonObject(patch.value);
    if (!row) {
      next.editorialAuthorityGraph = null;
      return next;
    }
    next.editorialAuthorityGraph = cloneEditorialAuthorityGraph(row as unknown as HammerEditorialAuthorityGraph);
    return next;
  }

  if (root === "outputSelection") {
    if (patch.op === "remove") {
      next.outputSelection = {
        layerId: null,
        sourceRecipeRef: null,
      };
      return next;
    }
    next.outputSelection = normalizeOutputSelectionFromValue(patch.value);
    return next;
  }

  throw new Error(`Unsupported patch root path: ${root}`);
}

export function applyPatches(
  state: HammerEditorStateSerializable,
  patches: JsonPatchLike[],
): HammerEditorStateSerializable {
  return patches.reduce((current, patch) => applyPatchToState(current, patch), cloneEditorState(state));
}

function areSegmentsEqual(left: HammerTranscriptSegment[], right: HammerTranscriptSegment[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const lhs = left[index];
    const rhs = right[index];
    if (!lhs || !rhs) return false;
    if (
      lhs.segment_id !== rhs.segment_id
      || lhs.speaker !== rhs.speaker
      || lhs.text !== rhs.text
      || lhs.start_sec !== rhs.start_sec
      || lhs.end_sec !== rhs.end_sec
      || lhs.is_disabled !== rhs.is_disabled
      || lhs.gain_db !== rhs.gain_db
    ) {
      return false;
    }
  }
  return true;
}

function buildSegmentPatches(
  before: HammerTranscriptSegment[],
  after: HammerTranscriptSegment[],
): { forward: JsonPatchLike[]; inverse: JsonPatchLike[] } {
  const forward: JsonPatchLike[] = [];
  const inverse: JsonPatchLike[] = [];

  const maxLength = Math.max(before.length, after.length);
  for (let index = 0; index < maxLength; index += 1) {
    const lhs = before[index];
    const rhs = after[index];

    if (!lhs && rhs) {
      forward.push({ op: "add", path: `/transcriptSegments/${index}`, value: { ...rhs } });
      inverse.unshift({ op: "remove", path: `/transcriptSegments/${index}` });
      continue;
    }

    if (lhs && !rhs) {
      forward.push({ op: "remove", path: `/transcriptSegments/${index}` });
      inverse.unshift({ op: "add", path: `/transcriptSegments/${index}`, value: { ...lhs } });
      continue;
    }

    if (!lhs || !rhs) continue;

    const fields: Array<keyof HammerTranscriptSegment> = [
      "segment_id",
      "speaker",
      "text",
      "start_sec",
      "end_sec",
      "is_disabled",
      "gain_db",
    ];
    for (const field of fields) {
      if (lhs[field] === rhs[field]) continue;
      forward.push({ op: "replace", path: `/transcriptSegments/${index}/${field}`, value: rhs[field] });
      inverse.unshift({ op: "replace", path: `/transcriptSegments/${index}/${field}`, value: lhs[field] });
    }
  }

  return { forward, inverse };
}

export function buildStatePatches(
  before: HammerEditorStateSerializable,
  after: HammerEditorStateSerializable,
): { forward: JsonPatchLike[]; inverse: JsonPatchLike[] } {
  const forward: JsonPatchLike[] = [];
  const inverse: JsonPatchLike[] = [];

  if (!areSegmentsEqual(before.transcriptSegments, after.transcriptSegments)) {
    const segmentPatches = buildSegmentPatches(before.transcriptSegments, after.transcriptSegments);
    forward.push(...segmentPatches.forward);
    inverse.push(...segmentPatches.inverse);
  }

  if (before.selectedSegmentId !== after.selectedSegmentId) {
    forward.push({ op: "replace", path: "/selectedSegmentId", value: after.selectedSegmentId });
    inverse.unshift({ op: "replace", path: "/selectedSegmentId", value: before.selectedSegmentId });
  }

  if (before.playheadSec !== after.playheadSec) {
    forward.push({ op: "replace", path: "/playheadSec", value: after.playheadSec });
    inverse.unshift({ op: "replace", path: "/playheadSec", value: before.playheadSec });
  }

  if (before.transcriptTimingHint !== after.transcriptTimingHint) {
    forward.push({ op: "replace", path: "/transcriptTimingHint", value: after.transcriptTimingHint });
    inverse.unshift({ op: "replace", path: "/transcriptTimingHint", value: before.transcriptTimingHint });
  }

  if (!areVisualPlacementsEqual(before.visualPlacements, after.visualPlacements)) {
    forward.push({
      op: "replace",
      path: "/visualPlacements",
      value: clonePatchValue(after.visualPlacements),
    });
    inverse.unshift({
      op: "replace",
      path: "/visualPlacements",
      value: clonePatchValue(before.visualPlacements),
    });
  }

  if (!areStudioRackEqual(before.studioRack, after.studioRack)) {
    forward.push({
      op: "replace",
      path: "/studioRack",
      value: clonePatchValue(after.studioRack),
    });
    inverse.unshift({
      op: "replace",
      path: "/studioRack",
      value: clonePatchValue(before.studioRack),
    });
  }

  if (!areEditorialAuthorityGraphsEqual(before.editorialAuthorityGraph, after.editorialAuthorityGraph)) {
    forward.push({
      op: "replace",
      path: "/editorialAuthorityGraph",
      value: clonePatchValue(after.editorialAuthorityGraph),
    });
    inverse.unshift({
      op: "replace",
      path: "/editorialAuthorityGraph",
      value: clonePatchValue(before.editorialAuthorityGraph),
    });
  }

  if (!areOutputSelectionsEqual(before.outputSelection, after.outputSelection)) {
    forward.push({
      op: "replace",
      path: "/outputSelection",
      value: clonePatchValue(after.outputSelection),
    });
    inverse.unshift({
      op: "replace",
      path: "/outputSelection",
      value: clonePatchValue(before.outputSelection),
    });
  }

  return { forward, inverse };
}

function readEntryById(document: HammerHistoryDocumentV1, entryId: string): HammerHistoryEntry | null {
  return document.entries.find((entry) => entry.id === entryId) ?? null;
}

export function createHammerHistoryController(args: {
  document: HammerHistoryDocumentV1;
  initialState: HammerEditorStateSerializable;
  maxUndoSteps?: number;
}): HammerHistoryController {
  const maxUndoSteps = Math.max(1, args.maxUndoSteps ?? 100);
  let state = cloneEditorState(args.initialState);
  let pendingTransaction: PendingTransaction | null = null;

  const updateHead = (): void => {
    args.document.headEntryId = args.document.undoStack.at(-1) ?? null;
    args.document.updatedAt = new Date().toISOString();
  };

  const commitEntry = (entry: HammerHistoryEntry): void => {
    args.document.entries.push(entry);
    args.document.undoStack.push(entry.id);
    args.document.redoStack.length = 0;

    if (args.document.undoStack.length > maxUndoSteps) {
      args.document.undoStack.splice(0, args.document.undoStack.length - maxUndoSteps);
    }

    updateHead();
  };

  const controller: HammerHistoryController = {
    document: args.document,

    beginTransaction(label, kind = "editor_state_change", toolId = null): string {
      if (pendingTransaction) {
        throw new Error("Hammer history transaction already active.");
      }

      pendingTransaction = {
        id: createId("txn"),
        label,
        kind,
        toolId,
        parentEntryId: args.document.undoStack.at(-1) ?? null,
        startedAt: new Date().toISOString(),
        affectedSegmentIds: new Set<string>(),
        affectedPlacementIds: new Set<string>(),
        forwardPatch: [],
        inversePatch: [],
      };
      return pendingTransaction.id;
    },

    recordPatch(forward, inverse, meta) {
      if (!pendingTransaction) {
        throw new Error("Hammer history recordPatch requires an active transaction.");
      }

      pendingTransaction.forwardPatch.push(...clonePatches(forward));
      pendingTransaction.inversePatch.unshift(...clonePatches(inverse));
      for (const segmentId of meta?.affectedSegmentIds ?? []) {
        pendingTransaction.affectedSegmentIds.add(segmentId);
      }
      for (const placementId of meta?.affectedPlacementIds ?? []) {
        pendingTransaction.affectedPlacementIds.add(placementId);
      }
    },

    commitTransaction(transactionId = null) {
      if (!pendingTransaction) return null;
      if (!pendingTransaction.forwardPatch.length || !pendingTransaction.inversePatch.length) {
        pendingTransaction = null;
        return null;
      }

      const baseStateHash = hashEditorState(state);
      const nextState = applyPatches(state, pendingTransaction.forwardPatch);
      const resultStateHash = hashEditorState(nextState);

      const entry: HammerHistoryEntry = {
        id: createId("entry"),
        parentEntryId: pendingTransaction.parentEntryId,
        timestamp: new Date().toISOString(),
        kind: pendingTransaction.kind,
        label: pendingTransaction.label,
        forwardPatch: clonePatches(pendingTransaction.forwardPatch),
        inversePatch: clonePatches(pendingTransaction.inversePatch),
        ...(pendingTransaction.affectedSegmentIds.size
          ? { affectedSegmentIds: [...pendingTransaction.affectedSegmentIds] }
          : {}),
        ...(pendingTransaction.affectedPlacementIds.size
          ? { affectedPlacementIds: [...pendingTransaction.affectedPlacementIds] }
          : {}),
        toolId: pendingTransaction.toolId,
        baseStateHash,
        resultStateHash,
        transactionId,
      };

      state = nextState;
      pendingTransaction = null;
      commitEntry(entry);
      return entry;
    },

    rollbackTransaction() {
      pendingTransaction = null;
    },

    applyMutation(argsMutation) {
      const previousState = cloneEditorState(state);
      const nextState = cloneEditorState(argsMutation.nextState);
      const canonicalOperationDeltas = buildCanonicalOperationDeltas(
        previousState.editorialAuthorityGraph,
        nextState.editorialAuthorityGraph,
      );
      const patchSet = buildStatePatches(previousState, nextState);
      if (!patchSet.forward.length || !patchSet.inverse.length) {
        return null;
      }

      const now = Date.now();
      if (argsMutation.allowCoalesce) {
        const previousEntryId = args.document.undoStack.at(-1) ?? null;
        if (previousEntryId) {
          const previousEntry = readEntryById(args.document, previousEntryId);
          const windowMs = Math.max(200, argsMutation.coalesceWindowMs ?? 1500);
          if (
            previousEntry
            && previousEntry.transactionId
            && argsMutation.transactionId
            && previousEntry.transactionId === argsMutation.transactionId
            && (now - Date.parse(previousEntry.timestamp) <= windowMs)
          ) {
            try {
              const rolledBack = applyPatches(state, previousEntry.inversePatch);
              const mergedPatchSet = buildStatePatches(rolledBack, nextState);
              if (!mergedPatchSet.forward.length || !mergedPatchSet.inverse.length) {
                return null;
              }
              previousEntry.forwardPatch = clonePatches(mergedPatchSet.forward);
              previousEntry.resultStateHash = hashEditorState(nextState);
              previousEntry.timestamp = new Date().toISOString();
              previousEntry.canonicalOperationDeltas = canonicalOperationDeltas.length > 0
                ? canonicalOperationDeltas
                : undefined;
              state = nextState;
              updateHead();
              return previousEntry;
            } catch (error) {
              console.warn("Hammer history coalescing failed; falling back to new transaction.", {
                error,
              });
            }
          }
        }
      }

      const txnId = controller.beginTransaction(argsMutation.label, argsMutation.kind, argsMutation.toolId ?? null);
      controller.recordPatch(patchSet.forward, patchSet.inverse, {
        affectedSegmentIds: argsMutation.affectedSegmentIds,
        affectedPlacementIds: argsMutation.affectedPlacementIds,
      });
      const entry = controller.commitTransaction(argsMutation.transactionId ?? txnId);
      if (entry) {
        entry.canonicalOperationDeltas = canonicalOperationDeltas.length > 0
          ? canonicalOperationDeltas
          : undefined;
      }
      return entry;
    },

    canUndo() {
      return args.document.undoStack.length > 0;
    },

    canRedo() {
      return args.document.redoStack.length > 0;
    },

    peekUndoEntry() {
      const entryId = args.document.undoStack.at(-1);
      return entryId ? readEntryById(args.document, entryId) : null;
    },

    peekRedoEntry() {
      const entryId = args.document.redoStack.at(-1);
      return entryId ? readEntryById(args.document, entryId) : null;
    },

    undo() {
      const entryId = args.document.undoStack.at(-1);
      if (!entryId) return null;
      const entry = readEntryById(args.document, entryId);
      if (!entry) {
        args.document.undoStack.pop();
        updateHead();
        return null;
      }

      state = applyPatches(state, entry.inversePatch);
      args.document.undoStack.pop();
      args.document.redoStack.push(entry.id);
      updateHead();
      return entry;
    },

    redo() {
      const entryId = args.document.redoStack.at(-1);
      if (!entryId) return null;
      const entry = readEntryById(args.document, entryId);
      if (!entry) {
        args.document.redoStack.pop();
        updateHead();
        return null;
      }

      state = applyPatches(state, entry.forwardPatch);
      args.document.redoStack.pop();
      args.document.undoStack.push(entry.id);
      updateHead();
      return entry;
    },

    createCheckpoint(label) {
      const entryId = args.document.undoStack.at(-1);
      if (!entryId) return null;
      const checkpoint: HammerCheckpoint = {
        id: createId("checkpoint"),
        createdAt: new Date().toISOString(),
        label,
        entryId,
        snapshotRef: null,
      };
      args.document.checkpoints.push(checkpoint);
      updateHead();
      return checkpoint;
    },

    getState() {
      return cloneEditorState(state);
    },

    replaceState(nextState) {
      state = cloneEditorState(nextState);
    },

    getReplayStateFromBaseline(baseline, afterEntryId) {
      let replay = cloneEditorState(baseline);
      let shouldReplay = !afterEntryId;
      for (const entryId of args.document.undoStack) {
        if (!shouldReplay) {
          if (entryId === afterEntryId) {
            shouldReplay = true;
          }
          continue;
        }
        const entry = readEntryById(args.document, entryId);
        if (!entry) continue;
        replay = applyPatches(replay, entry.forwardPatch);
      }
      return replay;
    },
  };

  return controller;
}
