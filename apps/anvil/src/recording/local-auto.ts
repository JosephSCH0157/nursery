// Lightweight auto-record stub (browser MediaRecorder-based).
// Mirrors the legacy JS behavior but typed for the TS runtime.
import { getRecordingEngine, getRecordingMode } from './recording-settings';
import {
  beginRecordingCaptureSession,
  commitRecordingJsonArtifactToTongs,
  commitRecordingBytesToTongs,
  ensureRecordingCaptureTarget,
  readPendingRecordingDecisions,
  transitionRecordingCompleted,
  transitionRecordingDiscarded,
  transitionRecordingKept,
  type AnvilCaptureAuthority,
  type RecordingCommitResult,
} from '../forge/workpiece-commit';
import { startSpeechBackendForSession, stopSpeechBackendForSession } from '../features/speech-loader';
import { ScriptStore } from '../features/scripts-store';
import {
  hideRecordingFinalizeIndicator,
  isRecordingDecisionPending,
  showRecordingDecisionDialog,
  showRecordingFinalizeIndicator,
} from './recording-decision-dialog';
import { buildRecordingFilename, pickRecordingBaseTitle } from './recording-name';
import { resolveActiveWorkpieceId } from '../forge/workpiece-context';
import {
  RecordingTranscriptController,
  type RecordingTranscriptFinalizeResult,
} from './recordingTranscriptController';
import {
  selectBestRecordingStrategy,
  type RecordingCaptureStrategy,
} from './selectBestRecordingStrategy';

