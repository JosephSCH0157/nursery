import type { Session, SessionId } from "./model";
import { newId, now } from "./model";

const KEY = "barstock_sessions_v1";

export function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Session[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSessions(sessions: Session[]): void {
  localStorage.setItem(KEY, JSON.stringify(sessions));
}

export function makeSession(name: string): Session {
  const t = now();
  return {
    id: newId(),
    name: name.trim(),
    createdAt: t,
    updatedAt: t
  };
}

export function upsertSession(list: Session[], s: Session): Session[] {
  const idx = list.findIndex(x => x.id === s.id);
  if (idx === -1) return [s, ...list];
  const next = list.slice();
  next[idx] = s;
  return next;
}

export function removeSession(list: Session[], id: SessionId): Session[] {
  return list.filter(s => s.id !== id);
}
