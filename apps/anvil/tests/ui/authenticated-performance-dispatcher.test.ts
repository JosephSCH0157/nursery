import { createHash } from 'crypto';
import { observeCommittedPresentationMutations } from '../../src/script/performance-presentation-mirror-observer';
import {
  dispatchAuthenticatedCanonicalScript,
  resetAuthenticatedPerformanceDispatcherForTests,
} from '../../src/script/authenticated-performance-dispatcher';

Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: {
    randomUUID: () => '33333333-3333-4333-8333-333333333333',
    subtle: { digest: async (_algorithm: string, data: ArrayBuffer) => Uint8Array.from(createHash('sha256').update(new Uint8Array(data)).digest()).buffer },
  },
});

const encoder = new TextEncoder();
const TEXT = '[s1]\nOne short line\ncontinues here.\n\nSecond block.\n[/s1]\n';
const BYTES = encoder.encode(TEXT);
const SOURCE = {
  workspaceId: '11111111-1111-4111-8111-111111111111', workpieceId: '22222222-2222-4222-8222-222222222222',
  path: 'script/script.md', scriptRevision: 7, scriptHash: createHash('sha256').update(BYTES).digest('hex'), readyTransitionId: null,
};

describe('HA-4D2 authenticated performance dispatcher', () => {
  beforeEach(() => {
    resetAuthenticatedPerformanceDispatcherForTests();
    document.body.innerHTML = '<textarea id="editor">Legacy editor</textarea><div id="script"><div id="legacy">Legacy presentation</div></div>';
    delete (window as any).__forgeCanonicalScriptIdentity;
    delete (window as any).__forgeCanonicalReadyScript;
    delete (window as any).__forgeActivePerformancePresentation;
    delete (window as any).__tpRawScript;
    delete (window as any).__tpPerformancePresentationError;
    (window as any).toast = jest.fn();
  });

  afterEach(() => {
    delete (window as any).toast;
  });

  test.each(['workpiece-handoff', 'ready-script'] as const)('activates exact authenticated %s content with one rendered mirror and no raw publisher', async (source) => {
    const root = document.getElementById('script')!;
    const mirrors: string[] = [];
    const observer = observeCommittedPresentationMutations(root, () => mirrors.push(root.innerHTML));
    const committed: unknown[] = [];
    window.addEventListener('tp:performance-presentation-committed', (event) => committed.push((event as CustomEvent).detail), { once: true });
    const result = await dispatchAuthenticatedCanonicalScript({
      source, authenticated: true, canonicalIdentity: SOURCE, canonicalText: TEXT,
      canonicalUtf8Bytes: BYTES, canonicalReadyScript: source === 'ready-script' ? { id: 'ready-1' } : null,
      search: '?presentation=performance-projection-v1', scrollMode: 'step', root,
      legacyApply: jest.fn(),
    });
    await Promise.resolve();
    observer.disconnect();
    expect(result.outcome).toBe('projection-committed');
    expect(mirrors).toHaveLength(1);
    expect(mirrors[0]).toContain('tp-performance-block');
    expect(committed).toHaveLength(1);
    expect((window as any).__tpRawScript).toBe(TEXT);
    expect((window as any).__forgeCanonicalScriptIdentity).toEqual(SOURCE);
    expect((document.getElementById('editor') as HTMLTextAreaElement).value).toBe(TEXT);
    expect((window as any).__forgeActivePerformancePresentation?.status).toBe('active');
  });

  test('missing selection routes directly through unchanged legacy callback', async () => {
    const legacyApply = jest.fn();
    const result = await dispatchAuthenticatedCanonicalScript({
      source: 'workpiece-handoff', authenticated: true, canonicalIdentity: SOURCE,
      canonicalText: TEXT, canonicalUtf8Bytes: BYTES, search: '?open=script', scrollMode: 'hybrid', legacyApply,
    });
    expect(result).toEqual({ outcome: 'legacy-applied' });
    expect(legacyApply).toHaveBeenCalledTimes(1);
    expect(legacyApply).toHaveBeenCalledWith(TEXT);
    expect(document.getElementById('legacy')).not.toBeNull();
  });

  test.each(['asr', 'hybrid'])('rejects explicit projection visibly in %s mode without changing old presentation', async (scrollMode) => {
    const before = document.getElementById('script')!.outerHTML;
    const result = await dispatchAuthenticatedCanonicalScript({
      source: 'workpiece-handoff', authenticated: true, canonicalIdentity: SOURCE,
      canonicalText: TEXT, canonicalUtf8Bytes: BYTES, search: '?presentation=performance-projection-v1', scrollMode,
    });
    expect(result).toMatchObject({ outcome: 'rejected', code: 'ASR_SCROLL_MODE_UNSUPPORTED' });
    expect(document.getElementById('script')!.outerHTML).toBe(before);
    expect((window as any).toast).toHaveBeenCalledTimes(1);
  });

  test('unknown selection and non-authoritative sources reject visibly without legacy fallback', async () => {
    const legacyApply = jest.fn();
    const unknown = await dispatchAuthenticatedCanonicalScript({
      source: 'workpiece-handoff', authenticated: true, canonicalIdentity: SOURCE,
      canonicalText: TEXT, canonicalUtf8Bytes: BYTES, search: '?presentation=unknown', scrollMode: 'step', legacyApply,
    });
    expect(unknown).toMatchObject({ outcome: 'rejected', code: 'UNKNOWN_PRESENTATION' });
    const nonAuthoritative = await dispatchAuthenticatedCanonicalScript({
      source: 'non-authoritative', authenticated: false, canonicalText: TEXT,
      search: '?presentation=performance-projection-v1', scrollMode: 'step', legacyApply,
    });
    expect(nonAuthoritative).toMatchObject({ outcome: 'rejected', code: 'AUTHENTICATED_SOURCE_REQUIRED' });
    expect(legacyApply).not.toHaveBeenCalled();
    expect(document.getElementById('legacy')).not.toBeNull();
  });

  test('hash mismatch rolls back runtime and publishes neither projected nor raw replacement content', async () => {
    const root = document.getElementById('script')!;
    const before = root.outerHTML;
    (window as any).__tpRawScript = 'legacy raw';
    const mirrors: string[] = [];
    const observer = observeCommittedPresentationMutations(root, () => mirrors.push(root.innerHTML));
    const result = await dispatchAuthenticatedCanonicalScript({
      source: 'workpiece-handoff', authenticated: true,
      canonicalIdentity: { ...SOURCE, scriptHash: 'a'.repeat(64) },
      canonicalText: TEXT, canonicalUtf8Bytes: BYTES,
      search: '?presentation=performance-projection-v1', scrollMode: 'step', root,
    });
    await Promise.resolve();
    observer.disconnect();
    expect(result.outcome).toBe('rejected');
    expect(root.outerHTML).toBe(before);
    expect((window as any).__tpRawScript).toBe('legacy raw');
    expect(mirrors).toEqual([]);
  });
});
