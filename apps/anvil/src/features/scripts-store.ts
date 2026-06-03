// scripts-store.ts
// Centralized script store for local and mapped-folder scripts.

export type ScriptMeta = {
  id: string;
  title: string;
  updated?: string;
};

export type ScriptRecord = {
  id: string;
  title: string;
  content: string;
  updated?: string;
  created?: string;
  source?: 'mapped' | 'local' | 'ready';
};

export type MappedHandle = {
  id: string;
  title: string;
  handle: FileSystemHandle; // FileSystemFileHandle expected
};

import { debugLog, hudLog } from '../env/logging';
import { readReadyScriptText, type ReadyScriptReference } from '../forge/ready-scripts';
import {
  hasUsableReadyScriptContent,
  readReadyScriptRecordContent,
} from './ready-script-loading';

const scriptsById = new Map<string, ScriptRecord>();
const mappedHandles = new Map<string, MappedHandle>();
const readyRefsById = new Map<string, ReadyScriptReference>();
let lastMappedFingerprint = '';
let lastReadyFingerprint = '';
const computeFingerprint = (entries: { id: string }[]) =>
  entries
    .map((e) => String(e.id || ''))
    .sort()
    .join('|');
const computeReadyFingerprint = (entries: ReadyScriptReference[]) =>
  entries
    .map((e) => `${String(e.id || '')}:${String(e.updatedAt || '')}:${String(e.path || '')}`)
    .sort()
    .join('|');

function isScriptSyncDebugEnabled(): boolean {
  try {
    const w = window as any;
    if (w.__tpScriptSyncDebug === true) return true;
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('script_sync_debug') === '1') return true;
  } catch {}
  try {
    if (window.localStorage?.getItem('tp_script_sync_debug') === '1') return true;
  } catch {}
  return false;
}

function scriptStoreLog(...args: any[]): void {
  if (!isScriptSyncDebugEnabled()) return;
  debugLog(...args);
}

function scriptStoreHud(event: string, payload?: any): void {
  if (!isScriptSyncDebugEnabled()) return;
  hudLog(event, payload);
}

function shortUserId(value: string | null | undefined): string {
  const userId = String(value ?? "").trim();
  if (!userId) return "Unknown";
  if (userId.length <= 12) return userId;
  return `${userId.slice(0, 8)}...`;
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return "unknown";
  const diffMs = Date.now() - timestamp;
  const absMs = Math.abs(diffMs);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const weekMs = 7 * dayMs;

  const formatUnit = (unit: Intl.RelativeTimeFormatUnit, amount: number): string => {
    try {
      return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(amount, unit);
    } catch {
      const abs = Math.abs(amount);
      const suffix = amount <= 0 ? "ago" : "from now";
      return `${abs} ${unit}${abs === 1 ? "" : "s"} ${suffix}`;
    }
  };

  if (absMs < hourMs) return formatUnit("minute", -Math.max(1, Math.round(absMs / minuteMs)));
  if (absMs < dayMs) return formatUnit("hour", -Math.round(absMs / hourMs));
  if (absMs < weekMs) return formatUnit("day", -Math.round(absMs / dayMs));
  return formatUnit("week", -Math.round(absMs / weekMs));
}

function formatReadyAttribution(entry: ReadyScriptReference): string {
  const by = shortUserId(entry.markedReadyBy);
  const at = entry.markedReadyAt ?? entry.updatedAt ?? null;
  return at ? `Ready by ${by} (${formatRelativeTime(at)})` : `Ready by ${by}`;
}

async function ensureReadPermission(handle: FileSystemHandle): Promise<boolean> {
  try {
    const h: any = handle as any;
    const hasQuery = typeof h?.queryPermission === 'function';
    const hasRequest = typeof h?.requestPermission === 'function';
    if (!hasQuery && !hasRequest) return true;
    const state = hasQuery ? await h.queryPermission({ mode: 'read' }) : null;
    if (state === 'granted') return true;
    if (!hasRequest) return true;
    const req = await h.requestPermission({ mode: 'read' });
    return req === 'granted';
  } catch {
    return false;
  }
}

function emitScriptsUpdated(): void {
  try {
    window.dispatchEvent(new CustomEvent('tp:scripts-updated'));
  } catch {
    // ignore
  }
}

