export type ScrollModeReadinessSnapshot = Readonly<{
  ready: boolean;
  mode: string;
  revision: number;
}>;

export type ScrollModeReadiness = Readonly<{
  snapshot: () => ScrollModeReadinessSnapshot;
  waitUntilReady: () => Promise<ScrollModeReadinessSnapshot>;
}>;

type ReadyWaiter = (snapshot: ScrollModeReadinessSnapshot) => void;

function normalizeMode(mode: string): string {
  const normalized = String(mode || '').trim().toLowerCase();
  return normalized === 'manual' ? 'step' : normalized;
}

export class ScrollModeReadinessBoundary implements ScrollModeReadiness {
  private current: ScrollModeReadinessSnapshot = Object.freeze({ ready: false, mode: '', revision: 0 });
  private readonly waiters = new Set<ReadyWaiter>();

  snapshot(): ScrollModeReadinessSnapshot {
    return this.current;
  }

  waitUntilReady(): Promise<ScrollModeReadinessSnapshot> {
    if (this.current.ready) return Promise.resolve(this.current);
    return new Promise((resolve) => { this.waiters.add(resolve); });
  }

  markRestored(mode: string): ScrollModeReadinessSnapshot {
    const normalized = normalizeMode(mode);
    if (this.current.ready && this.current.mode === normalized) return this.current;
    this.current = Object.freeze({ ready: true, mode: normalized, revision: this.current.revision + 1 });
    const waiters = Array.from(this.waiters);
    this.waiters.clear();
    for (const resolve of waiters) resolve(this.current);
    return this.current;
  }

  markModeChanged(mode: string): ScrollModeReadinessSnapshot {
    if (!this.current.ready) return this.current;
    return this.markRestored(mode);
  }

  resetForTests(): void {
    this.current = Object.freeze({ ready: false, mode: '', revision: 0 });
    this.waiters.clear();
  }
}

export const appScrollModeReadiness = new ScrollModeReadinessBoundary();

export function createResolvedScrollModeReadiness(mode: string): ScrollModeReadiness {
  const boundary = new ScrollModeReadinessBoundary();
  boundary.markRestored(mode);
  return boundary;
}
