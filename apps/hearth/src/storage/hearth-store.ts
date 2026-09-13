import type { Draft, DraftId } from "../domain/draft";
import type { Revision, RevisionId } from "../domain/revision";
import type { HearthChatMessage } from "../lib/hearth-chat-api";

export type HearthStoreKind = "local" | "tongs";
export type HearthChatHistoryCompleteness = "complete" | "legacy_completeness_unknown" | "known_truncated";

export type SaveDraftOptions = {
  reason?: string;
};

export type HearthDraftSaveAcknowledgement =
  | Readonly<{
      ok: true;
      kind: "canonical";
      authority: "tongs";
      artifact: "draft_snapshot";
      workspaceId: string;
      workpieceId: string;
      committedAt: string;
    }>
  | Readonly<{
      ok: false;
      kind: "recovery_only";
      authority: "browser_cache";
      artifact: "draft_snapshot";
      reason:
        | "local_store"
        | "canonical_target_unavailable"
        | "canonical_commit_failed"
        | "canonical_response_invalid"
        | "canonical_request_failed";
      status: number | null;
    }>;

export function isCanonicalHearthDraftSave(
  result: HearthDraftSaveAcknowledgement,
): result is Extract<HearthDraftSaveAcknowledgement, { ok: true }> {
  return result.ok && result.kind === "canonical" && result.authority === "tongs";
}

export type HearthRevisionSaveAcknowledgement =
  | Readonly<{
      ok: true;
      kind: "canonical";
      authority: "tongs";
      artifact: "revision_snapshot";
      workpieceId: string;
      committedAt: string;
    }>
  | Readonly<{
      ok: false;
      kind: "recovery_only";
      authority: "browser_cache";
      artifact: "revision_snapshot";
      reason: "local_store" | "canonical_read_failed" | "canonical_commit_failed";
    }>;

export type HearthCanonicalRevisionsResult =
  | Readonly<{
      ok: true;
      kind: "canonical";
      authority: "tongs";
      workpieceId: string;
      fileUpdatedAt: string | null;
      revisions: readonly Revision[];
    }>
  | Readonly<{
      ok: false;
      kind: "unavailable";
      authority: "none";
      reason: "local_store" | "not_found" | "request_failed" | "invalid_response";
      status: number | null;
    }>;

export function isCanonicalHearthRevisionSave(
  result: HearthRevisionSaveAcknowledgement,
): result is Extract<HearthRevisionSaveAcknowledgement, { ok: true }> {
  return result.ok && result.kind === "canonical" && result.authority === "tongs";
}

export interface HearthStore {
  listDrafts(): Promise<Draft[]>;
  listWorkpieceDrafts(workpieceId: string): Promise<Draft[]>;
  getDraft(id: DraftId): Promise<Draft | null>;
  saveDraft(draft: Draft, options?: SaveDraftOptions): Promise<HearthDraftSaveAcknowledgement>;
  deleteDraft(id: DraftId): Promise<void>;
  getChatHistory(draftId: DraftId, workpieceId?: string | null): Promise<HearthChatMessage[]>;
  saveChatHistory(draftId: DraftId, messages: HearthChatMessage[], workpieceId?: string | null): Promise<void>;
  /** Deliberate creator action; resolves only after canonical clear acknowledgement. */
  clearChatHistory(draftId: DraftId, workpieceId: string): Promise<void>;
  getChatHistoryCompleteness?(workpieceId: string | null): HearthChatHistoryCompleteness;
  readCanonicalRevisions(workpieceId: string, draftId?: DraftId | null): Promise<HearthCanonicalRevisionsResult>;
  listRevisions(workpieceId: string, draftId?: DraftId | null): Promise<Revision[]>;
  getRevision(workpieceId: string, id: RevisionId): Promise<Revision | null>;
  saveRevision(workpieceId: string, revision: Revision): Promise<HearthRevisionSaveAcknowledgement>;
  restoreRevision(workpieceId: string, id: RevisionId): Promise<{ title: string; body: string } | null>;
}
