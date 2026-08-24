import { createHash } from 'crypto';
import { parseRequestedPresentation, prepareRequestedPresentation } from '../../src/script/performance-presentation-boundary';
import { buildDetachedPerformancePresentation } from '../../src/script/performance-presentation-builder';
import {
  assertActivePresentationReceiptLive,
  installPerformancePresentation,
  PerformancePresentationAuthority,
  PerformancePresentationInstallError,
} from '../../src/script/performance-presentation-installer';
import { hasPresentationMutationTransaction } from '../../src/script/performance-presentation-mutation-transaction';

Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: {
    randomUUID: () => '33333333-3333-4333-8333-333333333333',
    subtle: { digest: async (_algorithm: string, data: ArrayBuffer) => Uint8Array.from(createHash('sha256').update(new Uint8Array(data)).digest()).buffer },
  },
});

const encoder = new TextEncoder();
const TEXT = '[s1]\nFirst short line\ncontinues naturally.\n\nSecond block.\n[/s1]\n';
const BYTES = encoder.encode(TEXT);
const SOURCE = {
  workspaceId: '11111111-1111-4111-8111-111111111111', workpieceId: '22222222-2222-4222-8222-222222222222',
  path: 'script/script.md', scriptRevision: 7, scriptHash: createHash('sha256').update(BYTES).digest('hex'), readyTransitionId: null,
};

async function setup() {
  document.body.innerHTML = '<div id="script" data-old="yes"><div id="legacy" class="line">Legacy presentation</div></div>';
  const prepared = await prepareRequestedPresentation({
    requestedPresentation: parseRequestedPresentation('?presentation=performance-projection-v1'),
    canonicalIdentity: SOURCE, canonicalText: TEXT, canonicalUtf8Bytes: BYTES,
  });
  if (!prepared) throw new Error('expected preparation');
  const candidate = await buildDetachedPerformancePresentation({ preparedPresentation: prepared });
  const authority = new PerformancePresentationAuthority(SOURCE);
  const generation = authority.authorizePrepared(prepared);
  return { root: document.getElementById('script')!, prepared, candidate, authority, generation };
}

