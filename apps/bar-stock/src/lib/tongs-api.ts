import { supabase } from "./supabase";
import type { Assignment, Spark, SparkSource, SparkStatus } from "./model";
import {
  normalizeWorkspaceAccessRows,
  type Workspace,
  type WorkspaceAccessRow,
} from "./workspace-access";
export { normalizeWorkspaceAccessRows };
export type { WorkspaceAccessRow, Workspace };

const WORKPIECE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const APPROVED_SCRIPT_EVENT_NAMES = [
  "hearth.script.approved.v1",
  "hearth.script.published.v1",
] as const;
const PUBLISHED_ARTIFACT_PATHS = [
  "script/script.published.md",
  "script/status.json",
] as const;
const RAW_SCRIPT_FALLBACK_PATHS = [
  "script/script.md",
  "scripts/script.anvil.txt",
] as const;
const GRADUATION_CACHE_TTL_MS = 30_000;

type ListGraduatedEpisodeIdsOptions = {
  candidateEpisodeIds?: readonly string[];
  forceRefresh?: boolean;
};

type GraduationCacheEntry = {
  ids: string[];
  fetchedAtMs: number;
};

const graduationCache = new Map<string, GraduationCacheEntry>();

const FALLBACK_SPARK_STATUS: SparkStatus = "raw";
const FALLBACK_SPARK_SOURCE: SparkSource = "other";

function parseTimestampToMs(value: unknown): number {
  if (typeof value !== "string") return Date.now();
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Date.now();
}

function normalizeSparkStatus(value: unknown): SparkStatus {
  if (value === "raw" || value === "warming" || value === "forged" || value === "archived" || value === "graduated") {
    return value;
  }
  return FALLBACK_SPARK_STATUS;
}

function normalizeSparkSource(value: unknown): SparkSource {
  if (value === "typed" || value === "paste" || value === "voice" || value === "import" || value === "link" || value === "other") {
    return value;
  }
  return FALLBACK_SPARK_SOURCE;
}

function normalizeWorkpieceId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return WORKPIECE_UUID_RE.test(trimmed) ? trimmed : null;
}

function stableUniqueIds(ids: readonly string[]): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    const normalized = normalizeWorkpieceId(id);
    if (normalized) out.add(normalized);
  }
  return [...out].sort();
}

function cacheKeyFor(workspaceId: string, scopedEpisodeIds: readonly string[]): string {
  return `${workspaceId.trim().toLowerCase()}::${scopedEpisodeIds.join(",")}`;
}

export async function listGraduatedEpisodeIds(
  workspaceId: string,
  options?: ListGraduatedEpisodeIdsOptions,
): Promise<string[]> {
  if (!supabase || !workspaceId.trim()) return [];

  const normalizedWorkspaceId = workspaceId.trim();
  const candidateEpisodeIds = options?.candidateEpisodeIds
    ? stableUniqueIds(options.candidateEpisodeIds as string[])
    : [];

  let scopedEpisodeIds: string[] = [];
  if (candidateEpisodeIds.length > 0) {
    const { data: scopedEpisodes, error: scopedEpisodesError } = await supabase
      .schema("tongs")
      .from("episodes")
      .select("id")
      .eq("workspace_id", normalizedWorkspaceId)
      .in("id", candidateEpisodeIds);

    if (scopedEpisodesError) {
      throw scopedEpisodesError;
    }

    scopedEpisodeIds = stableUniqueIds(
      (scopedEpisodes ?? []).map((row) => String((row as any).id ?? "")),
    );
  } else {
    const { data: allEpisodes, error: allEpisodesError } = await supabase
      .schema("tongs")
      .from("episodes")
      .select("id")
      .eq("workspace_id", normalizedWorkspaceId);

    if (allEpisodesError) {
      throw allEpisodesError;
    }

    scopedEpisodeIds = stableUniqueIds(
      (allEpisodes ?? []).map((row) => String((row as any).id ?? "")),
    );
  }
  if (!scopedEpisodeIds.length) return [];

  const key = cacheKeyFor(normalizedWorkspaceId, scopedEpisodeIds);
  const cached = graduationCache.get(key);
  if (!options?.forceRefresh && cached && (Date.now() - cached.fetchedAtMs) < GRADUATION_CACHE_TTL_MS) {
    return [...cached.ids];
  }

  const graduated = new Set<string>();

  const { data: events, error: eventsError } = await supabase
    .schema("tongs")
    .from("workpiece_events")
    .select("workpiece_id,event_name")
    .in("workpiece_id", scopedEpisodeIds)
    .in("event_name", [...APPROVED_SCRIPT_EVENT_NAMES]);

  if (eventsError) {
    throw eventsError;
  }

  for (const row of events ?? []) {
    const workpieceId = normalizeWorkpieceId(String((row as any).workpiece_id ?? ""));
    if (workpieceId) graduated.add(workpieceId);
  }

  const unresolvedAfterEvents = scopedEpisodeIds.filter((id) => !graduated.has(id));
  if (unresolvedAfterEvents.length > 0) {
    const { data: publishedFiles, error: publishedFilesError } = await supabase
      .schema("tongs")
      .from("workpiece_files")
      .select("workpiece_id,path")
      .in("workpiece_id", unresolvedAfterEvents)
      .in("path", [...PUBLISHED_ARTIFACT_PATHS]);

    if (publishedFilesError) {
      throw publishedFilesError;
    }

    for (const row of publishedFiles ?? []) {
      const workpieceId = normalizeWorkpieceId(String((row as any).workpiece_id ?? ""));
      if (workpieceId) graduated.add(workpieceId);
    }
  }

  const unresolvedAfterPublishedArtifact = scopedEpisodeIds.filter((id) => !graduated.has(id));
  if (unresolvedAfterPublishedArtifact.length > 0) {
    const { data: fallbackFiles, error: fallbackFilesError } = await supabase
      .schema("tongs")
      .from("workpiece_files")
      .select("workpiece_id,path")
      .in("workpiece_id", unresolvedAfterPublishedArtifact)
      .in("path", [...RAW_SCRIPT_FALLBACK_PATHS]);

    if (fallbackFilesError) {
      throw fallbackFilesError;
    }

    for (const row of fallbackFiles ?? []) {
      const workpieceId = normalizeWorkpieceId(String((row as any).workpiece_id ?? ""));
      if (workpieceId) graduated.add(workpieceId);
    }
  }

  const result = [...graduated].sort();
  graduationCache.set(key, { ids: result, fetchedAtMs: Date.now() });
  return result;
}

