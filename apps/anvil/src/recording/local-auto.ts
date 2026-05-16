// Lightweight auto-record stub (browser MediaRecorder-based).
// Mirrors the legacy JS behavior but typed for the TS runtime.
import { getRecordingEngine, getRecordingMode } from './recording-settings';
import {
  appendRecordingDecisionToTongs,
  beginRecordingCaptureSession,
  commitRecordingJsonArtifactToTongs,
  commitRecordingBytesToTongs,
  ensureRecordingCaptureTarget,
  HAMMER_STRUCTURED_TRANSCRIPT_PATH,
  promoteRecordingTranscriptForHammer,
  type RecordingCommitResult,
} from '../forge/workpiece-commit';
import { startSpeechBackendForSession, stopSpeechBackendForSession } from '../features/speech-loader';
import { ScriptStore } from '../features/scripts-store';
import {
  hideRecordingFinalizeIndicator,
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
  type RecordingSaveIdentity = {
    workpieceId: string | null;
    baseTitle: string;
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
    errorMessage: string | null;
    safeToLeave: boolean;
  }): void {
    try {
      window.dispatchEvent(new CustomEvent('tp:recording:local-safety-copy', { detail }));
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
    | { ok: false; reason: 'no_audio_stream' | 'near_silent_audio'; probe: RecordedArtifactAudioProbe };

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

  async function verifyFinalizedRecordingArtifact(blob: Blob): Promise<RecordedArtifactValidity> {
    const contentType = String(blob.type || 'application/octet-stream').trim().toLowerCase();
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
          if (probe.nearSilent === true) {
            return { ok: false, reason: 'near_silent_audio', probe };
          }
          return { ok: true, probe };
        }
      }
    } catch {}

    const fallbackProbe = buildProbeFromSnapshot(contentType);
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

  // --- Pending recording decision persistence ---
  // Written to localStorage before showing the keep/discard dialog so that a page
  // reload or browser crash can recover and re-surface the decision prompt.
  const PENDING_DECISION_KEY = 'anvil_pending_recording_decision_v1';
  const PENDING_DECISION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

  type PendingRecordingDecisionState = {
    v: 1;
    savedAt: string;
    takeName: string;
    workpieceId: string;
    filePath: string;
    contentType: string;
    bytes: number;
    durationMs: number | null;
    captureSessionId: string | null;
    plannerRecordingSessionId: string | null;
    createdCradle: boolean;
    transcriptPath: string | null;
    transcriptStatus: string | null;
    transcriptSourcePath: string | null;
    recordingMedium: string | null;
    requiresPostNormalization: boolean;
  };

  function writePendingDecisionState(
    state: Omit<PendingRecordingDecisionState, 'v' | 'savedAt'>,
  ): void {
    try {
      const entry: PendingRecordingDecisionState = { v: 1, savedAt: new Date().toISOString(), ...state };
      localStorage.setItem(PENDING_DECISION_KEY, JSON.stringify(entry));
    } catch {}
  }

  function readPendingDecisionState(): PendingRecordingDecisionState | null {
    try {
      const raw = localStorage.getItem(PENDING_DECISION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<PendingRecordingDecisionState>;
      if (parsed?.v !== 1) return null;
      if (parsed.savedAt) {
        const age = Date.now() - new Date(parsed.savedAt).getTime();
        if (!Number.isFinite(age) || age > PENDING_DECISION_TTL_MS) {
          try { localStorage.removeItem(PENDING_DECISION_KEY); } catch {}
          return null;
        }
      }
      return parsed as PendingRecordingDecisionState;
    } catch {
      return null;
    }
  }

  function clearPendingDecisionState(): void {
    try { localStorage.removeItem(PENDING_DECISION_KEY); } catch {}
  }

  async function promptForTakeDecision(args: {
    commitResult: Extract<RecordingCommitResult, { ok: true }>;
    name: string;
    contentType: string;
    bytes: number;
    durationMs: number | null;
    transcriptFinalize: RecordingTranscriptFinalizeResult | null;
    strategy: RecordingCaptureStrategy | null;
  }): Promise<void> {
    const persistDecision = async (eventName: 'take_kept' | 'take_discarded'): Promise<void> => {
      let transcriptPath = args.transcriptFinalize?.finalPath ?? null;
      let transcriptStatus = args.transcriptFinalize?.status ?? null;
      let transcriptSourcePath = args.transcriptFinalize?.finalPath ?? null;

      if (
        eventName === 'take_kept'
        && args.transcriptFinalize?.finalArtifact
        && args.transcriptFinalize.workpieceId === args.commitResult.workpieceId
      ) {
        const promoteResult = await promoteRecordingTranscriptForHammer({
          workpieceId: args.commitResult.workpieceId,
          transcript: args.transcriptFinalize.finalArtifact,
          captureSessionId: args.commitResult.captureSessionId,
          plannerRecordingSessionId: args.commitResult.plannerRecordingSessionId,
          sourceTranscriptPath: args.transcriptFinalize.finalPath,
        });
        if (promoteResult.ok) {
          transcriptPath = HAMMER_STRUCTURED_TRANSCRIPT_PATH;
          transcriptStatus = 'ready';
        } else {
          transcriptStatus = 'degraded';
          showRecorderToast('Transcript could not be promoted into Hammer readiness path. Media was still kept.', 'warning');
        }
      }

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
        transcriptPath,
        transcriptStatus,
        transcriptSourcePath,
        recordingMedium: args.strategy?.recordingMedium ?? null,
        requiresPostNormalization: args.strategy?.requiresPostNormalization === true,
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
      clearPendingDecisionState();
      showRecorderToast(
        eventName === 'take_kept'
          ? 'Take kept. Hammer can use it now.'
          : 'Take discarded. It will stay out of Hammer.',
        'info',
      );
    };

    writePendingDecisionState({
      takeName: args.name,
      workpieceId: args.commitResult.workpieceId,
      filePath: args.commitResult.path,
      contentType: args.contentType,
      bytes: args.bytes,
      durationMs: args.durationMs ?? null,
      captureSessionId: args.commitResult.captureSessionId ?? null,
      plannerRecordingSessionId: args.commitResult.plannerRecordingSessionId ?? null,
      createdCradle: args.commitResult.createdCradle === true,
      transcriptPath: args.transcriptFinalize?.finalPath ?? null,
      transcriptStatus: args.transcriptFinalize?.status ?? null,
      transcriptSourcePath: args.transcriptFinalize?.finalPath ?? null,
      recordingMedium: args.strategy?.recordingMedium ?? null,
      requiresPostNormalization: args.strategy?.requiresPostNormalization === true,
    });

    await showRecordingDecisionDialog({
      takeName: args.name,
      onKeep: async () => persistDecision('take_kept'),
      onDiscard: async () => persistDecision('take_discarded'),
    });
    // Safety net: if the dialog resolved without going through persistDecision (should not
    // happen in practice), ensure the pending state is not left behind.
    clearPendingDecisionState();
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
    mediaRecorder.start();
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
      const captureSessionId = beginRecordingCaptureSession();
      activeSaveIdentity = captureRecordingSaveIdentity();
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
    try {
      if (activeMode === 'audio' && strategyAtStop?.mechanism === 'pcm-wav-fallback') {
        await stopAudioOnly(durationMs, transcriptFinalize, strategyAtStop, saveIdentityAtStop);
      } else if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        const recorder = mediaRecorder;
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
    let canonicalAttempted = false;
    let canonicalErrorCode: string | null = null;
    let canonicalErrorMessage: string | null = null;
    try {
      const recordingValidity = await verifyFinalizedRecordingArtifact(blob);
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
        } else {
          showRecorderToast('The finalized recording contains an audio track, but no usable audio was detected. Verify the recording before leaving.', 'error');
          canonicalErrorCode = 'podcast_take_near_silent_audio';
          canonicalErrorMessage = 'The finalized recording contains an audio track, but no usable audio was detected. Verify the recording before leaving.';
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
      if (canonicalErrorCode === 'podcast_take_no_audio_stream' || canonicalErrorCode === 'podcast_take_near_silent_audio') {
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
            committed = true;
            commitResultOk = commitResultSuccess;
            if (opts.transcriptFinalize?.finalArtifact && opts.transcriptFinalize.finalPath) {
              const artifact = {
                ...opts.transcriptFinalize.finalArtifact,
                source_media_ref: {
                  kind: 'workpiece' as const,
                  path: commitResultSuccess.path,
                  content_type: contentType,
                },
              };
              await commitRecordingJsonArtifactToTongs({
                workpieceId: commitResultSuccess.workpieceId,
                path: opts.transcriptFinalize.finalPath,
                data: artifact,
                eventName: 'take_transcript_linked_media',
                eventPayload: {
                  source: 'anvil.local-auto',
                  transcript_path: opts.transcriptFinalize.finalPath,
                  file_path: commitResultSuccess.path,
                  transcript_status: opts.transcriptFinalize.status,
                  anvil_capture_session_id: commitResultSuccess.captureSessionId,
                  recording_session_id: commitResultSuccess.plannerRecordingSessionId,
                },
              }).catch(() => undefined);
              opts.transcriptFinalize.finalArtifact = artifact;
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
          const safetyEnabled = !!dir;
          emitLocalSafetyCopyStatus({
            enabled: safetyEnabled,
            configuredPath: configuredPath || null,
            attempted: false,
            success: false,
            bytesWritten: 0,
            finalPath: null,
            errorMessage: null,
            safeToLeave: false,
          });
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
              emitLocalSafetyCopyStatus({
                enabled: true,
                configuredPath: configuredPath || null,
                attempted: true,
                success: true,
                bytesWritten: bytes.length,
                finalPath: `local:directory:${name}`,
                errorMessage: null,
                safeToLeave: true,
              });
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
                  transcriptFinalize: opts.transcriptFinalize ?? null,
                  strategy: opts.strategy ?? null,
                });
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
                });
              }
              return true;
            } catch (err) {
              emitLocalSafetyCopyStatus({
                enabled: true,
                configuredPath: configuredPath || null,
                attempted: true,
                success: false,
                bytesWritten: 0,
                finalPath: null,
                errorMessage: String((err as any)?.message || err || 'local_safety_copy_failed'),
                safeToLeave: false,
              });
              showRecorderToast(
                'Recording finished, but the local safety copy was not saved. Do not leave this screen until the recording is verified or downloaded.',
                'error',
              );
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
            emitLocalSafetyCopyStatus({
              enabled: false,
              configuredPath: configuredPath || null,
              attempted: false,
              success: false,
              bytesWritten: 0,
              finalPath: null,
              errorMessage: 'recording_directory_handle_missing',
              safeToLeave: false,
            });
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
              transcriptFinalize: opts.transcriptFinalize ?? null,
              strategy: opts.strategy ?? null,
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
        });
        showRecorderToast(
          'Recording finished, but the local safety copy was not saved. Do not leave this screen until the recording is verified or downloaded.',
          'error',
        );
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

  // --- Pending recording decision recovery ---
  // If a previous page session wrote a pending decision state (the keep/discard dialog was
  // showing when the page reloaded or crashed), re-surface the decision prompt so the user
  // can still choose. Transcript promotion is skipped on recovery; the recording is still
  // marked kept and Hammer can process the transcript independently.
  function recoverPendingDecision(): void {
    const state = readPendingDecisionState();
    if (!state) return;
    try { console.log('[core-recorder] found pending recording decision; showing recovery prompt', { workpieceId: state.workpieceId }); } catch {}

    const makeRecoveryDecision = async (eventName: 'take_kept' | 'take_discarded'): Promise<void> => {
      const result = await appendRecordingDecisionToTongs({
        workpieceId: state.workpieceId,
        eventName,
        filePath: state.filePath,
        originalName: state.takeName,
        contentType: state.contentType,
        bytes: state.bytes,
        durationMs: state.durationMs,
        createdCradle: state.createdCradle,
        plannerRecordingSessionId: state.plannerRecordingSessionId,
        captureSessionId: state.captureSessionId,
        transcriptPath: state.transcriptPath,
        transcriptStatus: state.transcriptStatus,
        transcriptSourcePath: state.transcriptSourcePath,
        recordingMedium: state.recordingMedium,
        requiresPostNormalization: state.requiresPostNormalization,
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
      clearPendingDecisionState();
      showRecorderToast(
        eventName === 'take_kept' ? 'Take kept. Hammer can use it now.' : 'Take discarded. It will stay out of Hammer.',
        'info',
      );
    };

    void showRecordingDecisionDialog({
      takeName: state.takeName,
      isRecovery: true,
      onKeep: () => makeRecoveryDecision('take_kept'),
      onDiscard: () => makeRecoveryDecision('take_discarded'),
    }).catch((err) => {
      try { console.warn('[core-recorder] recovery dialog failed', err); } catch {}
    });
  }

  try { recoverPendingDecision(); } catch {}
})();

export {};
