/** @jest-environment jsdom */

import { setAsrBlocks } from '../../src/scroll/asr-block-store';
import { isSeekAnimationActive, seekToBlockAnimated } from '../../src/scroll/scroll-writer';

type LayoutLine = {
  idx: number;
  top: number;
  height: number;
  text: string;
};

type LayoutBlock = {
  top: number;
  height: number;
  lines: LayoutLine[];
};

function installSeekFixture(mode: 'asr' | 'hybrid'): {
  scroller: HTMLElement;
  blocks: HTMLElement[];
} {
  document.body.innerHTML = `
    <main id="viewer" class="viewer" style="overflow-y:auto">
      <div id="script"></div>
    </main>
  `;
  const scroller = document.getElementById('viewer') as HTMLElement;
  const script = document.getElementById('script') as HTMLElement;
  Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 500 });
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1600 });
  Object.defineProperty(scroller, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top: 0, left: 0, right: 600, bottom: 500, width: 600, height: 500 }),
  });

  let currentTop = 0;
  Object.defineProperty(scroller, 'scrollTop', {
    configurable: true,
    get: () => currentTop,
    set: (value: number) => {
      const maxTop = Math.max(0, Number(scroller.scrollHeight || 0) - Number(scroller.clientHeight || 0));
      currentTop = Math.max(0, Math.min(Number(value) || 0, maxTop));
    },
  });

  const layouts: LayoutBlock[] = [
    {
      top: 0,
      height: 260,
      lines: [
        { idx: 0, top: 40, height: 80, text: 'Line 0' },
        { idx: 1, top: 140, height: 80, text: 'Line 1' },
      ],
    },
    {
      top: 600,
      height: 260,
      lines: [
        { idx: 2, top: 640, height: 80, text: 'Line 2' },
        { idx: 3, top: 740, height: 80, text: 'Line 3' },
      ],
    },
    {
      top: 1180,
      height: 260,
      lines: [
        { idx: 4, top: 1280, height: 80, text: 'Line 4' },
        { idx: 5, top: 1380, height: 80, text: 'Line 5' },
      ],
    },
  ];

  const blocks = layouts.map((layout, blockIdx) => {
    const blockEl = document.createElement('section');
    blockEl.dataset.block = String(blockIdx);
    Object.defineProperty(blockEl, 'offsetTop', { configurable: true, value: layout.top });
    Object.defineProperty(blockEl, 'offsetHeight', { configurable: true, value: layout.height });
    Object.defineProperty(blockEl, 'clientHeight', { configurable: true, value: layout.height });
    Object.defineProperty(blockEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        top: layout.top - currentTop,
        left: 0,
        right: 600,
        bottom: layout.top - currentTop + layout.height,
        width: 600,
        height: layout.height,
      }),
    });
    for (const line of layout.lines) {
      const lineEl = document.createElement('div');
      lineEl.className = 'line';
      lineEl.dataset.line = String(line.idx);
      lineEl.textContent = line.text;
      lineEl.style.lineHeight = `${line.height}px`;
      Object.defineProperty(lineEl, 'offsetTop', { configurable: true, value: line.top });
      Object.defineProperty(lineEl, 'offsetHeight', { configurable: true, value: line.height });
      Object.defineProperty(lineEl, 'clientHeight', { configurable: true, value: line.height });
      Object.defineProperty(lineEl, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
          top: line.top - currentTop,
          left: 0,
          right: 600,
          bottom: line.top - currentTop + line.height,
          width: 600,
          height: line.height,
        }),
      });
      blockEl.appendChild(lineEl);
    }
    script.appendChild(blockEl);
    return blockEl;
  });

  (window as any).__tpStore = {
    get(key: string) {
      if (key === 'scrollMode') return mode;
      return undefined;
    },
  };
  (window as any).__TP_MARKER_PCT = 0.4;
  setAsrBlocks(blocks, { schemaVersion: 1, source: 'test' } as any);
  return { scroller, blocks };
}

describe('scroll writer ASR seek targeting', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16),
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      value: (handle: number) => clearTimeout(handle),
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete (window as any).__tpStore;
    delete (window as any).__TP_MARKER_PCT;
    setAsrBlocks([], { schemaVersion: 1, source: 'test' } as any);
  });

  test('asr_commit hard seek lands the committed line at the marker instead of top-aligning the block', async () => {
    const { scroller } = installSeekFixture('asr');

    seekToBlockAnimated(1, 'asr_commit');
    await jest.advanceTimersByTimeAsync(1000);

    const markerTop = Number(scroller.clientHeight || 0) * 0.4;
    const lineCenterViewport = 640 - Number(scroller.scrollTop || 0) + 40;
    expect(scroller.scrollTop).toBeCloseTo(480, 0);
    expect(scroller.scrollTop).not.toBeCloseTo(600, 0);
    expect(lineCenterViewport).toBeCloseTo(markerTop, 0);
    expect(isSeekAnimationActive()).toBe(false);
  });

  test('bottom clamp settles cleanly at the scroll limit without re-triggering a seek loop', async () => {
    const { scroller } = installSeekFixture('asr');
    const maxTop = Math.max(0, Number(scroller.scrollHeight || 0) - Number(scroller.clientHeight || 0));

    seekToBlockAnimated(2, 'asr_commit');
    await jest.advanceTimersByTimeAsync(1000);
    const settledTop = Number(scroller.scrollTop || 0);
    await jest.advanceTimersByTimeAsync(200);

    expect(settledTop).toBe(maxTop);
    expect(Number(scroller.scrollTop || 0)).toBe(maxTop);
    expect(isSeekAnimationActive()).toBe(false);
  });

  test('non-ASR seek behavior remains block-based and unchanged', async () => {
    const { scroller } = installSeekFixture('hybrid');

    seekToBlockAnimated(1, 'manual_seek', { forceAnimated: true });
    await jest.advanceTimersByTimeAsync(1000);

    expect(scroller.scrollTop).toBeCloseTo(400, 0);
    expect(scroller.scrollTop).not.toBeCloseTo(480, 0);
  });
});
