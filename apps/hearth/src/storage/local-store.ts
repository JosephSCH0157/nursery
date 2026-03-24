import type {
  Draft,
  DraftId,
  PersistedScriptValidationMeta,
  ScriptAuthoringMeta,
  ScriptValidationCode,
  ScriptValidationIssue,
  ScriptValidationSeverity,
} from "../domain/draft";
import type { Revision, RevisionId } from "../domain/revision";
import type { HearthChatMessage } from "../lib/hearth-chat-api";
import {
  applyRevisionCap,
  createEmptyRevisionSnapshot,
  entryToRevision,
  normalizeRevisionSnapshot,
  revisionToEntry,
} from "../lib/hearth-revisions-contract";
import type { HearthStore, SaveDraftOptions } from "./hearth-store";
import {
  cloneRevision,
  loadRevisionSnapshotFallback,
  normalizeRevision,
  saveRevisionSnapshotFallback,
} from "./revision-storage";

const DRAFTS_STORAGE_KEY = "hearth:drafts";
const CHAT_STORAGE_KEY = "hearth:chat-local:v1";
const MAX_CHAT_MESSAGES = 200;
const MAX_CHAT_TOTAL_CHARS = 650_000;
const MAX_CHAT_ENTRY_CHARS = 24_000;
const CHAT_TRUNCATED_SUFFIX = "\n\n[truncated in local cache]";

type DraftRecord = Record<string, Draft>;
type ChatEntry = {
  draftId: string;
  updatedAt: number;
  messages: HearthChatMessage[];
};
type ChatRecord = Record<string, ChatEntry>;

function cloneDraft(draft: Draft): Draft {
  return { ...draft };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeValidationIssue(value: unknown): ScriptValidationIssue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const code = typeof row.code === "string" ? row.code : null;
  const severity = typeof row.severity === "string" ? row.severity : null;
  const message = typeof row.message === "string" ? row.message : null;
  const line = typeof row.line === "number" && Number.isFinite(row.line) ? Math.max(1, Math.trunc(row.line)) : null;
  const column = typeof row.column === "number" && Number.isFinite(row.column) ? Math.max(1, Math.trunc(row.column)) : null;
  if (!code || !severity || !message || !line || !column) return null;
  return {
    code: code as ScriptValidationCode,
    severity: severity as ScriptValidationSeverity,
    message,
    line,
    column,
    ...(typeof row.tag === "string" ? { tag: row.tag } : {}),
  };
}

function normalizeScriptValidationMeta(value: unknown): PersistedScriptValidationMeta | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.ok !== "boolean") return null;
  const issues = Array.isArray(row.issues)
    ? row.issues.map((issue) => normalizeValidationIssue(issue)).filter((issue): issue is ScriptValidationIssue => Boolean(issue))
    : [];
  const issueCount = typeof row.issueCount === "number" && Number.isFinite(row.issueCount)
    ? Math.max(0, Math.trunc(row.issueCount))
    : issues.length;
  const validatorVersion = typeof row.validatorVersion === "string" ? row.validatorVersion.trim() : "";
  const validatedAt = typeof row.validatedAt === "string" ? row.validatedAt.trim() : "";
  if (!validatorVersion || !validatedAt) return null;
  return {
    ok: row.ok,
    issueCount,
    issues,
    validatorVersion,
    validatedAt,
  };
}

function normalizeScriptAuthoringMeta(value: unknown): ScriptAuthoringMeta | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const composeMode = typeof row.composeMode === "string" ? row.composeMode : null;
  const targetSpeaker = typeof row.targetSpeaker === "string" ? row.targetSpeaker : null;
  const speakers = Array.isArray(row.speakers)
    ? row.speakers.filter((speaker): speaker is "s1" | "s2" | "g1" | "g2" => (
      speaker === "s1" || speaker === "s2" || speaker === "g1" || speaker === "g2"
    ))
    : [];
  const speakerCount = typeof row.speakerCount === "number" && Number.isFinite(row.speakerCount)
    ? Math.max(1, Math.min(4, Math.trunc(row.speakerCount)))
    : null;
  if (!composeMode || !speakerCount || speakers.length === 0) return null;
  return {
    composeMode: composeMode as ScriptAuthoringMeta["composeMode"],
    targetSpeaker: (targetSpeaker === "s1" || targetSpeaker === "s2" || targetSpeaker === "g1" || targetSpeaker === "g2")
      ? targetSpeaker
      : null,
    speakers: speakers.slice(0, speakerCount),
    speakerCount: speakerCount as 1 | 2 | 3 | 4,
    isOverrideFromProductionDefault: row.isOverrideFromProductionDefault === true,
    lastComposedAt: typeof row.lastComposedAt === "string" ? row.lastComposedAt : null,
  };
}

