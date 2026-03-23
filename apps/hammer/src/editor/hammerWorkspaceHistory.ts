import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";

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

export interface HammerEditorStateSerializable {
  transcriptSegments: HammerTranscriptSegment[];
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
  getReplayStateFromBaseline(baseline: HammerEditorStateSerializable): HammerEditorStateSerializable;
}

function cloneSegments(segments: HammerTranscriptSegment[]): HammerTranscriptSegment[] {
  return segments.map((segment) => ({ ...segment }));
}

export function cloneEditorState(state: HammerEditorStateSerializable): HammerEditorStateSerializable {
  return {
    transcriptSegments: cloneSegments(state.transcriptSegments),
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
          if (!segmentId || !speaker || text == null || !Number.isFinite(startSec) || !Number.isFinite(endSec)) {
            return null;
          }
          return {
            segment_id: segmentId,
            speaker,
            text,
            start_sec: startSec,
            end_sec: endSec,
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
      return controller.commitTransaction(argsMutation.transactionId ?? txnId);
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

    getReplayStateFromBaseline(baseline) {
      let replay = cloneEditorState(baseline);
      for (const entryId of args.document.undoStack) {
        const entry = readEntryById(args.document, entryId);
        if (!entry) continue;
        replay = applyPatches(replay, entry.forwardPatch);
      }
      return replay;
    },
  };

  return controller;
}
