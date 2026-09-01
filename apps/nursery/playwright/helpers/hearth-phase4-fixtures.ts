import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STORAGE_STATE_DEFAULT = "playwright/.auth/state.json";
const ARTIFACT_DEFAULT = "playwright/.cache/hearth-phase4-fixtures.json";
const WORKSPACE_STORAGE_KEYS = ["forge_workspace_id_v1", "barstock_workspace_id"] as const;

type LocalStorageEntry = {
  name?: unknown;
  value?: unknown;
};

type StorageOrigin = {
  origin?: unknown;
  localStorage?: unknown;
};

type StorageState = {
  origins?: unknown;
};

export type HearthPhase4Env = {
  nurseryRoot: string;
  repoRoot: string;
  storageStatePath: string;
  artifactPath: string;
  workspaceId: string;
  workpieceId: string;
};

export type HearthPhase4VerifiedArtifact = {
  verified_at: string;
  storage_state_path: string;
  workspace_id: string;
  workpiece_id: string;
  selected_workspace_id: string;
  invalid_workspace_id: string;
  handoff: {
    title: string;
    script_path: string;
    script_snippet: string;
  };
  ready: {
    visible_items: Array<{ workpiece_id: string; title: string }>;
    visible_titles: string[];
    hidden_items: Array<{ workpiece_id: string; title: string }>;
    hidden_titles: string[];
  };
};

export type StorageSession = {
  accessToken: string;
  accessTokenExpiresAtMs: number | null;
  refreshToken: string | null;
  userId: string | null;
  selectedWorkspaceId: string | null;
  cachedWorkspaceIds: string[];
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeUuid(value: unknown): string | null {
  const trimmed = readString(value);
  if (!trimmed) return null;
  return UUID_RE.test(trimmed) ? trimmed.toLowerCase() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getHelperRoot(): string {
  const filename = fileURLToPath(import.meta.url);
  return path.dirname(filename);
}

export function getNurseryRoot(): string {
  return path.resolve(getHelperRoot(), "..", "..");
}

export function getRepoRoot(): string {
  return path.resolve(getNurseryRoot(), "..", "..");
}

export function parseEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return out;

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!key) continue;
    out[key] = value;
  }
  return out;
}

export function loadNurseryEnv(overrides: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const nurseryRoot = getNurseryRoot();
  return {
    ...parseEnvFile(path.join(nurseryRoot, ".env")),
    ...parseEnvFile(path.join(nurseryRoot, ".env.local")),
    ...Object.fromEntries(
      Object.entries(overrides).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    ),
  };
}

export function getPlaywrightStorageStatePath(env: Record<string, string> = loadNurseryEnv()): string {
  const configured = readString(env.PLAYWRIGHT_STORAGE_STATE);
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(getNurseryRoot(), configured);
  }
  return path.resolve(getNurseryRoot(), STORAGE_STATE_DEFAULT);
}

export function getHearthPhase4ArtifactPath(env: Record<string, string> = loadNurseryEnv()): string {
  const configured = readString(env.HEARTH_PHASE4_FIXTURE_ARTIFACT);
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(getNurseryRoot(), configured);
  }
  return path.resolve(getNurseryRoot(), ARTIFACT_DEFAULT);
}

export function requireFixtureEnv(name: string, env: Record<string, string>): string {
  const value = readString(env[name]);
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function readStorageState(storageStatePath: string): StorageState {
  if (!fs.existsSync(storageStatePath)) {
    throw new Error(`Missing Playwright storage state: ${storageStatePath}`);
  }

  const raw = fs.readFileSync(storageStatePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return isRecord(parsed) ? (parsed as StorageState) : {};
}

function listLocalStorageEntries(storageStatePath: string): LocalStorageEntry[] {
  const state = readStorageState(storageStatePath);
  const origins = Array.isArray(state.origins) ? state.origins : [];
  for (const origin of origins) {
    if (!isRecord(origin)) continue;
    const localStorage = (origin as StorageOrigin).localStorage;
    if (!Array.isArray(localStorage)) continue;
    return localStorage.filter(isRecord);
  }
  return [];
}

function readStorageValue(storageStatePath: string, key: string): string | null {
  const entries = listLocalStorageEntries(storageStatePath);
  for (const entry of entries) {
    const name = readString(entry.name);
    if (name !== key) continue;
    return readString(entry.value);
  }
  return null;
}

function extractAccessToken(value: unknown): string | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const token = extractAccessToken(entry);
      if (token) return token;
    }
    return null;
  }
  if (!isRecord(value)) return null;

  const direct = readString(value.access_token);
  if (direct) return direct;

  const currentSession = value.currentSession;
  if (isRecord(currentSession)) {
    const token = readString(currentSession.access_token);
    if (token) return token;
  }

  const session = value.session;
  if (isRecord(session)) {
    const token = readString(session.access_token);
    if (token) return token;
  }

  const nested = value.data;
  if (nested) {
    return extractAccessToken(nested);
  }

  return null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payload = readString(parts[1]);
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractAccessTokenExpiryMs(token: string): number | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const exp = payload.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp) || exp <= 0) return null;
  return exp * 1000;
}

