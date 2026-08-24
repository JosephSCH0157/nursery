import {
  coordinateStagedPerformanceApply,
  createStagedPerformanceApply,
  type PerformanceRuntimeCommit,
} from './performance-apply-coordinator';
import {
  parseRequestedPresentation,
  PresentationBoundaryError,
  type ActivePresentation,
  type CanonicalScriptIdentity,
} from './performance-presentation-boundary';
import { PerformancePresentationAuthority } from './performance-presentation-installer';
import {
  createResolvedScrollModeReadiness,
  type ScrollModeReadiness,
  type ScrollModeReadinessSnapshot,
} from './scroll-mode-readiness';

export type AuthenticatedDispatchSource = 'workpiece-handoff' | 'ready-script' | 'non-authoritative';

export type AuthenticatedPerformanceDispatchResult =
  | Readonly<{ outcome: 'legacy-applied' }>
  | Readonly<{ outcome: 'projection-committed'; activePresentation: ActivePresentation }>
  | Readonly<{ outcome: 'discarded'; code: 'STALE_PRESENTATION_ACTIVATION' }>
  | Readonly<{ outcome: 'rejected'; code: string; message: string }>;

type RuntimeSnapshot = {
  values: Record<string, { present: boolean; value: unknown }>;
  editorValue: string | null;
};

const RUNTIME_KEYS = [
  '__tpRawScript',
  '__TP_LAST_APPLIED_HASH',
  '__forgeCanonicalScriptIdentity',
  '__forgeCanonicalReadyScript',
  '__forgeActivePerformancePresentation',
  'scriptWords',
  'paraIndex',
  'currentIndex',
] as const;

let currentAuthority: PerformancePresentationAuthority | null = null;
let dispatchGeneration = 0;

function isSameReadinessSnapshot(
  left: ScrollModeReadinessSnapshot,
  right: ScrollModeReadinessSnapshot,
): boolean {
  return left.ready === right.ready && left.mode === right.mode && left.revision === right.revision;
}

function discardStaleActivation(): AuthenticatedPerformanceDispatchResult {
  return Object.freeze({ outcome: 'discarded', code: 'STALE_PRESENTATION_ACTIVATION' });
}

function hasExplicitPresentationSelection(search: string | URLSearchParams | undefined): boolean {
  const params = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(search ?? window.location.search);
  return params.has('presentation');
}

