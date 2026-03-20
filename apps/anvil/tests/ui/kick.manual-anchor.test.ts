import { ASR_MANUAL_ANCHOR_EVENT } from '../../src/features/asr/manual-anchor';
import { setAsrBlocks } from '../../src/scroll/asr-block-store';
import { kick } from '../../src/features/kick/kick';

describe('ASR kick manual anchor signal', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main id="viewer" class="viewer" style="overflow-y:auto">
        <div id="script">
          <div class="line" data-line="0">Line 0</div>
          <div class="line" data-line="1">Line 1</div>
          <div class="line" data-line="2">Line 2</div>
          <div class="line" data-line="3">Line 3</div>
          <div class="line" data-line="4">Line 4</div>
          <div class="line" data-line="5">Line 5</div>
          <div class="line" data-line="6">Line 6</div>
        </div>
      </main>
    `;
    const scroller = document.getElementById('viewer') as HTMLElement;
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 500 });
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(scroller, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, left: 0, right: 400, bottom: 500, width: 400, height: 500 }),
    });
    scroller.scrollTop = 0;
    Object.defineProperty(scroller, 'scrollTo', {
      configurable: true,
      value: ({ top }: { top?: number }) => {
        scroller.scrollTop = Number(top) || 0;
      },
    });
    Array.from(document.querySelectorAll<HTMLElement>('.line')).forEach((lineEl, idx) => {
      const top = idx * 120;
      const height = 80;
      Object.defineProperty(lineEl, 'offsetTop', { configurable: true, value: top });
      Object.defineProperty(lineEl, 'offsetHeight', { configurable: true, value: height });
      Object.defineProperty(lineEl, 'clientHeight', { configurable: true, value: height });
      Object.defineProperty(lineEl, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
          top: top - scroller.scrollTop,
          left: 0,
          right: 400,
          bottom: top - scroller.scrollTop + height,
          width: 400,
          height,
        }),
      });
    });
    (window as any).__tpStore = {
      get(key: string) {
        if (key === 'scrollMode') return 'asr';
        return undefined;
      },
    };
    (document as any).elementFromPoint = jest.fn(() => (
      document.querySelector<HTMLElement>('.line[data-line="6"]')
    ));
  });

  afterEach(() => {
    delete (window as any).__tpStore;
    delete (window as any).__tpAsrScrollDriver;
    delete (window as any).currentIndex;
    delete (document as any).elementFromPoint;
    setAsrBlocks([], { schemaVersion: 1, source: 'test' } as any);
  });

  test('emits a manual-anchor signal after ASR pixel fallback kick', () => {
    const events: CustomEvent[] = [];
    const onSignal = (event: Event) => events.push(event as CustomEvent);
    window.addEventListener(ASR_MANUAL_ANCHOR_EVENT, onSignal as EventListener);

    const moved = kick({ reason: 'test:kick' });

    window.removeEventListener(ASR_MANUAL_ANCHOR_EVENT, onSignal as EventListener);

    expect(moved).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0].detail).toEqual(expect.objectContaining({
      targetIndex: 6,
      source: 'kick',
      reason: 'test:kick',
    }));
  });

  test('targets the next line instead of the next block start on ASR kick', () => {
    const script = document.getElementById('script') as HTMLElement;
    const lines = Array.from(script.querySelectorAll<HTMLElement>('.line'));
    const makeBlock = (blockLines: HTMLElement[]) => {
      const block = document.createElement('div');
      for (const line of blockLines) block.appendChild(line);
      return block;
    };
    const block0 = makeBlock(lines.slice(0, 3));
    const block1 = makeBlock(lines.slice(3, 6));
    const block2 = makeBlock(lines.slice(6, 7));
    script.replaceChildren(block0, block1, block2);
    setAsrBlocks([block0, block1, block2], { schemaVersion: 1, source: 'test' } as any);

    const events: CustomEvent[] = [];
    const onSignal = (event: Event) => events.push(event as CustomEvent);
    window.addEventListener(ASR_MANUAL_ANCHOR_EVENT, onSignal as EventListener);
    (window as any).__tpAsrScrollDriver = {
      getLastLineIndex: () => 1,
    };
    (document as any).elementFromPoint = jest.fn(() => (
      document.querySelector<HTMLElement>('.line[data-line="1"]')
    ));

    const moved = kick({ reason: 'test:kick:block' });

    window.removeEventListener(ASR_MANUAL_ANCHOR_EVENT, onSignal as EventListener);

    expect(moved).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0].detail).toEqual(expect.objectContaining({
      targetIndex: 2,
      source: 'kick',
      reason: 'test:kick:block',
    }));
  });

  test('prefers the visible marker line over a drifted ASR index when resolving the next kick target', () => {
    const scroller = document.getElementById('viewer') as HTMLElement;
    const events: CustomEvent[] = [];
    const onSignal = (event: Event) => events.push(event as CustomEvent);
    window.addEventListener(ASR_MANUAL_ANCHOR_EVENT, onSignal as EventListener);
    (window as any).__tpAsrScrollDriver = {
      getLastLineIndex: () => 5,
    };
    (window as any).currentIndex = 5;
    scroller.scrollTop = 260;
    (document as any).elementFromPoint = jest.fn(() => (
      document.querySelector<HTMLElement>('.line[data-line="3"]')
    ));

    const moved = kick({ reason: 'test:kick:drifted-index' });

    window.removeEventListener(ASR_MANUAL_ANCHOR_EVENT, onSignal as EventListener);

    expect(moved).toBe(true);
    expect(scroller.scrollTop).toBe(320);
    expect(events).toHaveLength(1);
    expect(events[0].detail).toEqual(expect.objectContaining({
      targetIndex: 4,
      source: 'kick',
      reason: 'test:kick:drifted-index',
    }));
  });
});