export async function listMyWorkspaces(): Promise<Workspace[]> {
  if (!supabase) return [];

  const rpcResponse = await supabase
    .schema("tongs")
    .rpc("list_my_workspace_access");

  const data = rpcResponse.data as WorkspaceAccessRow[] | null;
  const error = rpcResponse.error;

  if (error) {
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "").toLowerCase()
      : "";
    const code = typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code ?? "").toUpperCase()
      : "";
    const looksMissingFunctionByMessage = message.includes("list_my_workspace_access")
      && (message.includes("function") || message.includes("not found") || message.includes("could not find"));
    const looksMissingFunctionByCode = code === "PGRST202" || rpcResponse.status === 404;

    if (looksMissingFunctionByMessage || looksMissingFunctionByCode) {
      const legacy = await supabase.schema("tongs").rpc("list_my_workspaces");
      if (legacy.error) throw legacy.error;
      const legacyRows = legacy.data as WorkspaceAccessRow[] | null;
      return normalizeWorkspaceAccessRows(legacyRows);
    }
  }

  if (error) {
    throw error;
  }

  return normalizeWorkspaceAccessRows(data);
}

export async function listWorkspaceProjects(workspaceId: string): Promise<Assignment[]> {
  if (!supabase || !workspaceId.trim()) return [];

  const normalizedWorkspaceId = workspaceId.trim();
  const { data, error } = await supabase
    .schema("tongs")
    .from("barstock_assignments")
    .select("id,title,status,revision,created_at,updated_at")
    .eq("workspace_id", normalizedWorkspaceId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });

  if (error) throw error;

  const out: Assignment[] = [];
  for (const row of data ?? []) {
    const id = typeof (row as any).id === "string" ? (row as any).id : "";
    const title = typeof (row as any).title === "string" ? (row as any).title.trim() : "";
    if (!id || !title) continue;
    out.push({
      id,
      name: title,
      revision: typeof (row as any).revision === "number" ? (row as any).revision : 0,
      createdAt: parseTimestampToMs((row as any).created_at),
      updatedAt: parseTimestampToMs((row as any).updated_at),
    });
  }

  return out;
}

export async function listWorkspaceSparks(workspaceId: string): Promise<Spark[]> {
  if (!supabase || !workspaceId.trim()) return [];

  const normalizedWorkspaceId = workspaceId.trim();
  const { data, error } = await supabase
    .schema("tongs")
    .from("barstock_sparks")
    .select("id,assignment_id,title,body,tags,status,source,pinned,revision,created_at,updated_at,deleted_at")
    .eq("workspace_id", normalizedWorkspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const out: Spark[] = [];
  for (const row of data ?? []) {
    const id = typeof (row as any).id === "string" ? (row as any).id : "";
    const body = typeof (row as any).body === "string" ? (row as any).body : "";
    if (!id || !body.trim()) continue;

    const assignmentId = typeof (row as any).assignment_id === "string" && (row as any).assignment_id.trim()
      ? (row as any).assignment_id.trim()
      : null;
    const title = typeof (row as any).title === "string" && (row as any).title.trim()
      ? (row as any).title.trim()
      : undefined;
    const tags = Array.isArray((row as any).tags)
      ? (row as any).tags.filter((tag: unknown): tag is string => typeof tag === "string")
      : [];

    out.push({
      id,
      revision: typeof (row as any).revision === "number" ? (row as any).revision : 0,
      assignmentId,
      title,
      body,
      tags,
      status: normalizeSparkStatus((row as any).status),
      source: normalizeSparkSource((row as any).source),
      pinned: Boolean((row as any).pinned),
      createdAt: parseTimestampToMs((row as any).created_at),
      updatedAt: parseTimestampToMs((row as any).updated_at),
    });
  }

  return out;
}