function appliedTextHash(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function snapshotRuntime(): RuntimeSnapshot {
  const runtime = window as unknown as Record<string, unknown>;
  const values: RuntimeSnapshot['values'] = {};
  for (const key of RUNTIME_KEYS) {
    values[key] = { present: Object.prototype.hasOwnProperty.call(runtime, key), value: runtime[key] };
  }
  const editor = document.getElementById('editor') as HTMLTextAreaElement | null;
  return { values, editorValue: editor?.value ?? null };
}

function restoreRuntime(snapshot: RuntimeSnapshot): void {
  const runtime = window as unknown as Record<string, unknown>;
  for (const key of RUNTIME_KEYS) {
    const entry = snapshot.values[key]!;
    if (entry.present) runtime[key] = entry.value;
    else delete runtime[key];
  }
  const editor = document.getElementById('editor') as HTMLTextAreaElement | null;
  if (editor && snapshot.editorValue != null) editor.value = snapshot.editorValue;
}

function commitProjectionRuntime(
  value: PerformanceRuntimeCommit,
  canonicalReadyScript: unknown,
): void {
  const runtime = window as unknown as Record<string, unknown>;
  runtime.__tpRawScript = value.canonicalText;
  runtime.__TP_LAST_APPLIED_HASH = appliedTextHash(value.canonicalText);
  runtime.__forgeCanonicalScriptIdentity = { ...value.canonicalIdentity };
  if (canonicalReadyScript != null) runtime.__forgeCanonicalReadyScript = canonicalReadyScript;
  else delete runtime.__forgeCanonicalReadyScript;
  runtime.__forgeActivePerformancePresentation = value.activePresentation;
  // Projection activation is unavailable to ASR/hybrid. Do not leave matcher state from
  // the previously displayed canonical script available under the new presentation.
  runtime.scriptWords = [];
  runtime.paraIndex = [];
  runtime.currentIndex = 0;
  const editor = document.getElementById('editor') as HTMLTextAreaElement | null;
  if (editor) editor.value = value.canonicalText;
}

function publishVisibleRejection(code: string, message: string, source: AuthenticatedDispatchSource): AuthenticatedPerformanceDispatchResult {
  const detail = Object.freeze({ code, message, source, at: Date.now() });
  try { (window as any).__tpPerformancePresentationError = detail; } catch {}
  try { window.dispatchEvent(new CustomEvent('tp:performance-presentation-error', { detail })); } catch {}
  try { (window as any).toast?.(message, { type: 'error' }); } catch {}
  try { console.warn('[performance-presentation]', message, detail); } catch {}
  return Object.freeze({ outcome: 'rejected', code, message });
}

function publishCanonicalIdentity(identity: CanonicalScriptIdentity | null, canonicalReadyScript: unknown): void {
  if (!identity) return;
  (window as any).__forgeCanonicalScriptIdentity = { ...identity };
  if (canonicalReadyScript != null) (window as any).__forgeCanonicalReadyScript = canonicalReadyScript;
  else delete (window as any).__forgeCanonicalReadyScript;
}

export async function dispatchAuthenticatedCanonicalScript(input: {
  source: AuthenticatedDispatchSource;
  authenticated: boolean;
  canonicalIdentity?: CanonicalScriptIdentity | null;
  canonicalText: string;
  canonicalUtf8Bytes?: Uint8Array | null;
  canonicalReadyScript?: unknown;
  search?: string | URLSearchParams;
  scrollMode: string;
  scrollModeReadiness?: ScrollModeReadiness;
  root?: HTMLElement | null;
  legacyApply?: (text: string) => void;
}): Promise<AuthenticatedPerformanceDispatchResult> {
  const requestGeneration = ++dispatchGeneration;
  const readiness = input.scrollModeReadiness ?? createResolvedScrollModeReadiness(input.scrollMode);
  let requested;
  try {
    requested = parseRequestedPresentation(input.search ?? window.location.search);
  } catch (error) {
    if (hasExplicitPresentationSelection(input.search)) {
      const restoredMode = await readiness.waitUntilReady();
      if (requestGeneration !== dispatchGeneration || !isSameReadinessSnapshot(restoredMode, readiness.snapshot())) {
        return discardStaleActivation();
      }
    }
    const code = error instanceof PresentationBoundaryError ? error.diagnostic.code : 'UNKNOWN_PRESENTATION';
    return publishVisibleRejection(code, error instanceof Error ? error.message : 'Invalid presentation selection.', input.source);
  }

  if (requested.status === 'current') {
    if (!input.legacyApply) {
      return publishVisibleRejection('LEGACY_APPLY_REQUIRED', 'Legacy script application callback is unavailable.', input.source);
    }
    if (input.canonicalIdentity) {
      currentAuthority?.invalidateForScriptGeneration(input.canonicalIdentity);
      currentAuthority = new PerformancePresentationAuthority(input.canonicalIdentity);
      publishCanonicalIdentity(input.canonicalIdentity, input.canonicalReadyScript);
    }
    input.legacyApply(input.canonicalText);
    return Object.freeze({ outcome: 'legacy-applied' });
  }

  const restoredMode = await readiness.waitUntilReady();
  if (requestGeneration !== dispatchGeneration || !isSameReadinessSnapshot(restoredMode, readiness.snapshot())) {
    return discardStaleActivation();
  }

  const identity = input.canonicalIdentity ?? null;
  const bytes = input.canonicalUtf8Bytes ?? null;
  if (!input.authenticated || input.source === 'non-authoritative' || !identity || !bytes) {
    return publishVisibleRejection(
      'AUTHENTICATED_SOURCE_REQUIRED',
      'Performance projection requires an authenticated canonical Hearth/Tongs script revision.',
      input.source,
    );
  }
  if (restoredMode.mode === 'asr' || restoredMode.mode === 'hybrid') {
    return publishVisibleRejection(
      'ASR_SCROLL_MODE_UNSUPPORTED',
      `Performance projection is unavailable while ${restoredMode.mode} scrolling is selected.`,
      input.source,
    );
  }
  const root = input.root
    ?? document.getElementById('script')
    ?? document.querySelector<HTMLElement>('.script');
  if (!root) {
    return publishVisibleRejection('SCRIPT_ROOT_REQUIRED', 'Performance presentation root is unavailable.', input.source);
  }

  const authority = new PerformancePresentationAuthority(identity);
  const stage = createStagedPerformanceApply({
    requestedPresentation: requested,
    authenticated: true,
    source: input.source,
    canonicalIdentity: identity,
    canonicalText: input.canonicalText,
    canonicalUtf8Bytes: bytes,
    scrollMode: restoredMode.mode,
    presentationGeneration: authority.generation,
  });
  try {
    if (requestGeneration !== dispatchGeneration || !isSameReadinessSnapshot(restoredMode, readiness.snapshot())) {
      return discardStaleActivation();
    }
    const result = await coordinateStagedPerformanceApply({
      stage,
      authority,
      root,
      adapters: {
        runtime: {
          snapshot: snapshotRuntime,
          commit: (value) => commitProjectionRuntime(value, input.canonicalReadyScript),
          restore: restoreRuntime,
        },
        events: {
          publishProjectionCommitted: (detail) => {
            window.dispatchEvent(new CustomEvent('tp:performance-presentation-committed', { detail }));
          },
        },
      },
    });
    if (result.outcome !== 'projection-committed') throw new Error('projection coordinator did not commit');
    currentAuthority = authority;
    try { delete (window as any).__tpPerformancePresentationError; } catch {}
    return Object.freeze({ outcome: 'projection-committed', activePresentation: result.activePresentation });
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'PROJECTION_ACTIVATION_FAILED';
    return publishVisibleRejection(code, error instanceof Error ? error.message : 'Performance projection activation failed.', input.source);
  }
}

export function getCurrentPerformancePresentationAuthority(): PerformancePresentationAuthority | null {
  return currentAuthority;
}

export function resetAuthenticatedPerformanceDispatcherForTests(): void {
  currentAuthority = null;
  dispatchGeneration = 0;
}
