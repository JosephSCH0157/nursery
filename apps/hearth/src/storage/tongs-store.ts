import type {
  Draft,
  DraftAttribution,
  DraftId,
  PersistedScriptValidationMeta,
  ScriptAuthoringMeta,
  ScriptValidationCode,
  ScriptValidationIssue,
  ScriptValidationSeverity,
} from "../domain/draft";
import type { Revision, RevisionId } from "../domain/revision";
import {
  HEARTH_REVISIONS_PATH,
  applyRevisionCap,
  createEmptyRevisionSnapshot,
  entryToRevision,
  normalizeRevisionSnapshot,
  revisionToEntry,
  type HearthRevisionEntry,
  type HearthRevisionSnapshot,
} from "../lib/hearth-revisions-contract";
import type { HearthChatMessage } from "../lib/hearth-chat-api";
import {
  appendCanonicalHearthConversation,
  clearCanonicalHearthConversation,
  readCanonicalHearthConversation,
} from "../lib/hearth-conversation-repo";
import type {
  HearthCanonicalRevisionsResult,
  HearthDraftSaveAcknowledgement,
  HearthRevisionSaveAcknowledgement,
  HearthStore,
  SaveDraftOptions,
} from "./hearth-store";
import {
  cloneRevision,
  loadRevisionSnapshotFallback,
  normalizeRevision,
  saveRevisionSnapshotFallback,
} from "./revision-storage";
import { tongsFetch } from "../lib/tongs-fetch";

type WrittenBy = {
  tool: string;
  tool_version: string;
  lane: string;
};

type ForgeWindow = Window &
  typeof globalThis & {
    __forgeWorkspaceId?: unknown;
    __tpWorkspaceId?: unknown;
    __forgeWorkspace?: unknown;
    __tpWorkspace?: unknown;
    __forgeTongsApiToken?: unknown;
    __tpTongsApiToken?: unknown;
    __forgeLane?: unknown;
    __tpLane?: unknown;
    APP_VERSION?: unknown;
  };

type TongsCacheV1 = {
  schemaVersion: 1;
  drafts: Record<string, Draft>;
  chats: Record<string, ChatSnapshotEntry>;
  draftWorkspaceById: Record<string, string>;
  draftSnapshotUpdatedAtByWorkspace: Record<string, string>;
  workpieceByWorkspace: Record<string, string>;
};

type ChatSnapshotEntry = {
  draftId: string;
  updatedAt: number;
  messages: HearthChatMessage[];
};

type CommitConflictDetails = {
  path: string;
  expected_previous_updated_at: string | null;
  current_updated_at: string | null;
};

const TONGS_CACHE_KEY = "hearth:tongs:cache:v1";
const TONGS_WORKPIECE_KEY = "forge_hearth_script_workpiece_id_v1";
const TONGS_WORKPIECE_BY_WORKSPACE_PREFIX = "forge_hearth_script_workpiece_v1:";
const LEGACY_TONGS_WORKPIECE_KEY = "forge_hearth_workpiece_id_v1";
const LEGACY_TONGS_WORKPIECE_BY_WORKSPACE_PREFIX = "forge_hearth_workpiece_v1:";
const TONGS_DRAFT_SNAPSHOT_PATH = "hearth/drafts.v1.json";
const TONGS_CHAT_SNAPSHOT_PATH = "hearth/chat.v1.json";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CHAT_MESSAGES = 200;
const MAX_CHAT_TOTAL_CHARS = 650_000;
const MAX_CHAT_ENTRY_CHARS = 24_000;
const CHAT_TRUNCATED_SUFFIX = "\n\n[truncated in local cache]";
const loadedChatSnapshotByWorkpiece = new Set<string>();
const canonicalChatGenerationByWorkpiece = new Map<string, number>();
const canonicalChatCompletenessByWorkpiece = new Map<string, "complete" | "legacy_completeness_unknown" | "known_truncated">();

let correlationSeq = 0;

