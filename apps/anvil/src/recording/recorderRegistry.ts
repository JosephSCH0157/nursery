import { getRecordingEngine, type RecordingEngine } from './recording-settings';

export type RecorderId = 'core' | 'obs' | string;

export interface RecorderBackend {
  id: RecorderId;
  label: string;
  isAvailable(): Promise<boolean>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

const registry = new Map<RecorderId, RecorderBackend>();
let sessionRecording = false;
const activeSessionRecorderIds = new Set<RecorderId>();
let startInFlight: Promise<void> | null = null;
let stopInFlight: Promise<void> | null = null;

const RECORDER_TIMEOUT_MS = {
  availability: 1500,
  start: 5000,
  stop: 2000,
} as const;
const STOP_SLOW_WARN_MS = 2000;

function withTimeout<T>(
  taskOrFactory: Promise<T> | (() => Promise<T> | T),
  timeoutMs: number,
  context: string,
): Promise<T> {
  const timeout = Math.max(0, Math.floor(timeoutMs));
  const task = typeof taskOrFactory === 'function' ? Promise.resolve().then(taskOrFactory) : Promise.resolve(taskOrFactory);
  if (timeout <= 0) return task;
  return Promise.race([
    task,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`[recording-timeout] ${context} exceeded ${timeout}ms`)), timeout);
    }),
  ]);
}

function emitRecordingState(recording: boolean): void {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try { (window as any).__tpRecordingActive = !!recording; } catch {}
      window.dispatchEvent(
        new CustomEvent('tp:recording:state', { detail: { recording: !!recording } }),
      );
    }
  } catch {
    // best-effort only
  }
}

function emitStopPhase(phase: string, detail: Record<string, unknown> = {}): void {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent('tp:recording:stop-phase', {
          detail: { phase, ...detail },
        }),
      );
    }
  } catch {
    // best-effort only
  }
  try {
    console.info('[recording] stop_phase', { phase, ...detail });
  } catch {
    // best-effort only
  }
}

export function registerRecorder(backend: RecorderBackend): void {
  if (!backend) return;
  registry.set(backend.id, backend);
}

export function getRecorder(id: RecorderId): RecorderBackend | undefined {
  return registry.get(id);
}

export function listRecorders(): RecorderBackend[] {
  return [...registry.values()];
}

export function registerRecorders(options: {
  core: RecorderBackend;
  obs?: RecorderBackend;
}): void {
  if (options?.core) registerRecorder(options.core);
  if (options?.obs) registerRecorder(options.obs);
}


export async function startSessionRecording(opts: { obsEnabled?: boolean; engine?: RecordingEngine }): Promise<void> {
  if (sessionRecording) return;
  if (startInFlight) return startInFlight;

  startInFlight = (async () => {
    const engine = opts?.engine ?? getRecordingEngine();
    const obsEnabled = !!opts?.obsEnabled;
    const tasks: Promise<{ id: RecorderId; started: boolean }>[] = [];
    activeSessionRecorderIds.clear();

    const queueStart = (backend: RecorderBackend) => {
      tasks.push(
        (async () => {
          const id = backend.id;
          const available = await withTimeout(
            () => backend.isAvailable(),
            RECORDER_TIMEOUT_MS.availability,
            `${id}:isAvailable:start`,
          ).catch((err) => {
            console.warn('[recording] availability probe failed (start)', id, err);
            return false;
          });
          if (!available) return { id, started: false };
          await withTimeout(
            () => backend.start(),
            RECORDER_TIMEOUT_MS.start,
            `${id}:start`,
          ).catch((err) => {
            console.warn('[recording] start failed', id, err);
            throw err;
          });
          return { id, started: true };
        })().catch(() => ({ id: backend.id, started: false })),
      );
    };

    const core = registry.get('core');
    if (core && engine === 'core') {
      try {
        console.debug('[recording-session] startRecorders: core available', { engine, obsEnabled });
      } catch {}
      queueStart(core);
    } else {
      console.warn('[recording] no "core" recorder registered');
    }

    if (engine === 'obs' && obsEnabled) {
      const obs = registry.get('obs');
      if (obs) {
        try {
          console.debug('[recording-session] startRecorders: obs available', { engine });
        } catch {}
        queueStart(obs);
      }
    }

    if (tasks.length === 0) return;
    try {
      console.debug('[recording-session] startRecorders', { count: tasks.length, enabled: true });
    } catch {}
    const results = await Promise.all(tasks);
    results.forEach((result) => {
      if (result?.started) activeSessionRecorderIds.add(result.id);
    });
    if (activeSessionRecorderIds.size === 0) return;
    sessionRecording = true;
    emitRecordingState(true);
  })();
  try {
    await startInFlight;
  } finally {
    startInFlight = null;
  }
}

export async function stopSessionRecording(): Promise<void> {
  if (!sessionRecording) return;
  if (stopInFlight) return stopInFlight;

  stopInFlight = (async () => {
    const startedAt = Date.now();

    const targetRecorders =
      activeSessionRecorderIds.size > 0
        ? Array.from(activeSessionRecorderIds.values())
            .map((id) => registry.get(id))
            .filter((rec): rec is RecorderBackend => !!rec)
        : listRecorders();
    emitStopPhase('begin', {
      recorderCount: targetRecorders.length,
      scopedToSession: activeSessionRecorderIds.size > 0,
    });
    const tasks = targetRecorders.map(async (rec) => {
      emitStopPhase('probe', { recorderId: rec.id });
      const available = await withTimeout(
        () => rec.isAvailable(),
        RECORDER_TIMEOUT_MS.availability,
        `${rec.id}:isAvailable:stop`,
      ).catch((err) => {
        console.warn('[recording] availability probe failed (stop)', rec.id, err);
        return false;
      });
      if (!available) return;
      emitStopPhase('stop-call', { recorderId: rec.id });
      await withTimeout(
        () => rec.stop(),
        RECORDER_TIMEOUT_MS.stop,
        `${rec.id}:stop`,
      ).catch((err) => {
        console.warn('[recording] stop failed', rec.id, err);
      });
    });

    await Promise.allSettled(tasks);
    activeSessionRecorderIds.clear();
    sessionRecording = false;
    emitRecordingState(false);
    const elapsedMs = Math.max(0, Date.now() - startedAt);
    emitStopPhase('end', { elapsedMs });
    if (elapsedMs > STOP_SLOW_WARN_MS) {
      try {
        console.warn('[recording] stop exceeded latency budget', { elapsedMs, budgetMs: STOP_SLOW_WARN_MS });
      } catch {
        // best-effort only
      }
    }
  })();
  try {
    await stopInFlight;
  } finally {
    stopInFlight = null;
  }
}

export function isSessionRecording(): boolean {
  return sessionRecording;
}
