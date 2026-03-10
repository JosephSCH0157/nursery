import type { DraftId } from "../domain/draft";
import type { HearthSession } from "../domain/session";
import type { SessionStore } from "./session-store";

const SESSION_STORAGE_PREFIX = "hearth:session:v2:";
const WORKSPACE_QUERY_KEYS = ["workspace_id", "workspaceId", "workspace"] as const;
const WORKSPACE_STORAGE_KEYS = ["forge_workspace_id_v1", "barstock_workspace_id"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeDraftId(value: unknown): DraftId | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeUuid(value: unknown): string | null {
  const text = readString(value);
  if (!text) return null;
  return UUID_RE.test(text) ? text.toLowerCase() : null;
}

function readLocalStorage(key: string): string | null {
  try {
    return readString(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function resolveWorkspaceId(): string | null {
  try {
    const params = new URLSearchParams(window.location.search || "");
    for (const key of WORKSPACE_QUERY_KEYS) {
      const value = normalizeUuid(params.get(key));
      if (value) return value;
    }
  } catch {
    // ignore
  }

  for (const key of WORKSPACE_STORAGE_KEYS) {
    const value = normalizeUuid(readLocalStorage(key));
    if (value) return value;
  }

  return null;
}

function resolveSessionStorageKey(): string | null {
  const workspaceId = resolveWorkspaceId();
  if (!workspaceId) return null;
  return `${SESSION_STORAGE_PREFIX}${workspaceId}`;
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
      cursorPosition: isFiniteNumber((row.uiState as Record<string, unknown>).cursorPosition)
        ? (row.uiState as Record<string, unknown>).cursorPosition as number
        : undefined,
      scrollTop: isFiniteNumber((row.uiState as Record<string, unknown>).scrollTop)
        ? (row.uiState as Record<string, unknown>).scrollTop as number
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
  const key = resolveSessionStorageKey();
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return normalizeSession(parsed);
  } catch {
    return null;
  }
}

function writeSession(session: HearthSession): void {
  const key = resolveSessionStorageKey();
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(session));
}

export class LocalSessionStore implements SessionStore {
  async getSession(): Promise<HearthSession | null> {
    return readSession();
  }

  async saveSession(session: HearthSession): Promise<void> {
    writeSession(session);
  }

  async clearSession(): Promise<void> {
    const key = resolveSessionStorageKey();
    if (!key) return;
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}