function cloneDraft(draft: Draft): Draft {
  return { ...draft };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeDraftAttribution(value: unknown): DraftAttribution | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const userId = readString(row.userId);
  const displayName = readString(row.displayName);
  if (!userId && !displayName) return null;
  return {
    userId: userId ?? null,
    displayName: displayName ?? null,
  };
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
  const createdBy = normalizeDraftAttribution(row.createdBy);
  const updatedBy = normalizeDraftAttribution(row.updatedBy);
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
    createdBy,
    updatedBy,
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

function normalizeChatSnapshotEntry(
  draftId: string,
  value: unknown,
): ChatSnapshotEntry | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { updatedAt?: unknown; messages?: unknown };
  const updatedAt = isFiniteNumber(row.updatedAt) ? row.updatedAt : Date.now();
  const messages = Array.isArray(row.messages) ? sanitizeChatMessages(row.messages) : [];
  return {
    draftId,
    updatedAt,
    messages,
  };
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeUuid(value: unknown): string | null {
  const candidate = readString(value);
  if (!candidate) return null;
  return UUID_RE.test(candidate) ? candidate.toLowerCase() : null;
}

function readLocalStorage(key: string): string | null {
  try {
    return readString(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function readCache(): TongsCacheV1 {
  const fallback: TongsCacheV1 = {
    schemaVersion: 1,
    drafts: {},
    chats: {},
    draftWorkspaceById: {},
    draftSnapshotUpdatedAtByWorkspace: {},
    workpieceByWorkspace: {},
  };

  try {
    const raw = localStorage.getItem(TONGS_CACHE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return fallback;
    const row = parsed as Record<string, unknown>;
    if (row.schemaVersion !== 1) return fallback;

    const draftsIn = row.drafts;
    const drafts: Record<string, Draft> = {};
    if (draftsIn && typeof draftsIn === "object" && !Array.isArray(draftsIn)) {
      for (const [id, value] of Object.entries(draftsIn as Record<string, unknown>)) {
        const normalized = normalizeDraft({ ...(value as object), id });
        if (normalized) drafts[normalized.id] = normalized;
      }
    }

    const chatsIn = row.chats;
    const chats: Record<string, ChatSnapshotEntry> = {};
    if (chatsIn && typeof chatsIn === "object" && !Array.isArray(chatsIn)) {
      for (const [draftIdRaw, value] of Object.entries(chatsIn as Record<string, unknown>)) {
        const draftId = readString(draftIdRaw);
        if (!draftId) continue;
        const normalized = normalizeChatSnapshotEntry(draftId, value);
        if (normalized) {
          chats[normalized.draftId] = normalized;
        }
      }
    }

    const workpieceIn = row.workpieceByWorkspace;
    const workpieceByWorkspace: Record<string, string> = {};
    if (workpieceIn && typeof workpieceIn === "object" && !Array.isArray(workpieceIn)) {
      for (const [workspaceId, workpieceId] of Object.entries(workpieceIn as Record<string, unknown>)) {
        const normalizedWorkspaceId = normalizeUuid(workspaceId);
        const normalizedWorkpieceId = normalizeUuid(workpieceId);
        if (normalizedWorkspaceId && normalizedWorkpieceId) {
          workpieceByWorkspace[normalizedWorkspaceId] = normalizedWorkpieceId;
        }
      }
    }

    const draftWorkspaceIn = row.draftWorkspaceById;
    const draftWorkspaceById: Record<string, string> = {};
    if (draftWorkspaceIn && typeof draftWorkspaceIn === "object" && !Array.isArray(draftWorkspaceIn)) {
      for (const [draftId, workspaceIdRaw] of Object.entries(draftWorkspaceIn as Record<string, unknown>)) {
        const normalizedDraftId = readString(draftId);
        const normalizedWorkspaceId = normalizeUuid(workspaceIdRaw);
        if (normalizedDraftId && normalizedWorkspaceId) {
          draftWorkspaceById[normalizedDraftId] = normalizedWorkspaceId;
        }
      }
    }

    const snapshotUpdatedIn = row.draftSnapshotUpdatedAtByWorkspace;
    const draftSnapshotUpdatedAtByWorkspace: Record<string, string> = {};
    if (snapshotUpdatedIn && typeof snapshotUpdatedIn === "object" && !Array.isArray(snapshotUpdatedIn)) {
      for (const [workspaceIdRaw, updatedAtRaw] of Object.entries(snapshotUpdatedIn as Record<string, unknown>)) {
        const workspaceId = normalizeUuid(workspaceIdRaw);
        const updatedAt = readString(updatedAtRaw);
        if (!workspaceId || !updatedAt) continue;
        const parsed = Date.parse(updatedAt);
        if (!Number.isFinite(parsed)) continue;
        draftSnapshotUpdatedAtByWorkspace[workspaceId] = new Date(parsed).toISOString();
      }
    }

    return {
      schemaVersion: 1,
      drafts,
      chats,
      draftWorkspaceById,
      draftSnapshotUpdatedAtByWorkspace,
      workpieceByWorkspace,
    };
  } catch {
    return fallback;
  }
}

function writeCache(cache: TongsCacheV1): void {
  try {
    localStorage.setItem(TONGS_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

function resolveWorkspaceId(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const queryCandidate =
      params.get("workspace_id") ?? params.get("workspaceId") ?? params.get("workspace");
    const fromQuery = normalizeUuid(queryCandidate);
    if (fromQuery) return fromQuery;
  } catch {
    // ignore
  }

  try {
    const w = window as ForgeWindow;
    const fromWindow = normalizeUuid(
      w.__forgeWorkspaceId ?? w.__tpWorkspaceId ?? w.__forgeWorkspace ?? w.__tpWorkspace,
    );
    if (fromWindow) return fromWindow;
  } catch {
    // ignore
  }

  const fromForge = normalizeUuid(readLocalStorage("forge_workspace_id_v1"));
  if (fromForge) return fromForge;
  return normalizeUuid(readLocalStorage("barstock_workspace_id"));
}

function resolveLane(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = readString(params.get("forge_lane") ?? params.get("lane"));
    if (fromQuery) return fromQuery;
  } catch {
    // ignore
  }

  try {
    const w = window as ForgeWindow;
    const fromWindow = readString(w.__forgeLane ?? w.__tpLane);
    if (fromWindow) return fromWindow;
  } catch {
    // ignore
  }

  return readLocalStorage("forge_lane_v1") ?? "forge-managed";
}

function resolveToolVersion(): string {
  try {
    const w = window as ForgeWindow;
    const fromWindow = readString(w.APP_VERSION);
    if (fromWindow) return fromWindow;
  } catch {
    // ignore
  }
  return "0.0.0";
}

function buildWrittenBy(): WrittenBy {
  return {
    tool: "hearth",
    tool_version: resolveToolVersion(),
    lane: resolveLane(),
  };
}

function nextCorrelationId(prefix: string): string {
  correlationSeq += 1;
  return `${prefix}:${Date.now().toString(36)}:${correlationSeq}`;
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function readJsonFromTongs(url: string): Promise<
  { ok: true; data: unknown | null; fileUpdatedAt: string | null } | { ok: false; status?: number; reason: string }
> {
  const response = await tongsFetch(url);
  if (response.status === 404) {
    const body = await readJsonBody(response);
    if (
      body
      && typeof body === "object"
      && (body as { ok?: boolean }).ok === true
      && (body as { exists?: boolean }).exists === false
    ) {
      return { ok: true, data: null, fileUpdatedAt: null };
    }
    return { ok: false, status: 404, reason: "not_found" };
  }

  if (!response.ok) {
    return { ok: false, status: response.status, reason: "request_failed" };
  }

  const body = await readJsonBody(response);
  if (!body || typeof body !== "object" || (body as { ok?: boolean }).ok !== true) {
    return { ok: false, status: response.status, reason: "invalid_response" };
  }

  return {
    ok: true,
    data: (body as { data?: unknown }).data ?? null,
    fileUpdatedAt: readString(
      (body as { file_row?: { updated_at?: unknown } })?.file_row?.updated_at,
    ) ?? readString(
      (body as { data?: { file_row?: { updated_at?: unknown } } })?.data?.file_row?.updated_at,
    ),
  };
}

function isCommitAck(body: unknown): boolean {
  const row = body as {
    ok?: unknown;
    success?: unknown;
    error?: unknown;
    data?: {
      ok?: unknown;
      success?: unknown;
    };
  };

  if (row?.error) return false;

  return row?.ok === true
    || row?.success === true
    || row?.data?.ok === true
    || row?.data?.success === true;
}

async function commitDraftSnapshot(
  workpieceId: string,
  snapshot: {
    schemaVersion: 1;
    workspaceId: string;
    updatedAt: string;
    drafts: Draft[];
  },
  writtenBy: WrittenBy,
  options?: { expectedPreviousUpdatedAt?: string; reason?: string },
): Promise<
  | { ok: true; fileUpdatedAt: string }
  | { ok: false; status: number; reason: "request_failed" | "conflict" | "invalid_response"; details?: CommitConflictDetails }
> {
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/commit-file`, {
    method: "POST",
    json: {
      path: TONGS_DRAFT_SNAPSHOT_PATH,
      content_type: "application/json",
      json: snapshot,
      written_by: writtenBy,
      ...(options?.expectedPreviousUpdatedAt
        ? { expected_previous_updated_at: options.expectedPreviousUpdatedAt }
        : {}),
      event_name: "hearth.drafts.snapshot.v1",
      event_payload: {
        schemaVersion: 1,
        count: snapshot.drafts.length,
        updatedAt: snapshot.updatedAt,
        reason: readString(options?.reason) ?? "manual",
      },
      correlation_id: nextCorrelationId("hearth-drafts-commit"),
    },
  });

  const body = await readJsonBody(response);
  if (!response.ok) {
    const errorBody = body as {
      error?: {
        code?: unknown;
        details?: unknown;
      };
    } | null;
    if (response.status === 409 && errorBody?.error?.code === "file_conflict") {
      const detailsRaw = errorBody.error.details;
      const details: CommitConflictDetails | undefined = detailsRaw && typeof detailsRaw === "object"
        ? {
          path: readString((detailsRaw as Record<string, unknown>).path) ?? TONGS_DRAFT_SNAPSHOT_PATH,
          expected_previous_updated_at: readString(
            (detailsRaw as Record<string, unknown>).expected_previous_updated_at,
          ),
          current_updated_at: readString((detailsRaw as Record<string, unknown>).current_updated_at),
        }
        : undefined;
      return { ok: false, status: 409, reason: "conflict", details };
    }
    return { ok: false, status: response.status, reason: "request_failed" };
  }
  if (!isCommitAck(body)) {
    return { ok: false, status: response.status, reason: "invalid_response" };
  }
  const fileUpdatedAt = readString(
    (body as { data?: { file_row?: { updated_at?: unknown } } })?.data?.file_row?.updated_at,
  );
  if (!fileUpdatedAt) {
    return { ok: false, status: response.status, reason: "invalid_response" };
  }
  return { ok: true, fileUpdatedAt };
}

function parseDraftSnapshot(data: unknown): { drafts: Draft[]; updatedAt: string | null } | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const row = data as {
    schemaVersion?: unknown;
    drafts?: unknown;
    updatedAt?: unknown;
  };

  if (typeof row.schemaVersion !== "undefined" && row.schemaVersion !== 1) {
    return null;
  }

  const draftsRaw = Array.isArray(row.drafts) ? row.drafts : [];
  const drafts: Draft[] = draftsRaw
    .map((entry) => normalizeDraft(entry))
    .filter((entry): entry is Draft => Boolean(entry));

  const updatedAt = readString(row.updatedAt);
  const normalizedUpdatedAt = updatedAt && Number.isFinite(Date.parse(updatedAt))
    ? new Date(Date.parse(updatedAt)).toISOString()
    : null;

  return {
    drafts,
    updatedAt: normalizedUpdatedAt,
  };
}

async function readDraftSnapshot(
  workpieceId: string,
): Promise<{ drafts: Draft[]; updatedAt: string | null; fileUpdatedAt: string | null } | null> {
  const url = `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(
    TONGS_DRAFT_SNAPSHOT_PATH,
  )}`;
  const result = await readJsonFromTongs(url);
  if (!result.ok) return null;
  if (result.data == null) {
    return { drafts: [], updatedAt: null, fileUpdatedAt: result.fileUpdatedAt };
  }
  const parsed = parseDraftSnapshot(result.data);
  if (!parsed) return null;
  return {
    ...parsed,
    fileUpdatedAt: result.fileUpdatedAt,
  };
}

function sortRevisionEntriesDesc(entries: readonly HearthRevisionEntry[]): HearthRevisionEntry[] {
  return entries
    .slice()
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

function buildNormalizedRevisionSnapshot(
  workpieceId: string,
  revisions: readonly HearthRevisionEntry[],
): HearthRevisionSnapshot {
  const snapshot = normalizeRevisionSnapshot(workpieceId, {
    schema_version: 1,
    workpiece_id: workpieceId,
    updated_at: new Date().toISOString(),
    revisions: applyRevisionCap(sortRevisionEntriesDesc(revisions)),
  });
  if (!snapshot) {
    throw new Error("invalid_revision_snapshot");
  }
  return snapshot;
}

function normalizeRevisionEntryForWorkpiece(
  workpieceId: string,
  entry: HearthRevisionEntry,
): HearthRevisionEntry | null {
  return normalizeRevisionSnapshot(workpieceId, {
    ...createEmptyRevisionSnapshot(workpieceId),
    revisions: [entry],
  })?.revisions[0] ?? null;
}

function parseHearthRevisionSnapshot(
  workpieceId: string,
  data: unknown,
): HearthRevisionSnapshot | null {
  return normalizeRevisionSnapshot(workpieceId, data);
}

async function readHearthRevisionSnapshotFromTongs(
  workpieceId: string,
): Promise<{ snapshot: HearthRevisionSnapshot; fileUpdatedAt: string | null } | null> {
  const result = await readCanonicalHearthRevisionSnapshotFromTongs(workpieceId);
  return result.ok
    ? { snapshot: result.snapshot, fileUpdatedAt: result.fileUpdatedAt }
    : null;
}

async function readCanonicalHearthRevisionSnapshotFromTongs(
  workpieceId: string,
): Promise<
  | { ok: true; snapshot: HearthRevisionSnapshot; fileUpdatedAt: string | null }
  | { ok: false; reason: "not_found" | "request_failed" | "invalid_response"; status: number | null }
> {
  const url = `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(
    HEARTH_REVISIONS_PATH,
  )}`;
  const result = await readJsonFromTongs(url);
  if (!result.ok) {
    const reason = result.reason === "not_found" || result.reason === "invalid_response"
      ? result.reason
      : "request_failed";
    return { ok: false, reason, status: result.status ?? null };
  }
  if (result.data == null) {
    return {
      ok: true,
      snapshot: createEmptyRevisionSnapshot(workpieceId),
      fileUpdatedAt: result.fileUpdatedAt,
    };
  }
  const snapshot = parseHearthRevisionSnapshot(workpieceId, result.data);
  if (!snapshot) return { ok: false, reason: "invalid_response", status: 200 };
  return {
    ok: true,
    snapshot,
    fileUpdatedAt: result.fileUpdatedAt,
  };
}

async function commitHearthRevisionSnapshot(
  workpieceId: string,
  snapshot: HearthRevisionSnapshot,
  writtenBy: WrittenBy,
  options?: { expectedPreviousUpdatedAt?: string; reason?: string },
): Promise<
  | { ok: true; fileUpdatedAt: string }
  | { ok: false; status: number; reason: "request_failed" | "conflict" | "invalid_response"; details?: CommitConflictDetails }
> {
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/commit-file`, {
    method: "POST",
    json: {
      path: HEARTH_REVISIONS_PATH,
      content_type: "application/json",
      json: snapshot,
      written_by: writtenBy,
      ...(options?.expectedPreviousUpdatedAt
        ? { expected_previous_updated_at: options.expectedPreviousUpdatedAt }
        : {}),
      event_name: "hearth.revisions.snapshot.v1",
      event_payload: {
        schema_version: snapshot.schema_version,
        count: snapshot.revisions.length,
        updated_at: snapshot.updated_at,
        reason: readString(options?.reason) ?? "manual",
      },
      correlation_id: nextCorrelationId("hearth-revisions-commit"),
    },
  });

  const body = await readJsonBody(response);
  if (!response.ok) {
    const errorBody = body as {
      error?: {
        code?: unknown;
        details?: unknown;
      };
    } | null;
    if (response.status === 409 && errorBody?.error?.code === "file_conflict") {
      const detailsRaw = errorBody.error.details;
      const details: CommitConflictDetails | undefined = detailsRaw && typeof detailsRaw === "object"
        ? {
          path: readString((detailsRaw as Record<string, unknown>).path) ?? HEARTH_REVISIONS_PATH,
          expected_previous_updated_at: readString(
            (detailsRaw as Record<string, unknown>).expected_previous_updated_at,
          ),
          current_updated_at: readString((detailsRaw as Record<string, unknown>).current_updated_at),
        }
        : undefined;
      return { ok: false, status: 409, reason: "conflict", details };
    }
    return { ok: false, status: response.status, reason: "request_failed" };
  }

  if (!isCommitAck(body)) {
    return { ok: false, status: response.status, reason: "invalid_response" };
  }

  const fileUpdatedAt = readString(
    (body as { data?: { file_row?: { updated_at?: unknown } } })?.data?.file_row?.updated_at,
  );
  if (!fileUpdatedAt) {
    return { ok: false, status: response.status, reason: "invalid_response" };
  }
  return { ok: true, fileUpdatedAt };
}

function buildChatSnapshot(cache: TongsCacheV1, workspaceId: string, draftId: string): {
  schema: "hearth.chat.v1";
  updatedAt: number;
  chats: Record<string, ChatSnapshotEntry>;
} {
  const chats: Record<string, ChatSnapshotEntry> = {};
  const entry = cache.chats[draftId];
  if (entry && cache.draftWorkspaceById[draftId] === workspaceId) {
    chats[draftId] = {
      draftId: entry.draftId,
      updatedAt: entry.updatedAt,
      messages: sanitizeChatMessages(entry.messages),
    };
  }

  return {
    schema: "hearth.chat.v1",
    updatedAt: Date.now(),
    chats,
  };
}

async function commitChatSnapshot(
  workpieceId: string,
  snapshot: {
    schema: "hearth.chat.v1";
    updatedAt: number;
    chats: Record<string, ChatSnapshotEntry>;
  },
  writtenBy: WrittenBy,
): Promise<{ ok: true } | { ok: false; status: number }> {
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/commit-file`, {
    method: "POST",
    json: {
      path: TONGS_CHAT_SNAPSHOT_PATH,
      content_type: "application/json",
      json: snapshot,
      written_by: writtenBy,
      event_name: "hearth.chat.snapshot.v1",
      event_payload: {
        schema: snapshot.schema,
        count: Object.keys(snapshot.chats).length,
        updatedAt: snapshot.updatedAt,
      },
      correlation_id: nextCorrelationId("hearth-chat-commit"),
    },
  });

  const body = await readJsonBody(response);
  if (!response.ok || !isCommitAck(body)) {
    return { ok: false, status: response.status };
  }
  return { ok: true };
}

function parseChatSnapshot(data: unknown): Record<string, ChatSnapshotEntry> | null {
  if (!data || typeof data !== "object") return null;
  const row = data as { schema?: unknown; chats?: unknown };
  const schema = readString(row.schema);
  if (schema && schema !== "hearth.chat.v1") return null;
  const chatsIn = row.chats;
  if (!chatsIn || typeof chatsIn !== "object" || Array.isArray(chatsIn)) return {};

  const out: Record<string, ChatSnapshotEntry> = {};
  for (const [draftIdRaw, entry] of Object.entries(chatsIn as Record<string, unknown>)) {
    const draftId = readString(draftIdRaw);
    if (!draftId) continue;
    const normalized = normalizeChatSnapshotEntry(draftId, entry);
    if (normalized) {
      out[normalized.draftId] = normalized;
    }
  }
  return out;
}

async function readChatSnapshot(
  workpieceId: string,
): Promise<Record<string, ChatSnapshotEntry> | null> {
  const url = `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(
    TONGS_CHAT_SNAPSHOT_PATH,
  )}`;
  const result = await readJsonFromTongs(url);
  if (!result.ok) return null;
  if (result.data == null) return {};
  return parseChatSnapshot(result.data);
}

function syncCachedWorkpieceId(workspaceId: string, workpieceId: string, cache: TongsCacheV1): string {
  if (cache.workpieceByWorkspace[workspaceId] === workpieceId) {
    return workpieceId;
  }
  cache.workpieceByWorkspace[workspaceId] = workpieceId;
  delete cache.draftSnapshotUpdatedAtByWorkspace[workspaceId];
  writeCache(cache);
  return workpieceId;
}

function resolveCachedWorkpieceId(workspaceId: string, cache: TongsCacheV1): string | null {
  const fromScopedKey =
    normalizeUuid(readLocalStorage(`${TONGS_WORKPIECE_BY_WORKSPACE_PREFIX}${workspaceId}`))
    ?? normalizeUuid(readLocalStorage(`${LEGACY_TONGS_WORKPIECE_BY_WORKSPACE_PREFIX}${workspaceId}`));
  if (fromScopedKey) {
    return syncCachedWorkpieceId(workspaceId, fromScopedKey, cache);
  }

  const fromGlobal = normalizeUuid(readLocalStorage(TONGS_WORKPIECE_KEY))
    ?? normalizeUuid(readLocalStorage(LEGACY_TONGS_WORKPIECE_KEY));
  if (fromGlobal) {
    return syncCachedWorkpieceId(workspaceId, fromGlobal, cache);
  }

  const fromMap = normalizeUuid(cache.workpieceByWorkspace[workspaceId]);
  if (fromMap) return fromMap;
  return null;
}

function persistWorkpieceId(workspaceId: string, workpieceId: string, cache: TongsCacheV1): void {
  cache.workpieceByWorkspace[workspaceId] = workpieceId;
  writeCache(cache);
  writeLocalStorage(TONGS_WORKPIECE_KEY, workpieceId);
  writeLocalStorage(`${TONGS_WORKPIECE_BY_WORKSPACE_PREFIX}${workspaceId}`, workpieceId);
}

function readDrafts(cache: TongsCacheV1, workspaceId?: string | null): Draft[] {
  const values = Object.values(cache.drafts).filter((draft) => {
    if (!workspaceId) return true;
    return cache.draftWorkspaceById[draft.id] === workspaceId;
  });
  return values
    .map(cloneDraft)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function readChatMessages(cache: TongsCacheV1, draftId: string, workspaceId?: string | null): HearthChatMessage[] {
  if (workspaceId && cache.draftWorkspaceById[draftId] !== workspaceId) return [];
  const entry = cache.chats[draftId];
  if (!entry) return [];
  return sanitizeChatMessages(entry.messages);
}

function readDraftSnapshotUpdatedAt(cache: TongsCacheV1, workspaceId: string): string | null {
  return readString(cache.draftSnapshotUpdatedAtByWorkspace[workspaceId]) ?? null;
}

function writeDraftSnapshotUpdatedAt(cache: TongsCacheV1, workspaceId: string, updatedAt: string | null): void {
  if (!updatedAt) {
    delete cache.draftSnapshotUpdatedAtByWorkspace[workspaceId];
    return;
  }
  cache.draftSnapshotUpdatedAtByWorkspace[workspaceId] = updatedAt;
}

function migrateLegacyDraftWorkspaceIds(cache: TongsCacheV1, workspaceId: string): boolean {
  const hasAnyMappedForWorkspace = Object.values(cache.draftWorkspaceById)
    .some((value) => value === workspaceId);
  if (hasAnyMappedForWorkspace) return false;

  let changed = false;
  for (const draftId of Object.keys(cache.drafts)) {
    if (cache.draftWorkspaceById[draftId]) continue;
    cache.draftWorkspaceById[draftId] = workspaceId;
    changed = true;
  }
  for (const draftId of Object.keys(cache.chats)) {
    if (cache.draftWorkspaceById[draftId]) continue;
    cache.draftWorkspaceById[draftId] = workspaceId;
    changed = true;
  }
  return changed;
}

function createDraftConflictError(details?: CommitConflictDetails): Error {
  const error = new Error("Draft changed on another client");
  (error as Error & { code?: string; details?: CommitConflictDetails }).code = "draft_conflict";
  (error as Error & { code?: string; details?: CommitConflictDetails }).details = details;
  return error;
}

export class TongsHearthStore implements HearthStore {
  async listDrafts(): Promise<Draft[]> {
    const cache = readCache();
    const workspaceId = resolveWorkspaceId();
    if (workspaceId) {
      await this.hydrateWorkspaceDrafts(cache, workspaceId);
    }
    if (workspaceId && migrateLegacyDraftWorkspaceIds(cache, workspaceId)) {
      writeCache(cache);
    }
    return readDrafts(cache, workspaceId);
  }

  async listWorkpieceDrafts(workpieceId: string): Promise<Draft[]> {
    const normalizedWorkpieceId = normalizeUuid(workpieceId);
    if (!normalizedWorkpieceId) return [];

    const cache = readCache();
    const workspaceId = resolveWorkspaceId();
    const remote = await readDraftSnapshot(normalizedWorkpieceId);
    if (remote) {
      if (workspaceId) {
        persistWorkpieceId(workspaceId, normalizedWorkpieceId, cache);
        writeDraftSnapshotUpdatedAt(cache, workspaceId, remote.fileUpdatedAt ?? remote.updatedAt);
      }
      for (const draft of remote.drafts) {
        cache.drafts[draft.id] = draft;
        if (workspaceId) {
          cache.draftWorkspaceById[draft.id] = workspaceId;
        }
      }
      writeCache(cache);
      return remote.drafts
        .map(cloneDraft)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    }

    const cachedDrafts = workspaceId
      ? readDrafts(cache, workspaceId)
      : Object.values(cache.drafts).map(cloneDraft);
    return cachedDrafts
      .filter((draft) => draft.id === normalizedWorkpieceId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getDraft(id: DraftId): Promise<Draft | null> {
    const cache = readCache();
    const workspaceId = resolveWorkspaceId();
    if (workspaceId) {
      await this.hydrateWorkspaceDrafts(cache, workspaceId);
    }
    const found = cache.drafts[id];
    if (!found) return null;
    if (workspaceId && cache.draftWorkspaceById[id] !== workspaceId) {
      return null;
    }
    return found ? cloneDraft(found) : null;
  }

  async saveDraft(draft: Draft, options?: SaveDraftOptions): Promise<HearthDraftSaveAcknowledgement> {
    const normalized = normalizeDraft(draft);
    if (!normalized) {
      throw new Error("Invalid draft payload");
    }

    const cache = readCache();
    const workspaceId = resolveWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspace");
    }
    cache.drafts[normalized.id] = cloneDraft(normalized);
    cache.draftWorkspaceById[normalized.id] = workspaceId;
    writeCache(cache);
    try {
      return await this.syncDraftsToTongs(cache, workspaceId, options?.reason, normalized.id);
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code === "draft_conflict") throw error;
      return {
        ok: false,
        kind: "recovery_only",
        authority: "browser_cache",
        artifact: "draft_snapshot",
        reason: "canonical_request_failed",
        status: null,
      };
    }
  }

  async deleteDraft(id: DraftId): Promise<void> {
    const cache = readCache();
    const workspaceId = resolveWorkspaceId();
    if (!workspaceId) return;
    if (!cache.drafts[id]) return;
    if (cache.draftWorkspaceById[id] !== workspaceId) return;
    delete cache.drafts[id];
    delete cache.chats[id];
    delete cache.draftWorkspaceById[id];
    writeCache(cache);
    await this.syncDraftsToTongs(cache, workspaceId, undefined, id);
    await this.syncChatsToTongs(cache, workspaceId, id);
  }

  async getChatHistory(draftId: DraftId, explicitWorkpieceId?: string | null): Promise<HearthChatMessage[]> {
    const id = typeof draftId === "string" ? draftId.trim() : "";
    if (!id) return [];

    const cache = readCache();
    const workspaceId = resolveWorkspaceId();
    if (!workspaceId) return [];
    if (cache.draftWorkspaceById[id] !== workspaceId) return [];
    if (workspaceId) {
      const workpieceId = normalizeUuid(explicitWorkpieceId) ?? resolveCachedWorkpieceId(workspaceId, cache);
      if (workpieceId) {
        const canonical = await readCanonicalHearthConversation(workspaceId, workpieceId);
        if (canonical.ok && canonical.data) {
          canonicalChatGenerationByWorkpiece.set(workpieceId, canonical.data.generation);
          canonicalChatCompletenessByWorkpiece.set(workpieceId, canonical.data.completeness);
          return canonical.data.messages;
        }
        if (!canonical.ok && canonical.status !== 404) {
          throw new Error(`canonical_chat_read_failed:${canonical.status}`);
        }
      }
      if (workpieceId && !loadedChatSnapshotByWorkpiece.has(workpieceId)) {
        const remoteChats = await readChatSnapshot(workpieceId);
        if (remoteChats != null) {
          for (const [remoteDraftId, remoteEntry] of Object.entries(remoteChats)) {
            cache.chats[remoteDraftId] = remoteEntry;
            cache.draftWorkspaceById[remoteDraftId] = workspaceId;
          }
          writeCache(cache);
          loadedChatSnapshotByWorkpiece.add(workpieceId);
        }
      }
    }

    const legacyMessages = readChatMessages(cache, id, workspaceId);
    const workpieceId = normalizeUuid(explicitWorkpieceId) ?? resolveCachedWorkpieceId(workspaceId, cache);
    if (workpieceId && legacyMessages.length > 0) {
      const knownTruncated = legacyMessages.length >= MAX_CHAT_MESSAGES
        || legacyMessages.some((message) => message.content.includes(CHAT_TRUNCATED_SUFFIX));
      canonicalChatCompletenessByWorkpiece.set(workpieceId, knownTruncated ? "known_truncated" : "legacy_completeness_unknown");
      const imported = await appendCanonicalHearthConversation({
        workspaceId,
        workpieceId,
        generation: 1,
        messages: legacyMessages,
        importCompleteness: knownTruncated ? "known_truncated" : "legacy_completeness_unknown",
      });
      if (imported.ok) canonicalChatGenerationByWorkpiece.set(workpieceId, imported.data.generation ?? 1);
    }
    return legacyMessages;
  }

  async saveChatHistory(draftId: DraftId, messages: HearthChatMessage[], explicitWorkpieceId?: string | null): Promise<void> {
    const id = typeof draftId === "string" ? draftId.trim() : "";
    if (!id) return;

    const cache = readCache();
    const workspaceId = resolveWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspace");
    }
    if (cache.draftWorkspaceById[id] && cache.draftWorkspaceById[id] !== workspaceId) {
      return;
    }
    cache.draftWorkspaceById[id] = workspaceId;
    const canonicalMessages = messages.filter((message) => (
      (message.role === "user" || message.role === "assistant") && Boolean(message.content.trim())
    ));
    const sanitized = sanitizeChatMessages(canonicalMessages);
    if (sanitized.length === 0) {
      if (cache.chats[id]) {
        delete cache.chats[id];
      }
    } else {
      cache.chats[id] = {
        draftId: id,
        updatedAt: Date.now(),
        messages: sanitized,
      };
    }
    writeCache(cache);
    const workpieceId = normalizeUuid(explicitWorkpieceId) ?? resolveCachedWorkpieceId(workspaceId, cache);
    if (!workpieceId) throw new Error("canonical_chat_workpiece_required");
    const generation = canonicalChatGenerationByWorkpiece.get(workpieceId) ?? 1;
    if (canonicalMessages.length === 0) {
      const cleared = await clearCanonicalHearthConversation(workspaceId, workpieceId, generation);
      if (!cleared.ok) throw new Error(`canonical_chat_clear_failed:${cleared.status}`);
      if (cleared.data.status === "generation_conflict") throw new Error("canonical_chat_generation_conflict");
      canonicalChatGenerationByWorkpiece.set(workpieceId, cleared.data.generation ?? generation);
    } else {
      const appended = await appendCanonicalHearthConversation({ workspaceId, workpieceId, generation, messages: canonicalMessages });
      if (!appended.ok) throw new Error(`canonical_chat_append_failed:${appended.status}`);
      if (appended.data.status === "generation_conflict") throw new Error("canonical_chat_generation_conflict");
      canonicalChatGenerationByWorkpiece.set(workpieceId, appended.data.generation ?? generation);
    }
    // Keep the bounded snapshot temporarily for rollback/read compatibility.
    await this.syncChatsToTongs(cache, workspaceId, id, workpieceId);
  }

  getChatHistoryCompleteness(workpieceId: string | null): "complete" | "legacy_completeness_unknown" | "known_truncated" {
    const normalized = normalizeUuid(workpieceId);
    return normalized ? canonicalChatCompletenessByWorkpiece.get(normalized) ?? "complete" : "legacy_completeness_unknown";
  }

  async getHearthRevisionSnapshot(workpieceId: string): Promise<HearthRevisionSnapshot | null> {
    const normalizedWorkpieceId = normalizeUuid(workpieceId);
    if (!normalizedWorkpieceId) return null;

    const remote = await readHearthRevisionSnapshotFromTongs(normalizedWorkpieceId);
    if (remote) {
      saveRevisionSnapshotFallback(normalizedWorkpieceId, remote.snapshot);
      return remote.snapshot;
    }

    return loadRevisionSnapshotFallback(normalizedWorkpieceId);
  }

  async saveHearthRevisionSnapshot(
    workpieceId: string,
    snapshot: HearthRevisionSnapshot,
  ): Promise<void> {
    const normalizedWorkpieceId = normalizeUuid(workpieceId);
    if (!normalizedWorkpieceId) {
      throw new Error("missing_workpiece");
    }

    const normalizedSnapshot = normalizeRevisionSnapshot(normalizedWorkpieceId, snapshot);
    if (!normalizedSnapshot) {
      throw new Error("invalid_revision_snapshot");
    }

    await this.replaceHearthRevisionHistory(normalizedWorkpieceId, normalizedSnapshot.revisions);
  }

  async appendHearthRevisionEntry(
    workpieceId: string,
    entry: HearthRevisionEntry,
  ): Promise<{ snapshot: HearthRevisionSnapshot; fileUpdatedAt: string }> {
    const normalizedWorkpieceId = normalizeUuid(workpieceId);
    if (!normalizedWorkpieceId) {
      throw new Error("missing_workpiece");
    }

    const normalizedEntry = normalizeRevisionEntryForWorkpiece(normalizedWorkpieceId, entry);
    if (!normalizedEntry) {
      throw new Error("invalid_revision_entry");
    }

    const remote = await readHearthRevisionSnapshotFromTongs(normalizedWorkpieceId);
    if (!remote) {
      const fallbackBase = loadRevisionSnapshotFallback(normalizedWorkpieceId)
        ?? createEmptyRevisionSnapshot(normalizedWorkpieceId);
      const fallbackSnapshot = buildNormalizedRevisionSnapshot(
        normalizedWorkpieceId,
        [...fallbackBase.revisions.filter((item) => item.id !== normalizedEntry.id), normalizedEntry],
      );
      saveRevisionSnapshotFallback(normalizedWorkpieceId, fallbackSnapshot);
      throw new Error("revision_snapshot_sync_failed");
    }

    const writtenBy = buildWrittenBy();
    let nextSnapshot = buildNormalizedRevisionSnapshot(
      normalizedWorkpieceId,
      [...remote.snapshot.revisions.filter((item) => item.id !== normalizedEntry.id), normalizedEntry],
    );

    const firstTry = await commitHearthRevisionSnapshot(
      normalizedWorkpieceId,
      nextSnapshot,
      writtenBy,
      { expectedPreviousUpdatedAt: remote.fileUpdatedAt ?? undefined, reason: "append" },
    );

    if (firstTry.ok) {
      saveRevisionSnapshotFallback(normalizedWorkpieceId, nextSnapshot);
      return { snapshot: nextSnapshot, fileUpdatedAt: firstTry.fileUpdatedAt };
    }

    if (firstTry.reason === "conflict") {
      const latest = await readHearthRevisionSnapshotFromTongs(normalizedWorkpieceId);
      if (latest) {
        nextSnapshot = buildNormalizedRevisionSnapshot(
          normalizedWorkpieceId,
          [...latest.snapshot.revisions.filter((item) => item.id !== normalizedEntry.id), normalizedEntry],
        );

        const secondTry = await commitHearthRevisionSnapshot(
          normalizedWorkpieceId,
          nextSnapshot,
          writtenBy,
          { expectedPreviousUpdatedAt: latest.fileUpdatedAt ?? undefined, reason: "append_retry" },
        );

        if (secondTry.ok) {
          saveRevisionSnapshotFallback(normalizedWorkpieceId, nextSnapshot);
          return { snapshot: nextSnapshot, fileUpdatedAt: secondTry.fileUpdatedAt };
        }
      }
    }

    saveRevisionSnapshotFallback(normalizedWorkpieceId, nextSnapshot);
    throw new Error("revision_snapshot_sync_failed");
  }

  async replaceHearthRevisionHistory(
    workpieceId: string,
    revisions: HearthRevisionEntry[],
  ): Promise<HearthRevisionSnapshot> {
    const normalizedWorkpieceId = normalizeUuid(workpieceId);
    if (!normalizedWorkpieceId) {
      throw new Error("missing_workpiece");
    }

    const normalizedSnapshot = buildNormalizedRevisionSnapshot(normalizedWorkpieceId, revisions);
    const remote = await readHearthRevisionSnapshotFromTongs(normalizedWorkpieceId);
    if (!remote) {
      saveRevisionSnapshotFallback(normalizedWorkpieceId, normalizedSnapshot);
      throw new Error("revision_snapshot_sync_failed");
    }

    const writtenBy = buildWrittenBy();
    const firstTry = await commitHearthRevisionSnapshot(
      normalizedWorkpieceId,
      normalizedSnapshot,
      writtenBy,
      { expectedPreviousUpdatedAt: remote.fileUpdatedAt ?? undefined, reason: "replace" },
    );

    if (firstTry.ok) {
      saveRevisionSnapshotFallback(normalizedWorkpieceId, normalizedSnapshot);
      return normalizedSnapshot;
    }

    if (firstTry.reason === "conflict") {
      const latest = await readHearthRevisionSnapshotFromTongs(normalizedWorkpieceId);
      if (latest) {
        const mergedById = new Map<string, HearthRevisionEntry>();
        for (const entry of latest.snapshot.revisions) {
          mergedById.set(entry.id, entry);
        }
        for (const entry of normalizedSnapshot.revisions) {
          mergedById.set(entry.id, entry);
        }

        const mergedSnapshot = buildNormalizedRevisionSnapshot(
          normalizedWorkpieceId,
          Array.from(mergedById.values()),
        );

        const secondTry = await commitHearthRevisionSnapshot(
          normalizedWorkpieceId,
          mergedSnapshot,
          writtenBy,
          { expectedPreviousUpdatedAt: latest.fileUpdatedAt ?? undefined, reason: "replace_retry" },
        );

        if (secondTry.ok) {
          saveRevisionSnapshotFallback(normalizedWorkpieceId, mergedSnapshot);
          return mergedSnapshot;
        }

        saveRevisionSnapshotFallback(normalizedWorkpieceId, mergedSnapshot);
        throw new Error("revision_snapshot_sync_failed");
      }
    }

    saveRevisionSnapshotFallback(normalizedWorkpieceId, normalizedSnapshot);
    throw new Error("revision_snapshot_sync_failed");
  }

  async listRevisions(workpieceId: string, draftId?: DraftId | null): Promise<Revision[]> {
    const snapshot = await this.getHearthRevisionSnapshot(workpieceId);
    if (!snapshot) return [];

    let revisions = snapshot.revisions.map((entry) => entryToRevision(entry));
    if (draftId?.trim()) {
      revisions = revisions.filter((revision) => revision.draftId === draftId);
    }

    return revisions
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(cloneRevision);
  }

  async readCanonicalRevisions(
    workpieceId: string,
    draftId?: DraftId | null,
  ): Promise<HearthCanonicalRevisionsResult> {
    const normalizedWorkpieceId = normalizeUuid(workpieceId);
    if (!normalizedWorkpieceId) {
      return {
        ok: false,
        kind: "unavailable",
        authority: "none",
        reason: "not_found",
        status: null,
      };
    }
    let result: Awaited<ReturnType<typeof readCanonicalHearthRevisionSnapshotFromTongs>>;
    try {
      result = await readCanonicalHearthRevisionSnapshotFromTongs(normalizedWorkpieceId);
    } catch {
      return {
        ok: false,
        kind: "unavailable",
        authority: "none",
        reason: "request_failed",
        status: null,
      };
    }
    if (!result.ok) {
      return {
        ok: false,
        kind: "unavailable",
        authority: "none",
        reason: result.reason,
        status: result.status,
      };
    }
    let revisions = result.snapshot.revisions.map((entry) => entryToRevision(entry));
    if (draftId?.trim()) {
      revisions = revisions.filter((revision) => revision.draftId === draftId);
    }
    return {
      ok: true,
      kind: "canonical",
      authority: "tongs",
      workpieceId: normalizedWorkpieceId,
      fileUpdatedAt: result.fileUpdatedAt,
      revisions: revisions.sort((a, b) => b.createdAt - a.createdAt).map(cloneRevision),
    };
  }

  async getRevision(workpieceId: string, id: RevisionId): Promise<Revision | null> {
    const revisionId = typeof id === "string" ? id.trim() : "";
    if (!revisionId) return null;

    const snapshot = await this.getHearthRevisionSnapshot(workpieceId);
    if (!snapshot) return null;

    const entry = snapshot.revisions.find((item) => item.id === revisionId);
    if (!entry) return null;

    return cloneRevision(entryToRevision(entry));
  }

  async saveRevision(workpieceId: string, revision: Revision): Promise<HearthRevisionSaveAcknowledgement> {
    const normalized = normalizeRevision(revision);
    if (!normalized) {
      throw new Error("Invalid revision payload");
    }

    try {
      const committed = await this.appendHearthRevisionEntry(workpieceId, revisionToEntry(normalized));
      return {
        ok: true,
        kind: "canonical",
        authority: "tongs",
        artifact: "revision_snapshot",
        workpieceId,
        committedAt: committed.fileUpdatedAt,
      };
    } catch {
      return {
        ok: false,
        kind: "recovery_only",
        authority: "browser_cache",
        artifact: "revision_snapshot",
        reason: "canonical_commit_failed",
      };
    }
  }

  async restoreRevision(workpieceId: string, id: RevisionId): Promise<{ title: string; body: string } | null> {
    const revision = await this.getRevision(workpieceId, id);
    if (!revision) return null;

    return {
      title: revision.titleSnapshot,
      body: revision.bodySnapshot,
    };
  }

  private async hydrateWorkspaceDrafts(cache: TongsCacheV1, workspaceId: string): Promise<void> {
    const workpieceId = resolveCachedWorkpieceId(workspaceId, cache);
    if (!workpieceId) return;
    const remote = await readDraftSnapshot(workpieceId);
    if (remote == null) return;
    writeDraftSnapshotUpdatedAt(cache, workspaceId, remote.fileUpdatedAt ?? remote.updatedAt);
    for (const draft of remote.drafts) {
      cache.drafts[draft.id] = draft;
      cache.draftWorkspaceById[draft.id] = workspaceId;
    }
    writeCache(cache);
  }

  private async syncDraftsToTongs(
    cache: TongsCacheV1,
    workspaceIdInput?: string | null,
    reason?: string,
    draftId?: string,
  ): Promise<HearthDraftSaveAcknowledgement> {
    const workspaceId = workspaceIdInput ?? resolveWorkspaceId();
    if (!workspaceId) {
      return {
        ok: false,
        kind: "recovery_only",
        authority: "browser_cache",
        artifact: "draft_snapshot",
        reason: "canonical_target_unavailable",
        status: null,
      };
    }

    const writtenBy = buildWrittenBy();
    const workpieceId = resolveCachedWorkpieceId(workspaceId, cache);
    if (!workpieceId) return {
      ok: false,
      kind: "recovery_only",
      authority: "browser_cache",
      artifact: "draft_snapshot",
      reason: "canonical_target_unavailable",
      status: null,
    };

    const drafts = draftId && cache.drafts[draftId] ? [cloneDraft(cache.drafts[draftId]!)] : [];
    const snapshot = {
      schemaVersion: 1 as const,
      workspaceId,
      updatedAt: new Date().toISOString(),
      drafts,
    };

    const expectedPreviousUpdatedAt = readDraftSnapshotUpdatedAt(cache, workspaceId) ?? undefined;
    const firstTry = await commitDraftSnapshot(workpieceId, snapshot, writtenBy, {
      expectedPreviousUpdatedAt,
      reason,
    });
    if (firstTry.ok) {
      writeDraftSnapshotUpdatedAt(cache, workspaceId, firstTry.fileUpdatedAt);
      writeCache(cache);
      return {
        ok: true,
        kind: "canonical",
        authority: "tongs",
        artifact: "draft_snapshot",
        workspaceId,
        workpieceId,
        committedAt: firstTry.fileUpdatedAt,
      };
    }
    if (firstTry.reason === "conflict") {
      throw createDraftConflictError(firstTry.details);
    }
    if (firstTry.status !== 404) {
      return {
        ok: false,
        kind: "recovery_only",
        authority: "browser_cache",
        artifact: "draft_snapshot",
        reason: firstTry.reason === "invalid_response"
          ? "canonical_response_invalid"
          : "canonical_commit_failed",
        status: firstTry.status,
      };
    }

    return {
      ok: false,
      kind: "recovery_only",
      authority: "browser_cache",
      artifact: "draft_snapshot",
      reason: "canonical_target_unavailable",
      status: 404,
    };
  }

  private async syncChatsToTongs(cache: TongsCacheV1, workspaceIdInput: string | null | undefined, draftId: string, explicitWorkpieceId?: string | null): Promise<void> {
    const workspaceId = workspaceIdInput ?? resolveWorkspaceId();
    if (!workspaceId) return;

    const writtenBy = buildWrittenBy();
    const workpieceId = normalizeUuid(explicitWorkpieceId) ?? resolveCachedWorkpieceId(workspaceId, cache);
    if (!workpieceId) throw new Error("canonical_chat_workpiece_required");

    const snapshot = buildChatSnapshot(cache, workspaceId, draftId);
    let firstTry: { ok: true } | { ok: false; status: number };
    try {
      firstTry = await commitChatSnapshot(workpieceId, snapshot, writtenBy);
    } catch (error) {
      console.warn("[hearth:tongs] chat snapshot sync request failed", error);
      throw error;
    }
    if (firstTry.ok) {
      loadedChatSnapshotByWorkpiece.add(workpieceId);
      return;
    }
    if (firstTry.status !== 404) {
      console.warn("[hearth:tongs] chat snapshot sync failed", {
        workspaceId,
        workpieceId,
        status: firstTry.status,
      });
      throw new Error(`canonical_chat_commit_failed:${firstTry.status}`);
    }

    throw new Error("canonical_chat_workpiece_not_found");
  }
}
