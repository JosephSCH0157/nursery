import type { SupabaseClient } from "@supabase/supabase-js";
import type { Assignment, Spark, SparkSource, SparkStatus } from "./model";

export type BarStockScope = {
  workspaceId: string;
  userId: string;
};

export type BarStockSnapshot = {
  assignments: Assignment[];
  sparks: Spark[];
  links: Record<string, string>;
};

export type BarStockRpcOutcome =
  | "saved"
  | "duplicate"
  | "stale"
  | "denied"
  | "conflict"
  | "not_found"
  | "linked"
  | "deleted";

export type BarStockMutationResult<T> =
  | { outcome: BarStockRpcOutcome; row: T | null }
  | { outcome: "unavailable" | "failed"; row: null; error: string };

export interface BarStockRepository {
  hydrateWorkspace(scope: BarStockScope): Promise<BarStockSnapshot>;
  list(scope: BarStockScope): Promise<BarStockSnapshot>;
  createAssignment(scope: BarStockScope, assignment: Assignment, importKey: string): Promise<BarStockMutationResult<Assignment>>;
  updateAssignment(scope: BarStockScope, assignment: Assignment, expectedRevision: number): Promise<BarStockMutationResult<Assignment>>;
  archiveAssignment(scope: BarStockScope, assignmentId: string, expectedRevision: number): Promise<BarStockMutationResult<Assignment>>;
  deleteAssignment(scope: BarStockScope, assignmentId: string, expectedRevision: number): Promise<BarStockMutationResult<Assignment>>;
  createSpark(scope: BarStockScope, spark: Spark, importKey: string): Promise<BarStockMutationResult<Spark>>;
  updateSpark(scope: BarStockScope, spark: Spark, expectedRevision: number): Promise<BarStockMutationResult<Spark>>;
  archiveSpark(scope: BarStockScope, sparkId: string, expectedRevision: number): Promise<BarStockMutationResult<Spark>>;
  getAssignmentWorkpieceLink(scope: BarStockScope, assignmentId: string): Promise<string | null>;
}

export class BarStockAuthorityUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BarStockAuthorityUnavailableError";
  }
}

type Client = SupabaseClient<any, any, any, any>;

const RPC_OUTCOMES = new Set<BarStockRpcOutcome>([
  "saved", "duplicate", "stale", "denied", "conflict", "not_found", "linked", "deleted",
]);

function assertScope(scope: BarStockScope): void {
  if (!scope.workspaceId.trim() || !scope.userId.trim()) {
    throw new BarStockAuthorityUnavailableError("Authentication and a resolved workspace are required.");
  }
}

