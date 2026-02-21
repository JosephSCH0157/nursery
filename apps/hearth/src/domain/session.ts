import type { DraftId } from "./draft";

export type SessionId = string;

export interface HearthSession {
  id: SessionId;
  activeDraftId?: DraftId;
  lastOpenedAt?: number;
  uiState?: {
    splitPane?: boolean;
    selectedTab?: string;
    cursorPosition?: number;
    scrollTop?: number;
  };
  createdAt: number;
  updatedAt: number;
}
