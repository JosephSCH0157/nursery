import type { DraftId } from "./draft";

export type SessionId = string;

export interface HearthSession {
  id: SessionId;
  activeDraftId?: DraftId;
  lastOpenedAt?: number;
  uiState?: {
    splitPane?: boolean;
    selectedTab?: string;
  };
  createdAt: number;
  updatedAt: number;
}
