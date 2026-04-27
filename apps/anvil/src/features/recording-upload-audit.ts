import type { RecordingUploadStatusDetail, UploadStrategy } from "../forge/workpiece-commit";

export type RecordingUploadAuditPhase = "preflight" | "uploading" | "finalizing" | "done" | "failed";

export type RecordingUploadAuditEntry = {
  id: string;
  createdAtIso: string;
  updatedAtIso: string;

  sessionRunKey: string | null;
  workpieceId: string | null;
  workspaceId: string | null;
  title: string | null;
  scriptHash: string | null;

  strategy: UploadStrategy;
  phase: RecordingUploadAuditPhase;
  safeToLeave: boolean;

  blobBytes: number | null;
  blobMb: number | null;

  chunkIndex: number | null;
  chunkTotal: number | null;
  progressPct: number | null;

  canonicalAttempted: boolean;
  canonicalSucceeded: boolean;
  fallbackUsed: boolean;

  errorCode: string | null;
  errorMessage: string | null;

  finalStorageKey: string | null;
};

type RecordingUploadFallbackDetail = {
  sessionRunKey?: string | null;
  workpieceId?: string | null;
  workspaceId?: string | null;
  title?: string | null;
  scriptHash?: string | null;
  strategy?: UploadStrategy | null;
  phase?: RecordingUploadAuditPhase | null;
  safeToLeave?: boolean;
  blobBytes?: number | null;
  blobMb?: number | null;
  canonicalAttempted?: boolean;
  canonicalSucceeded?: boolean;
  fallbackUsed?: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  finalStorageKey?: string | null;
};

export const RECORDING_UPLOAD_AUDIT_STORAGE_KEY = "forge_anvil_recording_upload_audit_v1";
export const RECORDING_UPLOAD_AUDIT_MAX_ENTRIES = 25;

let historyCache: RecordingUploadAuditEntry[] | null = null;
let listenersWired = false;

function nowIso(): string {
  return new Date().toISOString();
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function toBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function toNumberOrNull(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function toPhase(value: unknown): RecordingUploadAuditPhase {
  const candidate = String(value || "").toLowerCase();
  if (candidate === "preflight") return "preflight";
  if (candidate === "uploading") return "uploading";
  if (candidate === "finalizing") return "finalizing";
  if (candidate === "done") return "done";
  return "failed";
}

function toStrategy(value: unknown): UploadStrategy {
  return String(value || "").toLowerCase() === "chunked" ? "chunked" : "single";
}

function sanitizeEntry(raw: unknown): RecordingUploadAuditEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<RecordingUploadAuditEntry>;
  const id = toStringOrNull(row.id);
  if (!id) return null;
  return {
    id,
    createdAtIso: toStringOrNull(row.createdAtIso) || nowIso(),
    updatedAtIso: toStringOrNull(row.updatedAtIso) || nowIso(),
    sessionRunKey: toStringOrNull(row.sessionRunKey),
    workpieceId: toStringOrNull(row.workpieceId),
    workspaceId: toStringOrNull(row.workspaceId),
    title: toStringOrNull(row.title),
    scriptHash: toStringOrNull(row.scriptHash),
    strategy: toStrategy(row.strategy),
    phase: toPhase(row.phase),
    safeToLeave: toBoolean(row.safeToLeave),
    blobBytes: toNumberOrNull(row.blobBytes),
    blobMb: toNumberOrNull(row.blobMb),
    chunkIndex: toNumberOrNull(row.chunkIndex),
    chunkTotal: toNumberOrNull(row.chunkTotal),
    progressPct: toNumberOrNull(row.progressPct),
    canonicalAttempted: toBoolean(row.canonicalAttempted),
    canonicalSucceeded: toBoolean(row.canonicalSucceeded),
    fallbackUsed: toBoolean(row.fallbackUsed),
    errorCode: toStringOrNull(row.errorCode),
    errorMessage: toStringOrNull(row.errorMessage),
    finalStorageKey: toStringOrNull(row.finalStorageKey),
  };
}

function makeAuditId(seed: string | null): string {
  const safeSeed = toStringOrNull(seed) || "upload";
  return `audit:${safeSeed}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 9)}`;
}

function chooseTitle(existing: string | null, incoming: string | null): string | null {
  if (existing) return existing;
  return incoming;
}

function clampProgress(value: number | null): number | null {
  if (!Number.isFinite(Number(value))) return null;
  const n = Math.round(Number(value));
  return Math.max(0, Math.min(100, n));
}

function toEntryArray(raw: unknown): RecordingUploadAuditEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => sanitizeEntry(item))
    .filter((item): item is RecordingUploadAuditEntry => !!item);
}

