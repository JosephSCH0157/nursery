import { createHash } from 'crypto';
import { prepareRequestedPresentation, parseRequestedPresentation } from '../../src/script/performance-presentation-boundary';
import {
  buildDetachedPerformancePresentation,
  PERFORMANCE_PRESENTATION_DOM_BUDGET,
  PerformancePresentationBuildError,
} from '../../src/script/performance-presentation-builder';

Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: {
    subtle: {
      digest: async (_algorithm: string, data: ArrayBuffer) => {
        const hash = createHash('sha256').update(new Uint8Array(data)).digest();
        return Uint8Array.from(hash).buffer;
      },
    },
  },
});

const encoder = new TextEncoder();
const TEXT = '[s1]\nOne short line\ncontinues here.\n\nA separate block follows.\n[/s1]\n';
const BYTES = encoder.encode(TEXT);
const SOURCE = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  workpieceId: '22222222-2222-4222-8222-222222222222',
  path: 'script/script.md',
  scriptRevision: 7,
  scriptHash: createHash('sha256').update(BYTES).digest('hex'),
  readyTransitionId: null,
};

async function prepare() {
  const result = await prepareRequestedPresentation({
    requestedPresentation: parseRequestedPresentation('?presentation=performance-projection-v1'),
    canonicalIdentity: SOURCE,
    canonicalText: TEXT,
    canonicalUtf8Bytes: BYTES,
  });
  if (!result) throw new Error('expected prepared presentation');
  return result;
}

