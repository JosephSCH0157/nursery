import { supabase } from "./supabase";
import type { OutboxOp } from "./outbox";
import type { Session, Spark } from "./model";

type FlushResult = {
  sent: number;
  failed: number;
  errors: string[];
};

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
    const rows = sparksToUpsert.map((sp) => ({
      id: sp.id,
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
    }));

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