function extractRefreshToken(value: unknown): string | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const token = extractRefreshToken(entry);
      if (token) return token;
    }
    return null;
  }
  if (!isRecord(value)) return null;

  const direct = readString(value.refresh_token);
  if (direct) return direct;

  const currentSession = value.currentSession;
  if (isRecord(currentSession)) {
    const token = readString(currentSession.refresh_token);
    if (token) return token;
  }

  const session = value.session;
  if (isRecord(session)) {
    const token = readString(session.refresh_token);
    if (token) return token;
  }

  const nested = value.data;
  if (nested) {
    return extractRefreshToken(nested);
  }

  return null;
}

function extractUserId(value: unknown): string | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const userId = extractUserId(entry);
      if (userId) return userId;
    }
    return null;
  }
  if (!isRecord(value)) return null;

  const direct = normalizeUuid(value.user_id) ?? normalizeUuid(value.id) ?? normalizeUuid(value.sub);
  if (direct) return direct;

  const user = value.user;
  if (isRecord(user)) {
    const userId = normalizeUuid(user.id);
    if (userId) return userId;
  }

  const currentSession = value.currentSession;
  if (isRecord(currentSession)) {
    const userId = extractUserId(currentSession);
    if (userId) return userId;
  }

  const session = value.session;
  if (isRecord(session)) {
    const userId = extractUserId(session);
    if (userId) return userId;
  }

  const nested = value.data;
  if (nested) {
    return extractUserId(nested);
  }

  return null;
}

function readWorkspaceIdsFromCache(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const ids: string[] = [];
    for (const item of parsed) {
      if (!isRecord(item)) continue;
      const workspaceId = normalizeUuid(item.id);
      if (workspaceId && !ids.includes(workspaceId)) {
        ids.push(workspaceId);
      }
    }
    return ids;
  } catch {
    return [];
  }
}

export function readStorageSession(storageStatePath: string = getPlaywrightStorageStatePath()): StorageSession {
  const authRaw = readStorageValue(storageStatePath, "forge-auth");
  if (!authRaw) {
    throw new Error(`Missing forge-auth session in storage state: ${storageStatePath}`);
  }

  let parsedAuth: unknown = null;
  try {
    parsedAuth = JSON.parse(authRaw);
  } catch {
    throw new Error(`Invalid forge-auth payload in storage state: ${storageStatePath}`);
  }

  const accessToken = extractAccessToken(parsedAuth);
  if (!accessToken) {
    throw new Error(`Missing access_token in forge-auth payload: ${storageStatePath}`);
  }

  const selectedWorkspaceId = WORKSPACE_STORAGE_KEYS
    .map((key) => normalizeUuid(readStorageValue(storageStatePath, key)))
    .find(Boolean)
    ?? null;
  const cachedWorkspaceIds = readWorkspaceIdsFromCache(
    readStorageValue(storageStatePath, "forge_workspaces_cache_v1"),
  );

  return {
    accessToken,
    accessTokenExpiresAtMs: extractAccessTokenExpiryMs(accessToken),
    refreshToken: extractRefreshToken(parsedAuth),
    userId: extractUserId(parsedAuth),
    selectedWorkspaceId,
    cachedWorkspaceIds,
  };
}

export function getHearthPhase4Fixtures(env: Record<string, string> = loadNurseryEnv()): HearthPhase4Env {
  const manifestPath = path.resolve(getNurseryRoot(), readString(env.FORGE_BROWSER_FIXTURE_MANIFEST) ?? "playwright/.cache/browser-fixtures.v1.json");
  let generated: { workspace_id?: unknown; hearth_workpiece_id?: unknown } = {};
  if (fs.existsSync(manifestPath)) {
    try { generated = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as typeof generated; } catch { generated = {}; }
  }
  const workspaceId = normalizeUuid(readString(env.FORGE_TEST_WORKSPACE_ID) ?? generated.workspace_id);
  const workpieceId = normalizeUuid(readString(env.FORGE_TEST_WORKPIECE_ID) ?? generated.hearth_workpiece_id);
  return {
    nurseryRoot: getNurseryRoot(),
    repoRoot: getRepoRoot(),
    storageStatePath: getPlaywrightStorageStatePath(env),
    artifactPath: getHearthPhase4ArtifactPath(env),
    workspaceId: workspaceId ?? (() => { throw new Error("FORGE_TEST_WORKSPACE_ID or a generated browser fixture manifest must provide a workspace UUID"); })(),
    workpieceId: workpieceId ?? (() => { throw new Error("FORGE_TEST_WORKPIECE_ID or a generated browser fixture manifest must provide a workpiece UUID"); })(),
  };
}