export const ScriptStore = {
  list(): ScriptMeta[] {
    const all = Array.from(scriptsById.values());
    scriptStoreLog('[SCRIPT-STORE] list size', all.length, all.map((r) => r.id));
    return all.map((rec) => ({
      id: rec.id,
      title: rec.title,
      updated: rec.updated,
    }));
  },

  async get(id: string): Promise<ScriptRecord | null> {
    const existing = scriptsById.get(id);
    if (existing && hasUsableReadyScriptContent(existing.content)) return existing;

    const mapped = mappedHandles.get(id);
    if (!mapped) {
      const ready = readyRefsById.get(id);
      if (!ready) return hasUsableReadyScriptContent(existing?.content) ? existing : null;

      try {
        const text = await readReadyScriptRecordContent(ready, readReadyScriptText);
        if (!hasUsableReadyScriptContent(text)) {
          return hasUsableReadyScriptContent(existing?.content) ? existing : null;
        }
        const rec: ScriptRecord = {
          id: ready.id,
          title: ready.title,
          content: text,
          source: 'ready',
          created: existing?.created || ready.updatedAt || new Date().toISOString(),
          updated: ready.updatedAt || new Date().toISOString(),
        };
        scriptsById.set(id, rec);
        return rec;
      } catch (err) {
        try { console.warn('[scripts-store] failed to load ready script', err); } catch {}
        return hasUsableReadyScriptContent(existing?.content) ? existing : null;
      }
    }

    try {
      const ok = await ensureReadPermission(mapped.handle);
      if (!ok) {
        hudLog('script:permission:denied', { id });
        try { (window as any).toast?.('Allow folder access to load scripts, then try Refresh.', { type: 'warning' }); } catch {}
        return hasUsableReadyScriptContent(existing?.content) ? existing : null;
      }
      const file = await (mapped.handle as any).getFile();
      const text = await readMappedFile(file);
      const rec: ScriptRecord = {
        id: mapped.id,
        title: mapped.title,
        content: text,
        source: 'mapped',
        created: existing?.created,
        updated: new Date().toISOString(),
      };
      scriptsById.set(id, rec);
      return rec;
    } catch (err) {
      try { console.warn('[scripts-store] failed to load mapped script', err); } catch {}
      return hasUsableReadyScriptContent(existing?.content) ? existing : null;
    }
  },

  save(data: { id?: string | null; title: string; content: string }): string {
    const fallbackId = data.title?.trim() || `script-${Date.now()}`;
    const id = (data.id || '').trim() || fallbackId;
    const existing = scriptsById.get(id);
    const now = new Date().toISOString();

    const rec: ScriptRecord = {
      id,
      title: data.title || existing?.title || id,
      content: data.content,
      source: existing?.source || 'local',
      created: existing?.created || now,
      updated: now,
    };

    scriptsById.set(id, rec);
    emitScriptsUpdated();
    return id;
  },

  rename(id: string, title: string): void {
    const rec = scriptsById.get(id);
    if (!rec) return;
    rec.title = title;
    rec.updated = new Date().toISOString();
    scriptsById.set(id, rec);
    emitScriptsUpdated();
  },

  remove(id: string): void {
    scriptsById.delete(id);
    mappedHandles.delete(id);
    emitScriptsUpdated();
  },

  getMappedEntries(): Array<{ id: string; title: string; handle?: FileSystemHandle }> {
    return Array.from(mappedHandles.values()).map((m) => ({
      id: m.id,
      title: m.title,
      handle: m.handle,
    }));
  },

  getSelectableEntries(): Array<{ id: string; title: string; subtitle?: string; handle?: FileSystemHandle; source: 'mapped' | 'ready' }> {
    const mapped = Array.from(mappedHandles.values()).map((m) => ({
      id: m.id,
      title: m.title,
      handle: m.handle,
      source: 'mapped' as const,
    }));
    const ready = Array.from(readyRefsById.values()).map((r) => ({
      id: r.id,
      title: r.title,
      subtitle: formatReadyAttribution(r),
      source: 'ready' as const,
    }));
    return [...ready, ...mapped];
  },

  syncMapped(entries: { id: string; title: string; handle: FileSystemHandle }[]): void {
    const fingerprint = computeFingerprint(entries);
    if (fingerprint && fingerprint === lastMappedFingerprint) {
      scriptStoreLog('[SCRIPT-STORE] syncMapped skipped (unchanged)', { fingerprint, count: entries.length });
      return;
    }
    lastMappedFingerprint = fingerprint;
    scriptStoreLog('[SCRIPT-STORE] syncMapped entries', entries);

    for (const [id, rec] of scriptsById.entries()) {
      if (rec.source === 'mapped' && !entries.some((entry) => entry.id === id)) {
        scriptsById.delete(id);
      }
    }
    mappedHandles.clear();

    for (const e of entries) {
      mappedHandles.set(e.id, { id: e.id, title: e.title, handle: e.handle });

      const existing = scriptsById.get(e.id);
      scriptsById.set(e.id, {
        id: e.id,
        title: e.title,
        content: existing?.content || '',
        created: existing?.created || new Date().toISOString(),
        updated: existing?.updated,
        source: existing?.source ?? 'mapped',
      });
    }
    const ids = Array.from(scriptsById.keys());
    scriptStoreLog('[SCRIPT-STORE] scriptsById size after sync', scriptsById.size, ids);
    scriptStoreHud('script-store:syncMapped', { size: scriptsById.size, ids });
    emitScriptsUpdated();
  },

  syncReady(entries: ReadyScriptReference[]): void {
    const fingerprint = computeReadyFingerprint(entries);
    if (fingerprint && fingerprint === lastReadyFingerprint) {
      scriptStoreLog('[SCRIPT-STORE] syncReady skipped (unchanged)', { fingerprint, count: entries.length });
      return;
    }
    lastReadyFingerprint = fingerprint;
    scriptStoreLog('[SCRIPT-STORE] syncReady entries', entries);

    for (const [id, rec] of scriptsById.entries()) {
      if (rec.source === 'ready' && !entries.some((entry) => entry.id === id)) {
        scriptsById.delete(id);
      }
    }
    readyRefsById.clear();

    for (const entry of entries) {
      readyRefsById.set(entry.id, entry);
      const existing = scriptsById.get(entry.id);
      scriptsById.set(entry.id, {
        id: entry.id,
        title: entry.title,
        content: existing?.content || '',
        source: 'ready',
        created: existing?.created || entry.updatedAt || new Date().toISOString(),
        updated: entry.updatedAt || existing?.updated,
      });
    }

    const ids = Array.from(scriptsById.keys());
    scriptStoreLog('[SCRIPT-STORE] scriptsById size after ready sync', scriptsById.size, ids);
    scriptStoreHud('script-store:syncReady', { size: scriptsById.size, ids });
    emitScriptsUpdated();
  },
};