describe('HA-4C transactional performance presentation installer', () => {
  afterEach(() => {
    delete (window as any).__tpRawScript;
    delete (window as any).__tpAsrBlocksReady;
    delete (window as any).scriptWords;
  });

  test('issues a strong receipt and active state only after attached validation', async () => {
    const state = await setup();
    const metrics: Array<{ domInsertionMs: number; installedTreeValidationMs: number; mirrorSerializationMs: number; mirrorHtmlBytes: number }> = [];
    const active = await installPerformancePresentation({ ...state, preparedPresentation: state.prepared, expectedGeneration: state.generation, onMetrics: (value) => metrics.push(value) });
    expect(state.authority.active).toBe(active);
    expect(active.activation).toMatchObject({
      schema: 'anvil.performance-presentation-installation.v1', projectionId: state.candidate.projectionId,
      presentationGeneration: state.generation, installedBlockCount: state.candidate.integrity.blockCount,
      installedWordCount: state.candidate.integrity.wordCount,
      orderedAnchorIntegrityHash: state.candidate.integrity.orderedAnchorIntegrityHash,
      orderedWordMappingHash: state.candidate.integrity.orderedWordMappingHash,
    });
    expect(() => assertActivePresentationReceiptLive({ authority: state.authority, active, root: state.root })).not.toThrow();
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toEqual(expect.objectContaining({
      domInsertionMs: expect.any(Number), installedTreeValidationMs: expect.any(Number), mirrorSerializationMs: expect.any(Number), mirrorHtmlBytes: expect.any(Number),
    }));
  });

  test.each(['after-replace', 'before-receipt'] as const)('rolls back DOM, attributes, state, and scroll on injected %s failure', async (stage) => {
    const state = await setup();
    state.root.scrollTop = 17;
    state.root.scrollLeft = 9;
    const before = state.root.outerHTML;
    const sentinel = { unchanged: true };
    (window as any).__tpRawScript = sentinel;
    (window as any).__tpAsrBlocksReady = sentinel;
    (window as any).scriptWords = sentinel;
    const events: string[] = [];
    const listener = () => events.push('active');
    window.addEventListener('tp:presentation-active', listener);
    await expect(installPerformancePresentation({
      ...state, preparedPresentation: state.prepared, expectedGeneration: state.generation,
      fault: (at) => { if (at === stage) throw new Error('injected'); },
    })).rejects.toMatchObject({ code: 'INSTALLATION_FAILED' });
    expect(state.root.outerHTML).toBe(before);
    expect(state.root.scrollTop).toBe(17);
    expect(state.root.scrollLeft).toBe(9);
    expect(state.authority.active).toBeNull();
    expect(events).toEqual([]);
    expect((window as any).__tpRawScript).toBe(sentinel);
    expect((window as any).__tpAsrBlocksReady).toBe(sentinel);
    expect((window as any).scriptWords).toBe(sentinel);
    expect(hasPresentationMutationTransaction(state.root)).toBe(false);
    window.removeEventListener('tp:presentation-active', listener);
  });

  test('revalidates canonical generation immediately before commit and invalidates state synchronously', async () => {
    const state = await setup();
    const next = { ...SOURCE, scriptRevision: 8, scriptHash: 'a'.repeat(64) };
    state.authority.invalidateForScriptGeneration(next);
    expect(state.authority.prepared).toBeNull();
    expect(state.authority.active).toBeNull();
    await expect(installPerformancePresentation({
      ...state, preparedPresentation: state.prepared, expectedGeneration: state.generation,
    })).rejects.toBeInstanceOf(PerformancePresentationInstallError);
    expect(state.root.querySelector('#legacy')).not.toBeNull();
  });

  test('generation change during installation rolls back and creates no active state', async () => {
    const state = await setup();
    await expect(installPerformancePresentation({
      ...state, preparedPresentation: state.prepared, expectedGeneration: state.generation,
      fault: (stage) => {
        if (stage === 'after-replace') state.authority.invalidateForScriptGeneration({ ...SOURCE, scriptRevision: 8, scriptHash: 'a'.repeat(64) });
      },
    })).rejects.toMatchObject({ code: 'PRESENTATION_GENERATION_STALE' });
    expect(state.root.querySelector('#legacy')).not.toBeNull();
    expect(state.authority.active).toBeNull();
  });

  test('attached-subtree corruption fails validation and restores the prior presentation', async () => {
    const state = await setup();
    const before = state.root.outerHTML;
    await expect(installPerformancePresentation({
      ...state, preparedPresentation: state.prepared, expectedGeneration: state.generation,
      fault: (stage) => {
        if (stage === 'before-receipt') state.root.querySelector<HTMLElement>('.tp-performance-block')!.id = 'corrupted';
      },
    })).rejects.toMatchObject({ code: 'ATTACHED_VALIDATION_FAILED' });
    expect(state.root.outerHTML).toBe(before);
    expect(state.authority.active).toBeNull();
  });

  test('detached or removed installed nodes invalidate the receipt', async () => {
    const state = await setup();
    const active = await installPerformancePresentation({ ...state, preparedPresentation: state.prepared, expectedGeneration: state.generation });
    state.root.querySelector('.tp-performance-block')?.remove();
    expect(() => assertActivePresentationReceiptLive({ authority: state.authority, active, root: state.root })).toThrow(expect.objectContaining({
      code: 'ACTIVE_RECEIPT_STALE',
    }));
  });

  test('changed installed block text invalidates the receipt', async () => {
    const state = await setup();
    const active = await installPerformancePresentation({ ...state, preparedPresentation: state.prepared, expectedGeneration: state.generation });
    const block = state.root.querySelector<HTMLElement>('.tp-performance-block')!;
    block.textContent = 'changed';
    expect(() => assertActivePresentationReceiptLive({ authority: state.authority, active, root: state.root })).toThrow(expect.objectContaining({
      code: 'ACTIVE_RECEIPT_STALE',
    }));
  });

  test('MutationObservers may see rollback records while Forge active events and committed state remain absent', async () => {
    const state = await setup();
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((next) => records.push(...next));
    observer.observe(state.root, { childList: true, subtree: true, attributes: true });
    const dispatch = jest.spyOn(window, 'dispatchEvent');
    await expect(installPerformancePresentation({
      ...state, preparedPresentation: state.prepared, expectedGeneration: state.generation,
      fault: () => { throw new Error('rollback'); },
    })).rejects.toBeInstanceOf(PerformancePresentationInstallError);
    await Promise.resolve();
    observer.disconnect();
    expect(records.length).toBeGreaterThan(0);
    for (const type of ['tp:presentation-active', 'tp:render:done', 'tp:script-rendered', 'tp:scriptChanged', 'tp:asr:blocks-ready']) {
      expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type }));
    }
    expect(state.authority.active).toBeNull();
  });
});
