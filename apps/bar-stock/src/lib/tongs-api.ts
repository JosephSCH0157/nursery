import { supabase } from "./supabase";

export type Workspace = {
  id: string;
  name: string;
  role?: string | null;
};

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

  const { data, error } = await supabase
    .schema("tongs")
    .from("workspace_members")
    .select("workspace_id, role, workspaces!workspace_members_workspace_id_fkey(id, name)");

  if (error) {
    throw error;
  }

  const out: Workspace[] = [];
  for (const row of data ?? []) {
    const w = (row as any).workspaces;
    const role = typeof (row as any).role === "string" ? (row as any).role : null;
    if (w?.id && w?.name) out.push({ id: w.id, name: w.name, role });
  }
  return out;
}