function timestamp(value: unknown): number {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function revision(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function sparkStatus(value: unknown): SparkStatus {
  return value === "raw" || value === "warming" || value === "forged" || value === "graduated" || value === "archived"
    ? value
    : "raw";
}

function sparkSource(value: unknown): SparkSource {
  return value === "typed" || value === "paste" || value === "voice" || value === "import" || value === "link" || value === "other"
    ? value
    : "other";
}

function mapAssignment(row: Record<string, unknown>, workpieceId: string | null = null): Assignment {
  return {
    id: String(row.id ?? ""),
    name: String(row.title ?? "").trim(),
    revision: revision(row.revision),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    workpieceId,
  };
}

function mapSpark(row: Record<string, unknown>): Spark {
  return {
    id: String(row.id ?? ""),
    revision: revision(row.revision),
    assignmentId: typeof row.assignment_id === "string" ? row.assignment_id : null,
    title: typeof row.title === "string" && row.title.trim() ? row.title.trim() : undefined,
    body: String(row.body ?? ""),
    tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string") : [],
    status: sparkStatus(row.status),
    source: sparkSource(row.source),
    pinned: row.pinned === true,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function assignmentPayload(scope: BarStockScope, assignment: Assignment): Record<string, unknown> {
  return { id: assignment.id, workspace_id: scope.workspaceId, title: assignment.name, status: "open" };
}

function sparkPayload(scope: BarStockScope, spark: Spark): Record<string, unknown> {
  return {
    id: spark.id,
    workspace_id: scope.workspaceId,
    assignment_id: spark.assignmentId,
    title: spark.title ?? null,
    body: spark.body,
    tags: spark.tags,
    status: spark.status === "graduated" ? "forged" : spark.status,
    source: spark.source,
    pinned: spark.pinned === true,
  };
}

function errorText(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return String(error ?? "Unknown database error");
}

function isUnavailable(error: unknown): boolean {
  const message = errorText(error).toLowerCase();
  const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
  return code === "PGRST202" || code === "PGRST204" || message.includes("failed to fetch")
    || message.includes("could not find the function") || message.includes("revision does not exist");
}

function parseRpc<T>(data: unknown, error: unknown, mapper: (row: Record<string, unknown>) => T): BarStockMutationResult<T> {
  if (error) return { outcome: isUnavailable(error) ? "unavailable" : "failed", row: null, error: errorText(error) };
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { outcome: "failed", row: null, error: "Malformed Bar-Stock RPC acknowledgement." };
  }
  const outcome = (data as Record<string, unknown>).outcome;
  if (typeof outcome !== "string" || !RPC_OUTCOMES.has(outcome as BarStockRpcOutcome)) {
    return { outcome: "failed", row: null, error: "Unknown Bar-Stock RPC outcome." };
  }
  const rawRow = (data as Record<string, unknown>).row;
  return {
    outcome: outcome as BarStockRpcOutcome,
    row: rawRow && typeof rawRow === "object" && !Array.isArray(rawRow) ? mapper(rawRow as Record<string, unknown>) : null,
  };
}

export function createSupabaseBarStockRepository(client: Client): BarStockRepository {
  const rpc = async <T>(name: string, args: Record<string, unknown>, mapper: (row: Record<string, unknown>) => T) => {
    const { data, error } = await client.schema("tongs").rpc(name, args);
    return parseRpc(data, error, mapper);
  };

  const repository: BarStockRepository = {
    async hydrateWorkspace(scope) {
      assertScope(scope);
      const db = client.schema("tongs") as any;
      const [assignmentResult, sparkResult, linkResult] = await Promise.all([
        db.from("barstock_assignments").select("id,title,status,revision,created_at,updated_at").eq("workspace_id", scope.workspaceId).neq("status", "archived").order("updated_at", { ascending: false }),
        db.from("barstock_sparks").select("id,assignment_id,title,body,tags,status,source,pinned,revision,created_at,updated_at,deleted_at").eq("workspace_id", scope.workspaceId).is("deleted_at", null).order("created_at", { ascending: false }),
        db.from("barstock_project_episode_links").select("project_id,workpiece_id").eq("workspace_id", scope.workspaceId),
      ]);
      const error = assignmentResult.error ?? sparkResult.error ?? linkResult.error;
      if (error) throw new BarStockAuthorityUnavailableError(errorText(error));
      const links: Record<string, string> = {};
      for (const row of linkResult.data ?? []) {
        if (typeof row.project_id === "string" && typeof row.workpiece_id === "string") links[row.project_id] = row.workpiece_id;
      }
      return {
        assignments: (assignmentResult.data ?? []).map((row: Record<string, unknown>) => mapAssignment(row, links[String(row.id)] ?? null)).filter((row: Assignment) => row.id && row.name && row.revision > 0),
        sparks: (sparkResult.data ?? []).map(mapSpark).filter((row: Spark) => row.id && row.body.trim() && row.revision > 0),
        links,
      };
    },
    async list(scope) { return this.hydrateWorkspace(scope); },
    async createAssignment(scope, assignment, importKey) {
      assertScope(scope);
      return rpc("barstock_apply_assignment", { p_row: assignmentPayload(scope, assignment), p_expected_revision: null, p_import_key: importKey }, mapAssignment);
    },
    async updateAssignment(scope, assignment, expectedRevision) {
      assertScope(scope);
      return rpc("barstock_apply_assignment", { p_row: assignmentPayload(scope, assignment), p_expected_revision: expectedRevision, p_import_key: null }, mapAssignment);
    },
    async archiveAssignment(scope, assignmentId, expectedRevision) {
      assertScope(scope);
      return rpc("barstock_archive_assignment", { p_workspace_id: scope.workspaceId, p_id: assignmentId, p_expected_revision: expectedRevision }, mapAssignment);
    },
    async deleteAssignment(scope, assignmentId, expectedRevision) {
      assertScope(scope);
      if (await this.getAssignmentWorkpieceLink(scope, assignmentId)) return { outcome: "linked", row: null };
      return rpc("barstock_delete_assignment", { p_workspace_id: scope.workspaceId, p_id: assignmentId, p_expected_revision: expectedRevision }, mapAssignment);
    },
    async createSpark(scope, spark, importKey) {
      assertScope(scope);
      return rpc("barstock_apply_spark", { p_row: sparkPayload(scope, spark), p_expected_revision: null, p_import_key: importKey }, mapSpark);
    },
    async updateSpark(scope, spark, expectedRevision) {
      assertScope(scope);
      return rpc("barstock_apply_spark", { p_row: sparkPayload(scope, spark), p_expected_revision: expectedRevision, p_import_key: null }, mapSpark);
    },
    async archiveSpark(scope, sparkId, expectedRevision) {
      assertScope(scope);
      return rpc("barstock_archive_spark", { p_workspace_id: scope.workspaceId, p_id: sparkId, p_expected_revision: expectedRevision }, mapSpark);
    },
    async getAssignmentWorkpieceLink(scope, assignmentId) {
      assertScope(scope);
      const { data, error } = await (client.schema("tongs") as any).from("barstock_project_episode_links")
        .select("workpiece_id").eq("workspace_id", scope.workspaceId).eq("project_id", assignmentId).maybeSingle();
      if (error) throw new BarStockAuthorityUnavailableError(errorText(error));
      return typeof data?.workpiece_id === "string" ? data.workpiece_id : null;
    },
  };
  return repository;
}
