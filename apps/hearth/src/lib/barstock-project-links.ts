const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PROJECT_PARAM_KEYS = ["project_id", "projectId", "barstock_project_id"] as const;

type RuntimeSupabaseScope = {
  from?: (table: string) => any;
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
}): Promise<{ projectTitle: string | null; workpieceId: string | null; error?: string }> {
  const workspaceId = normalizeUuid(args.workspaceId);
  const projectId = normalizeUuid(args.projectId);
  if (!workspaceId || !projectId) {
    return { projectTitle: null, workpieceId: null, error: "invalid_project_context" };
  }

  const runtimeClient = getRuntimeSupabaseClient();
  if (!runtimeClient) {
    return { projectTitle: null, workpieceId: null, error: "missing_runtime_supabase_client" };
  }

  const scope = resolveTongsScope(runtimeClient);
  if (typeof scope.from !== "function") {
    return { projectTitle: null, workpieceId: null, error: "invalid_runtime_supabase_client" };
  }

  const [projectResult, linkResult] = await Promise.all([
    scope
      .from("barstock_assignments")
      .select("title")
      .eq("workspace_id", workspaceId)
      .eq("id", projectId)
      .maybeSingle(),
    scope
      .from("barstock_project_episode_links")
      .select("workpiece_id")
      .eq("workspace_id", workspaceId)
      .eq("project_id", projectId)
      .maybeSingle(),
  ]);

  if (projectResult?.error) {
    return {
      projectTitle: null,
      workpieceId: null,
      error: `project_lookup_failed:${String(projectResult.error.message ?? "unknown")}`,
    };
  }

  if (linkResult?.error) {
    return {
      projectTitle: readString(projectResult?.data?.title),
      workpieceId: null,
      error: `project_link_lookup_failed:${String(linkResult.error.message ?? "unknown")}`,
    };
  }

  return {
    projectTitle: readString(projectResult?.data?.title),
    workpieceId: normalizeUuid(linkResult?.data?.workpiece_id),
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

  const { error } = await scope
    .from("barstock_project_episode_links")
    .upsert(
      {
        workspace_id: workspaceId,
        project_id: projectId,
        workpiece_id: workpieceId,
      },
      { onConflict: "workspace_id,project_id" },
    );

  if (error) {
    return { ok: false, error: String(error.message ?? "unknown") };
  }

  return { ok: true };
}
