import type { Assignment, Spark } from "./model";
import type { RetryStorage } from "./retry-cache";

const ASSIGNMENT_KEYS = ["barstock_assignments_v1", "barstock_sessions_v1"];
const SPARK_KEYS = ["barstock_sparks_v1"];

export type LegacyImportData = {
  assignments: Array<{ originalId: string; canonical: Assignment; importKey: string }>;
  sparks: Array<{ originalId: string; canonical: Spark; importKey: string }>;
  malformed: number;
  sourceKeys: string[];
};

async function deterministicUuid(namespace: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(namespace)));
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = [...digest.slice(0, 16)].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function canonicalId(workspaceId: string, kind: "assignment" | "spark", originalId: string): Promise<string> {
  const normalized = originalId.trim().toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) return normalized;
  return deterministicUuid(`forge:${workspaceId.toLowerCase()}:${kind}:${originalId}`);
}

function arraysFrom(storage: RetryStorage, keys: string[]): Array<{ key: string; rows: unknown[] }> {
  const result: Array<{ key: string; rows: unknown[] }> = [];
  for (const key of keys) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      result.push({ key, rows: Array.isArray(parsed) ? parsed : [] });
    } catch {
      result.push({ key, rows: [null] });
    }
  }
  return result;
}

export async function readLegacyImport(storage: RetryStorage, workspaceId: string): Promise<LegacyImportData> {
  const scope = workspaceId.trim().toLowerCase();
  const assignmentSources = arraysFrom(storage, [...ASSIGNMENT_KEYS, `barstock_assignments_v2:${scope}`]);
  const sparkSources = arraysFrom(storage, [...SPARK_KEYS, `barstock_sparks_v2:${scope}`]);
  const assignmentIds = new Map<string, string>();
  const assignments: LegacyImportData["assignments"] = [];
  const sparks: LegacyImportData["sparks"] = [];
  let malformed = 0;

  for (const { rows } of assignmentSources) {
    for (const value of rows) {
      if (!value || typeof value !== "object") { malformed++; continue; }
      const row = value as Record<string, unknown>;
      if (typeof row.id !== "string" || typeof row.name !== "string" || !row.name.trim()) { malformed++; continue; }
      if (assignmentIds.has(row.id)) continue;
      const id = await canonicalId(scope, "assignment", row.id);
      assignmentIds.set(row.id, id);
      assignments.push({
        originalId: row.id,
        importKey: `legacy:assignment:${row.id}`,
        canonical: {
          id, name: row.name.trim(), revision: 0,
          createdAt: typeof row.createdAt === "number" ? row.createdAt : Date.now(),
          updatedAt: typeof row.updatedAt === "number" ? row.updatedAt : Date.now(),
        },
      });
    }
  }

  const seenSparks = new Set<string>();
  for (const { rows } of sparkSources) {
    for (const value of rows) {
      if (!value || typeof value !== "object") { malformed++; continue; }
      const row = value as Record<string, unknown>;
      if (typeof row.id !== "string" || typeof row.body !== "string" || !row.body.trim()) { malformed++; continue; }
      if (seenSparks.has(row.id)) continue;
      seenSparks.add(row.id);
      const id = await canonicalId(scope, "spark", row.id);
      const rawAssignmentId = typeof row.assignmentId === "string" ? row.assignmentId : null;
      let canonicalAssignmentId: string | null = null;
      if (rawAssignmentId) {
        canonicalAssignmentId = assignmentIds.get(rawAssignmentId) ?? await canonicalId(scope, "assignment", rawAssignmentId);
        if (!assignmentIds.has(rawAssignmentId)) {
          assignmentIds.set(rawAssignmentId, canonicalAssignmentId);
          const at = typeof row.createdAt === "number" ? row.createdAt : Date.now();
          assignments.push({
            originalId: rawAssignmentId,
            importKey: `legacy:assignment:${rawAssignmentId}`,
            canonical: {
              id: canonicalAssignmentId,
              name: typeof row.title === "string" && row.title.trim() ? row.title.trim() : "Imported Project",
              revision: 0,
              createdAt: at,
              updatedAt: typeof row.updatedAt === "number" ? row.updatedAt : at,
            },
          });
        }
      }
      sparks.push({
        originalId: row.id,
        importKey: `legacy:spark:${row.id}`,
        canonical: {
          id, revision: 0, body: row.body.trim(),
          title: typeof row.title === "string" ? row.title : undefined,
          assignmentId: canonicalAssignmentId,
          tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string") : [],
          status: row.status === "warming" || row.status === "forged" || row.status === "archived" ? row.status : "raw",
          source: row.source === "typed" || row.source === "paste" || row.source === "voice" || row.source === "link" ? row.source : "import",
          pinned: row.pinned === true,
          createdAt: typeof row.createdAt === "number" ? row.createdAt : Date.now(),
          updatedAt: typeof row.updatedAt === "number" ? row.updatedAt : Date.now(),
        },
      });
    }
  }
  return { assignments, sparks, malformed, sourceKeys: [...assignmentSources, ...sparkSources].map((source) => source.key) };
}

export function markLegacyImportAcknowledged(storage: RetryStorage, workspaceId: string, sourceKeys: readonly string[]): void {
  storage.setItem(`barstock_legacy_import_v3:${workspaceId.toLowerCase()}`, JSON.stringify({ acknowledgedAt: new Date().toISOString() }));
  for (const key of sourceKeys) storage.removeItem(key);
}
