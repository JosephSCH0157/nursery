import type {
  AsrProfile,
  CalMetrics,
  CalibrationRecommendation,
  FrontEndFilters,
  RoomAnalysis,
  VadThresholds,
} from './schema';

const DB_EPS = 1e-12;
const toDb = (x: number) => 20 * Math.log10(Math.max(x, DB_EPS));
const median = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
};

const variance = (values: number[]): number => {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sumSq = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0);
  return sumSq / Math.max(1, values.length - 1);
};

export type CalibrationMeasurement = {
  rmsDbfs: number;
  peakDbfs: number;
  spectral: {
    rumbleRatio: number;
    hum50: number;
    hum60: number;
    hissRatio: number;
    sibilanceRatio: number;
    bodyRatio: number;
    presenceRatio: number;
  };
  stability: number;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function deriveRoomAnalysis(cal: CalMetrics, silence: CalibrationMeasurement, speech: CalibrationMeasurement): RoomAnalysis {
  const rumbleDetected = silence.spectral.rumbleRatio > 0.42 || speech.spectral.rumbleRatio > 0.36;
  const humDetected = Math.max(silence.spectral.hum50, silence.spectral.hum60) > 0.12;
  const echoRisk: RoomAnalysis['echoRisk'] =
    cal.snrDb < 10 || speech.stability > 16
      ? 'high'
      : cal.snrDb < 15 || speech.stability > 9
        ? 'medium'
        : 'low';
  const clippingRisk: RoomAnalysis['clippingRisk'] =
    cal.speechPeakDbfs > -2
      ? 'high'
      : cal.speechPeakDbfs > -6
        ? 'medium'
        : 'low';

  return {
    noiseFloorDb: cal.noiseRmsDbfs,
    snrDb: cal.snrDb,
    rumbleDetected,
    humDetected,
    echoRisk,
    clippingRisk,
  };
}

export function deriveFilters(room: RoomAnalysis, silence: CalibrationMeasurement, speech: CalibrationMeasurement): FrontEndFilters {
  const filters: FrontEndFilters = {};
  if (room.rumbleDetected) {
    filters.hpfHz = silence.spectral.rumbleRatio > 0.52 ? 90 : 80;
  }
  if (room.humDetected) {
    filters.mainsNotchHz = silence.spectral.hum60 >= silence.spectral.hum50 ? 60 : 50;
  }
  if (speech.spectral.sibilanceRatio > 0.42) {
    filters.deEssBandHz = [5000, 8500];
    filters.presenceCutDb = 1.5;
  }
  if (speech.spectral.bodyRatio < 0.18 && speech.spectral.presenceRatio > 0.35) {
    filters.bodyBoostDb = 1.5;
  }
  return filters;
}

export function deriveRecommendation(cal: CalMetrics, room: RoomAnalysis): CalibrationRecommendation {
  const messages: string[] = [];
  let status: CalibrationRecommendation['status'] = 'good_to_record';

  if (cal.snrDb < 15) {
    status = 'recordable_but_noisy';
    messages.push('Room noise is elevated. Consider headphones and quieter surroundings.');
  }
  if (room.rumbleDetected) {
    if (status === 'good_to_record') status = 'recordable_but_noisy';
    messages.push('Low-frequency rumble detected. High-pass filtering is recommended.');
  }
  if (room.humDetected) {
    if (status === 'good_to_record') status = 'recordable_but_noisy';
    messages.push('Mains hum signature detected. Notch filtering is recommended.');
  }
  if (room.clippingRisk === 'high') {
    status = 'fix_first';
    messages.push('Voice peaks are clipping. Lower input gain before recording.');
  } else if (room.clippingRisk === 'medium') {
    if (status === 'good_to_record') status = 'recordable_but_noisy';
    messages.push('Voice peaks are hot. Slight gain reduction may improve clarity.');
  }

  if (!messages.length) {
    messages.push('Room and voice look healthy. Ready to record.');
  }

  return { status, messages };
}

export async function runCalibration(opts: {
  deviceId: string,
  label: string,
  flags: { echoCancellation: boolean; noiseSuppression: boolean; autoGainControl: boolean; sampleRateHz?: number }
}): Promise<{ profile: AsrProfile; preview: (_stop?: boolean) => void }> {

  const wantedDeviceId = String(opts.deviceId || '').trim();
  const audioConstraints: MediaTrackConstraints = {
    channelCount: 1,
    sampleRate: opts.flags.sampleRateHz ?? 48000,
    echoCancellation: opts.flags.echoCancellation,
    noiseSuppression: opts.flags.noiseSuppression,
    autoGainControl: opts.flags.autoGainControl,
  };
  if (wantedDeviceId) {
    audioConstraints.deviceId = { exact: wantedDeviceId };
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
  const resolvedDeviceId = (() => {
    try {
      const track = stream.getAudioTracks?.()[0] || null;
      const fromSettings = (track?.getSettings?.() as MediaTrackSettings | undefined)?.deviceId;
      return String(fromSettings || wantedDeviceId || 'default');
    } catch {
      return wantedDeviceId || 'default';
    }
  })();

  const AudioCtx: any = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx: AudioContext = new AudioCtx({ sampleRate: opts.flags.sampleRateHz ?? undefined });
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  const buf = new Float32Array(analyser.fftSize);
  const freq = new Float32Array(analyser.frequencyBinCount);
  src.connect(analyser);

  const sampleRate = ctx.sampleRate || 48000;
  const binHz = sampleRate / analyser.fftSize;
  const bandEnergy = (fromHz: number, toHz: number): number => {
    const start = Math.max(0, Math.floor(fromHz / Math.max(1, binHz)));
    const end = Math.min(freq.length - 1, Math.ceil(toHz / Math.max(1, binHz)));
    let sum = 0;
    for (let i = start; i <= end; i += 1) {
      const amp = 10 ** ((freq[i] || -160) / 20);
      sum += amp * amp;
    }
    return sum;
  };

  const measure = async (ms: number) => {
    const t0 = performance.now();
    const rms: number[] = []; let peak = -1;
    const rumbleRatios: number[] = [];
    const hum50Ratios: number[] = [];
    const hum60Ratios: number[] = [];
    const hissRatios: number[] = [];
    const sibilanceRatios: number[] = [];
    const bodyRatios: number[] = [];
    const presenceRatios: number[] = [];
    while (performance.now() - t0 < ms) {
      analyser.getFloatTimeDomainData(buf);
      analyser.getFloatFrequencyData(freq);
      let sum = 0, p = 0;
      for (let i = 0; i < buf.length; i++) { const v = buf[i]; sum += v*v; p = Math.max(p, Math.abs(v)); }
      const frameRms = Math.sqrt(sum / buf.length);
      rms.push(frameRms);
      peak = Math.max(peak, p);

      const total = Math.max(1e-10, bandEnergy(20, 12000));
      const rumble = bandEnergy(20, 140) / total;
      const hum50 = bandEnergy(47, 53) / total;
      const hum60 = bandEnergy(57, 63) / total;
      const hiss = bandEnergy(4500, 9000) / total;
      const sibilance = bandEnergy(5000, 9000) / total;
      const body = bandEnergy(120, 320) / total;
      const presence = bandEnergy(2000, 5000) / total;

      rumbleRatios.push(clamp01(rumble));
      hum50Ratios.push(clamp01(hum50));
      hum60Ratios.push(clamp01(hum60));
      hissRatios.push(clamp01(hiss));
      sibilanceRatios.push(clamp01(sibilance));
      bodyRatios.push(clamp01(body));
      presenceRatios.push(clamp01(presence));
      await new Promise(r => setTimeout(r, 20));
    }
    const rmsMedian = median(rms);
    return {
      rmsDbfs: toDb(rmsMedian),
      peakDbfs: toDb(peak),
      spectral: {
        rumbleRatio: median(rumbleRatios),
        hum50: median(hum50Ratios),
        hum60: median(hum60Ratios),
        hissRatio: median(hissRatios),
        sibilanceRatio: median(sibilanceRatios),
        bodyRatio: median(bodyRatios),
        presenceRatio: median(presenceRatios),
      },
      stability: variance(rms),
    } as CalibrationMeasurement;
  };

  // A) Silence 5s
  const silence = await measure(5000);
  // B) Speech 15s
  const speech  = await measure(15000);
  const cal: CalMetrics = {
    noiseRmsDbfs: silence.rmsDbfs,
    noisePeakDbfs: silence.peakDbfs,
    speechRmsDbfs: speech.rmsDbfs,
    speechPeakDbfs: speech.peakDbfs,
    snrDb: speech.rmsDbfs - silence.rmsDbfs
  };

  // C) Derive thresholds
  const ton = Math.max(cal.noiseRmsDbfs + 10, Math.min(-20, cal.speechRmsDbfs - 4)); // within your guidelines
  const toff = ton - 6;
  const vad: VadThresholds = { tonDb: ton, toffDb: toff, attackMs: 80, releaseMs: 300 };

  const room = deriveRoomAnalysis(cal, silence, speech);
  const recommendation = deriveRecommendation(cal, room);
  const filters = deriveFilters(room, silence, speech);

  const shouldUseNs = cal.snrDb < 15 || room.echoRisk !== 'low';
  const shouldUseAgc = cal.speechRmsDbfs < -33 || speech.stability > 16;
  const shouldUseAec = opts.flags.echoCancellation || room.echoRisk === 'high';

  const profile: AsrProfile = {
    id: `${resolvedDeviceId}::${opts.label}`,
    label: opts.label,
    capture: {
      deviceId: resolvedDeviceId,
      sampleRateHz: ctx.sampleRate,
      channelCount: 1,
      echoCancellation: shouldUseAec,
      noiseSuppression: opts.flags.noiseSuppression || shouldUseNs,
      autoGainControl: opts.flags.autoGainControl || shouldUseAgc
    },
    cal,
    vad,
    filters,
    room,
    recommendation,
    version: 2,
    measuredAt: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  // D) Live preview gate: shows stable VAD using derived thresholds
  let stop = false, gate = false, onCounter = 0, offCounter = 0;
  const msPerFrame = 20;
  const preview = async (_stop?: boolean) => {
    if (_stop) { stop = true; return; }
    stop = false;
    while (!stop) {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0; for (let i=0;i<buf.length;i++) sum += buf[i]*buf[i];
      const rmsDb = toDb(Math.sqrt(sum/buf.length));
      const speaking = gate
        ? (rmsDb > profile.vad.toffDb ? (offCounter=0, true) : ((offCounter+=msPerFrame) < profile.vad.releaseMs))
        : (rmsDb > profile.vad.tonDb ? ((onCounter+=msPerFrame) >= profile.vad.attackMs) : (onCounter=0, false));
      gate = speaking as boolean;

      try {
        window.dispatchEvent(new CustomEvent('tp:asrPreview', {
          detail: { rmsDbfs: rmsDb, gate, ton: profile.vad.tonDb, toff: profile.vad.toffDb }
        }));
      } catch {}

      await new Promise(r => setTimeout(r, msPerFrame));
    }
  };

  let closed = false;
  const safeClose = async () => {
    if (closed) return;
    closed = true;
    try { stop = true; } catch {}
    try { src.disconnect(); } catch {}
    try { analyser.disconnect(); } catch {}
    try { stream.getTracks?.().forEach((track) => track.stop()); } catch {}
    try { await ctx.close(); } catch {}
  };

  const wrappedPreview = async (_stop?: boolean) => {
    if (_stop) {
      await safeClose();
      return;
    }
    await preview();
  };

  // If preview is never invoked, release mic/context after a short grace window.
  setTimeout(() => { void safeClose(); }, 30000);

  return { profile, preview: wrappedPreview };
}
