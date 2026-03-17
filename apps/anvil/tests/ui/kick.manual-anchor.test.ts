import { ASR_MANUAL_ANCHOR_EVENT } from '../../src/features/asr/manual-anchor';
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
    delete (document as any).elementFromPoint;
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
});