export function trimRecordingUploadAuditHistory(
  entries: RecordingUploadAuditEntry[],
  maxEntries = RECORDING_UPLOAD_AUDIT_MAX_ENTRIES,
): RecordingUploadAuditEntry[] {
  const limit = Math.max(1, Math.floor(maxEntries));
  return entries.slice(0, limit);
}

export function loadRecordingUploadAuditHistory(
  storage: Storage | null | undefined = typeof localStorage === "undefined" ? null : localStorage,
): RecordingUploadAuditEntry[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(RECORDING_UPLOAD_AUDIT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return trimRecordingUploadAuditHistory(toEntryArray(parsed));
  } catch {
    return [];
  }
}

export function saveRecordingUploadAuditHistory(
  entries: RecordingUploadAuditEntry[],
  storage: Storage | null | undefined = typeof localStorage === "undefined" ? null : localStorage,
): void {
  if (!storage) return;
  try {
    const trimmed = trimRecordingUploadAuditHistory(entries);
    storage.setItem(RECORDING_UPLOAD_AUDIT_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore persistence failures
  }
}

function resolveEntryIndex(entries: RecordingUploadAuditEntry[], sessionRunKey: string | null, id?: string | null): number {
  if (sessionRunKey) {
    return entries.findIndex((entry) => entry.sessionRunKey === sessionRunKey);
  }
  if (id) return entries.findIndex((entry) => entry.id === id);
  return -1;
}

function upsertEntry(
  entries: RecordingUploadAuditEntry[],
  next: Partial<RecordingUploadAuditEntry> & { sessionRunKey?: string | null; id?: string | null },
): RecordingUploadAuditEntry[] {
  const sessionRunKey = toStringOrNull(next.sessionRunKey);
  const now = nowIso();
  const idx = resolveEntryIndex(entries, sessionRunKey, toStringOrNull(next.id));
  const existing = idx >= 0 ? entries[idx] : null;
  const id = toStringOrNull(next.id) || existing?.id || makeAuditId(sessionRunKey);
  const createdAtIso = existing?.createdAtIso || now;
  const merged: RecordingUploadAuditEntry = {
    id,
    createdAtIso,
    updatedAtIso: now,
    sessionRunKey: sessionRunKey ?? existing?.sessionRunKey ?? null,
    workpieceId: toStringOrNull(next.workpieceId) ?? existing?.workpieceId ?? null,
    workspaceId: toStringOrNull(next.workspaceId) ?? existing?.workspaceId ?? null,
    title: chooseTitle(existing?.title ?? null, toStringOrNull(next.title)),
    scriptHash: toStringOrNull(next.scriptHash) ?? existing?.scriptHash ?? null,
    strategy: toStrategy(next.strategy ?? existing?.strategy ?? "single"),
    phase: toPhase(next.phase ?? existing?.phase ?? "preflight"),
    safeToLeave: toBoolean(next.safeToLeave, existing?.safeToLeave ?? false),
    blobBytes: toNumberOrNull(next.blobBytes) ?? existing?.blobBytes ?? null,
    blobMb: toNumberOrNull(next.blobMb) ?? existing?.blobMb ?? null,
    chunkIndex: toNumberOrNull(next.chunkIndex) ?? existing?.chunkIndex ?? null,
    chunkTotal: toNumberOrNull(next.chunkTotal) ?? existing?.chunkTotal ?? null,
    progressPct: clampProgress(toNumberOrNull(next.progressPct) ?? existing?.progressPct ?? null),
    canonicalAttempted: toBoolean(next.canonicalAttempted, existing?.canonicalAttempted ?? false),
    canonicalSucceeded: toBoolean(next.canonicalSucceeded, existing?.canonicalSucceeded ?? false),
    fallbackUsed: toBoolean(next.fallbackUsed, existing?.fallbackUsed ?? false),
    errorCode: toStringOrNull(next.errorCode) ?? existing?.errorCode ?? null,
    errorMessage: toStringOrNull(next.errorMessage) ?? existing?.errorMessage ?? null,
    finalStorageKey: toStringOrNull(next.finalStorageKey) ?? existing?.finalStorageKey ?? null,
  };

  const output = entries.slice();
  if (idx >= 0) output.splice(idx, 1);
  output.unshift(merged);
  return trimRecordingUploadAuditHistory(output);
}

export function applyUploadStatusToAuditEntries(
  entries: RecordingUploadAuditEntry[],
  detail: Partial<RecordingUploadStatusDetail>,
): RecordingUploadAuditEntry[] {
  const phase = toPhase(detail.phase);
  const canonicalAttempted = true;
  const canonicalSucceeded = phase === "done";
  const fallbackUsed = phase === "done" ? false : entries.find((entry) => entry.sessionRunKey === toStringOrNull(detail.sessionRunKey))?.fallbackUsed ?? false;
  return upsertEntry(entries, {
    sessionRunKey: toStringOrNull(detail.sessionRunKey),
    workpieceId: toStringOrNull(detail.workpieceId),
    workspaceId: toStringOrNull(detail.workspaceId),
    title: toStringOrNull(detail.title),
    scriptHash: toStringOrNull(detail.scriptHash),
    strategy: toStrategy(detail.strategy),
    phase,
    safeToLeave: toBoolean(detail.safeToLeave, phase === "done"),
    blobBytes: toNumberOrNull(detail.bytes),
    blobMb: toNumberOrNull(detail.mb),
    chunkIndex: toNumberOrNull(detail.chunkIndex),
    chunkTotal: toNumberOrNull(detail.totalChunks),
    progressPct: clampProgress(toNumberOrNull(detail.progressPct)),
    canonicalAttempted,
    canonicalSucceeded,
    fallbackUsed,
    errorCode: toStringOrNull(detail.errorCode),
    errorMessage: toStringOrNull(detail.errorMessage),
    finalStorageKey: toStringOrNull(detail.finalStorageKey),
  });
}

export function applyUploadFallbackToAuditEntries(
  entries: RecordingUploadAuditEntry[],
  detail: RecordingUploadFallbackDetail,
): RecordingUploadAuditEntry[] {
  const canonicalAttempted = toBoolean(detail.canonicalAttempted, false);
  const canonicalSucceeded = toBoolean(detail.canonicalSucceeded, false);
  return upsertEntry(entries, {
    sessionRunKey: toStringOrNull(detail.sessionRunKey),
    workpieceId: toStringOrNull(detail.workpieceId),
    workspaceId: toStringOrNull(detail.workspaceId),
    title: toStringOrNull(detail.title),
    scriptHash: toStringOrNull(detail.scriptHash),
    strategy: toStrategy(detail.strategy ?? "single"),
    phase: toPhase(detail.phase ?? "failed"),
    safeToLeave: toBoolean(detail.safeToLeave, true),
    blobBytes: toNumberOrNull(detail.blobBytes),
    blobMb: toNumberOrNull(detail.blobMb),
    canonicalAttempted,
    canonicalSucceeded,
    fallbackUsed: toBoolean(detail.fallbackUsed, true),
    errorCode: toStringOrNull(detail.errorCode),
    errorMessage: toStringOrNull(detail.errorMessage),
    finalStorageKey: toStringOrNull(detail.finalStorageKey),
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatLocalTime(iso: string | null): string {
  if (!iso) return "unknown";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function deriveStatusBadge(entry: RecordingUploadAuditEntry): string {
  if (entry.fallbackUsed && !entry.canonicalSucceeded) return "Fallback saved locally";
  if (entry.phase === "preflight") return "Preparing upload";
  if (entry.phase === "uploading") return "Uploading";
  if (entry.phase === "finalizing") return "Finalizing";
  if (entry.phase === "done") return "Upload complete";
  return "Upload failed";
}

function deriveCanonicalSummary(entry: RecordingUploadAuditEntry): string {
  if (entry.canonicalSucceeded) return "Canonical: succeeded";
  if (entry.canonicalAttempted) return "Canonical: failed";
  return "Canonical: skipped";
}

function deriveFallbackSummary(entry: RecordingUploadAuditEntry): string {
  return entry.fallbackUsed ? "Fallback: saved locally" : "Fallback: not used";
}

function formatSize(entry: RecordingUploadAuditEntry): string {
  if (entry.blobMb != null) return `${entry.blobMb.toFixed(2)} MB`;
  if (entry.blobBytes != null) return `${entry.blobBytes} bytes`;
  return "unknown size";
}

function renderLatestEntry(entry: RecordingUploadAuditEntry): string {
  const safe = entry.safeToLeave ? "Yes" : "No";
  const progress =
    entry.strategy === "chunked" && entry.chunkTotal && entry.chunkTotal > 0
      ? `Chunk ${entry.chunkIndex ?? 0}/${entry.chunkTotal}${entry.progressPct != null ? ` (${entry.progressPct}%)` : ""}`
      : entry.progressPct != null
      ? `Progress ${entry.progressPct}%`
      : "Progress n/a";
  const title = escapeHtml(entry.title || "Untitled recording");
  return [
    `<div class="settings-small"><strong>${title}</strong></div>`,
    `<div class="settings-small"><span class="badge">${escapeHtml(deriveStatusBadge(entry))}</span> · ${escapeHtml(entry.strategy.toUpperCase())} · ${escapeHtml(formatSize(entry))}</div>`,
    `<div class="settings-small">${escapeHtml(progress)} · Safe to leave: <strong>${escapeHtml(safe)}</strong></div>`,
    `<div class="settings-small">${escapeHtml(deriveCanonicalSummary(entry))} · ${escapeHtml(deriveFallbackSummary(entry))}</div>`,
    entry.errorMessage ? `<div class="settings-small" style="color:#ffb3b3">Error: ${escapeHtml(entry.errorMessage)}</div>` : "",
  ].join("");
}

function renderHistoryRow(entry: RecordingUploadAuditEntry): string {
  const title = escapeHtml(entry.title || "Untitled recording");
  const updated = escapeHtml(formatLocalTime(entry.updatedAtIso));
  const progress =
    entry.strategy === "chunked" && entry.chunkTotal && entry.chunkTotal > 0
      ? `chunk ${entry.chunkIndex ?? 0}/${entry.chunkTotal}${entry.progressPct != null ? ` (${entry.progressPct}%)` : ""}`
      : entry.progressPct != null
      ? `${entry.progressPct}%`
      : "n/a";
  const error = entry.errorMessage ? ` · ${escapeHtml(entry.errorMessage)}` : "";
  return `<li><strong>${title}</strong> · ${escapeHtml(deriveStatusBadge(entry))} · ${escapeHtml(entry.strategy)} · ${escapeHtml(formatSize(entry))} · ${escapeHtml(progress)} · ${updated}${error}</li>`;
}

function renderAuditPanel(entries: RecordingUploadAuditEntry[]): void {
  const latestEl = document.getElementById("recordingUploadAuditLatest");
  const listEl = document.getElementById("recordingUploadAuditList");
  if (!latestEl || !listEl) return;

  if (!entries.length) {
    latestEl.innerHTML = `<div class="settings-small">No recording uploads yet.</div>`;
    listEl.innerHTML = "";
    return;
  }

  const latest = entries[0];
  latestEl.innerHTML = renderLatestEntry(latest);
  const rows = entries.slice(0, 10).map((entry) => renderHistoryRow(entry)).join("");
  listEl.innerHTML = `<ul class="settings-small" style="margin:8px 0 0 16px;display:grid;gap:4px;">${rows}</ul>`;
}

function emitAuditUpdated(entries: RecordingUploadAuditEntry[]): void {
  try {
    window.dispatchEvent(new CustomEvent("tp:recording:upload-audit-updated", { detail: { entries } }));
  } catch {
    // ignore
  }
}

function commitHistory(next: RecordingUploadAuditEntry[]): void {
  historyCache = trimRecordingUploadAuditHistory(next);
  saveRecordingUploadAuditHistory(historyCache);
  renderAuditPanel(historyCache);
  emitAuditUpdated(historyCache);
}

function ensureHistoryLoaded(): RecordingUploadAuditEntry[] {
  if (historyCache) return historyCache;
  historyCache = loadRecordingUploadAuditHistory();
  return historyCache;
}

function onUploadStatus(event: Event): void {
  const detail = ((event as CustomEvent).detail || {}) as Partial<RecordingUploadStatusDetail>;
  const next = applyUploadStatusToAuditEntries(ensureHistoryLoaded(), detail);
  commitHistory(next);
}

function onUploadFallback(event: Event): void {
  const detail = ((event as CustomEvent).detail || {}) as RecordingUploadFallbackDetail;
  const next = applyUploadFallbackToAuditEntries(ensureHistoryLoaded(), detail);
  commitHistory(next);
}

function onSettingsRendered(): void {
  renderAuditPanel(ensureHistoryLoaded());
}

export function initRecordingUploadAudit(): void {
  if (listenersWired) {
    renderAuditPanel(ensureHistoryLoaded());
    return;
  }
  listenersWired = true;
  ensureHistoryLoaded();
  try {
    window.addEventListener("tp:recording:upload-status", onUploadStatus as EventListener);
    window.addEventListener("tp:recording:upload-fallback", onUploadFallback as EventListener);
    document.addEventListener("tp:settings:rendered", onSettingsRendered as EventListener);
    renderAuditPanel(ensureHistoryLoaded());
  } catch {
    // ignore
  }
}

