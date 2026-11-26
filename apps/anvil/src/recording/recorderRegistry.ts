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

function withTimeout<T>(
  taskOrFactory: Promise<T> | (() => Promise<T> | T),
  timeoutMs: number,
  context: string,
): Promise<T> {
  const timeout = Math.max(0, Math.floor(timeoutMs));
  const task = typeof taskOrFactory === 'function' ? Promise.resolve().then(taskOrFactory) : Promise.resolve(taskOrFactory);
  if (timeout <= 0) return task;
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    task,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`[recording-timeout] ${context} exceeded ${timeout}ms`)), timeout);
    }),
  ]).finally(() => clearTimeout(timer));
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


export async function startSessionRecording(opts: { obsEnabled?: boolean; engine?: RecordingEngine } = {}): Promise<void> {
  if (stopInFlight) await stopInFlight;
  if (sessionRecording) return;
  if (startInFlight) return startInFlight;
  if (activeSessionRecorderIds.size) throw new Error('Recording status is unconfirmed. Check the selected recorder and use Stop before starting another take.');
  startInFlight = (async () => {
    const engine = opts.engine ?? getRecordingEngine();
    const backend = registry.get(engine);
    if (!backend) throw new Error(`${engine === 'obs' ? 'OBS' : 'Core Recorder'} is unavailable. Check Recording Settings.`);
    const available = await withTimeout(() => backend.isAvailable(), RECORDER_TIMEOUT_MS.availability, `${engine}:isAvailable:start`);
    if (!available) throw new Error(`${backend.label} is unavailable. ${engine === 'obs' ? 'Connect OBS in Recording Settings.' : 'Check camera and microphone permissions.'}`);
    // Start must confirm capture. Do not time out an uncancellable capture operation
    // and allow it to start later without an active session owner.
    try { await backend.start(); }
    catch (error) {
      if ((error as { captureMayBeActive?: boolean })?.captureMayBeActive) {
        activeSessionRecorderIds.add(engine);
        // Retain Stop ownership without claiming that capture was confirmed.
        emitRecordingState(false);
        try { window.dispatchEvent(new CustomEvent('tp:recording:uncertain', { detail: { engine } })); } catch {}
      }
      throw error;
    }
    activeSessionRecorderIds.clear();
    activeSessionRecorderIds.add(engine);
    sessionRecording = true;
    emitRecordingState(true);
  })();
  try { await startInFlight; }
  catch (error) { reportRecordingError(error); throw error; }
  finally { startInFlight = null; }
}

function reportRecordingError(error: unknown): void {
  const message = (error as Error)?.message || String(error);
  try { (window as any).toast?.(message, { type: 'error' }); } catch {}
  try { window.dispatchEvent(new CustomEvent('tp:recording:error', { detail: { message } })); } catch {}
}

export async function stopSessionRecording(): Promise<void> {
  if (startInFlight) {
    try { await startInFlight; }
    catch (error) { if (!activeSessionRecorderIds.size) throw error; }
  }
  if (!sessionRecording && !activeSessionRecorderIds.size) return;
  if (stopInFlight) return stopInFlight;
  stopInFlight = (async () => {
    const startedAt = Date.now();
    emitStopPhase('begin', { recorderCount: activeSessionRecorderIds.size, scopedToSession: true });
    // The engine that started the take owns Stop, even if settings changed or a
    // device became unavailable. A failed Stop retains ownership for retry.
    for (const id of activeSessionRecorderIds) {
      const rec = registry.get(id);
      if (!rec) throw new Error(`Active recorder ${id} is unavailable. Check the recorder before leaving.`);
      emitStopPhase('stop-call', { recorderId: id });
      if (id === 'core') await rec.stop();
      else await withTimeout(() => rec.stop(), 15000, `${id}:stop`);
      activeSessionRecorderIds.delete(id);
    }
    sessionRecording = false;
    emitStopPhase('end', { elapsedMs: Date.now() - startedAt });
  })();
  try { await stopInFlight; }
  catch (error) { reportRecordingError(error); throw error; }
  finally {
    stopInFlight = null;
    if (!sessionRecording && !activeSessionRecorderIds.size) emitRecordingState(false);
  }
}

export function isSessionRecording(): boolean {
  return sessionRecording;
}

export function isRecordingBusy(): boolean {
  return sessionRecording || activeSessionRecorderIds.size > 0 || startInFlight !== null || stopInFlight !== null;
}