function normalizeDraft(value: unknown): Draft | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  if (!id) return null;

  const createdAt = isFiniteNumber(row.createdAt) ? row.createdAt : Date.now();
  const updatedAt = isFiniteNumber(row.updatedAt) ? row.updatedAt : createdAt;

  const revisionCount = isFiniteNumber(row.revisionCount) ? row.revisionCount : undefined;
  const lastRevisionAt = isFiniteNumber(row.lastRevisionAt) ? row.lastRevisionAt : undefined;
  const archived = typeof row.archived === "boolean" ? row.archived : undefined;
  const pinned = typeof row.pinned === "boolean" ? row.pinned : undefined;
  const scriptValidationMeta = normalizeScriptValidationMeta(row.scriptValidationMeta);
  const scriptAuthoringMeta = normalizeScriptAuthoringMeta(row.scriptAuthoringMeta);

  return {
    id,
    title: typeof row.title === "string" && row.title.trim() ? row.title.trim() : "Untitled Draft",
    body: typeof row.body === "string" ? row.body : "",
    createdAt,
    updatedAt,
    revisionCount,
    lastRevisionAt,
    archived,
    pinned,
    scriptValidationMeta,
    scriptAuthoringMeta,
  };
}

function normalizeChatRole(value: unknown): HearthChatMessage["role"] | null {
  if (value === "assistant" || value === "user" || value === "system") {
    return value;
  }
  return null;
}

function trimChatContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return "";
  if (trimmed.length <= MAX_CHAT_ENTRY_CHARS) return trimmed;
  const maxLength = Math.max(1, MAX_CHAT_ENTRY_CHARS - CHAT_TRUNCATED_SUFFIX.length);
  return `${trimmed.slice(0, maxLength)}${CHAT_TRUNCATED_SUFFIX}`;
}

function normalizeChatMessage(value: unknown): HearthChatMessage | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { role?: unknown; content?: unknown };
  const role = normalizeChatRole(row.role);
  if (!role || typeof row.content !== "string") return null;
  const content = trimChatContent(row.content);
  if (!content) return null;
  return { role, content };
}

function sanitizeChatMessages(messages: ReadonlyArray<unknown>): HearthChatMessage[] {
  const normalized = messages
    .map((entry) => normalizeChatMessage(entry))
    .filter((entry): entry is HearthChatMessage => Boolean(entry));

  const out: HearthChatMessage[] = [];
  let totalChars = 0;
  for (let idx = normalized.length - 1; idx >= 0; idx -= 1) {
    if (out.length >= MAX_CHAT_MESSAGES) break;
    const message = normalized[idx]!;
    const nextChars = totalChars + message.content.length;
    if (out.length > 0 && nextChars > MAX_CHAT_TOTAL_CHARS) break;
    out.push(message);
    totalChars = nextChars;
  }
  return out.reverse();
}

