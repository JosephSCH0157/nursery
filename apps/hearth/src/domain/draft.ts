export type DraftId = string;

export type DraftAttribution = {
  userId: string | null;
  displayName: string | null;
};

export interface Draft {
  id: DraftId;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  revisionCount?: number;
  lastRevisionAt?: number;
  archived?: boolean;
  pinned?: boolean;
  createdBy?: DraftAttribution | null;
  updatedBy?: DraftAttribution | null;
}

function generateDraftId(): DraftId {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createDraft(partial?: { title?: string; body?: string }): Draft {
  const now = Date.now();
  const title = String(partial?.title ?? "").trim();
  return {
    id: generateDraftId(),
    title: title || "Untitled Draft",
    body: partial?.body ?? "",
    createdAt: now,
    updatedAt: now,
    revisionCount: 0,
    lastRevisionAt: undefined,
    archived: false,
    pinned: false,
    createdBy: null,
    updatedBy: null,
  };
}
