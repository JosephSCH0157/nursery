export type RevisionId = string;

export type RevisionKind = "manual" | "autosave" | "milestone";

export interface Revision {
  id: RevisionId;
  draftId: string;
  createdAt: number;
  titleSnapshot: string;
  bodySnapshot: string;
  note?: string;
  kind: RevisionKind;
}

function generateRevisionId(): RevisionId {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `rev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createRevision(input: {
  draftId: string;
  title: string;
  body: string;
  kind: RevisionKind;
  note?: string;
}): Revision {
  return {
    id: generateRevisionId(),
    draftId: input.draftId,
    createdAt: Date.now(),
    titleSnapshot: input.title,
    bodySnapshot: input.body,
    kind: input.kind,
    note: input.note?.trim() || undefined,
  };
}
