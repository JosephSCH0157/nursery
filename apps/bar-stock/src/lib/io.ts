import type { Spark } from "./model";
import { makeSpark, now } from "./model";

export type ImportResult = {
  imported: number;
  skipped: number;
  errors: number;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asBool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === "string") out.push(x);
  }
  return out;
}

/**
 * Accepts either:
 *  - { version: "barstock_sparks_v1", sparks: Spark[] }
 *  - Spark[] (raw array)
 *  - { sparks: Spark[] } (loose)
 *
 * Anything malformed becomes a “best effort” Spark via makeSpark(body).
 */
export function parseImportJson(rawText: string): { sparks: Spark[]; errors: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { sparks: [], errors: 1 };
  }

  let list: unknown = parsed;

  if (isObject(parsed)) {
    if (Array.isArray((parsed as any).sparks)) list = (parsed as any).sparks;
  }

  if (!Array.isArray(list)) return { sparks: [], errors: 1 };

  let errors = 0;
  const sparks: Spark[] = [];

  for (const item of list) {
    if (!isObject(item)) {
      errors++;
      continue;
    }

    const body = asString(item.body);
    if (!body || !body.trim()) {
      errors++;
      continue;
    }

    // best-effort hydration, but never trust imported timestamps blindly
    const id = asString(item.id) ?? undefined;
    const createdAt = asNumber(item.createdAt) ?? now();
    const updatedAt = asNumber(item.updatedAt) ?? createdAt;
    const tags = asStringArray(item.tags) ?? [];
    const status = asString(item.status) as any;
    const source = asString(item.source) as any;
    const pinned = asBool(item.pinned) ?? false;

    // Build a “real” Spark, then overlay safe fields
    const s = makeSpark(body, {
      id,
      createdAt,
      updatedAt,
      tags,
      pinned,
      status:
        status === "raw" || status === "warming" || status === "forged" || status === "archived"
          ? status
          : "raw",
      source:
        source === "typed" || source === "paste" || source === "voice" || source === "import" || source === "link" || source === "other"
          ? source
          : "import"
    });

    sparks.push(s);
  }

  return { sparks, errors };
}

export function mergeSparks(existing: Spark[], incoming: Spark[]): ImportResult & { merged: Spark[] } {
  const byId = new Map<string, Spark>();
  for (const s of existing) byId.set(s.id, s);

  let imported = 0;
  let skipped = 0;

  for (const s of incoming) {
    const prev = byId.get(s.id);
    if (!prev) {
      byId.set(s.id, s);
      imported++;
      continue;
    }

    // If same id exists, keep whichever is newer
    if ((s.updatedAt ?? 0) > (prev.updatedAt ?? 0)) {
      byId.set(s.id, s);
      imported++;
    } else {
      skipped++;
    }
  }

  const merged = Array.from(byId.values());
  return { merged, imported, skipped, errors: 0 };
}

export function buildExportPayload(sparks: Spark[]) {
  return {
    version: "barstock_sparks_v1",
    exportedAt: new Date().toISOString(),
    sparks
  };
}

export function downloadJson(filename: string, obj: unknown) {
  const text = JSON.stringify(obj, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 500);
}
