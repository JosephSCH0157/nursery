import type { Assignment, AssignmentId } from "./model";
import { newId, now } from "./model";

const KEY = "barstock_assignments_v1";
const LEGACY_KEY = "barstock_sessions_v1";
const KEY_PREFIX = "barstock_assignments_v2";
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "to", "of", "for", "in", "on", "at", "by", "with", "from"
]);

function normalizedScope(workspaceId?: string | null): string | null {
  const trimmed = typeof workspaceId === "string" ? workspaceId.trim().toLowerCase() : "";
  return trimmed || null;
}

function scopedKey(workspaceId?: string | null): string {
  const scope = normalizedScope(workspaceId);
  return scope ? `${KEY_PREFIX}:${scope}` : KEY;
}

function parseAssignments(raw: string | null): Assignment[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Assignment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadAssignments(workspaceId?: string | null): Assignment[] {
  const key = scopedKey(workspaceId);
  const scoped = parseAssignments(localStorage.getItem(key));
  if (scoped.length > 0 || key === KEY) return scoped;
  return parseAssignments(localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY));
}

export function saveAssignments(assignments: Assignment[], workspaceId?: string | null): void {
  localStorage.setItem(scopedKey(workspaceId), JSON.stringify(assignments));
}

export function buildAssignmentNameFromSpark(body: string, at: number = now()): string {
  const text = body.toLowerCase();
  const tokens = text.match(/[a-z0-9]+/g) ?? [];

  let keyword = "idea";
  for (const t of tokens) {
    if (STOP_WORDS.has(t)) continue;
    keyword = t;
    break;
  }

  const d = new Date(at);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");

  return `${keyword}_${y}-${m}-${day}_${hh}${mm}`;
}

export function makeAssignment(name: string, partial?: Partial<Assignment>): Assignment {
  const t = now();
  return {
    id: newId(),
    name: name.trim(),
    createdAt: t,
    updatedAt: t,
    ...partial
  };
}

export function makeAssignmentFromSpark(body: string, at: number = now()): Assignment {
  return makeAssignment(buildAssignmentNameFromSpark(body, at), { createdAt: at, updatedAt: at });
}

export function upsertAssignment(list: Assignment[], s: Assignment): Assignment[] {
  const idx = list.findIndex(x => x.id === s.id);
  if (idx === -1) return [s, ...list];
  const next = list.slice();
  next[idx] = s;
  return next;
}

export function removeAssignment(list: Assignment[], id: AssignmentId): Assignment[] {
  return list.filter(s => s.id !== id);
}
