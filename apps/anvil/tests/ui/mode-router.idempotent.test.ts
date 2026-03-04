import {
  initScrollModeRouter,
  type ScrollMode,
  type SessionState,
  type ScrollModeSource,
  type SessionSource,
} from '../../src/features/scroll/mode-router';

type SubscribableSource<T> = {
  source: {
    get(): T;
    subscribe(cb: (value: T) => void): () => void;
  };
  emit(value: T): void;
  getActiveCount(): number;
  getUnsubscribedCount(): number;
  getLastCallback(): ((value: T) => void) | null;
};

function createSubscribableSource<T>(initial: T): SubscribableSource<T> {
  let current = initial;
  const active = new Set<(value: T) => void>();
  let unsubscribed = 0;
  let lastCallback: ((value: T) => void) | null = null;
  return {
    source: {
      get() {
        return current;
      },
      subscribe(cb: (value: T) => void) {
        active.add(cb);
        lastCallback = cb;
        return () => {
          if (active.delete(cb)) unsubscribed += 1;
        };
      },
    },
    emit(value: T) {
      current = value;
      active.forEach((cb) => cb(value));
    },
    getActiveCount() {
      return active.size;
    },
    getUnsubscribedCount() {
      return unsubscribed;
    },
    getLastCallback() {
      return lastCallback;
    },
  };
}

describe('mode-router init idempotency', () => {
  test('re-init disposes prior subscriptions and ignores stale callbacks', () => {
    const auto = {
      setEnabled: jest.fn(),
      setMode: jest.fn(),
    };
    const asr = { setEnabled: jest.fn() };
    const step = { setEnabled: jest.fn() };

    const modeA = createSubscribableSource<ScrollMode>('asr');
    const sessionA = createSubscribableSource<SessionState>({
      state: 'live',
      scrollAutoOnLive: true,
    });

    initScrollModeRouter({
      auto,
      asr,
      step,
      session: sessionA.source as SessionSource,
      scrollMode: modeA.source as ScrollModeSource,
    });

    const staleModeCb = modeA.getLastCallback();
    const staleSessionCb = sessionA.getLastCallback();
    expect(modeA.getActiveCount()).toBe(1);
    expect(sessionA.getActiveCount()).toBe(1);

    const modeB = createSubscribableSource<ScrollMode>('step');
    const sessionB = createSubscribableSource<SessionState>({
      state: 'idle',
      scrollAutoOnLive: false,
    });

    initScrollModeRouter({
      auto,
      asr,
      step,
      session: sessionB.source as SessionSource,
      scrollMode: modeB.source as ScrollModeSource,
    });

    expect(modeA.getActiveCount()).toBe(0);
    expect(sessionA.getActiveCount()).toBe(0);
    expect(modeA.getUnsubscribedCount()).toBe(1);
    expect(sessionA.getUnsubscribedCount()).toBe(1);
    expect(modeB.getActiveCount()).toBe(1);
    expect(sessionB.getActiveCount()).toBe(1);

    const asrCallsBeforeStale = asr.setEnabled.mock.calls.length;
    const stepCallsBeforeStale = step.setEnabled.mock.calls.length;
    staleModeCb?.('asr');
    staleSessionCb?.({ state: 'live', scrollAutoOnLive: true });
    expect(asr.setEnabled.mock.calls.length).toBe(asrCallsBeforeStale);
    expect(step.setEnabled.mock.calls.length).toBe(stepCallsBeforeStale);

    modeB.emit('asr');
    expect(asr.setEnabled).toHaveBeenCalled();
  });
});
