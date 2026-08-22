import { createHash } from 'crypto';
import { parseRequestedPresentation, prepareRequestedPresentation } from '../../src/script/performance-presentation-boundary';
import { buildDetachedPerformancePresentation } from '../../src/script/performance-presentation-builder';
import { installPerformancePresentation, PerformancePresentationAuthority } from '../../src/script/performance-presentation-installer';
import {
  beginPresentationMutationTransaction,
  commitPresentationMutationTransaction,
  finishPresentationMutationTransaction,
  hasPresentationMutationTransaction,
  rollBackPresentationMutationTransaction,
} from '../../src/script/performance-presentation-mutation-transaction';
import { observeCommittedPresentationMutations } from '../../src/script/performance-presentation-mirror-observer';

Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: {
    randomUUID: () => '33333333-3333-4333-8333-333333333333',
    subtle: { digest: async (_algorithm: string, data: ArrayBuffer) => Uint8Array.from(createHash('sha256').update(new Uint8Array(data)).digest()).buffer },
  },
});

const encoder = new TextEncoder();
const TEXT = '[s1]\nOne line\ncontinues.\n[/s1]\n';
const BYTES = encoder.encode(TEXT);
const SOURCE = {
  workspaceId: '11111111-1111-4111-8111-111111111111', workpieceId: '22222222-2222-4222-8222-222222222222',
  path: 'script/script.md', scriptRevision: 7, scriptHash: createHash('sha256').update(BYTES).digest('hex'), readyTransitionId: null,
};

async function installerState() {
  const prepared = await prepareRequestedPresentation({
    requestedPresentation: parseRequestedPresentation('?presentation=performance-projection-v1'),
    canonicalIdentity: SOURCE, canonicalText: TEXT, canonicalUtf8Bytes: BYTES,
  });
  if (!prepared) throw new Error('expected preparation');
  const candidate = await buildDetachedPerformancePresentation({ preparedPresentation: prepared });
  const authority = new PerformancePresentationAuthority(SOURCE);
  const generation = authority.authorizePrepared(prepared);
  return { prepared, candidate, authority, generation };
}

describe('performance presentation mirror observer regression', () => {
  let mirroredHtml: string[];
  let root: HTMLElement;
  let observer: MutationObserver;

  beforeEach(() => {
    document.body.innerHTML = '<div id="viewer"><div id="script"><div id="legacy">Legacy</div></div></div>';
    root = document.getElementById('script')!;
    mirroredHtml = [];
    observer = observeCommittedPresentationMutations(root, () => mirroredHtml.push(root.innerHTML));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    observer.disconnect();
    delete (window as any).__tpPresentationTransactionDepth;
  });

  async function flushObserver(): Promise<void> {
    await Promise.resolve();
  }

  test('ordinary legacy root mutations still mirror and arbitrary state cannot suppress them', async () => {
    (window as any).__tpPresentationTransactionDepth = 999;
    root.dataset.presentationEpoch = 'arbitrary-not-owned';
    root.appendChild(document.createElement('p')).textContent = 'ordinary legacy mutation';
    await flushObserver();
    expect(mirroredHtml).toHaveLength(1);
    expect(mirroredHtml[0]).toContain('ordinary legacy mutation');
  });

  test('installer success produces exactly one committed projected mirror update', async () => {
    const state = await installerState();
    await installPerformancePresentation({
      ...state, root, preparedPresentation: state.prepared, expectedGeneration: state.generation,
    });
    await flushObserver();
    expect(mirroredHtml).toHaveLength(1);
    expect(mirroredHtml[0]).toContain('tp-performance-block');
    expect(hasPresentationMutationTransaction(root)).toBe(false);
  });

  test('installer rollback produces no transient projected mirror output and clears suppression', async () => {
    const state = await installerState();
    await expect(installPerformancePresentation({
      ...state, root, preparedPresentation: state.prepared, expectedGeneration: state.generation,
      fault: () => { throw new Error('rollback'); },
    })).rejects.toBeTruthy();
    await flushObserver();
    expect(mirroredHtml).toHaveLength(0);
    expect(root.innerHTML).toContain('Legacy');
    expect(hasPresentationMutationTransaction(root)).toBe(false);
  });

  test('durable bookkeeping classifies asynchronous observer callbacks after synchronous mutation', async () => {
    const transaction = beginPresentationMutationTransaction(root, 'owned-epoch');
    root.replaceChildren(document.createTextNode('committed content'));
    commitPresentationMutationTransaction(transaction);
    await flushObserver();
    finishPresentationMutationTransaction(transaction);
    expect(mirroredHtml).toHaveLength(1);
    expect(mirroredHtml[0]).toContain('committed content');

    mirroredHtml = [];
    const rollback = beginPresentationMutationTransaction(root, 'owned-rollback');
    root.replaceChildren(document.createTextNode('transient content'));
    rollBackPresentationMutationTransaction(rollback);
    root.replaceChildren(document.createTextNode('restored content'));
    await flushObserver();
    finishPresentationMutationTransaction(rollback);
    expect(mirroredHtml).toHaveLength(0);
  });

  test('nested attempts reject without stranding suppression and consecutive transactions remain usable', async () => {
    const first = beginPresentationMutationTransaction(root, 'first');
    expect(() => beginPresentationMutationTransaction(root, 'nested')).toThrow();
    rollBackPresentationMutationTransaction(first);
    await Promise.resolve();
    finishPresentationMutationTransaction(first);
    expect(hasPresentationMutationTransaction(root)).toBe(false);

    const second = beginPresentationMutationTransaction(root, 'second');
    rollBackPresentationMutationTransaction(second);
    await Promise.resolve();
    finishPresentationMutationTransaction(second);
    expect(hasPresentationMutationTransaction(root)).toBe(false);
  });

  test('exceptions and root removal clear installer-owned suppression', async () => {
    const state = await installerState();
    await expect(installPerformancePresentation({
      ...state, root, preparedPresentation: state.prepared, expectedGeneration: state.generation,
      fault: () => { root.remove(); throw new Error('removed'); },
    })).rejects.toBeTruthy();
    expect(hasPresentationMutationTransaction(root)).toBe(false);
  });
});
