export type DraftId = string;

export type DraftAttribution = {
  userId: string | null;
  displayName: string | null;
};

export type ScriptValidationSeverity = "error" | "warning";

export type ScriptValidationCode =
  | "UNSUPPORTED_TAG"
  | "UNCLOSED_TAG"
  | "UNOPENED_CLOSING_TAG"
  | "CROSSED_TAGS"
  | "SPEAKER_TAG_NOT_OWN_LINE"
  | "NOTE_TAG_NOT_OWN_LINE"
  | "INVALID_SPEAKER_TAG"
  | "INVALID_PACING_TOKEN"
  | "TEXT_OUTSIDE_SPEAKER_BLOCK"
  | "EMPTY_SPEAKER_BLOCK";

export interface ScriptValidationIssue {
  code: ScriptValidationCode;
  severity: ScriptValidationSeverity;
  message: string;
  line: number;
  column: number;
  tag?: string;
}

export interface PersistedScriptValidationMeta {
  ok: boolean;
  issueCount: number;
  issues: ScriptValidationIssue[];
  validatorVersion: string;
  validatedAt: string;
}

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
  scriptValidationMeta?: PersistedScriptValidationMeta | null;
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
    scriptValidationMeta: null,
  };
}
