import { tongsFetch } from "./tongs-fetch";
import { buildDefaultMetadataDocument } from "./episode-package-v2";

type RuntimeSupabaseScope = { rpc?: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };
type RuntimeSupabaseClient = RuntimeSupabaseScope & { schema?: (name: string) => RuntimeSupabaseScope };

function getRuntimeSupabaseClient(): RuntimeSupabaseClient | null {
  if (typeof window === "undefined") return null;
  const client = (window as typeof window & { __forge_supabase_client__?: unknown }).__forge_supabase_client__;
  return client && typeof client === "object" ? client as RuntimeSupabaseClient : null;
}

type WrittenBy = {
  tool: string;
  tool_version: string;
  lane: string;
};

export type ForgeOrigin = {
  created_from: "bar-stock" | "scratch" | "hearth";
  spark_id?: string;
};

export type CreateWorkpieceResult =
  | { ok: true; workpieceId: string }
  | { ok: false; reason: string; status?: number; details?: unknown; workpieceId?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const WORKSPACE_STORAGE_KEYS = ["forge_workspace_id_v1", "barstock_workspace_id"] as const;
const WORKPIECE_KEY = "forge_hearth_script_workpiece_id_v1";
const WORKPIECE_PREFIX = "forge_hearth_script_workpiece_v1:";
const DEFAULT_LANE = "forge-managed";
const DEFAULT_TOOL_VERSION = "0.0.0";
const PRIMARY_SCRIPT_PATH = "script/script.md";
const DEFAULT_SCRIPT_SEED = "## Draft Script\n\n";

let correlationSeq = 0;

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

function readLocalStorage(key: string): string | null {
  try {
    return readString(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function getQueryParam(...keys: string[]): string | null {
  try {
    const q = new URLSearchParams(window.location.search || "");
    for (const key of keys) {
      const value = readString(q.get(key));
      if (value) return value;
    }
  } catch {
    // ignore
  }
  return null;
}

function resolveWorkspaceId(): string | null {
  const fromQuery = normalizeUuid(getQueryParam("workspace_id", "workspaceId", "workspace"));
  if (fromQuery) return fromQuery;

  const w = window as typeof window & {
    __forgeWorkspaceId?: unknown;
    __tpWorkspaceId?: unknown;
    __forgeWorkspace?: unknown;
    __tpWorkspace?: unknown;
  };
  const fromWindow = normalizeUuid(
    w.__forgeWorkspaceId ?? w.__tpWorkspaceId ?? w.__forgeWorkspace ?? w.__tpWorkspace,
  );
  if (fromWindow) return fromWindow;

  for (const key of WORKSPACE_STORAGE_KEYS) {
    const value = normalizeUuid(readLocalStorage(key));
    if (value) return value;
  }

  return null;
}

function resolveLane(): string {
  const w = window as typeof window & { __forgeLane?: unknown; __tpLane?: unknown };
  const fromQuery = readString(getQueryParam("forge_lane", "lane"));
  if (fromQuery) return fromQuery;
  const fromWindow = readString(w.__forgeLane ?? w.__tpLane);
  if (fromWindow) return fromWindow;
  const fromStorage = readString(readLocalStorage("forge_lane_v1"));
  if (fromStorage) return fromStorage;
  return DEFAULT_LANE;
}

function getWrittenBy(): WrittenBy {
  const version = readString((window as typeof window & { APP_VERSION?: unknown }).APP_VERSION)
    || DEFAULT_TOOL_VERSION;
  return {
    tool: "hearth",
    tool_version: version,
    lane: resolveLane(),
  };
}

function nextCorrelationId(prefix: string): string {
  correlationSeq += 1;
  return `${prefix}:${Date.now().toString(36)}:${correlationSeq}`;
}

function persistWorkpiece(workspaceId: string | null, workpieceId: string): void {
  writeLocalStorage(WORKPIECE_KEY, workpieceId);
  if (workspaceId) {
    writeLocalStorage(`${WORKPIECE_PREFIX}${workspaceId}`, workpieceId);
  }
}

async function readBodyAsJson(response: Response): Promise<unknown> {
  const text = await response.text();
  const raw = readString(text);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
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

async function createCradle(args: {
  workspaceId: string;
  writtenBy: WrittenBy;
  origin?: ForgeOrigin;
  title?: string | null;
}): Promise<CreateWorkpieceResult> {
  const metadata: Record<string, unknown> = {};
  if (args.origin) metadata.origin = args.origin;
  const title = readString(args.title);
  if (title) metadata.title = title;

  const response = await tongsFetch("/tongs/cradles", {
    method: "POST",
    json: {
      workspace_id: args.workspaceId,
      written_by: args.writtenBy,
      origin_tool: {
        name: "hearth",
        version: args.writtenBy.tool_version,
      },
      metadata,
      correlation_id: nextCorrelationId("hearth-create-cradle"),
    },
  });

  const body = await readBodyAsJson(response);
  const createdId = resolveCreatedWorkpieceId(body);
  if (!response.ok || !createdId) {
    return { ok: false, reason: "create_cradle_failed", status: response.status, details: body };
  }
  return { ok: true, workpieceId: createdId };
}

async function createProjectEpisodeIdentity(args: {
  workspaceId: string;
  projectId: string;
  title?: string | null;
  operationKey: string;
}): Promise<CreateWorkpieceResult> {
  const runtimeClient = getRuntimeSupabaseClient();
  const projectId = normalizeUuid(args.projectId);
  if (!runtimeClient || !projectId) return { ok: false, reason: "project_intake_identity_unavailable" };
  const scope = typeof runtimeClient.schema === "function" ? runtimeClient.schema("tongs") : runtimeClient;
  if (typeof scope.rpc !== "function") return { ok: false, reason: "project_intake_rpc_unavailable" };
  const { data, error } = await scope.rpc("create_hearth_project_episode", {
    p_workspace_id: args.workspaceId,
    p_project_id: projectId,
    p_title: readString(args.title) ?? "Untitled Project",
    p_operation_key: args.operationKey,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, reason: "project_intake_identity_failed", details: error ?? data };
  }
  const row = data as Record<string, unknown>;
  const workpieceId = normalizeUuid(row.workpiece_id);
  const outcome = readString(row.outcome);
  if (!workpieceId || (outcome !== "created" && outcome !== "existing")) {
    return { ok: false, reason: `project_intake_${outcome ?? "malformed"}`, details: data };
  }
  return { ok: true, workpieceId };
}

async function createSparkEpisodeIdentity(args: {
  workspaceId: string;
  sparkId: string;
  title?: string | null;
}): Promise<CreateWorkpieceResult> {
  const runtimeClient = getRuntimeSupabaseClient();
  const sparkId = normalizeUuid(args.sparkId);
  if (!runtimeClient || !sparkId) return { ok: false, reason: "spark_intake_identity_unavailable" };
  const scope = typeof runtimeClient.schema === "function" ? runtimeClient.schema("tongs") : runtimeClient;
  if (typeof scope.rpc !== "function") return { ok: false, reason: "spark_intake_rpc_unavailable" };
  const { data, error } = await scope.rpc("get_or_create_hearth_spark_episode", {
    p_workspace_id: args.workspaceId,
    p_spark_id: sparkId,
    p_title: readString(args.title) ?? "Untitled Spark",
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, reason: "spark_intake_identity_failed", details: error ?? data };
  }
  const row = data as Record<string, unknown>;
  const workpieceId = normalizeUuid(row.workpiece_id);
  const outcome = readString(row.outcome);
  if (!workpieceId || (outcome !== "created" && outcome !== "existing")) {
    return { ok: false, reason: `spark_intake_${outcome ?? "malformed"}`, details: data };
  }
  return { ok: true, workpieceId };
}

async function commitMetadata(args: {
  workpieceId: string;
  workspaceId: string;
  writtenBy: WrittenBy;
  origin?: ForgeOrigin;
}): Promise<{ ok: boolean; status?: number; details?: unknown }> {
  const nowIso = new Date().toISOString();
  const payload = buildDefaultMetadataDocument({
    workpieceId: args.workpieceId,
    workspaceId: args.workspaceId,
    createdAt: nowIso,
    updatedAt: nowIso,
    status: "draft",
    notes: null,
    origin: args.origin ?? null,
  });

  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`, {
    method: "POST",
    json: {
      path: "metadata.json",
      content_type: "application/json",
      written_by: args.writtenBy,
      json: payload,
      event_name: "hearth.metadata.seeded",
      event_payload: {
        origin: args.origin ?? null,
      },
      correlation_id: nextCorrelationId("hearth-metadata"),
    },
  });

  const body = await readBodyAsJson(response);
  return { ok: response.ok && isCommitAck(body), status: response.status, details: body };
}

async function bootstrapFileExists(workpieceId: string, path: string): Promise<boolean> {
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(path)}`, { method: "GET" });
  if (response.status === 404) {
    const body = await readBodyAsJson(response);
    if (body && typeof body === "object" && !Array.isArray(body) && (body as Record<string, unknown>).exists === false) return false;
  }
  if (!response.ok) throw new Error(`bootstrap_read_failed:${path}:${response.status}`);
  return true;
}

function normalizeScriptSeed(seed: string | null | undefined): string {
  if (typeof seed !== "string") return DEFAULT_SCRIPT_SEED;
  const normalized = seed.replace(/\r\n?/g, "\n");
  return normalized.trim() ? normalized : DEFAULT_SCRIPT_SEED;
}

async function commitScriptSeed(args: {
  workpieceId: string;
  writtenBy: WrittenBy;
  origin?: ForgeOrigin;
  scriptSeed?: string | null;
}): Promise<{ ok: boolean; status?: number; details?: unknown }> {
  const scriptText = normalizeScriptSeed(args.scriptSeed);
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`, {
    method: "POST",
    json: {
      path: PRIMARY_SCRIPT_PATH,
      content_type: "text/markdown; charset=utf-8",
      written_by: args.writtenBy,
      text: scriptText,
      event_name: "hearth.script.seeded.v1",
      event_payload: {
        path: PRIMARY_SCRIPT_PATH,
        chars: scriptText.length,
        origin: args.origin?.created_from ?? "hearth",
      },
      correlation_id: nextCorrelationId("hearth-script-seed"),
    },
  });

  const body = await readBodyAsJson(response);
  return { ok: response.ok && isCommitAck(body), status: response.status, details: body };
}

export async function createHearthWorkpiece(
  origin?: ForgeOrigin,
  scriptSeed?: string | null,
  options?: { title?: string | null },
): Promise<CreateWorkpieceResult> {
  if (typeof window === "undefined") {
    return { ok: false, reason: "no_window" };
  }
  const workspaceId = resolveWorkspaceId();
  if (!workspaceId) {
    return { ok: false, reason: "missing_workspace" };
  }

  const writtenBy = getWrittenBy();

  // Success contract: cradle created -> metadata committed -> script seeded -> pointers persisted.
  const created = await createCradle({
    workspaceId,
    writtenBy,
    origin,
    title: options?.title ?? null,
  });
  if (!created.ok) return created;
  const metadata = await commitMetadata({
    workpieceId: created.workpieceId,
    workspaceId,
    writtenBy,
    origin,
  });

  if (!metadata.ok) {
    return {
      ok: false,
      reason: "metadata_commit_failed",
      status: metadata.status,
      details: metadata.details,
      workpieceId: created.workpieceId,
    };
  }

  const script = await commitScriptSeed({
    workpieceId: created.workpieceId,
    writtenBy,
    origin,
    scriptSeed,
  });

  if (!script.ok) {
    return {
      ok: false,
      reason: "script_seed_failed",
      status: script.status,
      details: script.details,
      workpieceId: created.workpieceId,
    };
  }

  // Persist only after cloud commit acks are complete.
  persistWorkpiece(workspaceId, created.workpieceId);
  return { ok: true, workpieceId: created.workpieceId };
}

export async function getOrCreateHearthProjectWorkpiece(args: {
  projectId: string;
  title?: string | null;
  origin?: ForgeOrigin;
  scriptSeed?: string | null;
  operationKey?: string;
}): Promise<CreateWorkpieceResult> {
  if (typeof window === "undefined") return { ok: false, reason: "no_window" };
  const workspaceId = resolveWorkspaceId();
  if (!workspaceId) return { ok: false, reason: "missing_workspace" };
  const writtenBy = getWrittenBy();
  const operationKey = readString(args.operationKey) ?? `hearth-project-episode:${crypto.randomUUID()}`;
  const resolved = await createProjectEpisodeIdentity({ workspaceId, projectId: args.projectId, title: args.title, operationKey });
  if (!resolved.ok) return resolved;

  try {
    if (!await bootstrapFileExists(resolved.workpieceId, "metadata.json")) {
      const metadata = await commitMetadata({ workpieceId: resolved.workpieceId, workspaceId, writtenBy, origin: args.origin });
      if (!metadata.ok) return { ok: false, reason: "metadata_commit_failed", status: metadata.status, details: metadata.details, workpieceId: resolved.workpieceId };
    }
    if (!await bootstrapFileExists(resolved.workpieceId, PRIMARY_SCRIPT_PATH)) {
      const script = await commitScriptSeed({ workpieceId: resolved.workpieceId, writtenBy, origin: args.origin, scriptSeed: args.scriptSeed });
      if (!script.ok) return { ok: false, reason: "script_seed_failed", status: script.status, details: script.details, workpieceId: resolved.workpieceId };
    }
  } catch (error) {
    return { ok: false, reason: "project_bootstrap_verification_failed", details: error, workpieceId: resolved.workpieceId };
  }
  persistWorkpiece(workspaceId, resolved.workpieceId);
  return { ok: true, workpieceId: resolved.workpieceId };
}

export async function getOrCreateHearthSparkWorkpiece(args: {
  sparkId: string;
  title?: string | null;
  origin?: ForgeOrigin;
  scriptSeed?: string | null;
}): Promise<CreateWorkpieceResult> {
  if (typeof window === "undefined") return { ok: false, reason: "no_window" };
  const workspaceId = resolveWorkspaceId();
  if (!workspaceId) return { ok: false, reason: "missing_workspace" };
  const writtenBy = getWrittenBy();
  const resolved = await createSparkEpisodeIdentity({ workspaceId, sparkId: args.sparkId, title: args.title });
  if (!resolved.ok) return resolved;

  try {
    if (!await bootstrapFileExists(resolved.workpieceId, "metadata.json")) {
      const metadata = await commitMetadata({ workpieceId: resolved.workpieceId, workspaceId, writtenBy, origin: args.origin });
      if (!metadata.ok) return { ok: false, reason: "metadata_commit_failed", status: metadata.status, details: metadata.details, workpieceId: resolved.workpieceId };
    }
    if (!await bootstrapFileExists(resolved.workpieceId, PRIMARY_SCRIPT_PATH)) {
      const script = await commitScriptSeed({ workpieceId: resolved.workpieceId, writtenBy, origin: args.origin, scriptSeed: args.scriptSeed });
      if (!script.ok) return { ok: false, reason: "script_seed_failed", status: script.status, details: script.details, workpieceId: resolved.workpieceId };
    }
  } catch (error) {
    return { ok: false, reason: "spark_bootstrap_verification_failed", details: error, workpieceId: resolved.workpieceId };
  }
  persistWorkpiece(workspaceId, resolved.workpieceId);
  return { ok: true, workpieceId: resolved.workpieceId };
}
