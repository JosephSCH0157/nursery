import type { Draft, DraftId } from "../domain/draft";
import type { Revision, RevisionId } from "../domain/revision";
import type { HearthChatMessage } from "../lib/hearth-chat-api";

export type HearthStoreKind = "local" | "tongs";

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

export interface HearthStore {
  listDrafts(): Promise<Draft[]>;
  listWorkpieceDrafts(workpieceId: string): Promise<Draft[]>;
  getDraft(id: DraftId): Promise<Draft | null>;
  saveDraft(draft: Draft, options?: SaveDraftOptions): Promise<HearthDraftSaveAcknowledgement>;
  deleteDraft(id: DraftId): Promise<void>;
  getChatHistory(draftId: DraftId): Promise<HearthChatMessage[]>;
  saveChatHistory(draftId: DraftId, messages: HearthChatMessage[]): Promise<void>;
  listRevisions(workpieceId: string, draftId?: DraftId | null): Promise<Revision[]>;
  getRevision(workpieceId: string, id: RevisionId): Promise<Revision | null>;
  saveRevision(workpieceId: string, revision: Revision): Promise<void>;
  restoreRevision(workpieceId: string, id: RevisionId): Promise<{ title: string; body: string } | null>;
}