function buildToolUrl(pathname: string, args: {
  workspaceId?: string | null;
  workpieceId?: string | null;
  extraParams?: Record<string, string | null | undefined>;
}): string {
  const params = new URLSearchParams();
  const workspaceId = normalizeUuid(args.workspaceId);
  const workpieceId = normalizeUuid(args.workpieceId);
  if (workspaceId) params.set("workspace_id", workspaceId);
  if (workpieceId) params.set("workpiece_id", workpieceId);
  for (const [key, rawValue] of Object.entries(args.extraParams ?? {})) {
    const value = readString(rawValue);
    if (!value) continue;
    params.set(key, value);
  }
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

export function buildHearthUrl(args: {
  workspaceId?: string | null;
  workpieceId?: string | null;
  extraParams?: Record<string, string | null | undefined>;
} = {}): string {
  return buildToolUrl("/app/hearth", args);
}

export function buildAnvilUrl(args: {
  workspaceId?: string | null;
  workpieceId?: string | null;
  extraParams?: Record<string, string | null | undefined>;
} = {}): string {
  return buildToolUrl("/app/anvil", args);
}

export function buildBarstockUrl(args: {
  workspaceId?: string | null;
  extraParams?: Record<string, string | null | undefined>;
} = {}): string {
  return buildToolUrl("/app/barstock", args);
}

export function readHearthPhase4Artifact(
  artifactPath: string = getHearthPhase4ArtifactPath(),
): HearthPhase4VerifiedArtifact {
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Missing Hearth Phase 4 fixture artifact: ${artifactPath}`);
  }

  const raw = fs.readFileSync(artifactPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Invalid Hearth Phase 4 fixture artifact: ${artifactPath}`);
  }

  const workspaceId = normalizeUuid(parsed.workspace_id);
  const workpieceId = normalizeUuid(parsed.workpiece_id);
  const selectedWorkspaceId = normalizeUuid(parsed.selected_workspace_id);
  const invalidWorkspaceId = normalizeUuid(parsed.invalid_workspace_id);
  const handoff = isRecord(parsed.handoff) ? parsed.handoff : null;
  const ready = isRecord(parsed.ready) ? parsed.ready : null;
  const handoffTitle = readString(handoff?.title);
  const handoffScriptPath = readString(handoff?.script_path);
  const handoffScriptSnippet = readString(handoff?.script_snippet);
  const visibleTitles = Array.isArray(ready?.visible_titles)
    ? ready.visible_titles.map((value) => readString(value)).filter((value): value is string => Boolean(value))
    : [];
  const visibleItems = Array.isArray(ready?.visible_items)
    ? ready.visible_items.map((value) => {
      if (!isRecord(value)) return null;
      const workpieceId = normalizeUuid(value.workpiece_id);
      const title = readString(value.title);
      return workpieceId && title
        ? { workpiece_id: workpieceId, title }
        : null;
    }).filter((value): value is { workpiece_id: string; title: string } => Boolean(value))
    : [];
  const hiddenTitles = Array.isArray(ready?.hidden_titles)
    ? ready.hidden_titles.map((value) => readString(value)).filter((value): value is string => Boolean(value))
    : [];
  const hiddenItems = Array.isArray(ready?.hidden_items)
    ? ready.hidden_items.map((value) => {
      if (!isRecord(value)) return null;
      const workpieceId = normalizeUuid(value.workpiece_id);
      const title = readString(value.title);
      return workpieceId && title
        ? { workpiece_id: workpieceId, title }
        : null;
    }).filter((value): value is { workpiece_id: string; title: string } => Boolean(value))
    : [];
  const verifiedAt = readString(parsed.verified_at);
  const storageStatePath = readString(parsed.storage_state_path);

  if (
    !workspaceId
    || !workpieceId
    || !selectedWorkspaceId
    || !invalidWorkspaceId
    || !handoffTitle
    || !handoffScriptPath
    || !handoffScriptSnippet
    || !verifiedAt
    || !storageStatePath
  ) {
    throw new Error(`Incomplete Hearth Phase 4 fixture artifact: ${artifactPath}`);
  }

  return {
    verified_at: verifiedAt,
    storage_state_path: storageStatePath,
    workspace_id: workspaceId,
    workpiece_id: workpieceId,
    selected_workspace_id: selectedWorkspaceId,
    invalid_workspace_id: invalidWorkspaceId,
    handoff: {
      title: handoffTitle,
      script_path: handoffScriptPath,
      script_snippet: handoffScriptSnippet,
    },
    ready: {
      visible_items: visibleItems,
      visible_titles: visibleTitles,
      hidden_items: hiddenItems,
      hidden_titles: hiddenTitles,
    },
  };
}
