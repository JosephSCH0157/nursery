import type { Draft, DraftId } from "../domain/draft";
import type { Revision, RevisionId } from "../domain/revision";
import type { HearthChatMessage } from "../lib/hearth-chat-api";

export type HearthStoreKind = "local" | "tongs";

export type SaveDraftOptions = {
  reason?: string;
};

export interface HearthStore {
  listDrafts(): Promise<Draft[]>;
  getDraft(id: DraftId): Promise<Draft | null>;
  saveDraft(draft: Draft, options?: SaveDraftOptions): Promise<void>;
  deleteDraft(id: DraftId): Promise<void>;
  getChatHistory(draftId: DraftId): Promise<HearthChatMessage[]>;
  saveChatHistory(draftId: DraftId, messages: HearthChatMessage[]): Promise<void>;
  listRevisions(workpieceId: string, draftId?: DraftId | null): Promise<Revision[]>;
  getRevision(workpieceId: string, id: RevisionId): Promise<Revision | null>;
  saveRevision(workpieceId: string, revision: Revision): Promise<void>;
  restoreRevision(workpieceId: string, id: RevisionId): Promise<{ title: string; body: string } | null>;
}
