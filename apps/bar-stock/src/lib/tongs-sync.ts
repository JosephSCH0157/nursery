import { supabase } from "./supabase";
import type { OutboxOp } from "./outbox";
import type { Assignment, Spark } from "./model";

type FlushResult = {
  sent: number;
  failed: number;
  errors: string[];
};

type SyncOp =
  | OutboxOp
  | { op: "upsert_session"; session: Assignment }
  | { op: "delete_session"; sessionId: string };

const DEV = import.meta.env.DEV;
const SPARK_ID_MAP_KEY = "forge_barstock_spark_idmap_v1";
const TONGS_ONLINE_TTL_MS = 30_000;

const tongsOnlineCache = new Map<string, { at: number; value: boolean }>();

function isUuid(v: unknown): v is string {
  return typeof v === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function loadSparkIdMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SPARK_ID_MAP_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function saveSparkIdMap(map: Record<string, string>) {
  try {
    localStorage.setItem(SPARK_ID_MAP_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

/** Returns a stable UUID for a possibly-non-UUID legacy id. */
function normalizeSparkId(id: string): string {
  if (isUuid(id)) return id;

  const map = loadSparkIdMap();
  const existing = map[id];
  if (existing && isUuid(existing)) return existing;

  const next = crypto.randomUUID();
  map[id] = next;
  saveSparkIdMap(map);
  return next;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeSparkStatus(value: unknown): "raw" | "warming" | "forged" | "archived" {
  if (value === "raw" || value === "warming" || value === "forged" || value === "archived") {
    return value;
  }
  // Graduation is derived from approved/published script signals in Tongs; keep
  // canonical barstock_sparks.status in supported states for now.
  if (value === "graduated") return "forged";
  return "raw";
}

function normalizeSparkSource(value: unknown): "typed" | "paste" | "voice" | "import" | "link" | "other" {
  if (value === "typed" || value === "paste" || value === "voice" || value === "import" || value === "link" || value === "other") {
    return value;
  }
  return "other";
}

function uniqById<T extends { id: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const it of items) map.set(it.id, it);
  return [...map.values()];
}

export async function flushOutboxToTongs(args: {
  workspaceId: string;
  userId: string;
  ops: SyncOp[];
}): Promise<FlushResult> {
  const { workspaceId, userId, ops } = args;

  const result: FlushResult = { sent: 0, failed: 0, errors: [] };
  if (!supabase) {
    return { ...result, errors: ["Cloud sync unavailable (missing Supabase env)."] };
  }
  if (!workspaceId) return { ...result, errors: ["Missing workspaceId"] };
  if (!userId) return { ...result, errors: ["Missing userId"] };
  if (!ops.length) return result;

  const upsertAssignments: Assignment[] = [];
  const upsertSparks: Spark[] = [];
  const deleteAssignmentIds: string[] = [];
  const deleteSparkIds: string[] = [];

  for (const op of ops) {
    switch (op.op) {
      case "upsert_assignment":
        upsertAssignments.push(op.assignment);
        break;
      case "upsert_spark":
        upsertSparks.push(op.spark);
        break;
      case "delete_assignment":
        deleteAssignmentIds.push(op.assignmentId);
        break;
      case "delete_spark":
        deleteSparkIds.push(op.sparkId);
        break;
      case "upsert_session":
        upsertAssignments.push(op.session);
        break;
      case "delete_session":
        deleteAssignmentIds.push(op.sessionId);
        break;
    }
  }

  const deleteAssignmentsSet = new Set(deleteAssignmentIds);
  const deleteSparksSet = new Set(deleteSparkIds);

  const assignmentsToUpsert = uniqById(upsertAssignments).filter(s => !deleteAssignmentsSet.has(s.id));
  const sparksToUpsert = uniqById(upsertSparks).filter(s => !deleteSparksSet.has(s.id));

  if (assignmentsToUpsert.length) {
    const rows = assignmentsToUpsert.map((s) => ({
      id: s.id,
      workspace_id: workspaceId,
      created_by: userId,
      title: s.name,
      status: "open",
      created_at: new Date(s.createdAt ?? Date.now()).toISOString(),
      updated_at: new Date(s.updatedAt ?? s.createdAt ?? Date.now()).toISOString(),
    }));

    const { error } = await supabase
      .schema("tongs")
      .from("barstock_assignments")
      .upsert(rows, { onConflict: "id" });

    if (error) {
      result.failed += rows.length;
      result.errors.push(`assignments upsert: ${error.message}`);
    } else {
      result.sent += rows.length;
    }
  }

  if (sparksToUpsert.length) {
    const rows = sparksToUpsert.map((sp) => {
      const normalizedId = normalizeSparkId(sp.id);
      if (sp.id !== normalizedId) sp.id = normalizedId;

      return {
        id: normalizedId,
        workspace_id: workspaceId,
        created_by: userId,
        assignment_id: sp.assignmentId ?? null,
        title: sp.title ?? null,
        body: sp.body,
        tags: Array.isArray(sp.tags) ? sp.tags : [],
        status: normalizeSparkStatus(sp.status),
        source: normalizeSparkSource(sp.source),
        pinned: !!sp.pinned,
        deleted_at: null,
        created_at: new Date(sp.createdAt ?? Date.now()).toISOString(),
        updated_at: new Date(sp.updatedAt ?? sp.createdAt ?? Date.now()).toISOString(),
      };
    });

    const bad = rows.filter(r => !isUuid(r.id));
    if (bad.length) {
      console.warn("[tongs-sync] non-uuid spark ids still present", bad.slice(0, 5));
    }

    const { error } = await supabase
      .schema("tongs")
      .from("barstock_sparks")
      .upsert(rows, { onConflict: "id" });

    if (error) {
      result.failed += rows.length;
      result.errors.push(`sparks upsert: ${error.message}`);
    } else {
      result.sent += rows.length;
    }
  }

  if (deleteAssignmentIds.length) {
    const { error } = await supabase
      .schema("tongs")
      .from("barstock_assignments")
      .update({ status: "archived", updated_at: nowIso() })
      .eq("workspace_id", workspaceId)
      .in("id", [...new Set(deleteAssignmentIds)]);

    if (error) {
      result.failed += deleteAssignmentIds.length;
      result.errors.push(`assignments delete: ${error.message}`);
    } else {
      result.sent += deleteAssignmentIds.length;
    }
  }

  if (deleteSparkIds.length) {
    const { error } = await supabase
      .schema("tongs")
      .from("barstock_sparks")
      .update({ deleted_at: nowIso() })
      .eq("workspace_id", workspaceId)
      .in("id", [...new Set(deleteSparkIds)]);

    if (error) {
      result.failed += deleteSparkIds.length;
      result.errors.push(`sparks delete: ${error.message}`);
    } else {
      result.sent += deleteSparkIds.length;
    }
  }

  return result;
}

export async function checkTongsOnline(
  workspaceId: string,
  opts?: { reason?: string; reloadToken?: number; force?: boolean; role?: string },
): Promise<boolean> {
  if (!supabase) return false;
  const role = opts?.role ?? "barstock";
  const cacheKey = `${workspaceId}:${role}`;
  const now = Date.now();
  const cached = tongsOnlineCache.get(cacheKey);
  if (!opts?.force && cached && now - cached.at < TONGS_ONLINE_TTL_MS) {
    return cached.value;
  }

  if (DEV) {
    console.info("[tongs-sync] mount_registry fetch", {
      workspaceId,
      role,
      reason: opts?.reason ?? "effect",
      reloadToken: opts?.reloadToken,
      probe: "workspaces",
    });
  }
  const { data, error } = await supabase
    .schema("tongs")
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .limit(1);

  const online = !error && !!data && data.length > 0;
  tongsOnlineCache.set(cacheKey, { at: now, value: online });
  return online;
}
