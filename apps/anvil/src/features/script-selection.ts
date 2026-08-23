import { applyScript } from './apply-script';
import { ScriptStore } from './scripts-store';
import { persistActiveWorkpieceFromScriptId } from '../forge/workpiece-context';
import { appStore } from '../state/app-store';
import { dispatchAuthenticatedCanonicalScript } from '../script/authenticated-performance-dispatcher';

const LAST_SCRIPT_KEY = 'tp:last_script_id';
let restoreAttempted = false;
let restoreDeadlineAt = 0;

export function persistLastScriptId(id: string): void {
  if (!id) return;
  try {
    localStorage.setItem(LAST_SCRIPT_KEY, id);
  } catch {
    // ignore storage failures
  }
}

export function getLastScriptId(): string | null {
  try {
    return localStorage.getItem(LAST_SCRIPT_KEY);
  } catch {
    return null;
  }
}

const now = () =>
  (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();

export function consumeLastScriptId(entries: Array<{ id: string }>): string | null {
  if (restoreAttempted) return null;
  const curr = now();
  if (!restoreDeadlineAt) {
    restoreDeadlineAt = curr + 5000;
  }
  if (curr > restoreDeadlineAt) {
    restoreAttempted = true;
    return null;
  }
  const last = getLastScriptId();
  if (!last) return null;
  const found = entries?.some((entry) => entry.id === last);
  if (!found) {
    try {
      console.info('[script-selection] restore defer (not in entries yet)', {
        last,
        entries: entries?.length ?? 0,
      });
    } catch {}
    return null;
  }
  restoreAttempted = true;
  try {
    console.info('[script-selection] restore hit', { last, entries: entries.length });
  } catch {}
  return last;
}

export function restoreStillPossible(): boolean {
  if (restoreAttempted) return false;
  if (!restoreDeadlineAt) return true;
  return now() <= restoreDeadlineAt;
}

export async function loadScriptById(id: string): Promise<boolean> {
  if (!id) return false;
  const authorityBeforeLoad = {
    identityPresent: Object.prototype.hasOwnProperty.call(window, '__forgeCanonicalScriptIdentity'),
    identity: (window as any).__forgeCanonicalScriptIdentity,
    readyPresent: Object.prototype.hasOwnProperty.call(window, '__forgeCanonicalReadyScript'),
    ready: (window as any).__forgeCanonicalReadyScript,
  };
  try {
    const rec = await ScriptStore.get(id);
    if (!rec || typeof rec.content !== 'string' || rec.content.trim().length === 0) {
      try {
        (window as any).toast?.('Selected script could not be loaded. Refresh session scripts or reopen it from Hearth.', {
          type: 'warning',
        });
      } catch {
        // ignore toast failures
      }
      return false;
    }
    const text = rec.content;
    const ready = ScriptStore.getReadyReference(id);
    const dispatchResult = await dispatchAuthenticatedCanonicalScript({
      source: ready ? 'ready-script' : 'non-authoritative',
      authenticated: Boolean(ready),
      canonicalIdentity: ready ? {
        workspaceId: ready.workspaceId,
        workpieceId: ready.workpieceId,
        path: ready.path,
        scriptRevision: ready.scriptRevision,
        scriptHash: ready.scriptHash,
        readyTransitionId: ready.transitionId,
      } : null,
      canonicalText: text,
      canonicalUtf8Bytes: ready ? new TextEncoder().encode(text) : null,
      canonicalReadyScript: ready,
      scrollMode: String(appStore.get('scrollMode') || ''),
      legacyApply: (legacyText) => applyScript(legacyText, 'load', { updateEditor: true }),
    });
    if (dispatchResult.outcome === 'rejected') {
      if (authorityBeforeLoad.identityPresent) (window as any).__forgeCanonicalScriptIdentity = authorityBeforeLoad.identity;
      else delete (window as any).__forgeCanonicalScriptIdentity;
      if (authorityBeforeLoad.readyPresent) (window as any).__forgeCanonicalReadyScript = authorityBeforeLoad.ready;
      else delete (window as any).__forgeCanonicalReadyScript;
      return false;
    }
    try {
      window.dispatchEvent(
        new CustomEvent('tp:script-load', {
          detail: { name: rec.title, text, skipNormalize: true },
        })
      );
    } catch {
      // ignore dispatch failures
    }
    try {
      (window as any).__tpCurrentName = rec.title;
    } catch {
      // ignore
    }
    persistActiveWorkpieceFromScriptId(id);
    persistLastScriptId(id);
    return true;
  } catch (err) {
    try {
      console.warn('[script-selection] loadScriptById failed', err);
    } catch {
      // ignore
    }
    return false;
  }
}

export function resetScriptRestoreState(): void {
  restoreAttempted = false;
}
