import { cloneEditorState, type HammerEditorStateSerializable, type HammerHistoryController, type HammerHistoryDocumentV1 } from "./hammerWorkspaceHistory";

export type HammerHistoryPostSaveSnapshotRequest = Readonly<{
  workpieceId: string; sessionId: string; baseRevisionId: string; headEntryId: string | null;
  undoDepth: number; redoDepth: number; editorState: HammerEditorStateSerializable;
}>;

export function captureHammerHistoryPostSaveSnapshotRequest(args: { workpieceId: string; controller: HammerHistoryController }): HammerHistoryPostSaveSnapshotRequest {
  return Object.freeze({ workpieceId: args.workpieceId, sessionId: args.controller.document.sessionId,
    baseRevisionId: args.controller.document.baseRevisionId, headEntryId: args.controller.document.headEntryId ?? null,
    undoDepth: args.controller.document.undoStack.length, redoDepth: args.controller.document.redoStack.length,
    editorState: cloneEditorState(args.controller.getState()) });
}

export async function persistHammerHistorySaveBoundary(args: {
  saveHistory: () => Promise<{ ok: true } | { ok: false; error: string }>;
  snapshotRequest: HammerHistoryPostSaveSnapshotRequest;
  onHistorySaved: (request: HammerHistoryPostSaveSnapshotRequest) => Promise<void>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await args.saveHistory();
  if (!result.ok) return result;
  try { await args.onHistorySaved(args.snapshotRequest); }
  catch { /* Durable history success is independent of best-effort snapshot production. */ }
  return result;
}

export function cloneHammerHistoryDocument(document: HammerHistoryDocumentV1): HammerHistoryDocumentV1 { return structuredClone(document); }