describe('HA-4B detached performance presentation builder', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="viewer"><div id="script" data-existing="yes"><div class="line" id="legacy">Legacy</div></div></div>';
    window.scrollTo(0, 0);
  });

  test('builds detached .line blocks and exact canonical word-to-anchor mappings', async () => {
    const prepared = await prepare();
    const candidate = await buildDetachedPerformancePresentation({ preparedPresentation: prepared });
    expect(candidate.fragment.isConnected).toBe(false);
    expect(candidate.blockElements).toHaveLength(2);
    expect(candidate.blockElements.every((element) => element.matches('.line.tp-performance-block'))).toBe(true);
    expect(candidate.wordElements).toHaveLength(0);
    expect(candidate.blockElements.map((element) => element.textContent)).toEqual(prepared.projection.blocks.map((block) => block.text));
    expect(candidate.wordMappings.map((mapping) => mapping.wordId)).toEqual(prepared.projection.words.map((word) => word.wordId));
    expect(candidate.wordMappings.map((mapping) => mapping.screenAnchorId)).toEqual(
      prepared.projection.words.map((word) => prepared.projection.blocks.find((block) => block.wordOrdinals.includes(word.ordinal))!.screenAnchorId),
    );
    expect(candidate.canonicalLineToBlockOrdinals).toEqual({ '1': [0], '2': [0], '4': [1] });
    expect(candidate.blockElements.map((element) => element.dataset.line)).toEqual(['0', '1']);
    expect(candidate.diagnostics.wordSpanCount).toBe(PERFORMANCE_PRESENTATION_DOM_BUDGET.maxWordSpansAtRest);
    expect(candidate.diagnostics.nodeCount).toBe(candidate.blockElements.length * 2);
  });

  test('Florida-shaped projection stays inside explicit lean-DOM and build-time budgets', async () => {
    const lines = Array.from({ length: 137 }, (_, segment) =>
      Array.from({ length: 55 }, (_, word) => `orange${segment}_${word}`).join(' '));
    const text = `[s1]\n${lines.join('\n\n')}\n[/s1]\n`;
    const bytes = encoder.encode(text);
    const source = { ...SOURCE, scriptRevision: 137, scriptHash: createHash('sha256').update(bytes).digest('hex') };
    const prepared = await prepareRequestedPresentation({
      requestedPresentation: parseRequestedPresentation('?presentation=performance-projection-v1'),
      canonicalIdentity: source,
      canonicalText: text,
      canonicalUtf8Bytes: bytes,
    });
    if (!prepared) throw new Error('expected Florida-shaped preparation');
    const candidate = await buildDetachedPerformancePresentation({ preparedPresentation: prepared });
    expect(candidate.wordMappings.length).toBeGreaterThan(7_000);
    expect(candidate.wordElements).toHaveLength(0);
    expect(candidate.diagnostics.nodeCount).toBeLessThanOrEqual(prepared.projection.blocks.length * PERFORMANCE_PRESENTATION_DOM_BUDGET.maxNodesPerBlock);
    expect(candidate.diagnostics.generatedHtmlBytes).toBeLessThan(1_000_000);
    expect(candidate.diagnostics.projectionBuildMs).toBeLessThan(250);
  });

  test('produces deterministic candidate mappings and integrity hashes', async () => {
    const prepared = await prepare();
    const first = await buildDetachedPerformancePresentation({ preparedPresentation: prepared });
    const second = await buildDetachedPerformancePresentation({ preparedPresentation: prepared });
    expect(second.blockMappings).toEqual(first.blockMappings);
    expect(second.wordMappings).toEqual(first.wordMappings);
    expect(second.integrity).toEqual(first.integrity);
    expect(first.integrity).toMatchObject({
      blockCount: prepared.projection.blocks.length,
      wordCount: prepared.projection.words.length,
      orderedAnchorIntegrityHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      orderedWordMappingHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  test('construction mutates no live DOM, globals, stores, events, listeners, or scroll state', async () => {
    const prepared = await prepare();
    const root = document.getElementById('script')!;
    const beforeDom = root.outerHTML;
    const beforeScroll = { windowX: window.scrollX, windowY: window.scrollY, rootTop: root.scrollTop };
    const sentinel = { unchanged: true };
    (window as any).__tpRawScript = sentinel;
    (window as any).__tpAsrBlocksReady = sentinel;
    (window as any).scriptWords = sentinel;
    const windowDispatch = jest.spyOn(window, 'dispatchEvent');
    const documentDispatch = jest.spyOn(document, 'dispatchEvent');
    const windowListen = jest.spyOn(window, 'addEventListener');
    const documentListen = jest.spyOn(document, 'addEventListener');

    const candidate = await buildDetachedPerformancePresentation({ preparedPresentation: prepared });

    expect(root.outerHTML).toBe(beforeDom);
    expect(document.getElementById('legacy')?.textContent).toBe('Legacy');
    expect(candidate.blockElements.every((element) => !element.isConnected)).toBe(true);
    expect({ windowX: window.scrollX, windowY: window.scrollY, rootTop: root.scrollTop }).toEqual(beforeScroll);
    expect((window as any).__tpRawScript).toBe(sentinel);
    expect((window as any).__tpAsrBlocksReady).toBe(sentinel);
    expect((window as any).scriptWords).toBe(sentinel);
    expect(windowDispatch).not.toHaveBeenCalled();
    expect(documentDispatch).not.toHaveBeenCalled();
    expect(windowListen).not.toHaveBeenCalled();
    expect(documentListen).not.toHaveBeenCalled();
  });

  test('rejects corrupted projection structure without returning a partial candidate', async () => {
    const prepared = await prepare();
    const corrupted = {
      ...prepared,
      projection: {
        ...prepared.projection,
        blocks: prepared.projection.blocks.map((block, index) => index === 0
          ? { ...block, wordOrdinals: [...block.wordOrdinals, block.wordOrdinals[0]!] }
          : block),
      },
    };
    let candidate: Awaited<ReturnType<typeof buildDetachedPerformancePresentation>> | null = null;
    await expect(async () => {
      candidate = await buildDetachedPerformancePresentation({ preparedPresentation: corrupted });
    }).rejects.toBeInstanceOf(PerformancePresentationBuildError);
    expect(candidate).toBeNull();
    expect(document.getElementById('legacy')?.textContent).toBe('Legacy');
  });
});
