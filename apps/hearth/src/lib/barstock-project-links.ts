const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PROJECT_PARAM_KEYS = ["project_id", "projectId", "barstock_project_id"] as const;

type RuntimeSupabaseScope = {
  from?: (table: string) => any;
  rpc?: (name: string, args: Record<string, unknown>) => Promise<any>;
};

type RuntimeSupabaseClient = RuntimeSupabaseScope & {
  schema?: (name: string) => RuntimeSupabaseScope;
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeUuid(value: unknown): string | null {
  const str = readString(value);
  if (!str) return null;
  return UUID_RE.test(str) ? str.toLowerCase() : null;
}

function getRuntimeSupabaseClient(): RuntimeSupabaseClient | null {
  if (typeof window === "undefined") return null;
  const runtime = window as typeof window & {
    __forge_supabase_client__?: unknown;
  };
  const client = runtime.__forge_supabase_client__;
  if (!client || typeof client !== "object") return null;
  return client as RuntimeSupabaseClient;
}

function resolveTongsScope(client: RuntimeSupabaseClient): RuntimeSupabaseScope {
  if (typeof client.schema === "function") {
    try {
      const scoped = client.schema("tongs");
      if (scoped && typeof scoped === "object") {
        return scoped;
      }
    } catch {
      // ignore schema scope failures and fall back to direct scope
    }
  }
  return client;
}

export function resolveBarstockProjectIdFromQuery(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search || "");
    for (const key of PROJECT_PARAM_KEYS) {
      const value = normalizeUuid(params.get(key));
      if (value) return value;
    }
  } catch {
    return null;
  }
  return null;
}

export async function readBarstockProjectContext(args: {
  workspaceId: string;
  projectId: string;
}): Promise<{
  projectExists: boolean;
  projectTitle: string | null;
  episodes: Array<{ workpieceId: string; label: string; status: string; createdAt: string; updatedAt: string }>;
  error?: string;
}> {
  const workspaceId = normalizeUuid(args.workspaceId);
  const projectId = normalizeUuid(args.projectId);
  if (!workspaceId || !projectId) {
    return {
      projectExists: false,
      projectTitle: null,
      episodes: [],
      error: "invalid_project_context",
    };
  }

  const runtimeClient = getRuntimeSupabaseClient();
  if (!runtimeClient) {
    return {
      projectExists: false,
      projectTitle: null,
      episodes: [],
      error: "missing_runtime_supabase_client",
    };
  }

  const scope = resolveTongsScope(runtimeClient);
  if (typeof scope.from !== "function") {
    return {
      projectExists: false,
      projectTitle: null,
      episodes: [],
      error: "invalid_runtime_supabase_client",
    };
  }

  const [projectResult, episodeResult] = await Promise.all([
    scope
      .from("barstock_assignments")
      .select("id,title")
      .eq("workspace_id", workspaceId)
      .eq("id", projectId)
      .maybeSingle(),
    typeof scope.rpc === "function"
      ? scope.rpc("list_hearth_project_episodes", { p_workspace_id: workspaceId, p_project_id: projectId })
      : Promise.resolve({ data: null, error: { message: "project_episode_list_rpc_unavailable" } }),
  ]);

  if (projectResult?.error) {
    return {
      projectExists: false,
      projectTitle: null,
      episodes: [],
      error: `project_lookup_failed:${String(projectResult.error.message ?? "unknown")}`,
    };
  }

  if (episodeResult?.error) {
    const projectTitle = readString(projectResult?.data?.title);
    return {
      projectExists: Boolean(projectResult?.data),
      projectTitle,
      episodes: [],
      error: `project_episode_list_failed:${String(episodeResult.error.message ?? "unknown")}`,
    };
  }

  const projectTitle = readString(projectResult?.data?.title);
  const episodeEnvelope = episodeResult?.data && typeof episodeResult.data === "object" && !Array.isArray(episodeResult.data)
    ? episodeResult.data as Record<string, unknown> : null;
  const episodes = Array.isArray(episodeEnvelope?.episodes) ? episodeEnvelope.episodes.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const row = value as Record<string, unknown>;
    const workpieceId = normalizeUuid(row.workpiece_id);
    if (!workpieceId) return [];
    return [{ workpieceId, label: readString(row.label) ?? "Untitled Episode", status: readString(row.status) ?? "draft", createdAt: readString(row.created_at) ?? "", updatedAt: readString(row.updated_at) ?? "" }];
  }) : [];

  return {
    projectExists: Boolean(projectResult?.data),
    projectTitle,
    episodes,
  };
}

export async function upsertBarstockProjectEpisodeLink(args: {
  workspaceId: string;
  projectId: string;
  workpieceId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const workspaceId = normalizeUuid(args.workspaceId);
  const projectId = normalizeUuid(args.projectId);
  const workpieceId = normalizeUuid(args.workpieceId);
  if (!workspaceId || !projectId || !workpieceId) {
    return { ok: false, error: "invalid_project_link_input" };
  }

  const runtimeClient = getRuntimeSupabaseClient();
  if (!runtimeClient) {
    return { ok: false, error: "missing_runtime_supabase_client" };
  }

  const scope = resolveTongsScope(runtimeClient);
  if (typeof scope.from !== "function") {
    return { ok: false, error: "invalid_runtime_supabase_client" };
  }

  const existingResult = await scope
    .from("barstock_project_episode_links")
    .select("project_id")
    .eq("workspace_id", workspaceId)
    .eq("project_id", projectId)
    .limit(1);

  if (existingResult?.error) {
    return { ok: false, error: String(existingResult.error.message ?? "unknown") };
  }

  const hasExisting = Array.isArray(existingResult?.data) && existingResult.data.length > 0;
  if (hasExisting) {
    const { error } = await scope
      .from("barstock_project_episode_links")
      .update({ workpiece_id: workpieceId })
      .eq("workspace_id", workspaceId)
      .eq("project_id", projectId);
    if (error) {
      return { ok: false, error: String(error.message ?? "unknown") };
    }
    return { ok: true };
  }

  const { error } = await scope
    .from("barstock_project_episode_links")
    .insert({
      workspace_id: workspaceId,
      project_id: projectId,
      workpiece_id: workpieceId,
    });

  if (error) {
    const message = String(error.message ?? "unknown");
    if (message.toLowerCase().includes("duplicate key")) {
      const retry = await scope
        .from("barstock_project_episode_links")
        .update({ workpiece_id: workpieceId })
        .eq("workspace_id", workspaceId)
        .eq("project_id", projectId);
      if (!retry?.error) {
        return { ok: true };
      }
      return { ok: false, error: String(retry.error.message ?? message) };
    }
    return { ok: false, error: message };
  }

  return { ok: true };
}

export async function validateBarstockProjectEpisode(args: {
  workspaceId: string;
  projectId: string;
  workpieceId: string;
}): Promise<boolean> {
  const workspaceId = normalizeUuid(args.workspaceId);
  const projectId = normalizeUuid(args.projectId);
  const workpieceId = normalizeUuid(args.workpieceId);
  if (!workspaceId || !projectId || !workpieceId) return false;
  const runtimeClient = getRuntimeSupabaseClient();
  if (!runtimeClient) return false;
  const scope = resolveTongsScope(runtimeClient);
  if (typeof scope.rpc !== "function") return false;
  const { data, error } = await scope.rpc("validate_hearth_project_episode", {
    p_workspace_id: workspaceId,
    p_project_id: projectId,
    p_workpiece_id: workpieceId,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return false;
  return (data as Record<string, unknown>).valid === true;
}