function readChatRecord(): ChatRecord {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const out: ChatRecord = {};
    for (const [draftId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const row = value as { updatedAt?: unknown; messages?: unknown };
      const updatedAt = isFiniteNumber(row.updatedAt) ? row.updatedAt : Date.now();
      const messages = Array.isArray(row.messages) ? sanitizeChatMessages(row.messages) : [];
      out[draftId] = {
        draftId,
        updatedAt,
        messages,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function writeChatRecord(record: ChatRecord): void {
  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(record));
}

function readDraftRecord(): DraftRecord {
  try {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const out: DraftRecord = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const normalized = normalizeDraft({ ...(value as object), id });
      if (normalized) out[normalized.id] = normalized;
    }
    return out;
  } catch {
    return {};
  }
}

function writeDraftRecord(record: DraftRecord): void {
  localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(record));
}

export class LocalHearthStore implements HearthStore {
  async listDrafts(): Promise<Draft[]> {
    const record = readDraftRecord();
    return Object.values(record)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(cloneDraft);
  }

  async listWorkpieceDrafts(workpieceId: string): Promise<Draft[]> {
    const normalizedWorkpieceId = typeof workpieceId === "string" ? workpieceId.trim() : "";
    if (!normalizedWorkpieceId) return [];
    const record = readDraftRecord();
    return Object.values(record)
      .filter((draft) => draft.id === normalizedWorkpieceId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(cloneDraft);
  }

  async getDraft(id: DraftId): Promise<Draft | null> {
    const record = readDraftRecord();
    const found = record[id];
    return found ? cloneDraft(found) : null;
  }

  async saveDraft(draft: Draft, _options?: SaveDraftOptions): Promise<void> {
    const normalized = normalizeDraft(draft);
    if (!normalized) {
      throw new Error("Invalid draft payload");
    }

    const record = readDraftRecord();
    record[normalized.id] = cloneDraft(normalized);
    writeDraftRecord(record);
  }

  async deleteDraft(id: DraftId): Promise<void> {
    const record = readDraftRecord();
    if (!record[id]) return;
    delete record[id];
    writeDraftRecord(record);

    const chatRecord = readChatRecord();
    if (chatRecord[id]) {
      delete chatRecord[id];
      writeChatRecord(chatRecord);
    }
  }

  async getChatHistory(draftId: DraftId): Promise<HearthChatMessage[]> {
    const id = typeof draftId === "string" ? draftId.trim() : "";
    if (!id) return [];
    const record = readChatRecord();
    const found = record[id];
    return found ? sanitizeChatMessages(found.messages) : [];
  }

  async saveChatHistory(draftId: DraftId, messages: HearthChatMessage[]): Promise<void> {
    const id = typeof draftId === "string" ? draftId.trim() : "";
    if (!id) return;
    const record = readChatRecord();
    const sanitized = sanitizeChatMessages(messages);
    if (sanitized.length === 0) {
      if (record[id]) {
        delete record[id];
        writeChatRecord(record);
      }
      return;
    }
    record[id] = {
      draftId: id,
      updatedAt: Date.now(),
      messages: sanitized,
    };
    writeChatRecord(record);
  }

  async listRevisions(workpieceId: string, draftId?: DraftId | null): Promise<Revision[]> {
    const snapshot = loadRevisionSnapshotFallback(workpieceId);
    if (!snapshot) return [];

    let revisions = snapshot.revisions.map((entry) => entryToRevision(entry));
    if (draftId?.trim()) {
      revisions = revisions.filter((revision) => revision.draftId === draftId);
    }

    return revisions
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(cloneRevision);
  }

  async getRevision(workpieceId: string, id: RevisionId): Promise<Revision | null> {
    const snapshot = loadRevisionSnapshotFallback(workpieceId);
    if (!snapshot) return null;

    const found = snapshot.revisions.find((entry) => entry.id === id);
    return found ? cloneRevision(entryToRevision(found)) : null;
  }

  async saveRevision(workpieceId: string, revision: Revision): Promise<void> {
    const normalizedWorkpieceId = typeof workpieceId === "string" ? workpieceId.trim() : "";
    if (!normalizedWorkpieceId) {
      throw new Error("missing_workpiece");
    }

    const normalized = normalizeRevision(revision);
    if (!normalized) {
      throw new Error("Invalid revision payload");
    }

    const entry = revisionToEntry(normalized);
    const snapshot = loadRevisionSnapshotFallback(normalizedWorkpieceId)
      ?? createEmptyRevisionSnapshot(normalizedWorkpieceId);
    const nextSnapshot = normalizeRevisionSnapshot(normalizedWorkpieceId, {
      ...snapshot,
      updated_at: new Date().toISOString(),
      revisions: applyRevisionCap([
        ...snapshot.revisions.filter((item) => item.id !== entry.id),
        entry,
      ]),
    });
    if (!nextSnapshot) {
      throw new Error("Invalid revision snapshot");
    }
    saveRevisionSnapshotFallback(normalizedWorkpieceId, nextSnapshot);
  }

  async restoreRevision(workpieceId: string, id: RevisionId): Promise<{ title: string; body: string } | null> {
    const revision = await this.getRevision(workpieceId, id);
    if (!revision) return null;
    return { title: revision.titleSnapshot, body: revision.bodySnapshot };
  }
}
