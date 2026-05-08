// Mic + dB meter helpers extracted from monolith. Exposes window.__tpMic
import { appStore } from '../state/app-store';
import type { CaptureFlags } from '../asr/schema';
import { getActiveAsrProfile } from '../asr/active-profile';
import type { AsrProfile, FrontEndFilters } from '../asr/schema';
export interface MicAPI {
  requestMic(options?: string | MicRequestOptions): Promise<MediaStream>;
  releaseMic(): void;
  populateDevices(): Promise<void> | void;
  startDbMeter(stream: MediaStream): void;
  clearBars?(el?: HTMLElement | null): void;
  isOpen(): boolean;
  __lastStream?: MediaStream | null;
}

export type MicRequestOptions = {
  deviceId?: string;
  capture?: Partial<CaptureFlags> | null;
  source?: string;
  asrPath?: string;
  profileId?: string | null;
};

declare global {
  interface Window {
    camDeviceSel?: HTMLSelectElement;
    webkitAudioContext?: typeof AudioContext;
  }
}

const DEVICE_KEY = 'tp_mic_device_v1';
let audioStream: MediaStream | null = null;
let rawAudioStream: MediaStream | null = null;
let analyser: AnalyserNode | null = null;
let audioCtx: AudioContext | null = null;
let dbAnim: number | null = null;
let dspCtx: AudioContext | null = null;
let dspDestination: MediaStreamAudioDestinationNode | null = null;

type RuntimeCalibrationState = 'calibrated' | 'partially_calibrated' | 'bypassed';
type RuntimeDspState = 'active' | 'inactive' | 'unavailable' | 'error';

type RuntimeDspDiagnostics = {
  state: RuntimeDspState;
  activeFilters: string[];
  details: Record<string, unknown>;
  error?: string;
};