async function readMappedFile(file: File): Promise<string> {
  try {
    const name = file?.name || '';
    const lower = name.toLowerCase();
    if (/\.docx$/i.test(lower)) {
      const buf = await file.arrayBuffer();
      const docText = await extractDocxText(buf);
      if (docText) return docText;
    }
    return await file.text();
  } catch (err) {
    try { console.warn('[scripts-store] readMappedFile failed', err); } catch {}
    return '';
  }
}

async function extractDocxText(buf: ArrayBuffer): Promise<string> {
  try {
    const ensure = (window as any).ensureMammoth as undefined | (() => Promise<any>);
    const mod = ensure ? await ensure() : null;
    const mammoth = (mod && (mod.mammoth || mod.default)) || (window as any).mammoth || null;
    if (!mammoth) throw new Error('mammoth not available');
    const res = await mammoth.extractRawText({ arrayBuffer: buf });
    const raw = (res && (res.value || res.text || '')) || '';
    return String(raw).replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  } catch (err) {
    try { console.warn('[scripts-store] docx parse failed', err); } catch {}
    return '';
  }
}

declare global {
  interface Window {
    Scripts?: typeof ScriptStore;
    getScriptsApi?: () => typeof ScriptStore;
  }
}

try {
  (window as any).Scripts = ScriptStore;
  (window as any).getScriptsApi = () => ScriptStore;
} catch {
  // ignore if window not available
}
