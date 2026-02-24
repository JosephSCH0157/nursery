import type { Draft, DraftId } from "../domain/draft";
import type { Revision, RevisionId } from "../domain/revision";
import type { HearthStore } from "./hearth-store";
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
  workpieceByWorkspace: Record<string, string>;
};

const TONGS_CACHE_KEY = "hearth:tongs:cache:v1";
const TONGS_WORKPIECE_KEY = "forge_hearth_workpiece_id_v1";
const TONGS_WORKPIECE_BY_WORKSPACE_PREFIX = "forge_hearth_workpiece_v1:";
const TONGS_DRAFT_SNAPSHOT_PATH = "hearth/drafts.v1.json";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REVISIONS_PER_DRAFT = 200;

let correlationSeq = 0;

function cloneDraft(draft: Draft): Draft {
  return { ...draft };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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

    return {
      schemaVersion: 1,
      drafts,
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
  if (!response.ok || !(body as { ok?: boolean })?.ok) {
    return null;
  }

  return normalizeUuid((body as { data?: { cradle?: { id?: unknown } } })?.data?.cradle?.id);
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
): Promise<{ ok: true } | { ok: false; status: number }> {
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/commit-file`, {
    method: "POST",
    json: {
      path: TONGS_DRAFT_SNAPSHOT_PATH,
      content_type: "application/json",
      json: snapshot,
      written_by: writtenBy,
      event_name: "hearth.drafts.snapshot.v1",
      event_payload: {
        schemaVersion: 1,
        count: snapshot.drafts.length,
        updatedAt: snapshot.updatedAt,
      },
      correlation_id: nextCorrelationId("hearth-drafts-commit"),
    },
  });

  const body = await readJsonBody(response);
  if (!response.ok || !(body as { ok?: boolean })?.ok) {
    return { ok: false, status: response.status };
  }
  return { ok: true };
}

function resolveCachedWorkpieceId(workspaceId: string, cache: TongsCacheV1): string | null {
  const fromMap = normalizeUuid(cache.workpieceByWorkspace[workspaceId]);
  if (fromMap) return fromMap;

  const fromScopedKey = normalizeUuid(readLocalStorage(`${TONGS_WORKPIECE_BY_WORKSPACE_PREFIX}${workspaceId}`));
  if (fromScopedKey) return fromScopedKey;

  const fromGlobal = normalizeUuid(readLocalStorage(TONGS_WORKPIECE_KEY));
  return fromGlobal ?? null;
}

function persistWorkpieceId(workspaceId: string, workpieceId: string, cache: TongsCacheV1): void {
  cache.workpieceByWorkspace[workspaceId] = workpieceId;
  writeCache(cache);
  writeLocalStorage(TONGS_WORKPIECE_KEY, workpieceId);
  writeLocalStorage(`${TONGS_WORKPIECE_BY_WORKSPACE_PREFIX}${workspaceId}`, workpieceId);
}

function readDrafts(cache: TongsCacheV1): Draft[] {
  return Object.values(cache.drafts)
    .map(cloneDraft)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export class TongsHearthStore implements HearthStore {
  async listDrafts(): Promise<Draft[]> {
    return readDrafts(readCache());
  }

  async getDraft(id: DraftId): Promise<Draft | null> {
    const cache = readCache();
    const found = cache.drafts[id];
    return found ? cloneDraft(found) : null;
  }

  async saveDraft(draft: Draft): Promise<void> {
    const normalized = normalizeDraft(draft);
    if (!normalized) {
      throw new Error("Invalid draft payload");
    }

    const cache = readCache();
    cache.drafts[normalized.id] = cloneDraft(normalized);
    writeCache(cache);
    await this.syncToTongs(cache);
  }

  async deleteDraft(id: DraftId): Promise<void> {
    const cache = readCache();
    if (!cache.drafts[id]) return;
    delete cache.drafts[id];
    writeCache(cache);
    await this.syncToTongs(cache);
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

  private async syncToTongs(cache: TongsCacheV1): Promise<void> {
    const workspaceId = resolveWorkspaceId();
    if (!workspaceId) return;

    const writtenBy = buildWrittenBy();
    let workpieceId = resolveCachedWorkpieceId(workspaceId, cache);

    if (!workpieceId) {
      workpieceId = await createCradle(workspaceId, writtenBy);
      if (!workpieceId) return;
      persistWorkpieceId(workspaceId, workpieceId, cache);
    }

    const drafts = readDrafts(cache);
    const snapshot = {
      schemaVersion: 1 as const,
      workspaceId,
      updatedAt: new Date().toISOString(),
      drafts,
    };

    const firstTry = await commitDraftSnapshot(workpieceId, snapshot, writtenBy);
    if (firstTry.ok) return;
    if (firstTry.status !== 404) return;

    const replacementId = await createCradle(workspaceId, writtenBy);
    if (!replacementId) return;
    persistWorkpieceId(workspaceId, replacementId, cache);
    await commitDraftSnapshot(replacementId, snapshot, writtenBy);
  }
}