function emitFlatDspStatus(params: {
  path: string;
  state: RuntimeDspState | string;
  profileId?: string | null;
  source: string;
  dsp?: RuntimeDspDiagnostics | null;
  sampleRate?: number | null;
}): void {
  try {
    const activeFilters = Array.isArray(params.dsp?.activeFilters) ? params.dsp!.activeFilters : [];
    const details = params.dsp?.details && typeof params.dsp.details === 'object'
      ? params.dsp.details
      : null;
    const reason =
      params.state === 'inactive'
        ? 'no_calibration_filters'
        : params.state === 'unavailable'
          ? 'no_audio_context'
          : '';
    const detailPairs = details
      ? Object.entries(details)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('|') : String(v)}`)
      : [];
    const line = [
      `[ASR_DSP_STATUS]`,
      `path=${params.path || 'generic'}`,
      `state=${String(params.state || 'inactive')}`,
      `activeFilters=${activeFilters.length ? activeFilters.join(',') : 'none'}`,
      params.profileId ? `profileId=${params.profileId}` : 'profileId=none',
      Number.isFinite(Number(params.sampleRate)) ? `sampleRate=${Math.round(Number(params.sampleRate))}` : '',
      reason ? `reason=${reason}` : '',
      params.dsp?.error ? `error=${String(params.dsp.error)}` : '',
      detailPairs.length ? `details=${detailPairs.join(';')}` : '',
      `source=${params.source}`,
    ].filter(Boolean).join(' ');
    console.info(line);
  } catch {
    // best effort diagnostics only
  }
}

type MicPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';
type MicUiState = 'capturing' | 'granted' | 'blocked' | 'idle';

function getPermissionState(): MicPermissionState {
  try {
    const known = (window as any).__tpMicPermState;
    if (known === 'granted' || known === 'denied' || known === 'prompt') return known;
  } catch {}
  try {
    if (appStore.get?.('micGranted')) return 'granted';
  } catch {}
  return 'unknown';
}

function hasLiveAudio(stream: MediaStream | null): boolean {
  try {
    if (!stream || typeof stream.getAudioTracks !== 'function') return false;
    const tracks = stream.getAudioTracks();
    return tracks.some((t) => t && t.readyState === 'live' && t.enabled);
  } catch {
    return false;
  }
}

function getMicUiState(): { state: MicUiState; permission: MicPermissionState; capturing: boolean } {
  const permission = getPermissionState();
  const capturing = hasLiveAudio(audioStream) || (typeof mic?.isOpen === 'function' && mic.isOpen());
  if (capturing) return { state: 'capturing', permission, capturing };
  if (permission === 'granted') return { state: 'granted', permission, capturing };
  if (permission === 'denied') return { state: 'blocked', permission, capturing };
  return { state: 'idle', permission, capturing };
}

function updateMicPill(state: MicUiState): void {
  try {
    const pill = document.getElementById('permChip');
    if (!pill) return;
    const label =
      state === 'capturing'
        ? 'Mic: capturing'
        : state === 'granted'
          ? 'Mic: granted'
          : state === 'blocked'
            ? 'Mic: blocked'
            : 'Mic: idle';
    pill.textContent = label;
    pill.dataset.micState = state;
    pill.classList.toggle('mic-active', state === 'capturing');
  } catch {
    // ignore
  }
}

export function emitMicState(): void {
  try {
    const detail = getMicUiState();
    updateMicPill(detail.state);
    window.dispatchEvent(new CustomEvent('tp:mic:state', { detail }));
  } catch {
    // ignore
  }
}

async function syncPermissionState(): Promise<void> {
  try {
    if (!navigator.permissions?.query) return;
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    if (status.state === 'granted') {
      try { (window as any).__tpMicPermState = 'granted'; } catch {}
      try { appStore.set('micGranted', true); } catch {}
    } else if (status.state === 'denied') {
      try { (window as any).__tpMicPermState = 'denied'; } catch {}
      try { appStore.set('micGranted', false); } catch {}
    } else {
      try { (window as any).__tpMicPermState = 'prompt'; } catch {}
    }
  } catch {
    // ignore
  }
}

function buildDbBars(target: HTMLElement | null): HTMLElement[] {
  if (!target) return [];
  target.innerHTML = '';
  const ticks = document.createElement('div');
  ticks.className = 'db-ticks';
  target.appendChild(ticks);
  for (let i = 0; i < 12; i++) {
    const b = document.createElement('div');
    b.className = 'bar';
    b.style.display = 'inline-block';
    b.style.width = `${100 / 12}%`;
    b.style.height = '8px';
    b.style.marginRight = '2px';
    b.style.background = 'rgba(255,255,255,0.06)';
    b.style.borderRadius = '2px';
    target.appendChild(b);
  }
  return Array.from(target.querySelectorAll('.bar'));
}

function clearBars(el?: HTMLElement | null): void {
  if (!el) return;
  el.querySelectorAll('.bar.on').forEach((b) => b.classList.remove('on'));
}

function stopDbMeter(): void {
  if (dbAnim) cancelAnimationFrame(dbAnim);
  dbAnim = null;
  try {
    if (audioCtx && typeof audioCtx.close === 'function') audioCtx.close().catch(() => {});
  } catch {
    // ignore
  }
  audioStream = null;
  analyser = null;
  audioCtx = null;
}

function closeDspChain(): void {
  try {
    dspDestination?.disconnect?.();
  } catch {
    // ignore
  }
  try {
    if (dspCtx && typeof dspCtx.close === 'function') {
      dspCtx.close().catch(() => {});
    }
  } catch {
    // ignore
  }
  dspDestination = null;
  dspCtx = null;
}

function hasAnyFilterConfigured(filters?: FrontEndFilters | null): boolean {
  if (!filters) return false;
  return (
    Number.isFinite(Number(filters.hpfHz)) ||
    Number.isFinite(Number(filters.mainsNotchHz)) ||
    Number.isFinite(Number(filters.presenceCutDb)) ||
    Number.isFinite(Number(filters.bodyBoostDb)) ||
    Array.isArray(filters.deEssBandHz)
  );
}

function applyCalibrationDsp(
  input: MediaStream,
  profile: AsrProfile | null,
): { stream: MediaStream; diagnostics: RuntimeDspDiagnostics } {
  const filters = profile?.filters || null;
  if (!hasAnyFilterConfigured(filters)) {
    return {
      stream: input,
      diagnostics: { state: 'inactive', activeFilters: [], details: {} },
    };
  }
  const AC = (window.AudioContext || window.webkitAudioContext) as typeof AudioContext | undefined;
  if (!AC) {
    return {
      stream: input,
      diagnostics: {
        state: 'unavailable',
        activeFilters: [],
        details: { reason: 'audio_context_unavailable' },
      },
    };
  }

  try {
    closeDspChain();
    const ctx = new AC();
    dspCtx = ctx;
    const source = ctx.createMediaStreamSource(input);
    const nodes: AudioNode[] = [];
    const activeFilters: string[] = [];
    const details: Record<string, unknown> = {};

    if (typeof filters?.hpfHz === 'number' && Number.isFinite(filters.hpfHz)) {
      const hpf = ctx.createBiquadFilter();
      hpf.type = 'highpass';
      hpf.frequency.value = Math.max(40, Math.min(220, filters.hpfHz));
      hpf.Q.value = 0.707;
      nodes.push(hpf);
      activeFilters.push('highpass');
      details.highPassHz = hpf.frequency.value;
    }
    if (typeof filters?.mainsNotchHz === 'number' && Number.isFinite(filters.mainsNotchHz)) {
      const notch = ctx.createBiquadFilter();
      notch.type = 'notch';
      notch.frequency.value = filters.mainsNotchHz;
      notch.Q.value = 10;
      nodes.push(notch);
      activeFilters.push('notch');
      details.notchHz = notch.frequency.value;
    }
    if (Array.isArray(filters?.deEssBandHz) && filters.deEssBandHz.length === 2) {
      const [loRaw, hiRaw] = filters.deEssBandHz;
      const lo = Math.max(2000, Number(loRaw) || 5000);
      const hi = Math.min(12000, Number(hiRaw) || 8500);
      const center = Math.sqrt(lo * hi);
      const q = Math.max(0.5, Math.min(8, center / Math.max(100, hi - lo)));
      const deEss = ctx.createBiquadFilter();
      deEss.type = 'peaking';
      deEss.frequency.value = center;
      deEss.Q.value = q;
      deEss.gain.value = -1.5;
      nodes.push(deEss);
      activeFilters.push('de-ess');
      details.deEssBandHz = [lo, hi];
    }
    if (typeof filters?.presenceCutDb === 'number' && Number.isFinite(filters.presenceCutDb) && filters.presenceCutDb > 0) {
      const presence = ctx.createBiquadFilter();
      presence.type = 'peaking';
      presence.frequency.value = 3600;
      presence.Q.value = 1.2;
      presence.gain.value = -Math.min(4, Math.abs(filters.presenceCutDb));
      nodes.push(presence);
      activeFilters.push('presence-cut');
      details.presenceCutDb = presence.gain.value;
    }
    if (typeof filters?.bodyBoostDb === 'number' && Number.isFinite(filters.bodyBoostDb) && filters.bodyBoostDb > 0) {
      const body = ctx.createBiquadFilter();
      body.type = 'lowshelf';
      body.frequency.value = 170;
      body.gain.value = Math.min(4, Math.abs(filters.bodyBoostDb));
      nodes.push(body);
      activeFilters.push('body-boost');
      details.bodyBoostDb = body.gain.value;
    }

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 2;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;
    nodes.push(limiter);
    activeFilters.push('limiter');
    details.limiterDbfs = -3;

    let prev: AudioNode = source;
    for (const node of nodes) {
      prev.connect(node);
      prev = node;
    }
    const destination = ctx.createMediaStreamDestination();
    prev.connect(destination);
    dspDestination = destination;
    return {
      stream: destination.stream,
      diagnostics: {
        state: activeFilters.length ? 'active' : 'inactive',
        activeFilters,
        details,
      },
    };
  } catch (err) {
    closeDspChain();
    return {
      stream: input,
      diagnostics: {
        state: 'error',
        activeFilters: [],
        details: {},
        error: String((err as any)?.message || err || 'unknown_dsp_error'),
      },
    };
  }
}

function startDbMeter(stream: MediaStream): void {
  try {
    const AC = (window.AudioContext || window.webkitAudioContext) as typeof AudioContext | undefined;
    if (!AC) return;
    const ctx = new AC();
    audioCtx = ctx as AudioContext;
    try {
      if (typeof ctx.resume === 'function' && (ctx as AudioContext).state === 'suspended') (ctx as AudioContext).resume().catch(() => {});
    } catch {
      // ignore
    }
    const src = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const hostTop = document.getElementById('dbMeterTop');
    const unifiedFill = hostTop?.querySelector?.('i');
    const topBars = !unifiedFill ? buildDbBars(hostTop) : [];
    let levelSmooth = 0;
    const dBFloor = -60;
    const attack = 0.55;
    const release = 0.15;
    let peakHold = { value: dBFloor, lastUpdate: performance.now(), decay: 0.9 };
    const draw = (): void => {
      if (!analyser || !data) {
        dbAnim = null;
        return;
      }
      analyser.getByteTimeDomainData(data);
      const rms =
        Math.sqrt(data.reduce((a, b) => {
          const centered = (b - 128) / 128; // center around 0
          return a + centered * centered;
        }, 0) / data.length) || 0;
      const dbfs = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
      const dB = dbfs === -Infinity ? dBFloor : Math.max(dBFloor, Math.min(0, dbfs));
      let level = (dB - dBFloor) / (0 - dBFloor);
      if (!isFinite(level) || level < 0) level = 0;
      else if (level > 1) level = 1;
      if (level > levelSmooth) levelSmooth = levelSmooth + (level - levelSmooth) * attack;
      else levelSmooth = levelSmooth + (level - levelSmooth) * release;
      if (topBars && topBars.length) {
        const bars = Math.max(0, Math.min(topBars.length, Math.round(levelSmooth * topBars.length)));
        for (let i = 0; i < topBars.length; i++) topBars[i].classList.toggle('on', i < bars);
      }
      try {
        const now = performance.now();
        peakHold.value = Math.max(dB, peakHold.value * peakHold.decay + dB * (1 - peakHold.decay));
        peakHold.lastUpdate = now;
      } catch {
        // ignore
      }
      try {
        window.dispatchEvent(new CustomEvent('tp:db', { detail: { db: dB, peak: peakHold.value } }));
      } catch {
        // ignore
      }
      dbAnim = requestAnimationFrame(draw);
    };
    draw();
  } catch (e) {
    console.warn('startDbMeter failed', e);
  }
}

async function requestMic(preferredId?: string | MicRequestOptions): Promise<MediaStream> {
  try {
    releaseMic();
    const sel = document.getElementById('settingsMicSel') as HTMLSelectElement | null;
    const normalizedOptions: MicRequestOptions =
      typeof preferredId === 'object' && preferredId
        ? (preferredId as unknown as MicRequestOptions)
        : typeof preferredId === 'string'
          ? { deviceId: preferredId }
          : {};
    const asrPath = String(normalizedOptions.asrPath || 'generic').trim() || 'generic';
    const source = String(normalizedOptions.source || 'unknown').trim() || 'unknown';

    const selectedProfile = getActiveAsrProfile();
    const activeProfileId = normalizedOptions.profileId || selectedProfile?.id || null;
    const activeCapture =
      normalizedOptions.capture ||
      selectedProfile?.capture ||
      null;

    const chosenId =
      normalizedOptions.deviceId ||
      activeCapture?.deviceId ||
      sel?.value ||
      undefined;

    const audioConstraints: MediaTrackConstraints = {
      deviceId: chosenId ? { exact: chosenId } : undefined,
    };

    if (activeCapture) {
      if (typeof activeCapture.echoCancellation === 'boolean') {
        audioConstraints.echoCancellation = activeCapture.echoCancellation;
      }
      if (typeof activeCapture.noiseSuppression === 'boolean') {
        audioConstraints.noiseSuppression = activeCapture.noiseSuppression;
      }
      if (typeof activeCapture.autoGainControl === 'boolean') {
        audioConstraints.autoGainControl = activeCapture.autoGainControl;
      }
      if (typeof activeCapture.sampleRateHz === 'number' && Number.isFinite(activeCapture.sampleRateHz)) {
        audioConstraints.sampleRate = Math.max(8000, Math.round(activeCapture.sampleRateHz));
      }
      if (typeof activeCapture.channelCount === 'number' && Number.isFinite(activeCapture.channelCount)) {
        audioConstraints.channelCount = Math.max(1, Math.round(activeCapture.channelCount));
      } else {
        audioConstraints.channelCount = 1;
      }
    }

    const constraints: MediaStreamConstraints = { audio: audioConstraints };
    const rawStream = await navigator.mediaDevices.getUserMedia(constraints);
    rawAudioStream = rawStream;
    const selectedProfileForDsp = selectedProfile || null;
    const dspResult = applyCalibrationDsp(rawStream, selectedProfileForDsp);
    const stream = dspResult.stream;

    let runtimeCalibrationState: RuntimeCalibrationState = 'bypassed';
    const requestedKeys = Object.keys(audioConstraints).filter((key) => (audioConstraints as any)[key] !== undefined);
    const applied: Record<string, unknown> = {};
    const unsupported: string[] = [];
    try {
      const track = stream.getAudioTracks?.()[0];
      const settings = track?.getSettings?.() || {};
      for (const key of requestedKeys) {
        const rawRequested = (audioConstraints as any)[key];
        const requested =
          rawRequested && typeof rawRequested === 'object' && 'exact' in rawRequested
            ? (rawRequested as any).exact
            : rawRequested;
        const got = (settings as any)[key];
        const inspectable = got !== undefined && got !== null;
        const equal =
          inspectable
          && (typeof got === 'number' || typeof requested === 'number'
            ? Number(got) === Number(requested)
            : String(got) === String(requested));
        if (equal) applied[key] = got;
        else unsupported.push(key);
      }
      if (activeCapture) {
        runtimeCalibrationState = unsupported.length
          ? (Object.keys(applied).length ? 'partially_calibrated' : 'bypassed')
          : 'calibrated';
      }
    } catch {
      runtimeCalibrationState = activeCapture ? 'partially_calibrated' : 'bypassed';
    }

    try {
      const payload = {
        asrPath,
        source,
        profileId: activeProfileId,
        calibrationState: runtimeCalibrationState,
        requested: audioConstraints,
        applied,
        ignoredOrUnsupported: unsupported,
        dsp: dspResult.diagnostics,
      };
      (window as any).__tpCalibrationRuntime = payload;
      window.dispatchEvent(new CustomEvent('tp:calibration:runtime', { detail: payload }));
      console.info('[ASR_CALIBRATION_RUNTIME]', payload);
      const sampleRate =
        Number((stream.getAudioTracks?.()[0] as any)?.getSettings?.()?.sampleRate)
        || Number((rawStream.getAudioTracks?.()[0] as any)?.getSettings?.()?.sampleRate)
        || null;
      emitFlatDspStatus({
        path: asrPath,
        state: dspResult.diagnostics.state,
        profileId: activeProfileId,
        source: 'calibration',
        dsp: dspResult.diagnostics,
        sampleRate,
      });
    } catch {}

    audioStream = stream;
    mic.__lastStream = stream;
    try {
      (window as any).__tpMicPermState = 'granted';
    } catch {
      // ignore
    }
    try { appStore.set('micGranted', true); } catch {}
    startDbMeter(stream);
    emitMicState();
    try {
      if (chosenId) localStorage.setItem(DEVICE_KEY, chosenId);
    } catch {
      // ignore
    }
    return stream;
  } catch (err) {
    console.warn('requestMic failed', err);
    try {
      const name = String((err as any)?.name || '');
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        (window as any).__tpMicPermState = 'denied';
        try { appStore.set('micGranted', false); } catch {}
      }
    } catch {
      // ignore
    }
    emitMicState();
    throw err;
  }
}

function releaseMic(): void {
  try {
    audioStream?.getTracks().forEach((t) => t.stop());
  } catch {
    // ignore
  }
  try {
    rawAudioStream?.getTracks().forEach((t) => t.stop());
  } catch {
    // ignore
  }
  closeDspChain();
  rawAudioStream = null;
  audioStream = null;
  mic.__lastStream = null;
  emitMicState();
  stopDbMeter();
}

function isOpen(): boolean {
  try {
    if (!audioStream) return false;
    if (typeof audioStream.getTracks === 'function') {
      const tracks = audioStream.getTracks();
      if (Array.isArray(tracks) && tracks.length) {
        return tracks.some((track) => track && track.readyState === 'live');
      }
    }
    return audioStream.active !== false;
  } catch {
    return !!audioStream;
  }
}

async function populateDevices(): Promise<void> {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    const devs = await navigator.mediaDevices.enumerateDevices();
    const mics = devs.filter((d) => d.kind === 'audioinput');
    const cams = devs.filter((d) => d.kind === 'videoinput');

    const fill = (sel: HTMLSelectElement | null | undefined, list: MediaDeviceInfo[]): void => {
      if (!sel) return;
      const prev = sel.value;
      sel.innerHTML = '';
      for (const d of list) {
        const o = document.createElement('option');
        o.value = d.deviceId;
        o.textContent = d.label || (d.kind === 'audioinput' ? 'Microphone' : 'Camera');
        sel.appendChild(o);
      }
      try {
        if (prev && Array.from(sel.options).some((o) => o.value === prev)) sel.value = prev;
      } catch {
        // ignore
      }
    };

    fill(document.getElementById('settingsMicSel') as HTMLSelectElement | null, mics);
    fill(document.getElementById('micDeviceSel') as HTMLSelectElement | null, mics);
    fill(document.getElementById('settingsCamSel') as HTMLSelectElement | null, cams);
    try {
      if (window.camDeviceSel) fill(window.camDeviceSel, cams);
    } catch {
      // ignore
    }
  } catch (e) {
    console.warn('populateDevices failed', e);
  }
}

const mic: MicAPI = {
  requestMic,
  releaseMic,
  populateDevices,
  startDbMeter,
  clearBars,
  isOpen,
  __lastStream: null,
};

if (typeof window !== 'undefined') {
  const target = (window as any).__tpMic || {};
  Object.assign(target, mic);
  (window as any).__tpMic = target;
}

try {
  emitMicState();
  void syncPermissionState();
  appStore.subscribe?.('micGranted', () => emitMicState());
} catch {}

try {
  const delayedPopulate = (): void => {
    setTimeout(() => {
      try {
        void populateDevices();
        emitMicState();
      } catch {
        // ignore
      }
    }, 120);
  };
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', delayedPopulate, { once: true });
  } else {
    delayedPopulate();
  }
} catch {
  // ignore
}

export default mic;
