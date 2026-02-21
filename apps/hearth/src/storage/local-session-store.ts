import type { DraftId } from "../domain/draft";
import type { HearthSession } from "../domain/session";
import type { SessionStore } from "./session-store";

const SESSION_STORAGE_KEY = "hearth:session";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeDraftId(value: unknown): DraftId | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeSession(value: unknown): HearthSession | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : "default";
  const createdAt = isFiniteNumber(row.createdAt) ? row.createdAt : Date.now();
  const updatedAt = isFiniteNumber(row.updatedAt) ? row.updatedAt : createdAt;
  const lastOpenedAt = isFiniteNumber(row.lastOpenedAt) ? row.lastOpenedAt : undefined;
  const activeDraftId = normalizeDraftId(row.activeDraftId);
  const uiState = row.uiState && typeof row.uiState === "object" && !Array.isArray(row.uiState)
    ? {
      splitPane: typeof (row.uiState as Record<string, unknown>).splitPane === "boolean"
        ? (row.uiState as Record<string, unknown>).splitPane as boolean
        : undefined,
      selectedTab: typeof (row.uiState as Record<string, unknown>).selectedTab === "string"
        ? (row.uiState as Record<string, unknown>).selectedTab as string
        : undefined,
    }
    : undefined;

  return {
    id,
    activeDraftId,
    lastOpenedAt,
    uiState,
    createdAt,
    updatedAt,
  };
}

function readSession(): HearthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return normalizeSession(parsed);
  } catch {
    return null;
  }
}

function writeSession(session: HearthSession): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export class LocalSessionStore implements SessionStore {
  async getSession(): Promise<HearthSession | null> {
    return readSession();
  }

  async saveSession(session: HearthSession): Promise<void> {
    writeSession(session);
  }

  async clearSession(): Promise<void> {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
