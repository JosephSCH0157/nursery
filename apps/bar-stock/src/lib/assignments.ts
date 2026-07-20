import type { Assignment, AssignmentId } from "./model";
import { newId, now } from "./model";

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "to", "of", "for", "in", "on", "at", "by", "with", "from"
]);

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
    revision: 0,
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
