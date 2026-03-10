import type { Draft, DraftAttribution, DraftId } from "../domain/draft";
import type { Revision, RevisionId } from "../domain/revision";
import type { HearthChatMessage } from "../lib/hearth-chat-api";
import type { HearthStore, SaveDraftOptions } from "./hearth-store";
import { cloneRevision, normalizeRevision, readRevisionRecord, writeRevisionRecord } from "./revision-storage";
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
const MAX_REVISIONS_PER_DRAFT = 200;
const MAX_CHAT_MESSAGES = 200;
const MAX_CHAT_TOTAL_CHARS = 650_000;
const MAX_CHAT_ENTRY_CHARS = 24_000;
const CHAT_TRUNCATED_SUFFIX = "\n\n[truncated in local cache]";
const loadedChatSnapshotByWorkpiece = new Set<string>();

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
  { ok: true; data: unknown | null } | { ok: false; status?: number; reason: string }
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
      return { ok: true, data: null };
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

  return { ok: true, data: (body as { data?: unknown }).data ?? null };
}

function resolveCreatedWorkpieceId(body: unknown): string | null {
  const row = body as {
    data?: {
      cradle?: { id?: unknown };
      episode?: { id?: unknown };
      workpiece?: { id?: unknown };
      id?: unknown;
    };
    cradle?: { id?: unknown };
    episode?: { id?: unknown };
    workpiece?: { id?: unknown };
    id?: unknown;
  };

  return normalizeUuid(
    row?.data?.cradle?.id
      ?? row?.data?.episode?.id
      ?? row?.data?.workpiece?.id
      ?? row?.data?.id
      ?? row?.cradle?.id
      ?? row?.episode?.id
      ?? row?.workpiece?.id
      ?? row?.id,
  );
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

async function createCradle(workspaceId: string, writtenBy: WrittenBy): Promise<string | null> {
  const response = await tongsFetch("/tongs/cradles", {
    method: "POST",
    json: {
      workspace_id: workspaceId,
      written_by: writtenBy,
      origin_tool: {
        name: "hearth",
        version: writtenBy.tool_version,
      },
      metadata: {
        schema: "hearth.drafts.v1",
      },
      correlation_id: nextCorrelationId("hearth-create-cradle"),
    },
  });

  const body = await readJsonBody(response);
  const createdId = resolveCreatedWorkpieceId(body);
  if (!response.ok || !createdId) {
    return null;
  }
  return createdId;
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
  | { ok: true; fileUpdatedAt: string | null }
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
): Promise<{ drafts: Draft[]; updatedAt: string | null } | null> {
  const url = `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(
    TONGS_DRAFT_SNAPSHOT_PATH,
  )}`;
  const result = await readJsonFromTongs(url);
  if (!result.ok) return null;
  if (result.data == null) {
    return { drafts: [], updatedAt: null };
  }
  return parseDraftSnapshot(result.data);
}

function buildChatSnapshot(cache: TongsCacheV1, workspaceId: string): {
  schema: "hearth.chat.v1";
  updatedAt: number;
  chats: Record<string, ChatSnapshotEntry>;
} {
  const chats: Record<string, ChatSnapshotEntry> = {};
  for (const [draftId, entry] of Object.entries(cache.chats)) {
    if (cache.draftWorkspaceById[draftId] !== workspaceId) continue;
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

  async saveDraft(draft: Draft, options?: SaveDraftOptions): Promise<void> {
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
    await this.syncDraftsToTongs(cache, workspaceId, options?.reason);
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
    await this.syncDraftsToTongs(cache, workspaceId);
    await this.syncChatsToTongs(cache, workspaceId);
  }

  async getChatHistory(draftId: DraftId): Promise<HearthChatMessage[]> {
    const id = typeof draftId === "string" ? draftId.trim() : "";
    if (!id) return [];

    const cache = readCache();
    const workspaceId = resolveWorkspaceId();
    if (!workspaceId) return [];
    if (cache.draftWorkspaceById[id] !== workspaceId) return [];
    if (workspaceId) {
      const workpieceId = resolveCachedWorkpieceId(workspaceId, cache);
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

    return readChatMessages(cache, id, workspaceId);
  }

  async saveChatHistory(draftId: DraftId, messages: HearthChatMessage[]): Promise<void> {
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
    const sanitized = sanitizeChatMessages(messages);
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
    await this.syncChatsToTongs(cache, workspaceId);
  }

  async listRevisions(draftId: DraftId): Promise<Revision[]> {
    const record = readRevisionRecord();
    return Object.values(record)
      .filter((rev) => rev.draftId === draftId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(cloneRevision);
  }

  async getRevision(id: RevisionId): Promise<Revision | null> {
    const record = readRevisionRecord();
    const found = record[id];
    return found ? cloneRevision(found) : null;
  }

  async saveRevision(revision: Revision): Promise<void> {
    const normalized = normalizeRevision(revision);
    if (!normalized) {
      throw new Error("Invalid revision payload");
    }

    const record = readRevisionRecord();
    record[normalized.id] = cloneRevision(normalized);
    const byDraft = Object.values(record)
      .filter((rev) => rev.draftId === normalized.draftId)
      .sort((a, b) => b.createdAt - a.createdAt);
    if (byDraft.length > MAX_REVISIONS_PER_DRAFT) {
      for (const stale of byDraft.slice(MAX_REVISIONS_PER_DRAFT)) {
        delete record[stale.id];
      }
    }
    writeRevisionRecord(record);
  }

  async restoreRevision(id: RevisionId): Promise<{ title: string; body: string } | null> {
    const record = readRevisionRecord();
    const found = record[id];
    if (!found) return null;
    return { title: found.titleSnapshot, body: found.bodySnapshot };
  }

  private async hydrateWorkspaceDrafts(cache: TongsCacheV1, workspaceId: string): Promise<void> {
    const workpieceId = resolveCachedWorkpieceId(workspaceId, cache);
    if (!workpieceId) return;
    const remote = await readDraftSnapshot(workpieceId);
    if (remote == null) return;
    writeDraftSnapshotUpdatedAt(cache, workspaceId, remote.updatedAt);
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
  ): Promise<void> {
    const workspaceId = workspaceIdInput ?? resolveWorkspaceId();
    if (!workspaceId) return;

    const writtenBy = buildWrittenBy();
    let workpieceId = resolveCachedWorkpieceId(workspaceId, cache);

    if (!workpieceId) {
      workpieceId = await createCradle(workspaceId, writtenBy);
      if (!workpieceId) return;
      persistWorkpieceId(workspaceId, workpieceId, cache);
    }

    const drafts = readDrafts(cache, workspaceId);
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
      return;
    }
    if (firstTry.reason === "conflict") {
      throw createDraftConflictError(firstTry.details);
    }
    if (firstTry.status !== 404) {
      throw new Error("draft_snapshot_sync_failed");
    }

    const replacementId = await createCradle(workspaceId, writtenBy);
    if (!replacementId) return;
    persistWorkpieceId(workspaceId, replacementId, cache);
    writeDraftSnapshotUpdatedAt(cache, workspaceId, null);
    const secondTry = await commitDraftSnapshot(replacementId, snapshot, writtenBy, { reason });
    if (secondTry.ok) {
      writeDraftSnapshotUpdatedAt(cache, workspaceId, secondTry.fileUpdatedAt);
      writeCache(cache);
      return;
    }
    if (secondTry.reason === "conflict") {
      throw createDraftConflictError(secondTry.details);
    }
    throw new Error("draft_snapshot_sync_failed");
  }

  private async syncChatsToTongs(cache: TongsCacheV1, workspaceIdInput?: string | null): Promise<void> {
    const workspaceId = workspaceIdInput ?? resolveWorkspaceId();
    if (!workspaceId) return;

    const writtenBy = buildWrittenBy();
    let workpieceId = resolveCachedWorkpieceId(workspaceId, cache);

    if (!workpieceId) {
      workpieceId = await createCradle(workspaceId, writtenBy);
      if (!workpieceId) return;
      persistWorkpieceId(workspaceId, workpieceId, cache);
    }

    const snapshot = buildChatSnapshot(cache, workspaceId);
    const firstTry = await commitChatSnapshot(workpieceId, snapshot, writtenBy);
    if (firstTry.ok) {
      loadedChatSnapshotByWorkpiece.add(workpieceId);
      return;
    }
    if (firstTry.status !== 404) {
      throw new Error("chat_snapshot_sync_failed");
    }

    const replacementId = await createCradle(workspaceId, writtenBy);
    if (!replacementId) return;
    persistWorkpieceId(workspaceId, replacementId, cache);
    const secondTry = await commitChatSnapshot(replacementId, snapshot, writtenBy);
    if (secondTry.ok) {
      loadedChatSnapshotByWorkpiece.add(replacementId);
      return;
    }
    throw new Error("chat_snapshot_sync_failed");
  }
}
