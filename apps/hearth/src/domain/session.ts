import type { DraftId } from "./draft";

export type SessionId = string;

export interface HearthSession {
  id: SessionId;
  activeDraftId?: DraftId;
  createdAt: number;
  updatedAt: number;
}
