import { supabase } from "./supabase";
import type { OutboxOp } from "./outbox";
import type { Session, Spark } from "./model";

type FlushResult = {
  sent: number;
  failed: number;
  errors: string[];
};

const SPARK_ID_MAP_KEY = "forge_barstock_spark_idmap_v1";

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

function uniqById<T extends { id: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const it of items) map.set(it.id, it);
  return [...map.values()];
}

export async function flushOutboxToTongs(args: {
  workspaceId: string;
  userId: string;
  ops: OutboxOp[];
}): Promise<FlushResult> {
  const { workspaceId, userId, ops } = args;

  const result: FlushResult = { sent: 0, failed: 0, errors: [] };
  if (!supabase) {
    return { ...result, errors: ["Cloud sync unavailable (missing Supabase env)."] };
  }
  if (!workspaceId) return { ...result, errors: ["Missing workspaceId"] };
  if (!userId) return { ...result, errors: ["Missing userId"] };
  if (!ops.length) return result;

  const upsertSessions: Session[] = [];
  const upsertSparks: Spark[] = [];
  const deleteSessionIds: string[] = [];
  const deleteSparkIds: string[] = [];

  for (const op of ops) {
    switch (op.op) {
      case "upsert_session":
        upsertSessions.push(op.session);
        break;
      case "upsert_spark":
        upsertSparks.push(op.spark);
        break;
      case "delete_session":
        deleteSessionIds.push(op.sessionId);
        break;
      case "delete_spark":
        deleteSparkIds.push(op.sparkId);
        break;
    }
  }

  const deleteSessionsSet = new Set(deleteSessionIds);
  const deleteSparksSet = new Set(deleteSparkIds);

  const sessionsToUpsert = uniqById(upsertSessions).filter(s => !deleteSessionsSet.has(s.id));
  const sparksToUpsert = uniqById(upsertSparks).filter(s => !deleteSparksSet.has(s.id));

  if (sessionsToUpsert.length) {
    const rows = sessionsToUpsert.map((s) => ({
      id: s.id,
      workspace_id: workspaceId,
      created_by: userId,
      name: s.name,
      pinned: !!s.pinned,
      deleted_at: null
    }));

    const { error } = await supabase
      .schema("tongs")
      .from("barstock_sessions")
      .upsert(rows, { onConflict: "id" });

    if (error) {
      result.failed += rows.length;
      result.errors.push(`sessions upsert: ${error.message}`);
    } else {
      result.sent += rows.length;
    }
  }

  if (sparksToUpsert.length) {
    const rows = sparksToUpsert.map((sp) => {
      const normalizedId = normalizeSparkId(sp.id);

      return {
        id: normalizedId,
        workspace_id: workspaceId,
        created_by: userId,
        session_id: sp.sessionId ?? null,
        title: sp.title ?? null,
        body: sp.body,
        tags: Array.isArray(sp.tags) ? sp.tags : [],
        status: sp.status,
        source: sp.source,
        pinned: !!sp.pinned,
        deleted_at: null
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

  if (deleteSessionIds.length) {
    const { error } = await supabase
      .schema("tongs")
      .from("barstock_sessions")
      .update({ deleted_at: nowIso() })
      .eq("workspace_id", workspaceId)
      .in("id", [...new Set(deleteSessionIds)]);

    if (error) {
      result.failed += deleteSessionIds.length;
      result.errors.push(`sessions delete: ${error.message}`);
    } else {
      result.sent += deleteSessionIds.length;
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

export async function checkTongsOnline(workspaceId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase
    .schema("tongs")
    .from("mount_registry")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("role", "barstock")
    .limit(1);

  if (error) return false;
  return !!data && data.length > 0;
}
