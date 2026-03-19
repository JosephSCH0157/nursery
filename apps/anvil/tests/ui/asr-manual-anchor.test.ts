import {
  ASR_MANUAL_ANCHOR_EVENT,
} from '../../src/features/asr/manual-anchor';
import { createAsrScrollDriver, isAutomaticStallRescueReason } from '../../src/features/asr/asr-scroll-driver';

describe('ASR manual anchor adoption', () => {
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
    (window as any).__tpStore = {
      get(key: string) {
        if (key === 'scrollMode') return 'asr';
        if (key === 'session.phase') return 'live';
        if (key === 'session.asrArmed') return true;
        return undefined;
      },
    };
  });

  afterEach(() => {
    delete (window as any).__tpStore;
    delete (window as any).__tpAsrManualAnchorPending;
  });

  test('arms manual-anchor pending from the shared signal', () => {
    const driver = createAsrScrollDriver();

    window.dispatchEvent(new CustomEvent(ASR_MANUAL_ANCHOR_EVENT, {
      detail: {
        targetIndex: 5,
        source: 'kick',
        reason: 'test:kick',
      },
    }));

    expect((window as any).__tpAsrManualAnchorPending).toEqual(expect.objectContaining({
      targetIndex: 5,
    }));

    driver.dispose();
  });

  test('treats stall-tagged rescues as automatic so they can defer to manual anchor', () => {
    expect(isAutomaticStallRescueReason('stall:speech_stall')).toBe(true);
    expect(isAutomaticStallRescueReason('auto-stall')).toBe(true);
    expect(isAutomaticStallRescueReason('hud')).toBe(false);
  });
});