(() => {
  const RECORDING_STORAGE_LIMIT_HINT_KEY = 'forge_anvil_recording_storage_limit_hint_bytes_v1';
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
  let activeStrategy: RecordingCaptureStrategy | null = null;
  let recorderAudioTrackFailure: string | null = null;
  type RecordingSaveIdentity = {
    workpieceId: string | null;
    baseTitle: string;
    captureAuthority: AnvilCaptureAuthority | null;
  };
  let activeSaveIdentity: RecordingSaveIdentity | null = null;
  const transcriptController = new RecordingTranscriptController({
    ensureCaptureTarget: ensureRecordingCaptureTarget,
    commitJsonArtifact: commitRecordingJsonArtifactToTongs,
    startSpeech: startSpeechBackendForSession,
    stopSpeech: stopSpeechBackendForSession,
    localStorage,
    persistenceMode: 'disabled',
  });

  const pad = (n: number) => String(n).padStart(2, '0');

  const READY_SCRIPT_PREFIX = 'ready:';
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function parseReadyScriptWorkpieceId(scriptId: string | null | undefined): string | null {
    const raw = String(scriptId || '').trim();
    if (!raw.toLowerCase().startsWith(READY_SCRIPT_PREFIX)) return null;
    const rest = raw.slice(READY_SCRIPT_PREFIX.length);
    const separator = rest.indexOf(':');
    if (separator <= 0) return null;
    const candidate = rest.slice(0, separator).trim().toLowerCase();
    return UUID_RE.test(candidate) ? candidate : null;
  }

  async function recoverPendingTakeDecision(): Promise<void> {
    if (isRecordingDecisionPending()) return;
    const pending = await readPendingRecordingDecisions();
    const decision = pending[0];
    if (!decision || isRecordingDecisionPending()) return;
    await showRecordingDecisionDialog({
      takeName: decision.mediaPath.split("/").pop() || decision.mediaPath,
      isRecovery: true,
      onKeep: async () => {
        const result = await transitionRecordingKept({ commit: decision, completionId: decision.completionId });
        if (!result.ok) throw new Error(result.reason ?? `Keep failed (${result.outcome}).`);
        showRecorderToast('Take kept and ready for Hammer.', 'info');
      },
      onDiscard: async () => {
        const result = await transitionRecordingDiscarded({ commit: decision, completionId: decision.completionId });
        if (!result.ok) throw new Error(result.reason ?? `Discard failed (${result.outcome}).`);
        showRecorderToast('Take discarded.', 'info');
      },
    });
  }

  function buildWorkpieceFallbackTitle(workpieceId: string): string {
    return `Episode_${workpieceId.slice(0, 8)}`;
  }

  function getCurrentInputTitle(): string | null {
    try {
      const value = (document.getElementById('scriptTitle') as HTMLInputElement | null)?.value ?? null;
      const trimmed = String(value || '').trim();
      return trimmed.length > 0 ? trimmed : null;
    } catch {
      return null;
    }
  }

  function getStoredTitle(): string | null {
    try {
      const value = localStorage.getItem('tp_last_script_title') || localStorage.getItem('tp_last_script_name');
      const trimmed = String(value || '').trim();
      return trimmed.length > 0 ? trimmed : null;
    } catch {
      return null;
    }
  }

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

  type RecorderTrackSnapshot = {
    audioTrackCount: number;
    videoTrackCount: number;
    audioTracks: Array<{
      enabled: boolean;
      muted: boolean;
      readyState: string;
      label: string | null;
      deviceId: string | null;
    }>;
    videoTracks: Array<{
      enabled: boolean;
      muted: boolean;
      readyState: string;
      label: string | null;
      deviceId: string | null;
    }>;
    selectedMicDeviceId: string | null;
    recorderEngine: string;
  };

  let lastRecorderTrackSnapshot: RecorderTrackSnapshot | null = null;

  function readSelectedMicDeviceId(): string | null {
    try {
      const raw = localStorage.getItem('tp_mic_device_v1');
      const value = String(raw || '').trim();
      return value || null;
    } catch {
      return null;
    }
  }

  function readTrackDeviceId(track: MediaStreamTrack): string | null {
    try {
      const settings = (track as any)?.getSettings?.();
      const value = String(settings?.deviceId || '').trim();
      return value || null;
    } catch {
      return null;
    }
  }

  function summarizeTracks(stream: MediaStream): RecorderTrackSnapshot {
    const audioTracks = stream.getAudioTracks();
    const videoTracks = stream.getVideoTracks();
    return {
      audioTrackCount: audioTracks.length,
      videoTrackCount: videoTracks.length,
      audioTracks: audioTracks.map((track) => ({
        enabled: track.enabled !== false,
        muted: track.muted === true,
        readyState: String(track.readyState || ''),
        label: String(track.label || '').trim() || null,
        deviceId: readTrackDeviceId(track),
      })),
      videoTracks: videoTracks.map((track) => ({
        enabled: track.enabled !== false,
        muted: track.muted === true,
        readyState: String(track.readyState || ''),
        label: String(track.label || '').trim() || null,
        deviceId: readTrackDeviceId(track),
      })),
      selectedMicDeviceId: readSelectedMicDeviceId(),
      recorderEngine: getRecordingEngine(),
    };
  }

  function emitLocalSafetyCopyStatus(detail: {
    enabled: boolean;
    configuredPath: string | null;
    attempted: boolean;
    success: boolean;
    bytesWritten: number;
    finalPath: string | null;
    errorCode?: string | null;
    errorMessage: string | null;
    safeToLeave: boolean;
    localCopySecured?: boolean;
    localMirrorExpected?: boolean;
    localMirrorAttempted?: boolean;
    localMirrorSucceeded?: boolean;
    canonicalCommitAttempted?: boolean;
    canonicalCommitSucceeded?: boolean;
    overallSafeToLeave?: boolean;
    downloadFallbackAttempted?: boolean;
    downloadFallbackSucceeded?: boolean;
    downloadFallbackSkippedReason?: string | null;
  }): void {
    try {
      window.dispatchEvent(new CustomEvent('tp:recording:local-safety-copy', { detail }));
    } catch {}
  }

  type RecordingDestinationState = 'not_configured' | 'not_attempted' | 'succeeded' | 'failed' | 'skipped';

  function emitRecordingDestinationStatus(detail: {
    fileName: string;
    cloudUpload: { state: RecordingDestinationState; path: string | null; errorCode: string | null; errorMessage: string | null };
    canonicalCompletion: { state: RecordingDestinationState; completionId: string | null; errorCode: string | null; errorMessage: string | null };
    configuredFolder: { state: RecordingDestinationState; configuredPath: string | null; handleAvailable: boolean; errorCode: string | null; errorMessage: string | null };
    browserDownload: { state: RecordingDestinationState; fileName: string | null; errorCode: string | null; errorMessage: string | null };
  }): void {
    try {
      window.dispatchEvent(new CustomEvent('tp:recording:destination-status', { detail }));
    } catch {}
  }

  type RecordedArtifactAudioProbe = {
    hasAudioStream: boolean;
    audioDurationSec: number | null;
    channels: number | null;
    sampleRate: number | null;
    nearSilent: boolean | null;
    rmsDbfs: number | null;
    hasVideoStream: boolean;
    contentType: string;
  };

  type RecordedArtifactValidity =
    | { ok: true; probe: RecordedArtifactAudioProbe }
    | { ok: false; reason: 'empty_artifact' | 'content_type_mismatch' | 'no_audio_stream' | 'missing_video_stream' | 'invalid_duration' | 'near_silent_audio' | 'audio_track_ended'; probe: RecordedArtifactAudioProbe };

  function buildProbeFromSnapshot(contentType: string): RecordedArtifactAudioProbe {
    const audioTrackCount = Number(lastRecorderTrackSnapshot?.audioTrackCount || 0);
    const videoTrackCount = Number(lastRecorderTrackSnapshot?.videoTrackCount || 0);
    return {
      hasAudioStream: audioTrackCount > 0,
      audioDurationSec: null,
      channels: null,
      sampleRate: null,
      nearSilent: null,
      rmsDbfs: null,
      hasVideoStream: videoTrackCount > 0 || contentType.startsWith('video/'),
      contentType,
    };
  }

  async function verifyFinalizedRecordingArtifact(blob: Blob, strategy: RecordingCaptureStrategy | null): Promise<RecordedArtifactValidity> {
    const contentType = String(blob.type || 'application/octet-stream').trim().toLowerCase();
    const snapshotProbe = buildProbeFromSnapshot(contentType);
    if (blob.size <= 0) return { ok: false, reason: 'empty_artifact', probe: snapshotProbe };
    if ((strategy?.mode === 'audio' && !contentType.startsWith('audio/'))
      || (strategy?.mode === 'av' && !contentType.startsWith('video/'))) {
      return { ok: false, reason: 'content_type_mismatch', probe: snapshotProbe };
    }
    if (recorderAudioTrackFailure) {
      return { ok: false, reason: 'audio_track_ended', probe: snapshotProbe };
    }
    try {
      const customVerifier = (window as any).__tpVerifyRecordedArtifact;
      if (typeof customVerifier === 'function') {
        const result = await customVerifier(blob, {
          lastRecorderTrackSnapshot,
          recordingEngine: getRecordingEngine(),
        });
        if (result && typeof result === 'object') {
          const probe: RecordedArtifactAudioProbe = {
            hasAudioStream: !!(result as any).hasAudioStream,
            audioDurationSec: Number.isFinite(Number((result as any).audioDurationSec))
              ? Number((result as any).audioDurationSec)
              : null,
            channels: Number.isFinite(Number((result as any).channels)) ? Number((result as any).channels) : null,
            sampleRate: Number.isFinite(Number((result as any).sampleRate)) ? Number((result as any).sampleRate) : null,
            nearSilent: typeof (result as any).nearSilent === 'boolean' ? !!(result as any).nearSilent : null,
            rmsDbfs: Number.isFinite(Number((result as any).rmsDbfs)) ? Number((result as any).rmsDbfs) : null,
            hasVideoStream: typeof (result as any).hasVideoStream === 'boolean'
              ? !!(result as any).hasVideoStream
              : contentType.startsWith('video/'),
            contentType,
          };
          if (!probe.hasAudioStream || (typeof probe.channels === 'number' && probe.channels <= 0) || (typeof probe.sampleRate === 'number' && probe.sampleRate <= 0)) {
            return { ok: false, reason: 'no_audio_stream', probe };
          }
          if (strategy?.mode === 'av' && !probe.hasVideoStream) return { ok: false, reason: 'missing_video_stream', probe };
          if (typeof probe.audioDurationSec === 'number' && probe.audioDurationSec <= 0) return { ok: false, reason: 'invalid_duration', probe };
          if (probe.nearSilent === true) {
            return { ok: false, reason: 'near_silent_audio', probe };
          }
          return { ok: true, probe };
        }
      }
    } catch {}

    const fallbackProbe = snapshotProbe;
    if (!fallbackProbe.hasAudioStream) {
      return { ok: false, reason: 'no_audio_stream', probe: fallbackProbe };
    }
    return { ok: true, probe: fallbackProbe };
  }

  function readCaptureSessionRunKey(): string | null {
    try {
      const fromAsr = String((window as any).__tpAsrRunKey || '').trim();
      if (fromAsr) return fromAsr;
    } catch {}
    try {
      const fromSession = sessionStorage.getItem('forge_anvil_capture_session_v1');
      const trimmed = String(fromSession || '').trim();
      if (trimmed) return trimmed;
    } catch {}
    return null;
  }

  function readWorkspaceIdForAudit(): string | null {
    try {
      const value = localStorage.getItem('forge_workspace_id_v1') || localStorage.getItem('barstock_workspace_id');
      const trimmed = String(value || '').trim();
      return trimmed || null;
    } catch {
      return null;
    }
  }

  function emitUploadFallbackAudit(detail: {
    saveIdentity: RecordingSaveIdentity | null;
    originalName: string;
    bytes: number;
    canonicalAttempted: boolean;
    canonicalSucceeded: boolean;
    fallbackUsed: boolean;
    safeToLeave: boolean;
    errorCode?: string | null;
    errorMessage?: string | null;
    finalStorageKey?: string | null;
    localMirrorExpected?: boolean;
    localMirrorAttempted?: boolean;
    localMirrorSucceeded?: boolean;
    localCopySecured?: boolean;
    downloadFallbackAttempted?: boolean;
    downloadFallbackSucceeded?: boolean;
    downloadFallbackSkippedReason?: string | null;
  }): void {
    const cleanTitle = String(detail.saveIdentity?.baseTitle || '').trim();
    const fallbackTitle = cleanTitle || String(detail.originalName || '').replace(/\.[^.]+$/, '').trim() || null;
    const payload = {
      sessionRunKey: readCaptureSessionRunKey(),
      workpieceId: detail.saveIdentity?.workpieceId || null,
      workspaceId: readWorkspaceIdForAudit(),
      title: fallbackTitle,
      scriptHash: String((window as any).__TP_LAST_APPLIED_HASH || '').trim() || null,
      strategy: 'single' as const,
      phase: 'failed' as const,
      safeToLeave: detail.safeToLeave,
      blobBytes: detail.bytes,
      blobMb: Number((detail.bytes / (1024 * 1024)).toFixed(2)),
      canonicalAttempted: detail.canonicalAttempted,
      canonicalSucceeded: detail.canonicalSucceeded,
      fallbackUsed: detail.fallbackUsed,
      errorCode: detail.errorCode || null,
      errorMessage: detail.errorMessage || null,
      finalStorageKey: detail.finalStorageKey || null,
      localMirrorExpected: detail.localMirrorExpected === true,
      localMirrorAttempted: detail.localMirrorAttempted === true,
      localMirrorSucceeded: detail.localMirrorSucceeded === true,
      localCopySecured: detail.localCopySecured === true,
      downloadFallbackAttempted: detail.downloadFallbackAttempted === true,
      downloadFallbackSucceeded: detail.downloadFallbackSucceeded === true,
      downloadFallbackSkippedReason: detail.downloadFallbackSkippedReason || null,
    };
    try {
      window.dispatchEvent(new CustomEvent('tp:recording:upload-fallback', { detail: payload }));
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

  function extractCommitErrorSummary(result: unknown): { code: string | null; message: string | null } {
    if (!result || typeof result !== 'object') return { code: null, message: null };
    const row = result as {
      errorCode?: unknown;
      errorMessage?: unknown;
      details?: { error?: { code?: unknown; message?: unknown } };
    };
    const code =
      typeof row.errorCode === 'string'
        ? row.errorCode
        : typeof row.details?.error?.code === 'string'
        ? row.details.error.code
        : null;
    const message =
      typeof row.errorMessage === 'string'
        ? row.errorMessage
        : typeof row.details?.error?.message === 'string'
        ? row.details.error.message
        : null;
    return { code, message };
  }

  function readCommitResultSuccess(
    result: RecordingCommitResult,
  ): Extract<RecordingCommitResult, { ok: true }> | null {
    return result.ok ? result : null;
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

  function getReadyScriptTitleForWorkpiece(workpieceId: string | null): string | null {
    if (!workpieceId) return null;
    try {
      const entries = ScriptStore.list();
      const selectedIds = [
        (document.getElementById('scriptSelectSidebar') as HTMLSelectElement | null)?.value || '',
        (document.getElementById('scriptSelect') as HTMLSelectElement | null)?.value || '',
      ].map((value) => String(value || '').trim()).filter(Boolean);

      for (const selectedId of selectedIds) {
        if (parseReadyScriptWorkpieceId(selectedId) !== workpieceId) continue;
        const match = entries.find((entry) => entry.id === selectedId);
        const title = String(match?.title || '').trim();
        if (title) return title;
      }

      const firstMatch = entries.find((entry) => parseReadyScriptWorkpieceId(entry.id) === workpieceId);
      const fallbackTitle = String(firstMatch?.title || '').trim();
      return fallbackTitle || null;
    } catch {
      return null;
    }
  }

  function captureRecordingSaveIdentity(): RecordingSaveIdentity {
    const workpieceId = resolveActiveWorkpieceId();
    const routeEpisodeTitle = getRouteEpisodeTitle();
    const readyTitle = getReadyScriptTitleForWorkpiece(workpieceId);
    const inputTitle = getCurrentInputTitle();
    const storedTitle = getStoredTitle();

    const trustedWorkpieceTitle =
      routeEpisodeTitle
      || readyTitle;

    const baseTitle = trustedWorkpieceTitle
      || (workpieceId ? buildWorkpieceFallbackTitle(workpieceId) : null)
      || pickRecordingBaseTitle({
        inputTitle,
        routeEpisodeTitle,
        storedTitle,
      });

    try {
      console.log('[core-recorder] save identity snapshot', {
        workpieceId,
        baseTitle,
        trustedWorkpieceTitle: trustedWorkpieceTitle || null,
      });
    } catch {}

    return {
      workpieceId,
      baseTitle,
      captureAuthority: null,
    };
  }

  const applyFileExtension = (name: string, extension: string | null | undefined): string => {
    const cleanExtension = String(extension || '').trim().replace(/^\./, '');
    if (!cleanExtension) return name;
    const stem = name.replace(/\.[^.]+$/, '');
    return `${stem}.${cleanExtension}`;
  };

  const nowName = (
    mode: 'av' | 'audio',
    extensionOverride?: string | null,
    identity?: RecordingSaveIdentity | null,
  ): string => {
    try {
      return applyFileExtension(buildRecordingFilename({
        mode,
        baseTitle: identity?.baseTitle || pickRecordingBaseTitle({
          inputTitle: getCurrentInputTitle(),
          routeEpisodeTitle: getRouteEpisodeTitle(),
          storedTitle: getStoredTitle(),
        }),
      }), extensionOverride ?? (mode === 'audio' ? 'wav' : 'webm'));
    } catch {
      // Preserve existing fallback shape.
      const date = new Date();
      const year = date.getFullYear();
      const month = pad(date.getMonth() + 1);
      const day = pad(date.getDate());
      const hour = pad(date.getHours());
      const minute = pad(date.getMinutes());
      const second = pad(date.getSeconds());
      const fallback = `${year}-${month}-${day}_${hour}-${minute}-${second}`;
      return applyFileExtension(
        mode === 'audio' ? `Script_${fallback}_audio.wav` : `Script_${fallback}.webm`,
        extensionOverride ?? (mode === 'audio' ? 'wav' : 'webm'),
      );
    }
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
    // The production recorder must own its microphone source. The shared __tpMic
    // stream belongs to preview/ASR and requestMic() intentionally releases it
    // when Whisper changes capture mode. Cloning that shared stream therefore
    // lets transcript startup terminate the audio inside an otherwise-live video.
    const selectedDeviceId = readSelectedMicDeviceId();
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
        video: false,
      });
    } catch (error) {
      if (!selectedDeviceId) throw error;
      // A previously selected device may have been unplugged or renumbered. The
      // browser's current default is safer than falling back to ASR-owned media.
      return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
  };

  const monitorRecorderAudioTracks = (stream: MediaStream): void => {
    for (const track of stream.getAudioTracks()) {
      track.addEventListener('ended', () => {
        if (!active || recorderAudioTrackFailure) return;
        recorderAudioTrackFailure = 'recorder_audio_track_ended_during_capture';
        try {
          console.error('[core-recorder] audio track ended during active capture', {
            label: track.label || null,
            readyState: track.readyState,
          });
          window.dispatchEvent(new CustomEvent('tp:recording:audio-track-failed', {
            detail: { reason: recorderAudioTrackFailure, label: track.label || null },
          }));
        } catch {}
        showRecorderToast(
          'Microphone capture stopped during recording. This take cannot be kept; stop and record a new take.',
          'error',
        );
      }, { once: true });
    }
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
    recorderAudioTrackFailure = null;
    monitorRecorderAudioTracks(stream);
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

  const stopAudioOnly = async (
    durationMs: number | null,
    transcriptFinalize: RecordingTranscriptFinalizeResult | null,
    strategy: RecordingCaptureStrategy | null,
    identity: RecordingSaveIdentity | null,
  ): Promise<void> => {
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
      await saveBlob(blob, nowName('audio', strategy?.fileExtension ?? 'wav', identity), {
        durationMs,
        transcriptFinalize,
        strategy,
        saveIdentity: identity,
      });
    } finally {
      recordingStartedAtMs = null;
    }
  };

  const startMediaRecorderWithStrategy = async (strategy: RecordingCaptureStrategy): Promise<void> => {
    const mix = new MediaStream();
    if (strategy.mode === 'audio') {
      const audioStream = await getAudioStream();
      try {
        audioStream.getAudioTracks().forEach((track) => mix.addTrack(track));
      } catch {}
    } else {
      const videoStream = await getVideoStream();
      const audioStream = await getAudioStream();
      try {
        audioStream.getAudioTracks().forEach((track) => mix.addTrack(track));
      } catch {}
      try {
        videoStream.getVideoTracks().forEach((track) => mix.addTrack(track));
      } catch {}
    }

    currentStream = mix;
    recorderAudioTrackFailure = null;
    monitorRecorderAudioTracks(mix);
    const recorderTrackSnapshot = summarizeTracks(mix);
    lastRecorderTrackSnapshot = recorderTrackSnapshot;
    try {
      console.info('[core-recorder] recorder stream tracks', recorderTrackSnapshot);
      window.dispatchEvent(new CustomEvent('tp:recording:recorder-stream', { detail: recorderTrackSnapshot }));
    } catch {}
    try {
      const asrSourceSelected = String((window as any).__tpCalibrationRuntime?.source || '').trim() || 'unknown';
      const asrPath = String((window as any).__tpCalibrationRuntime?.asrPath || '').trim() || 'unknown';
      const asrSource = { asrSourceSelected, asrPath };
      console.info('[core-recorder] asr vs recorder source', {
        asr: asrSource,
        recorderEngine: recorderTrackSnapshot.recorderEngine,
        recorderAudioTrackCount: recorderTrackSnapshot.audioTrackCount,
      });
      window.dispatchEvent(new CustomEvent('tp:recording:asr-recorder-source', {
        detail: {
          asr: asrSource,
          recorder: {
            engine: recorderTrackSnapshot.recorderEngine,
            audioTrackCount: recorderTrackSnapshot.audioTrackCount,
            videoTrackCount: recorderTrackSnapshot.videoTrackCount,
          },
        },
      }));
    } catch {}
    if (recorderTrackSnapshot.audioTrackCount <= 0) {
      showRecorderToast(
        'Recording cannot start because the recorder has no active audio track. ASR may still hear the mic, but the recording would be silent.',
        'error',
      );
      try {
        console.error('[core-recorder] refusing to start: recorder stream has no audio track', recorderTrackSnapshot);
      } catch {}
      throw new Error('recorder_stream_missing_audio_track');
    }
    const recorderOptions: MediaRecorderOptions = {};
    if (strategy.mimeType) recorderOptions.mimeType = strategy.mimeType;
    if (strategy.videoBitsPerSecond != null) recorderOptions.videoBitsPerSecond = strategy.videoBitsPerSecond;
    if (strategy.audioBitsPerSecond != null) recorderOptions.audioBitsPerSecond = strategy.audioBitsPerSecond;
    mediaRecorder = new MediaRecorder(mix, recorderOptions);
    chunks = [];
    mediaRecorder.ondataavailable = (e: BlobEvent) => {
      try {
        if (e && e.data && e.data.size) chunks.push(e.data);
        else console.log('[core-recorder] dataavailable empty chunk');
      } catch {}
    };
    // Periodic chunks limit loss and make track failure visible before finalize.
    mediaRecorder.start(1000);
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

      const strategy = selectBestRecordingStrategy({ mode: recordingMode });
      const speechMode = (window as any).__tpStore?.get?.('scrollMode') ?? null;
      const captureSessionId = beginRecordingCaptureSession();
      const captureTarget = await ensureRecordingCaptureTarget();
      if (!captureTarget.ok) {
        showRecorderToast('Recording cannot start until this page is bound to a canonical episode and Tongs acknowledges capture authority.', 'error');
        throw new Error(captureTarget.reason);
      }
      activeSaveIdentity = { ...captureRecordingSaveIdentity(), captureAuthority: captureTarget.captureAuthority };
      activeStrategy = strategy;

      if (recordingMode === 'audio' && strategy.mechanism === 'pcm-wav-fallback') {
        await startAudioOnly();
        active = true;
        activeMode = 'audio';
        recordingStartedAtMs = Date.now();
        try {
          window.dispatchEvent(new CustomEvent('rec:state', { detail: { state: 'recording', adapter: 'local-auto' } }));
        } catch {}
        void transcriptController.startSession({
          captureSessionId,
          recordingStartedAtMs: recordingStartedAtMs,
          strategy,
          speechMode,
        }).catch((error) => {
          try { console.warn('[auto-rec] transcript start failed', error); } catch {}
        });
        return;
      }

      await startMediaRecorderWithStrategy(strategy);
      active = true;
      activeMode = strategy.mode;
      recordingStartedAtMs = Date.now();
      try {
        window.dispatchEvent(new CustomEvent('rec:state', { detail: { state: 'recording', adapter: 'local-auto' } }));
      } catch {}
      void transcriptController.startSession({
        captureSessionId,
        recordingStartedAtMs: recordingStartedAtMs,
        strategy,
        speechMode,
      }).catch((error) => {
        try { console.warn('[auto-rec] transcript start failed', error); } catch {}
      });
    } catch (e) {
      try {
        console.warn('[auto-rec] start failed', e);
      } catch {}
      activeSaveIdentity = null;
      activeStrategy = null;
    }
  }

  async function stop(): Promise<void> {
    try { console.log('[core-recorder] stop called'); } catch {}
    if (!active) return;
    const durationMs = recordingStartedAtMs != null ? Math.max(0, Date.now() - recordingStartedAtMs) : null;
    const strategyAtStop = activeStrategy;
    const saveIdentityAtStop = activeSaveIdentity;
    const transcriptFinalize = await transcriptController.stopSession({
      mediaDurationMs: durationMs,
    }).catch((error) => {
      try { console.warn('[auto-rec] transcript finalize failed', error); } catch {}
      return null;
    });
    let cleanupStreamAfterRecorderStop = false;
    try {
      if (activeMode === 'audio' && strategyAtStop?.mechanism === 'pcm-wav-fallback') {
        await stopAudioOnly(durationMs, transcriptFinalize, strategyAtStop, saveIdentityAtStop);
      } else if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        const recorder = mediaRecorder;
        cleanupStreamAfterRecorderStop = true;
        const stopName = nowName(strategyAtStop?.mode ?? 'av', strategyAtStop?.fileExtension, saveIdentityAtStop);
        recorder.onstop = async () => {
          try {
            console.log('[core-recorder] mediaRecorder.onstop fired', { chunks: chunks.length });
            console.log('[core-recorder] mediaRecorder.onstop fired');
            const blob = new Blob(chunks, { type: recorder.mimeType || strategyAtStop?.mimeType || 'video/webm' });
            chunks = [];
            try {
              console.log('[core-recorder] about to save blob', { size: blob.size, type: blob.type });
            } catch {}
            await saveBlob(blob, stopName, {
              durationMs,
              transcriptFinalize,
              strategy: strategyAtStop,
              saveIdentity: saveIdentityAtStop,
            });
          } catch (e) {
            try {
              console.warn('[auto-rec] save failed', e);
            } catch {}
          } finally {
            recordingStartedAtMs = null;
            try {
              currentStream?.getTracks().forEach((track) => track.stop());
            } catch {}
            currentStream = null;
          }
        };
        try { recorder.requestData(); } catch {}
        recorder.stop();
      } else {
        recordingStartedAtMs = null;
      }
    } catch {}
    // MediaRecorder.onstop owns stream cleanup so tracks remain live while the
    // browser flushes its final encoded chunk.
    if (!cleanupStreamAfterRecorderStop) {
      try { currentStream?.getTracks().forEach((track) => track.stop()); } catch {}
      currentStream = null;
    }
    mediaRecorder = null;
    active = false;
    activeMode = null;
    activeStrategy = null;
    activeSaveIdentity = null;
    try {
      window.dispatchEvent(new CustomEvent('rec:state', { detail: { state: 'idle', adapter: 'local-auto' } }));
    } catch {}
  }

  async function saveBlob(
    blob: Blob,
    name: string,
    opts: {
      durationMs?: number | null;
      transcriptFinalize?: RecordingTranscriptFinalizeResult | null;
      strategy?: RecordingCaptureStrategy | null;
      saveIdentity?: RecordingSaveIdentity | null;
    } = {},
  ): Promise<boolean> {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const contentType = blob.type || 'application/octet-stream';
    const localWritePayload = bytes;
    showRecordingFinalizeIndicator({ takeName: name });
    let committed = false;
    let commitResultOk: Extract<RecordingCommitResult, { ok: true }> | null = null;
    let acceptedCompletionId: string | null = null;
    let canonicalAttempted = false;
    let canonicalUploadSucceeded = false;
    let canonicalCompletionAttempted = false;
    let canonicalErrorCode: string | null = null;
    let canonicalErrorMessage: string | null = null;
    let localMirrorExpected = false;
    let localMirrorAttempted = false;
    let localMirrorSucceeded = false;
    let localMirrorHandleAvailable = false;
    let localMirrorConfiguredPath: string | null = null;
    let localMirrorErrorCode: string | null = null;
    let localMirrorErrorMessage: string | null = null;
    let downloadFallbackAttempted = false;
    let downloadFallbackSucceeded = false;
    let downloadFallbackSkippedReason: string | null = null;
    let downloadFallbackErrorMessage: string | null = null;
    const emitDestinationStatus = (): void => {
      emitRecordingDestinationStatus({
        fileName: name,
        cloudUpload: {
          state: canonicalUploadSucceeded ? 'succeeded' : canonicalAttempted ? 'failed' : 'not_attempted',
          path: commitResultOk?.path ?? null,
          errorCode: canonicalUploadSucceeded ? null : canonicalErrorCode,
          errorMessage: canonicalUploadSucceeded ? null : canonicalErrorMessage,
        },
        canonicalCompletion: {
          state: committed ? 'succeeded' : canonicalCompletionAttempted ? 'failed' : 'not_attempted',
          completionId: acceptedCompletionId,
          errorCode: committed ? null : canonicalErrorCode,
          errorMessage: committed ? null : canonicalErrorMessage,
        },
        configuredFolder: {
          state: !localMirrorExpected
            ? 'not_configured'
            : localMirrorSucceeded
              ? 'succeeded'
              : localMirrorAttempted
                ? 'failed'
                : 'not_attempted',
          configuredPath: localMirrorConfiguredPath,
          handleAvailable: localMirrorHandleAvailable,
          errorCode: localMirrorErrorCode,
          errorMessage: localMirrorErrorMessage,
        },
        browserDownload: {
          state: downloadFallbackSucceeded
            ? 'succeeded'
            : downloadFallbackAttempted
              ? 'failed'
              : downloadFallbackSkippedReason
                ? 'skipped'
                : 'not_attempted',
          fileName: downloadFallbackAttempted ? name : null,
          errorCode: downloadFallbackAttempted && !downloadFallbackSucceeded ? 'browser_download_failed' : downloadFallbackSkippedReason,
          errorMessage: downloadFallbackErrorMessage,
        },
      });
    };
    const presentCanonicalTakeDecision = async (): Promise<void> => {
      if (!commitResultOk || !acceptedCompletionId) return;
      hideRecordingFinalizeIndicator();
      showRecorderToast('Recording saved · Keep or discard this take.', 'info');
      await showRecordingDecisionDialog({
        takeName: name,
        onKeep: async () => {
          const result = await transitionRecordingKept({ commit: commitResultOk!, completionId: acceptedCompletionId! });
          if (!result.ok) throw new Error(result.reason ?? `Keep failed (${result.outcome}).`);
          showRecorderToast('Take kept and ready for Hammer.', 'info');
        },
        onDiscard: async () => {
          const result = await transitionRecordingDiscarded({ commit: commitResultOk!, completionId: acceptedCompletionId! });
          if (!result.ok) throw new Error(result.reason ?? `Discard failed (${result.outcome}).`);
          showRecorderToast('Take discarded.', 'info');
        },
      });
    };
    try {
      const recordingValidity = await verifyFinalizedRecordingArtifact(blob, opts.strategy ?? null);
      try {
        console.info('[core-recorder] finalized artifact validity', recordingValidity);
        window.dispatchEvent(new CustomEvent('tp:recording:artifact-audio-verification', {
          detail: {
            ok: recordingValidity.ok,
            reason: recordingValidity.ok ? null : recordingValidity.reason,
            probe: recordingValidity.probe,
          },
        }));
      } catch {}
      if (!recordingValidity.ok) {
        if (recordingValidity.reason === 'no_audio_stream') {
          showRecorderToast('The finalized recording has no audio track. This cannot be saved as a podcast take.', 'error');
          canonicalErrorCode = 'podcast_take_no_audio_stream';
          canonicalErrorMessage = 'The finalized recording has no audio track. This cannot be saved as a podcast take.';
        } else if (recordingValidity.reason === 'audio_track_ended') {
          showRecorderToast('Microphone capture stopped before this recording ended. This take cannot be kept.', 'error');
          canonicalErrorCode = 'podcast_take_audio_track_ended';
          canonicalErrorMessage = 'Microphone capture stopped before this recording ended. This take cannot be kept.';
        } else if (recordingValidity.reason === 'near_silent_audio') {
          showRecorderToast('The finalized recording contains an audio track, but no usable audio was detected. Verify the recording before leaving.', 'error');
          canonicalErrorCode = 'podcast_take_near_silent_audio';
          canonicalErrorMessage = 'The finalized recording contains an audio track, but no usable audio was detected. Verify the recording before leaving.';
        } else {
          showRecorderToast('The finalized recording failed browser media sanity checks and cannot be uploaded as a take.', 'error');
          canonicalErrorCode = `podcast_take_${recordingValidity.reason}`;
          canonicalErrorMessage = `The finalized recording failed browser media sanity checks (${recordingValidity.reason}).`;
        }
        try {
          window.dispatchEvent(new CustomEvent('tp:recording:podcast-audio-invalid', {
            detail: {
              reason: recordingValidity.reason,
              probe: recordingValidity.probe,
              safeToLeave: false,
            },
          }));
        } catch {}
      }

      const recorderAudioTrackCount = Number(lastRecorderTrackSnapshot?.audioTrackCount || 0);
      const recorderVideoTrackCount = Number(lastRecorderTrackSnapshot?.videoTrackCount || 0);
      const expectedContainerHasAudio = recorderAudioTrackCount > 0;
      try {
        console.info('[core-recorder] finalize blob diagnostics', {
          mimeType: contentType,
          bytes: bytes.length,
          durationMs: typeof opts.durationMs === 'number' ? opts.durationMs : null,
          recorderAudioTrackCount,
          recorderVideoTrackCount,
          expectedContainerHasAudio,
          recorderEngine: lastRecorderTrackSnapshot?.recorderEngine || getRecordingEngine(),
        });
      } catch {}
      const storageLimitHintBytes = readStorageLimitHintBytes();
      const skipCanonicalCommit =
        storageLimitHintBytes != null && bytes.length >= storageLimitHintBytes;
      if (!recordingValidity.ok) {
        canonicalAttempted = false;
      } else if (skipCanonicalCommit) {
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
        canonicalAttempted = false;
        canonicalErrorCode = 'canonical_commit_skipped_size_hint';
        canonicalErrorMessage = 'Canonical upload skipped after prior storage size-limit failure';
      } else {
        canonicalAttempted = true;
        try {
          const commitResult = await commitRecordingBytesToTongs({
            captureAuthority: opts.saveIdentity?.captureAuthority ?? (() => { throw new Error('capture_authority_unavailable'); })(),
            bytes,
            originalName: name,
            contentType,
            transcriptPath: opts.transcriptFinalize?.finalPath ?? null,
            transcriptStatus: opts.transcriptFinalize?.status ?? null,
            recordingMedium: opts.strategy?.recordingMedium ?? null,
            requiresPostNormalization: opts.strategy?.requiresPostNormalization === true,
          });
          const commitResultSuccess = readCommitResultSuccess(commitResult);
          if (commitResultSuccess) {
            commitResultOk = commitResultSuccess;
            canonicalUploadSucceeded = true;
            canonicalCompletionAttempted = true;
            const completion = await transitionRecordingCompleted({
              commit: commitResultSuccess,
              durationMs: typeof opts.durationMs === 'number' ? opts.durationMs : null,
            });
            if (completion.ok && completion.completionId) {
              committed = true;
              acceptedCompletionId = completion.completionId;
            } else {
              canonicalErrorCode = completion.reason ?? `recording_completion_${completion.outcome}`;
              canonicalErrorMessage = `Recording bytes were saved, but canonical completion remained incomplete (${completion.outcome}).`;
              showRecorderToast(canonicalErrorMessage, 'warning');
            }
            try {
              console.log('[core-recorder] canonical commit ok', {
                workpieceId: commitResultSuccess.workpieceId,
                path: commitResultSuccess.path,
                createdCradle: commitResultSuccess.createdCradle,
              });
            } catch {}
          } else {
            const commitError = extractCommitErrorSummary(commitResult);
            canonicalErrorCode = commitError.code;
            canonicalErrorMessage = commitError.message;
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
          canonicalErrorCode = 'canonical_commit_exception';
          canonicalErrorMessage = String((commitErr as any)?.message || commitErr || 'Canonical commit failed');
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
          const managed = !!(window as any).__tpRecDir?.isManaged?.();
          const hint = (window as any).__tpRecDir?.managedHint?.();
          const configuredPath = managed
            ? (typeof hint === 'string' && hint.trim() ? hint.trim() : 'managed:recordings')
            : (dir && typeof (dir as any).name === 'string' ? String((dir as any).name).trim() : null);
          localMirrorConfiguredPath = configuredPath || null;
          localMirrorExpected = managed || !!configuredPath || !!dir;
          localMirrorHandleAvailable = !!dir && typeof dir.getFileHandle === 'function';
          const safetyEnabled = !!dir;
          emitLocalSafetyCopyStatus({
            enabled: safetyEnabled,
            configuredPath: configuredPath || null,
            attempted: false,
            success: false,
            bytesWritten: 0,
            finalPath: null,
            errorCode: null,
            errorMessage: null,
            safeToLeave: false,
            localCopySecured: false,
            localMirrorExpected,
            localMirrorAttempted: false,
            localMirrorSucceeded: false,
            canonicalCommitAttempted: canonicalAttempted,
            canonicalCommitSucceeded: committed,
            overallSafeToLeave: committed,
            downloadFallbackAttempted,
            downloadFallbackSucceeded,
            downloadFallbackSkippedReason,
          });
          if (dir && typeof dir.getFileHandle === 'function') {
            let folderWriteStage: 'permission' | 'file' | 'writable' | 'write' | 'close' = 'permission';
            try {
              localMirrorAttempted = true;
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
              folderWriteStage = 'file';
              const fh = await dir.getFileHandle(name, { create: true });
              folderWriteStage = 'writable';
              const w = await fh.createWritable();
              folderWriteStage = 'write';
              await w.write(localWritePayload);
              folderWriteStage = 'close';
              await w.close();
              localMirrorSucceeded = true;
              localMirrorErrorCode = null;
              localMirrorErrorMessage = null;
              emitLocalSafetyCopyStatus({
                enabled: true,
                configuredPath: configuredPath || null,
                attempted: true,
                success: true,
                bytesWritten: bytes.length,
                finalPath: `local:directory:${name}`,
                errorCode: null,
                errorMessage: null,
                safeToLeave: true,
                localCopySecured: true,
                localMirrorExpected,
                localMirrorAttempted,
                localMirrorSucceeded,
                canonicalCommitAttempted: canonicalAttempted,
                canonicalCommitSucceeded: committed,
                overallSafeToLeave: true,
                downloadFallbackAttempted,
                downloadFallbackSucceeded,
                downloadFallbackSkippedReason,
              });
              try {
                console.log('[core-recorder] saved file mirror', name);
              } catch {}
              emitDestinationStatus();
              if (commitResultOk && acceptedCompletionId) {
                await presentCanonicalTakeDecision();
              }
              if (!committed) {
                emitUploadFallbackAudit({
                  saveIdentity: opts.saveIdentity ?? null,
                  originalName: name,
                  bytes: bytes.length,
                  canonicalAttempted,
                  canonicalSucceeded: false,
                  fallbackUsed: true,
                  safeToLeave: canonicalErrorCode == null,
                  errorCode: canonicalErrorCode,
                  errorMessage: canonicalErrorMessage,
                  finalStorageKey: `local:directory:${name}`,
                  localMirrorExpected,
                  localMirrorAttempted,
                  localMirrorSucceeded,
                  localCopySecured: true,
                  downloadFallbackAttempted,
                  downloadFallbackSucceeded,
                  downloadFallbackSkippedReason,
                });
              }
              return true;
            } catch (err) {
              const folderErrorCodes = {
                permission: 'directory_permission_not_granted',
                file: 'directory_file_creation_failed',
                writable: 'directory_writable_open_failed',
                write: 'directory_write_failed',
                close: 'directory_close_failed',
              } as const;
              localMirrorErrorCode = folderErrorCodes[folderWriteStage];
              localMirrorErrorMessage = String((err as any)?.message || err || 'configured_folder_write_failed');
              emitLocalSafetyCopyStatus({
                enabled: true,
                configuredPath: configuredPath || null,
                attempted: true,
                success: false,
                bytesWritten: 0,
                finalPath: null,
                errorCode: localMirrorErrorCode,
                errorMessage: localMirrorErrorMessage,
                safeToLeave: false,
                localCopySecured: false,
                localMirrorExpected,
                localMirrorAttempted: true,
                localMirrorSucceeded: false,
                canonicalCommitAttempted: canonicalAttempted,
                canonicalCommitSucceeded: committed,
                overallSafeToLeave: committed,
                downloadFallbackAttempted,
                downloadFallbackSucceeded,
                downloadFallbackSkippedReason,
              });
              if (committed) {
                showRecorderToast(
                  `Recording was saved to Forge, but the configured folder copy failed (${localMirrorErrorCode}).`,
                  'warning',
                );
              } else {
                showRecorderToast(
                  `Configured folder copy failed (${localMirrorErrorCode}). Keep this screen open until the browser download finishes.`,
                  'error',
                );
              }
              try { console.warn('[core-recorder] failed to write via FileSystemAccess', err); } catch {}
            }
          } else {
            localMirrorAttempted = localMirrorExpected;
            localMirrorErrorCode = localMirrorExpected ? 'missing_directory_handle' : null;
            localMirrorErrorMessage = localMirrorExpected
              ? `The configured recording folder is not linked for ${window.location.origin}.`
              : null;
            try {
              const managed = !!(window as any).__tpRecDir?.isManaged?.();
              const hint = (window as any).__tpRecDir?.managedHint?.();
              console.warn(
                '[core-recorder] no recording directory handle available; falling back to download',
                { managed, hint: hint || null },
              );
            } catch {}
            emitLocalSafetyCopyStatus({
              enabled: localMirrorExpected,
              configuredPath: configuredPath || null,
              attempted: localMirrorAttempted,
              success: false,
              bytesWritten: 0,
              finalPath: null,
              errorCode: localMirrorErrorCode,
              errorMessage: localMirrorErrorMessage,
              safeToLeave: false,
              localCopySecured: false,
              localMirrorExpected,
              localMirrorAttempted,
              localMirrorSucceeded: false,
              canonicalCommitAttempted: canonicalAttempted,
              canonicalCommitSucceeded: committed,
              overallSafeToLeave: committed,
              downloadFallbackAttempted,
              downloadFallbackSucceeded,
              downloadFallbackSkippedReason,
            });
            if (localMirrorExpected) {
              if (committed) {
                showRecorderToast(
                    `Recording was saved to Forge, but the configured folder is not linked for ${window.location.origin}.`,
                  'warning',
                );
              } else {
                showRecorderToast(
                    `The configured recording folder is not linked for ${window.location.origin}. Keep this screen open until the browser download finishes.`,
                  'error',
                );
              }
            }
          }
        } catch {}
        if (committed) {
          downloadFallbackSkippedReason = 'canonical_commit_succeeded';
          try {
            console.log('[core-recorder] canonical commit succeeded; skipping download fallback', { name });
          } catch {}
          if (localMirrorExpected && !localMirrorSucceeded) {
            emitUploadFallbackAudit({
              saveIdentity: opts.saveIdentity ?? null,
              originalName: name,
              bytes: bytes.length,
              canonicalAttempted,
              canonicalSucceeded: true,
              fallbackUsed: false,
              safeToLeave: true,
              errorCode: canonicalErrorCode,
              errorMessage: canonicalErrorMessage,
              finalStorageKey: commitResultOk?.path || null,
              localMirrorExpected,
              localMirrorAttempted,
              localMirrorSucceeded,
              localCopySecured: false,
              downloadFallbackAttempted,
              downloadFallbackSucceeded,
              downloadFallbackSkippedReason,
            });
          }
          emitDestinationStatus();
          if (commitResultOk && acceptedCompletionId) {
            await presentCanonicalTakeDecision();
          }
          return true;
        }
        showRecorderToast(
          'Recording saved locally only. Forge could not complete the canonical cloud save.',
          'warning',
        );
        try {
          downloadFallbackAttempted = true;
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
          downloadFallbackSucceeded = true;
        } catch (error) {
          downloadFallbackErrorMessage = String((error as any)?.message || error || 'browser_download_failed');
        }
        emitUploadFallbackAudit({
          saveIdentity: opts.saveIdentity ?? null,
          originalName: name,
          bytes: bytes.length,
          canonicalAttempted,
          canonicalSucceeded: false,
          fallbackUsed: true,
          safeToLeave: false,
          errorCode: canonicalErrorCode,
          errorMessage: canonicalErrorMessage,
          finalStorageKey: `local:download:${name}`,
          localMirrorExpected,
          localMirrorAttempted,
          localMirrorSucceeded,
          localCopySecured: downloadFallbackSucceeded,
          downloadFallbackAttempted,
          downloadFallbackSucceeded,
          downloadFallbackSkippedReason,
        });
        if (downloadFallbackSucceeded) {
          showRecorderToast(
            `Browser download succeeded for "${name}". Canonical completion${localMirrorExpected ? ' and the configured folder copy' : ''} did not succeed.`,
            'warning',
          );
        } else {
          showRecorderToast(
            'Canonical completion and browser download both failed. Do not leave this screen.',
            'error',
          );
        }
        emitDestinationStatus();
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
        void recoverPendingTakeDecision();
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
    let autoPreference = true;
    const coreSurface = {
      start,
      stop,
      isAvailable: () => true,
      wantsAuto: () => autoPreference,
      setAuto: (value: boolean) => {
        autoPreference = !!value;
      },
      setWantsAuto: (value: boolean) => {
        autoPreference = !!value;
      },
      getAdapter: () => coreSurface,
    };
    (window as any).__tpLocalRecorder = coreSurface;
    (window as any).__tpRecording = coreSurface; // override to ensure we hit the real recorder
    try { console.log('[core-recorder] bridged to __tpRecording'); } catch {}
  } catch {}

})();

export {};
