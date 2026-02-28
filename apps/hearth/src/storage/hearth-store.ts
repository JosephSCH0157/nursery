import type { Draft, DraftId } from "../domain/draft";
import type { Revision, RevisionId } from "../domain/revision";
import type { HearthChatMessage } from "../lib/hearth-chat-api";

export type HearthStoreKind = "local" | "tongs";

export interface HearthStore {
  listDrafts(): Promise<Draft[]>;
  getDraft(id: DraftId): Promise<Draft | null>;
  saveDraft(draft: Draft): Promise<void>;
  deleteDraft(id: DraftId): Promise<void>;
  getChatHistory(draftId: DraftId): Promise<HearthChatMessage[]>;
  saveChatHistory(draftId: DraftId, messages: HearthChatMessage[]): Promise<void>;
  listRevisions(draftId: DraftId): Promise<Revision[]>;
  getRevision(id: RevisionId): Promise<Revision | null>;
  saveRevision(revision: Revision): Promise<void>;
  restoreRevision(id: RevisionId): Promise<{ title: string; body: string } | null>;
}
