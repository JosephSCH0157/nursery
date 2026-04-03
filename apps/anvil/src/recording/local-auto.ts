// Lightweight auto-record stub (browser MediaRecorder-based).
// Mirrors the legacy JS behavior but typed for the TS runtime.
import { getRecordingMode } from './recording-settings';
import {
  appendRecordingDecisionToTongs,
  commitRecordingBytesToTongs,
  type RecordingCommitResult,
} from '../forge/workpiece-commit';
import {
  hideRecordingFinalizeIndicator,
  showRecordingDecisionDialog,
  showRecordingFinalizeIndicator,
} from './recording-decision-dialog';

(() => {
  const RECORDING_STORAGE_LIMIT_HINT_KEY = 'forge_anvil_recording_storage_limit_hint_bytes_v1';
  // Keep default AV output conservative so common multi-minute takes fit within
  // Supabase projects that still use the default 50 MiB object limit.
  const DEFAULT_VIDEO_BITS_PER_SECOND = 1_200_000;
  const DEFAULT_AUDIO_BITS_PER_SECOND = 96_000;
  let mediaRecorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let active = false;
  let activeMode: 'av' | 'audio' | null = null;
  let currentStream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;
  let audioSource: MediaStreamAudioSourceNode | null = null;
  let audioProcessor: ScriptProcessorNode | null = null;
  let audioGain: GainNode | null = null;
  let audioChunks: Float32Array[] = [];
  let audioSampleRate = 48000;
  let recordingStartedAtMs: number | null = null;

  const pad = (n: number) => String(n).padStart(2, '0');

  function readStorageLimitHintBytes(): number | null {
    try {
      const raw = sessionStorage.getItem(RECORDING_STORAGE_LIMIT_HINT_KEY);
      if (!raw) return null;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) return null;
      return Math.floor(parsed);
    } catch {
      return null;
    }
  }

  function writeStorageLimitHintBytes(bytes: number): void {
    if (!Number.isFinite(bytes) || bytes <= 0) return;
    try {
      sessionStorage.setItem(RECORDING_STORAGE_LIMIT_HINT_KEY, String(Math.floor(bytes)));
    } catch {}
  }

  function showRecorderToast(message: string, type: 'warning' | 'info' | 'error' = 'warning'): void {
    try {
      const toast = (window as any).toast;
      if (typeof toast === 'function') {
        toast(message, { type });
      }
    } catch {}
  }

  function isStorageTooLargeCommitResult(result: unknown): boolean {
    if (!result || typeof result !== 'object') return false;
    const row = result as {
      status?: unknown;
      errorCode?: unknown;
      errorMessage?: unknown;
      details?: { error?: { code?: unknown; message?: unknown } };
    };
    if (row.status === 413) return true;
    if (row.errorCode === 'storage_object_too_large') return true;
    if (row.details?.error?.code === 'storage_object_too_large') return true;
    const message =
      typeof row.errorMessage === 'string'
        ? row.errorMessage
        : typeof row.details?.error?.message === 'string'
        ? row.details.error.message
        : '';
    return message.toLowerCase().includes('object size limit');
  }

  function readCommitResultSuccess(
    result: RecordingCommitResult,
  ): Extract<RecordingCommitResult, { ok: true }> | null {
    return result.ok ? result : null;
  }

  async function promptForTakeDecision(args: {
    commitResult: Extract<RecordingCommitResult, { ok: true }>;
    name: string;
    contentType: string;
    bytes: number;
    durationMs: number | null;
  }): Promise<void> {
    const persistDecision = async (eventName: 'take_kept' | 'take_discarded'): Promise<void> => {
      const result = await appendRecordingDecisionToTongs({
        workpieceId: args.commitResult.workpieceId,
        eventName,
        filePath: args.commitResult.path,
        originalName: args.name,
        contentType: args.contentType,
        bytes: args.bytes,
        durationMs: args.durationMs,
        createdCradle: args.commitResult.createdCradle,
        plannerRecordingSessionId: args.commitResult.plannerRecordingSessionId,
        captureSessionId: args.commitResult.captureSessionId,
      });
      if (!result.ok) {
        const summary = eventName === 'take_kept'
          ? 'Could not mark this take as kept in Tongs.'
          : 'Could not mark this take as discarded in Tongs.';
        const detail = typeof result.errorMessage === 'string' && result.errorMessage.trim()
          ? ` ${result.errorMessage.trim()}`
          : '';
        throw new Error(`${summary}${detail}`);
      }
      showRecorderToast(
        eventName === 'take_kept'
          ? 'Take kept. Hammer can use it now.'
          : 'Take discarded. It will stay out of Hammer.',
        'info',
      );
    };

    await showRecordingDecisionDialog({
      takeName: args.name,
      onKeep: async () => persistDecision('take_kept'),
      onDiscard: async () => persistDecision('take_discarded'),
    });
  }

  function formatTimestamp(date: Date): string {
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hour = pad(date.getHours());
    const minute = pad(date.getMinutes());
    const second = pad(date.getSeconds());
    return `${year}-${month}-${day}_${hour}-${minute}-${second}`;
  }

  function sanitizeTitle(title: string): string {
    const trimmed = String(title || 'Script').trim() || 'Script';
    const cleaned = trimmed
      .replace(/[:/\\?<>|*"']/g, '-')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_');
    const sliced = cleaned.slice(0, 64).replace(/^_+|_+$/g, '');
    return sliced || 'Script';
  }

  function getRouteEpisodeTitle(): string | null {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const candidate = params.get('episode_title')
        || params.get('episodeTitle')
        || params.get('workpiece_title')
        || params.get('workpieceTitle');
      if (!candidate) return null;
      const normalized = candidate.trim();
      return normalized.length > 0 ? normalized : null;
    } catch {
      return null;
    }
  }

  function getActiveScriptTitle(): string {
    try {
      const routeEpisodeTitle = getRouteEpisodeTitle();
      if (routeEpisodeTitle) return routeEpisodeTitle;
    } catch {}
    try {
      const titleInput = document.getElementById('scriptTitle') as HTMLInputElement | null;
      if (titleInput && titleInput.value) return titleInput.value;
    } catch {}
    try {
      const stored = localStorage.getItem('tp_last_script_title') || localStorage.getItem('tp_last_script_name');
      if (stored) return stored;
    } catch {}
    return 'Script';
  }

  const nowName = (mode: 'av' | 'audio'): string => {
    try {
      const date = new Date();
      const title = sanitizeTitle(getActiveScriptTitle());
      const ts = formatTimestamp(date);
      if (mode === 'audio') return `${title}_${ts}_audio.wav`;
      return `${title}_${ts}.webm`;
    } catch {
      const fallback = formatTimestamp(new Date());
      return mode === 'audio' ? `Script_${fallback}_audio.wav` : `Script_${fallback}.webm`;
    }
  };

  const pickMime = (): string => {
    try {
      const cand = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      for (const t of cand) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
      }
    } catch {}
    return 'video/webm';
  };

  const encodeWav = (buffers: Float32Array[], sampleRate: number): ArrayBuffer => {
    const numChannels = 1;
    const bytesPerSample = 2;
    const totalSamples = buffers.reduce((sum, b) => sum + b.length, 0);
    const dataSize = totalSamples * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    let offset = 0;
    writeString(offset, 'RIFF'); offset += 4;
    view.setUint32(offset, 36 + dataSize, true); offset += 4;
    writeString(offset, 'WAVE'); offset += 4;
    writeString(offset, 'fmt '); offset += 4;
    view.setUint32(offset, 16, true); offset += 4; // PCM chunk size
    view.setUint16(offset, 1, true); offset += 2; // audio format = PCM
    view.setUint16(offset, numChannels, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, sampleRate * numChannels * bytesPerSample, true); offset += 4;
    view.setUint16(offset, numChannels * bytesPerSample, true); offset += 2;
    view.setUint16(offset, 16, true); offset += 2; // bits per sample
    writeString(offset, 'data'); offset += 4;
    view.setUint32(offset, dataSize, true); offset += 4;

    let dataOffset = 44;
    for (const chunk of buffers) {
      for (let i = 0; i < chunk.length; i++) {
        let s = chunk[i];
        if (s > 1) s = 1;
        else if (s < -1) s = -1;
        const v = s < 0 ? s * 0x8000 : s * 0x7fff;
        view.setInt16(dataOffset, v, true);
        dataOffset += 2;
      }
    }
    return buffer;
  };

  const cloneTracksIntoStream = (tracks: MediaStreamTrack[]): MediaStream => {
    const cloned = tracks.map((track) => {
      try {
        if (track && typeof track.clone === 'function') return track.clone();
      } catch {}
      return track;
    });
    return new MediaStream(cloned);
  };

  const getVideoStream = async (): Promise<MediaStream> => {
    try {
      const v = document.getElementById('camVideo') as HTMLVideoElement | null;
      const s = (v?.srcObject as MediaStream) || null;
      if (s && typeof s.getVideoTracks === 'function' && s.getVideoTracks().length) {
        return cloneTracksIntoStream([...s.getVideoTracks()]);
      }
    } catch {}
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
        audio: false,
      });
    } catch {
      return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
  };

  const getAudioStream = async (): Promise<MediaStream> => {
    try {
      const mic = (window as any).__tpMic;
      const s = mic?.__lastStream as MediaStream | undefined;
      if (s && typeof s.getAudioTracks === 'function' && s.getAudioTracks().length) {
        return cloneTracksIntoStream([...s.getAudioTracks()]);
      }
    } catch {}
    try {
      const mic = (window as any).__tpMic;
      if (mic && typeof mic.requestMic === 'function') {
        const s = await mic.requestMic();
        const tracks = (s as any)?.getAudioTracks?.();
        if (tracks && tracks.length) return cloneTracksIntoStream([...tracks]);
      }
    } catch {}
    const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    return new MediaStream([...s.getAudioTracks()]);
  };

  const mustSkipForMode = (): boolean => {
    try {
      const store = (window as any).__tpStore;
      const mode = store && typeof store.get === 'function' ? String(store.get('scrollMode') || '') : '';
      return /rehearsal/i.test(mode);
    } catch {
      return false;
    }
  };

  const startAudioOnly = async (): Promise<void> => {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) throw new Error('AudioContext not available');

    const stream = await getAudioStream();
    currentStream = stream;
    const ctx = new AC({ sampleRate: 48000 });
    audioCtx = ctx as AudioContext;
    try {
      if (typeof ctx.resume === 'function' && (ctx as AudioContext).state === 'suspended') {
        await (ctx as AudioContext).resume();
      }
    } catch {}
    audioSampleRate = (ctx as AudioContext).sampleRate || 48000;
    audioChunks = [];

    audioSource = (ctx as AudioContext).createMediaStreamSource(stream);
    audioProcessor = (ctx as AudioContext).createScriptProcessor(4096, 1, 1);
    audioGain = (ctx as AudioContext).createGain();
    audioGain.gain.value = 0;

    audioProcessor.onaudioprocess = (e: AudioProcessingEvent) => {
      try {
        const input = e.inputBuffer;
        const channelCount = input.numberOfChannels || 1;
        const length = input.length;
        if (channelCount === 1) {
          const data = input.getChannelData(0);
          audioChunks.push(new Float32Array(data));
          return;
        }
        const mixed = new Float32Array(length);
        for (let c = 0; c < channelCount; c++) {
          const data = input.getChannelData(c);
          for (let i = 0; i < length; i++) mixed[i] += data[i] / channelCount;
        }
        audioChunks.push(mixed);
      } catch {}
    };

    audioSource.connect(audioProcessor);
    audioProcessor.connect(audioGain);
    audioGain.connect((ctx as AudioContext).destination);
  };

  const stopAudioOnly = async (durationMs: number | null): Promise<void> => {
    try {
      if (audioProcessor) audioProcessor.disconnect();
    } catch {}
    try {
      if (audioSource) audioSource.disconnect();
    } catch {}
    try {
      if (audioGain) audioGain.disconnect();
    } catch {}
    try {
      if (audioCtx && typeof audioCtx.close === 'function') await audioCtx.close();
    } catch {}
    audioCtx = null;
    audioSource = null;
    audioProcessor = null;
    audioGain = null;

    const wavBuffer = encodeWav(audioChunks, audioSampleRate);
    audioChunks = [];
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    try {
      await saveBlob(blob, nowName('audio'), { durationMs });
    } finally {
      recordingStartedAtMs = null;
    }
  };

  async function start(): Promise<void> {
    if (active) return;
    try {
      if (mustSkipForMode()) {
        try { console.log('[core-recorder] start skipped: rehearsal mode'); } catch {}
        return;
      }

      const recordingMode = getRecordingMode();
      try {
        console.log('[core-recorder] start', {
          mode: (window as any).__tpStore?.get?.('scrollMode') || null,
          recordingMode,
        });
      } catch {}

      if (recordingMode === 'audio') {
        await startAudioOnly();
        active = true;
        activeMode = 'audio';
        recordingStartedAtMs = Date.now();
        try {
          window.dispatchEvent(new CustomEvent('rec:state', { detail: { state: 'recording', adapter: 'local-auto' } }));
        } catch {}
        return;
      }

      const v = await getVideoStream();
      const a = await getAudioStream();
      const mix = new MediaStream();
      try {
        a.getAudioTracks().forEach((t) => mix.addTrack(t));
      } catch {}
      try {
        v.getVideoTracks().forEach((t) => mix.addTrack(t));
      } catch {}
      currentStream = mix;
      const mime = pickMime();
      mediaRecorder = new MediaRecorder(mix, {
        mimeType: mime,
        videoBitsPerSecond: DEFAULT_VIDEO_BITS_PER_SECOND,
        audioBitsPerSecond: DEFAULT_AUDIO_BITS_PER_SECOND,
      });
      chunks = [];
      mediaRecorder.ondataavailable = (e: BlobEvent) => {
        try {
          if (e && e.data && e.data.size) chunks.push(e.data);
          else console.log('[core-recorder] dataavailable empty chunk');
        } catch {}
      };
      mediaRecorder.start();
      active = true;
      activeMode = 'av';
      recordingStartedAtMs = Date.now();
      try {
        window.dispatchEvent(new CustomEvent('rec:state', { detail: { state: 'recording', adapter: 'local-auto' } }));
      } catch {}
    } catch (e) {
      try {
        console.warn('[auto-rec] start failed', e);
      } catch {}
    }
  }

  async function stop(): Promise<void> {
    try { console.log('[core-recorder] stop called'); } catch {}
    if (!active) return;
    try {
      if (activeMode === 'audio') {
        const durationMs = recordingStartedAtMs != null ? Math.max(0, Date.now() - recordingStartedAtMs) : null;
        await stopAudioOnly(durationMs);
      } else if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        const durationMs = recordingStartedAtMs != null ? Math.max(0, Date.now() - recordingStartedAtMs) : null;
        const recorder = mediaRecorder;
        recorder.onstop = async () => {
          try {
            console.log('[core-recorder] mediaRecorder.onstop fired', { chunks: chunks.length });
            console.log('[core-recorder] mediaRecorder.onstop fired');
            const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
            chunks = [];
            try {
              console.log('[core-recorder] about to save blob', { size: blob.size, type: blob.type });
            } catch {}
            await saveBlob(blob, nowName('av'), { durationMs });
          } catch (e) {
            try {
              console.warn('[auto-rec] save failed', e);
            } catch {}
          } finally {
            recordingStartedAtMs = null;
          }
        };
        recorder.stop();
      } else {
        recordingStartedAtMs = null;
      }
    } catch {}
    try {
      if (currentStream) currentStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
    } catch {}
    currentStream = null;
    mediaRecorder = null;
    active = false;
    activeMode = null;
    try {
      window.dispatchEvent(new CustomEvent('rec:state', { detail: { state: 'idle', adapter: 'local-auto' } }));
    } catch {}
  }

  async function saveBlob(
    blob: Blob,
    name: string,
    opts: { durationMs?: number | null } = {},
  ): Promise<boolean> {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const contentType = blob.type || 'application/octet-stream';
    const localWritePayload = bytes;
    showRecordingFinalizeIndicator({ takeName: name });
    let committed = false;
    let commitResultOk: Extract<RecordingCommitResult, { ok: true }> | null = null;
    try {
      const storageLimitHintBytes = readStorageLimitHintBytes();
      const skipCanonicalCommit =
        storageLimitHintBytes != null && bytes.length >= storageLimitHintBytes;
      if (skipCanonicalCommit) {
        try {
          console.warn('[core-recorder] skipping canonical commit after prior storage size-limit failure', {
            size: bytes.length,
            hintBytes: storageLimitHintBytes,
            name,
          });
        } catch {}
        showRecorderToast(
          'Cloud save skipped for this take after a prior Storage size-limit failure. Recording will be mirrored locally.',
          'warning',
        );
      } else {
        try {
          const commitResult = await commitRecordingBytesToTongs({
            bytes,
            originalName: name,
            contentType,
          });
          const commitResultSuccess = readCommitResultSuccess(commitResult);
          if (commitResultSuccess) {
            committed = true;
            commitResultOk = commitResultSuccess;
            try {
              console.log('[core-recorder] canonical commit ok', {
                workpieceId: commitResultSuccess.workpieceId,
                path: commitResultSuccess.path,
                createdCradle: commitResultSuccess.createdCradle,
              });
            } catch {}
          } else {
            if (isStorageTooLargeCommitResult(commitResult)) {
              writeStorageLimitHintBytes(bytes.length);
              showRecorderToast(
                'Cloud save hit the current Supabase Storage object-size limit. Recording will be mirrored locally for this session.',
                'warning',
              );
            }
            try {
              console.warn('[core-recorder] canonical commit unavailable; using local fallback', commitResult);
            } catch {}
          }
        } catch (commitErr) {
          try {
            console.warn('[core-recorder] canonical commit failed; using local fallback', commitErr);
          } catch {}
        }
      }

      try {
        try {
          console.log('[recording-dir] saveRecordingBlob start', { size: blob.size, name, committed });
          await import('../fs/recording-dir');
          try {
            await (window as any).__tpRecDir?.init?.();
          } catch {}
          const dir = (window as any).__tpRecDir?.get?.() || null;
          if (dir && typeof dir.getFileHandle === 'function') {
            try {
              try {
                console.log('[core-recorder] writing to directory', { name: (dir as any).name || '(handle)' });
              } catch {}
              try {
                const q = await (dir as any).queryPermission?.({ mode: 'readwrite' });
                if (q !== 'granted') {
                  const r = await (dir as any).requestPermission?.({ mode: 'readwrite' });
                  if (r !== 'granted') {
                    throw new Error('recording-dir-permission-not-granted');
                  }
                }
              } catch (permErr) {
                try { console.warn('[core-recorder] directory permission not granted; using download fallback', permErr); } catch {}
                throw permErr;
              }
              const fh = await dir.getFileHandle(name, { create: true });
              const w = await fh.createWritable();
              await w.write(localWritePayload);
              await w.close();
              try {
                console.log('[core-recorder] saved file mirror', name);
              } catch {}
              if (commitResultOk) {
                hideRecordingFinalizeIndicator();
                await promptForTakeDecision({
                  commitResult: commitResultOk,
                  name,
                  contentType,
                  bytes: bytes.length,
                  durationMs: typeof opts.durationMs === 'number' && Number.isFinite(opts.durationMs)
                    ? opts.durationMs
                    : null,
                });
              }
              return true;
            } catch (err) {
              try { console.warn('[core-recorder] failed to write via FileSystemAccess', err); } catch {}
            }
          } else {
            try {
              const managed = !!(window as any).__tpRecDir?.isManaged?.();
              const hint = (window as any).__tpRecDir?.managedHint?.();
              console.warn(
                '[core-recorder] no recording directory handle available; falling back to download',
                { managed, hint: hint || null },
              );
            } catch {}
          }
        } catch {}
        if (committed) {
          try {
            console.log('[core-recorder] canonical commit succeeded; skipping download fallback', { name });
          } catch {}
          if (commitResultOk) {
            hideRecordingFinalizeIndicator();
            await promptForTakeDecision({
              commitResult: commitResultOk,
              name,
              contentType,
              bytes: bytes.length,
              durationMs: typeof opts.durationMs === 'number' && Number.isFinite(opts.durationMs)
                ? opts.durationMs
                : null,
            });
          }
          return true;
        }
        showRecorderToast(
          'Recording saved locally only. Forge cannot mark it kept or discarded until the canonical cloud save succeeds.',
          'warning',
        );
        try {
          const downloadBlob = new Blob([bytes], { type: contentType });
          const url = URL.createObjectURL(downloadBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = name || 'Recording.webm';
          a.rel = 'noopener noreferrer';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => {
            try {
              URL.revokeObjectURL(url);
            } catch {}
          }, 2000);
        } catch {}
        return false;
      } finally {
        hideRecordingFinalizeIndicator();
      }
    } catch (error) {
      hideRecordingFinalizeIndicator();
      throw error;
    }
  }

  try {
    document.addEventListener(
      'tp:session:start',
      () => {
        try {
          start();
        } catch {}
      },
      { capture: true },
    );
    document.addEventListener(
      'tp:session:stop',
      () => {
        try {
          stop();
        } catch {}
      },
      { capture: true },
    );
    document.addEventListener(
      'tp:speech-state',
      (e) => {
        try {
          const detail = (e as CustomEvent)?.detail;
          if (detail && detail.running === false) stop();
          if (detail && detail.running === true) start();
        } catch {}
      },
      { capture: true },
    );
  } catch {}

  try {
    const auto = ((window as any).__tpAutoRecord = (window as any).__tpAutoRecord || {});
    if (!auto.start) auto.start = start;
    if (!auto.stop) auto.stop = stop;
    auto.isActive = () => !!active;
  } catch {}

  try {
    (window as any).startAutoRecord = start;
    (window as any).stopAutoRecord = stop;
  } catch {}

  // Bridge this implementation to a stable core recorder surface so the registry always
  // targets the MediaRecorder-backed recorder (even if another legacy recorder is present).
  try {
    const coreSurface = {
      start,
      stop,
      isAvailable: () => true,
      wantsAuto: () => true,
      getAdapter: () => coreSurface,
    };
    (window as any).__tpLocalRecorder = coreSurface;
    (window as any).__tpRecording = coreSurface; // override to ensure we hit the real recorder
    try { console.log('[core-recorder] bridged to __tpRecording'); } catch {}
  } catch {}
})();

export {};
