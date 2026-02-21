import type { Draft, DraftId } from "../domain/draft";

export type HearthStoreKind = "local" | "tongs";

export interface HearthStore {
  listDrafts(): Promise<Draft[]>;
  getDraft(id: DraftId): Promise<Draft | null>;
  saveDraft(draft: Draft): Promise<void>;
  deleteDraft(id: DraftId): Promise<void>;
}
