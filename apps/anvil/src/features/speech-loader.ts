import {
  clearSessionLearnedPatches,
  getSessionLearnedPatches,
} from '../asr/asr-threshold-store';
import { DEFAULT_ASR_THRESHOLDS, clamp01 } from '../asr/asr-thresholds';
import { bootTrace } from '../boot/boot-trace';
import { shouldLogLevel, shouldLogTag } from '../env/dev-log';
import {
  createAsrScrollDriver,
  type AsrScrollDriver,
  type AsrScrollDriverStats,
} from '../features/asr/asr-scroll-driver';
import { installAsrLogBuffer } from '../features/asr/asr-log-buffer';
import { isSessionRecording } from '../recording/recorderRegistry';
import { getAsrBlockElements, getAsrBlockIndex } from '../scroll/asr-block-store';
import {
  describeElement,
  getPrimaryScroller,
  getRuntimeScroller,
  getScriptRoot,
  getScrollerEl,
  isWindowScroller,
  resolveActiveScroller,
} from '../scroll/scroller';
import { ensureSpeechGlobals, isSpeechBackendAllowed } from '../speech/backend-guard';
import { createWhisperBridgeRecognizer } from '../speech/engines/whisper-bridge';
import { getActiveAsrProfile } from '../asr/active-profile';
import { prepareMatcherInput } from '../speech/matcher-input';
import { getMatcherRuntimeState } from '../speech/matcher-runtime-state';
import { matchBatch as runMatcherBatch, normTokens } from '../speech/matcher';
import {
  emitTsPrimaryMatcherProviderDiagnostic,
  ensureTsPrimaryMatcherNamespace,
} from '../speech/ts-primary-matcher-provider';
import { resolveRuntimeSpeechEngine } from '../speech/runtime-engine-selection';
import type { AppStore } from '../state/app-store';
import { getSession, setSessionPhase } from '../state/session';
import type { SpeakerSlot } from '../types/speaker-profiles';
import { maybePromptSaveSpeakerProfiles } from '../ui/save-speaker-profiles-prompt';
import {
  applyProfileToSlot,
  createProfile,
  getActiveSpeakerSlot,
  getProfile,
  getSpeakerBindings,
  setProfileAsrTweaks,
} from '../ui/speaker-profiles-store';
import { completePrerollSession } from './preroll-session';
import { ASR_LANE_ASR1, ASR_LANE_ASR2 } from '../dev/dev-state';

ensureSpeechGlobals();

type AnyFn = (...args: any[]) => any;

type RecognizerLike = {
  start?: AnyFn;
  stop?: AnyFn;
  abort?: AnyFn;
  on?: AnyFn;
  onstart?: ((ev: Event) => void) | null;
  onaudiostart?: ((ev: Event) => void) | null;
  onaudioend?: ((ev: Event) => void) | null;
  onspeechstart?: ((ev: Event) => void) | null;
  onspeechend?: ((ev: Event) => void) | null;
  onend?: ((ev: Event) => void) | null;
  onerror?: ((ev: Event) => void) | null;
  onresult?: AnyFn;
};

type SpeechRecognition = {
  start: AnyFn;
  stop: AnyFn;
  abort?: AnyFn;
  continuous?: boolean;
  interimResults?: boolean;
  lang?: string;
  onstart?: ((ev: Event) => void) | null;
  onaudiostart?: ((ev: Event) => void) | null;
  onaudioend?: ((ev: Event) => void) | null;
  onspeechstart?: ((ev: Event) => void) | null;
  onspeechend?: ((ev: Event) => void) | null;
  onend?: ((ev: Event) => void) | null;
  onerror?: ((ev: Event) => void) | null;
  onresult?: AnyFn;
};

type TranscriptPayload = {
  text: string;
  final: boolean;
  timestamp: number;
  source: string;
  mode: string;
  isFinal: boolean;
  matchId?: string | null;
  match?: unknown;
  meta?: boolean;
  line?: number;
  candidates?: unknown;
  sim?: number;
  noMatch?: boolean;
  currentIdx?: number | null;
  runKey?: string | null;
  runGeneration?: number | null;
  speechRunningActual?: boolean;
  activeAsrLane?: string;
  transcriptSeq?: number | null;
  requestSeq?: string | null;
  requestGeneration?: number | null;
  bridgeGeneration?: number | null;
  rawText?: string | null;
  assembledText?: string | null;
  rawTextHash?: string | null;
  assembledTextHash?: string | null;
  rawTextPreview?: string | null;
  assembledTextPreview?: string | null;
  sourceRequestSeqs?: number[] | null;
  supportingRawSeqs?: number[] | null;
  appendedTokenRange?: { start: number; end: number } | null;
  appendedBySeq?: number[] | null;
  rawMatch?: Record<string, unknown> | null;
  rawMatchIndex?: number | null;
  assembledMatchIndex?: number | null;
  forwardMatchCreatedByAssembly?: boolean;
  promptIncluded?: boolean;
  promptHash?: string | null;
  promptLength?: number | null;
  promptPreview?: string | null;
  providerRequestId?: string | null;
  chunkBytes?: number | null;
  chunkMimeType?: string | null;
  chunkDurationMs?: number | null;
  chunkEnqueueTs?: number | null;
  captureStartedAtMs?: number | null;
  captureEndedAtMs?: number | null;
  captureRuntimePath?: string | null;
  captureRecorderGeneration?: number | null;
  requestCaptureVerdict?: 'voice_detected' | 'silence_detected' | 'unknown' | null;
  requestCaptureEvidence?: Array<{
    requestSeq: number;
    verdict: 'voice_detected' | 'silence_detected' | 'unknown';
    vadSpeaking?: boolean | null;
    rmsDbfs?: number | null;
    captureStartedAtMs?: number | null;
    captureEndedAtMs?: number | null;
    lastVoiceAtMs?: number | null;
    lastSilenceAtMs?: number | null;
    silenceBoundaryAtMs?: number | null;
  }> | null;
  captureActivityVerdict?: string | null;
  captureActivityEvidence?: {
    runtimeSpeechFresh?: boolean;
    vadSpeechFresh?: boolean;
    speechRunningActual?: boolean;
    silenceActive?: boolean;
    captureEvidenceAvailable?: boolean;
    requestCaptureVoiceDetected?: boolean;
    requestCaptureUnknown?: boolean;
    requestCaptureSilenceDetected?: boolean;
    requestCaptureSeqCount?: number;
  } | null;
  semanticAdmissionVerdict?: string | null;
};

type HudSnapshotPayload = {
  reason: string;
  ts: number;
  scrollMode: string;
  sessionPhase: string;
  speechRunning: boolean;
  speechRunningActual: boolean;
  asrDesired: boolean;
  asrArmed: boolean;
  driver: boolean;
  driverId: string | null;
  lastLineIndex: number | null;
  lastOnResultTs: number | null;
  lastIngestTs: number | null;
  lastCommitTs: number | null;
};

type AsrHeartbeatPayload = {
  reason: string;
  ts: number;
  scrollMode: string;
  sessionPhase: string;
  asrArmed: boolean;
  speechRunning: boolean;
  speechRunningActual: boolean;
  recognizerAttached: boolean;
  lastOnResultTs: number | null;
  lastIngestTs: number | null;
  lastCommitTs: number | null;
  sinceOnResultMs: number | null;
  sinceIngestMs: number | null;
  sinceCommitMs: number | null;
  commitCount: number;
  lifecycleEvent: string;
  lifecycleEventTs: number | null;
};

type AsrStallClass = 'speech_stall' | 'matcher_stall' | 'unknown';

type AsrStallPayload = {
  reason: string;
  ts: number;
  stallClass: AsrStallClass;
  scrollMode: string;
  sessionPhase: string;
  asrArmed: boolean;
  speechRunning: boolean;
  speechRunningActual: boolean;
  recognizerAttached: boolean;
  lastOnResultTs: number | null;
  lastIngestTs: number | null;
  lastCommitTs: number | null;
  sinceOnResultMs: number | null;
  sinceIngestMs: number | null;
  sinceCommitMs: number | null;
  commitCount: number;
  lifecycleEvent: string;
  lifecycleEventTs: number | null;
};

type AsrStallAutoRestartPayload = {
  reason: string;
  ts: number;
  stall: AsrStallPayload;
  episodeId: number;
  attemptCountThisEpisode: number;
  lastAttemptAt: number | null;
  cooldownRemainingMs: number;
  suppressionRemainingMs: number;
  restartAttempted: boolean;
  restarted: boolean;
};

type AsrRuntimeStatusPayload = {
  reason: string;
  requestedEngine: string;
  persistedEngine: string;
  speechStoreEngine: string;
  appStoreEngine: string;
  actualEngine: string | null;
  fallbackActive: boolean;
  fallbackReason: string | null;
  recognizerAttached: boolean;
  phase: string;
  runKey: string | null;
  runGeneration?: number | null;
  state: string;
  speechRunning: boolean;
  speechRunningActual: boolean;
  activeAsrLane?: string;
  runtimePath?: string;
  calibration?: {
    profileId: string | null;
    state: 'calibrated' | 'partially_calibrated' | 'bypassed';
    requested?: Record<string, unknown> | null;
    applied?: Record<string, unknown> | null;
    ignoredOrUnsupported?: string[] | null;
    dsp?: {
      state?: string;
      activeFilters?: string[];
      details?: Record<string, unknown> | null;
      error?: string;
    } | null;
  };
};

type PendingAsrScriptEndStop = {
  dedupeKey: string;
  runKey: string;
  mode: string;
  lineIndex: number | null;
  lastSpeakableLineIndex: number | null;
  armedAt: number;
  targetLineTokens: string[];
};

type AsrScriptEndConfirmationEvidence = {
  source: 'route-line' | 'token-overlap';
  matchedLine: number | null;
  sharedAny: number;
  sharedMeaningful: number;
  overlapRatio: number;
};

type DeferredAsrScriptEndStop = {
  pending: PendingAsrScriptEndStop;
  evidence: AsrScriptEndConfirmationEvidence;
  targetLine: number | null;
  startedAt: number;
  markerReachedAt: number | null;
  completionDelayMs: number;
  completionReason: 'marker-reached' | 'marker-timeout' | 'no-target';
  endGraceStartedAt: number | null;
  endGraceUntil: number | null;
  endGraceReason: string | null;
  pendingResponseSeen: boolean;
  lastExtensionReason: string | null;
};

declare global {
  interface Window {
    __tpBus?: { emit?: AnyFn };
    HUD?: { bus?: { emit?: AnyFn }; log?: AnyFn };
    __tpHud?: { log?: AnyFn };
    __tpStore?: AppStore;
    __tpScrollMode?: { getMode?: () => string };
    __tpMic?: {
      isOpen?: () => boolean;
      requestMic?: (options?: unknown) => Promise<MediaStream>;
      releaseMic?: () => void;
    } & Record<string, unknown>;
    __tpRecording?: {
      start?: () => unknown;
      stop?: () => unknown;
      getAdapter?: () => unknown;
      wantsAuto?: () => unknown;
      setAuto?: (on: boolean) => unknown;
      setWantsAuto?: (on: boolean) => unknown;
    };
    __tpObs?: { armed?: () => boolean; ensureRecording?: (on: boolean) => Promise<unknown> | unknown };
    __tpAutoRecord?: { start?: () => Promise<unknown> | unknown; stop?: () => Promise<unknown> | unknown };
    __tpSpeechOrchestrator?: { start?: () => Promise<RecognizerLike | void> | RecognizerLike | void };
    __tpSpeechCanDynImport?: boolean;
    __tpAsrRunKey?: string | null;
    __tpAsrRunGeneration?: number | null;
    __tpAsrLastEndedRunKey?: string | null;
    __tpAsrLastEndedRunAt?: number | null;
    __tpSpeech?: {
      store?: {
        getState?: () => unknown;
        get?: () => unknown;
        subscribe?: ((listener: (...args: any[]) => void) => (() => void) | void) | undefined;
      } | null;
      startRecognizer?: (cb: AnyFn, opts?: { lang?: string }) => void;
      stopRecognizer?: () => void;
      matchOne?: AnyFn;
      matchBatch?: AnyFn;
    };
    __tpEmitSpeech?: (t: unknown, final?: boolean) => void;
    __tpSendToDisplay?: (payload: unknown) => void;
    __tpGetActiveRecognizer?: () => RecognizerLike | null;
    __tpHardResetSpeech?: (reason?: string) => void;
    __tpStopSpeechBackend?: (reason?: string) => void;
    SpeechRecognition?: { new (): SpeechRecognition };
    webkitSpeechRecognition?: { new (): SpeechRecognition };
    getAutoRecordEnabled?: () => boolean;
    recAutoRestart?: unknown;
    speechOn?: boolean;
    enumerateDevices?: () => Promise<MediaDeviceInfo[]>;
    __tpAsrHeartbeatLast?: AsrHeartbeatPayload;
    __tpAsrLifecycleLast?: Record<string, unknown>;
    __tpAsrStallLast?: AsrStallPayload;
    __tpAsrStallAutoRestartLast?: AsrStallAutoRestartPayload;
    __tpAsrRuntimeStatus?: AsrRuntimeStatusPayload;
    __tpAsrEndGrace?: {
      active: boolean;
      startedAt: number;
      until: number;
      lastSpeakableLineIndex: number | null;
      reason: string;
    } | null;
  }
}

async function _enumerateDevices(): Promise<MediaDeviceInfo[]> {
  try {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return [];
    return await navigator.mediaDevices.enumerateDevices();
  } catch {
    return [];
  }
}

function _hasKind(devs: MediaDeviceInfo[], kind: MediaDeviceKind): boolean {
  return devs.some((d) => d.kind === kind);
}

function _showToast(msg: string) {
  try { (window as any).toasts?.show?.(msg); } catch {}
}

// One entry point for speech. Uses Web Speech by default.
// If /dist/speech/orchestrator.real.js exists (built from TS), we load it instead.
// Autoscroll is managed externally; buffered stop handled in index listener

let running = false;
let rec: RecognizerLike | null = null; // SR instance or orchestrator handle
let lastScrollMode = '';
let lastResultTs = 0;
let speechRunningActual = false;
let lastRecognizerOnResultTs = 0;
let lastRecognizerAttachedTs = 0;
let lastAsrIngestTs = 0;
let lastAsrCommitTs = 0;
let lastAsrCommitCount = 0;
let lastRecognizerLifecycleEvent = '';
let lastRecognizerLifecycleAt = 0;
let lastAsrStallClass: AsrStallClass | '' = '';
let speechWatchdogTimer: number | null = null;
let asrHeartbeatTimer: number | null = null;
let activeRecognizer: RecognizerLike | null = null;
let lastStartedSpeechEngine = 'webspeech';
let lastRequestedSpeechEngine = 'whisper';
let activeAsrLane = ASR_LANE_ASR1;
let currentActualSpeechEngine = '';
let currentFallbackReason = '';
let currentAsrState = 'idle';
let pendingManualRestartCount = 0;
let lifecycleRestartTimer: number | null = null;
let lastLifecycleRestartAt = 0;
let suppressRecognizerAutoRestart = false;
let lastHudSnapshotFingerprint = '';
let lastHudSnapshotAt = 0;
let asrStallEpisodeId = 0;
let asrStallEpisodeRestarted = false;
let asrStallAttemptCountThisEpisode = 0;
let lastAsrStallEpisodeClass: AsrStallClass = 'unknown';
let lastAsrStallAutoRestartAt = 0;
let suppressAsrStallAutoRestartUntil = 0;
let lastAsrStallRescueAt = 0;
let lastMatcherStallCommitCount = -1;
let lastMatcherStallCommitStableSince = 0;
let lastAsrScriptEndStopKey = '';
let pendingAsrScriptEndStop: PendingAsrScriptEndStop | null = null;
let deferredAsrScriptEndStop: DeferredAsrScriptEndStop | null = null;
let lastEmittedFinalTranscriptNorm = '';
let lastEmittedFinalTranscriptAt = 0;
let matcherSummaryCount = 0;
let matcherFallbackSummaryCount = 0;
let firstTranscriptFinalMatcherDiagnosticEmitted = false;

type AsrDriverCreateBlockedEntry = {
  suppressedCount: number;
  lastSummaryAt: number;
  payload: Record<string, unknown>;
};

const asrDriverCreateBlockedBySignature = new Map<string, AsrDriverCreateBlockedEntry>();
const ASR_DRIVER_CREATE_BLOCKED_SUMMARY_EVERY = 20;

function resetAsrDriverCreateBlockedDiagnostics(): void {
  asrDriverCreateBlockedBySignature.clear();
}

function emitAsrDriverCreateBlockedSummary(signature: string): void {
  if (!isDevMode()) return;
  const entry = asrDriverCreateBlockedBySignature.get(signature);
  if (!entry || entry.suppressedCount <= 0) return;
  const now = Date.now();
  if (
    entry.suppressedCount < ASR_DRIVER_CREATE_BLOCKED_SUMMARY_EVERY &&
    now - entry.lastSummaryAt < 1000
  ) {
    return;
  }
  entry.lastSummaryAt = now;
  try {
    console.debug('[ASR] driver create blocked (suppressed)', {
      signature,
      suppressedCount: entry.suppressedCount,
      ...entry.payload,
    });
  } catch {}
  entry.suppressedCount = 0;
}

function reportAsrDriverCreateBlocked(payload: {
  reason: string;
  mode: string;
  blocksReady: boolean;
  blockCount: number;
  backendReady: boolean;
  phaseAllowsAsrDriver: boolean;
  sessionPhase: string;
  running: boolean;
  asrSessionIntentActive: boolean;
}): void {
  if (!isDevMode()) return;
  const signature = [
    payload.reason,
    payload.mode,
    payload.sessionPhase,
    payload.blocksReady ? '1' : '0',
    payload.backendReady ? '1' : '0',
    payload.phaseAllowsAsrDriver ? '1' : '0',
    payload.running ? '1' : '0',
    payload.asrSessionIntentActive ? '1' : '0',
  ].join('|');
  const existing = asrDriverCreateBlockedBySignature.get(signature);
  if (!existing) {
    try {
      console.debug('[ASR] driver create blocked', payload);
    } catch {}
    asrDriverCreateBlockedBySignature.set(signature, {
      suppressedCount: 0,
      lastSummaryAt: 0,
      payload,
    });
    if (asrDriverCreateBlockedBySignature.size > 64) {
      asrDriverCreateBlockedBySignature.clear();
      asrDriverCreateBlockedBySignature.set(signature, {
        suppressedCount: 0,
        lastSummaryAt: 0,
        payload,
      });
    }
    return;
  }
  existing.payload = payload;
  existing.suppressedCount += 1;
  if (existing.suppressedCount >= ASR_DRIVER_CREATE_BLOCKED_SUMMARY_EVERY) {
    emitAsrDriverCreateBlockedSummary(signature);
  }
}

function shouldAllowAsrDriverCreateAttempt(mode: string, session = getSession()): boolean {
  if (!isAsrLikeMode(mode)) return false;
  const phase = String(session.phase || '').toLowerCase();
  return (
    running ||
    asrSessionIntentActive ||
    phase === 'preroll' ||
    phase === 'live'
  );
}

function disarmAsrSessionState(reason: string): void {
  if (typeof window === 'undefined') return;
  const store = window.__tpStore;
  if (!store || typeof store.set !== 'function') return;
  try { store.set('session.asrDesired' as any, false as any); } catch {}
  try { store.set('session.asrArmed' as any, false as any); } catch {}
  try { store.set('session.asrReady' as any, false as any); } catch {}
  if (isDevMode() && shouldLogTag('ASR:session-disarm', 2, 300)) {
    try { console.debug('[ASR] session disarmed', { reason }); } catch {}
  }
}
let deferredAsrScriptEndStopTimer: number | null = null;

const WATCHDOG_INTERVAL_MS = 5000;
const WATCHDOG_THRESHOLD_MS = 15000;
const ASR_WATCHDOG_THRESHOLD_MS = 4000;
const ASR_HEARTBEAT_INTERVAL_MS = 1000;
const ASR_STALL_SPEECH_THRESHOLD_MS = 2500;
const ASR_DEAF_RECOGNIZER_MS = 6000;
const ASR_STALL_MATCHER_THRESHOLD_MS = 4500;
const ASR_STALL_MATCHER_STABLE_COMMIT_MS = 1500;
const DIRECT_MATCHER_MULTI_LINE_MIN_LINES = 2;
const DIRECT_MATCHER_MULTI_LINE_MAX_LINES = 5;
const DIRECT_MATCHER_SHORT_UTTERANCE_MULTI_LINE_MAX_LINES = 3;
const DIRECT_MATCHER_SHORT_UTTERANCE_TOKEN_THRESHOLD = 10;
const ASR_STALL_AUTORESTART_COOLDOWN_MS = 15000;
const ASR_STALL_AUTORESTART_SUPPRESS_MS = 30000;
const ASR_STALL_RESCUE_COOLDOWN_MS = 2000;
const LIFECYCLE_RESTART_DELAY_MS = 120;
const LIFECYCLE_RESTART_COOLDOWN_MS = 350;
const HUD_SNAPSHOT_THROTTLE_MS = 120;
const ASR_SCRIPT_END_CONFIRM_MAX_WAIT_MS = 15000;
const ASR_SCRIPT_END_CONFIRM_MIN_SHARED_MEANINGFUL_TOKENS = 1;
const ASR_SCRIPT_END_CONFIRM_MIN_SHARED_TOKENS = 2;
const ASR_SCRIPT_END_MARKER_WAIT_MAX_MS = 4000;
const ASR_SCRIPT_END_MARKER_POLL_MS = 16;
const ASR_SCRIPT_END_POSTROLL_MS = 500;
const ASR_END_GRACE_MS = 6000;
const ASR_END_GRACE_EXTENSION_MS = 1000;
const ASR_END_GRACE_POLL_MS = 100;
const ASR_END_GRACE_SPEECH_FRESH_MS = 1200;
const ASR_SCRIPT_END_MARKER_TOLERANCE_MIN_PX = 12;
const ASR_SCRIPT_END_MARKER_TOLERANCE_MAX_PX = 48;
const ASR_SCRIPT_END_MARKER_TOLERANCE_LINE_RATIO = 0.35;
const ASR_FINAL_NOVELTY_MIN_RATIO = 0.18;
const ASR_FINAL_NOVELTY_MIN_OVERLAP_RATIO = 0.6;
const ASR_FINAL_NOVELTY_DEDUP_WINDOW_MS = 2500;
const ASR_SCRIPT_END_STOPWORDS = new Set([
  'the',
  'and',
  'that',
  'this',
  'with',
  'from',
  'your',
  'you',
  'for',
  'are',
  'was',
  'were',
  'have',
  'has',
  'had',
  'into',
  'onto',
  'then',
  'than',
  'but',
  'not',
  'its',
  'it',
  'they',
  'them',
  'their',
  'there',
  'here',
]);

function inRehearsal(): boolean {
  try { return !!document.body?.classList?.contains('mode-rehearsal'); } catch { return false; }
}

// Scroll/mic state helpers for gating transcript capture
function getScrollMode(): string {
  try {
    const store = window.__tpStore;
    if (store && typeof store.get === 'function') {
      const scrollMode = store.get('scrollMode');
      if (scrollMode != null) return String(scrollMode).toLowerCase();
      const legacyMode = store.get('mode');
      if (legacyMode != null) return String(legacyMode).toLowerCase();
    }

    const router: any = window.__tpScrollMode;
    if (router && typeof router.getMode === 'function') {
      const mode = router.getMode();
      if (mode != null) return String(mode).toLowerCase();
    }

  if (typeof router === 'string') return router.toLowerCase();
  } catch {}
  return '';
}

function getSpeechStoreState(store: any): any {
  if (!store) return undefined;

  // Redux-ish / Zustand vanilla
  if (typeof store.getState === 'function') return store.getState();

  // Atom-ish local store
  if (typeof store.get === 'function') return store.get();

  return undefined;
}

function subscribeSpeechStore(store: any, fn: (s: any) => void): () => void {
  if (!store) return () => {};

  // Redux-ish
  if (typeof store.subscribe === 'function' && typeof store.getState === 'function') {
    const unsub = store.subscribe(() => fn(store.getState()));
    return typeof unsub === 'function' ? unsub : () => {};
  }

  // Atom-ish with get()
  if (typeof store.subscribe === 'function' && typeof store.get === 'function') {
    const unsub = store.subscribe(() => fn(store.get()));
    return typeof unsub === 'function' ? unsub : () => {};
  }

  // Atom-ish subscribe passes value directly
  if (typeof store.subscribe === 'function') {
    const unsub = store.subscribe((v: any) => fn(v));
    return typeof unsub === 'function' ? unsub : () => {};
  }

  return () => {};
}

let speechStoreShimmed = false;
let speechStoreSubscribed = false;
let latestSpeechStoreState: any = undefined;

function getTpSpeechNamespace(): any {
  if (typeof window === 'undefined') return null;
  const ns = (window as any).__tpSpeech;
  if (!ns || typeof ns !== 'object') return null;
  const store = ns.store;
  if (store && !speechStoreShimmed && typeof store.getState !== 'function' && typeof store.get === 'function') {
    try {
      store.getState = store.get.bind(store);
    } catch {
      try { store.getState = () => store.get(); } catch {}
    }
    speechStoreShimmed = true;
  }
  if (store && !speechStoreSubscribed) {
    speechStoreSubscribed = true;
    try { latestSpeechStoreState = getSpeechStoreState(store); } catch {}
    try {
      subscribeSpeechStore(store, (state) => {
        latestSpeechStoreState = state;
      });
    } catch {}
  }
  return ns;
}

function isLegacySpeechNamespaceAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if ((window as any).__tpAllowLegacySpeechNamespace === true) return true;
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('legacySpeechNs') === '1') return true;
  } catch {}
  return false;
}

function isLegacySpeechOrchestratorAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if ((window as any).__tpAllowLegacySpeechOrchestrator === true) return true;
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('legacySpeechOrchestrator') === '1') return true;
    if (params.get('legacySpeechNs') === '1') return true;
  } catch {}
  return false;
}

function getTpSpeechStoreSnapshot(): any {
  try {
    const ns = getTpSpeechNamespace();
    return getSpeechStoreState(ns?.store) ?? latestSpeechStoreState;
  } catch {
    return latestSpeechStoreState;
  }
}

function normalizeAsrLane(value: unknown): string {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === ASR_LANE_ASR2 ? ASR_LANE_ASR2 : ASR_LANE_ASR1;
}

function readActiveAsrLane(): string {
  if (typeof window === 'undefined') return ASR_LANE_ASR1;
  try {
    const raw = window.localStorage?.getItem('tp_asr_experimental_lane_v1');
    return normalizeAsrLane(raw);
  } catch {
    return ASR_LANE_ASR1;
  }
}

function resolveRequestedEngineForLane(baseEngine: string, lane: string): string {
  if (lane === ASR_LANE_ASR2) return 'whisper';
  return String(baseEngine || 'whisper').trim().toLowerCase() || 'whisper';
}

function emitAiActivity(detail: Record<string, unknown>): void {
  try { (window as any).__tpAiActivity = detail; } catch {}
  try { window.dispatchEvent(new CustomEvent('tp:ai:activity', { detail })); } catch {}
}

function emitAsrRuntimeStatus(reason: string): void {
  if (typeof window === 'undefined') return;
  const speechStoreState = getTpSpeechStoreSnapshot();
  const appStoreEngine = String((window as any).__tpStore?.get?.('asr.engine') || '').trim().toLowerCase();
  const requestedEngine = String(lastRequestedSpeechEngine || appStoreEngine || 'whisper').trim().toLowerCase() || 'whisper';
  const actualEngine = currentActualSpeechEngine ? String(currentActualSpeechEngine).trim().toLowerCase() : null;
  const activeProfile = getActiveAsrProfile();
  const runtimeCalibration = (window as any).__tpCalibrationRuntime || null;
  const calibrationState = String(runtimeCalibration?.calibrationState || (activeProfile ? 'partially_calibrated' : 'bypassed')).toLowerCase();
  const runtimePath = activeAsrLane === ASR_LANE_ASR2 ? 'whisper-large-live' : 'whisper-bridge';
  const payload: AsrRuntimeStatusPayload = {
    reason,
    requestedEngine,
    persistedEngine: appStoreEngine || requestedEngine,
    speechStoreEngine: String((speechStoreState as any)?.engine || '').trim().toLowerCase(),
    appStoreEngine,
    actualEngine,
    fallbackActive: !!currentFallbackReason && actualEngine !== requestedEngine,
    fallbackReason: currentFallbackReason || null,
    recognizerAttached: !!activeRecognizer,
    phase: String(getSession().phase || 'idle').toLowerCase(),
    runKey: activeAsrRunKey || null,
    runGeneration: asrRunGeneration > 0 ? asrRunGeneration : null,
    state: currentAsrState,
    speechRunning: !!running,
    speechRunningActual: !!speechRunningActual,
    activeAsrLane,
    runtimePath,
    calibration: {
      profileId: activeProfile?.id || null,
      state: calibrationState === 'calibrated' || calibrationState === 'partially_calibrated' ? calibrationState : 'bypassed',
      requested: runtimeCalibration?.requested || null,
      applied: runtimeCalibration?.applied || null,
      ignoredOrUnsupported: Array.isArray(runtimeCalibration?.ignoredOrUnsupported) ? runtimeCalibration.ignoredOrUnsupported : null,
      dsp: runtimeCalibration?.dsp || null,
    },
  };
  try { window.__tpAsrRuntimeStatus = payload; } catch {}
  try { window.__tpBus?.emit?.('tp:asr:runtime-status', payload); } catch {}
  try { window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', { detail: payload })); } catch {}
  try { document.dispatchEvent(new CustomEvent('tp:asr:runtime-status', { detail: payload })); } catch {}
  try {
    console.info('[ASR_RUNTIME_STATUS]', {
      reason,
      lane: activeAsrLane,
      runtimePath,
      calibrationState: payload.calibration?.state || 'bypassed',
      calibrationProfileId: payload.calibration?.profileId || null,
      requestedConstraints: payload.calibration?.requested || null,
      appliedConstraints: payload.calibration?.applied || null,
      ignoredOrUnsupportedConstraints: payload.calibration?.ignoredOrUnsupported || null,
      dspState: payload.calibration?.dsp?.state || 'inactive',
      activeDspFilters: payload.calibration?.dsp?.activeFilters || [],
    });
  } catch {}
  try {
    const dsp = payload.calibration?.dsp || null;
    const activeFilters = Array.isArray(dsp?.activeFilters) ? dsp!.activeFilters : [];
    const details = dsp?.details && typeof dsp.details === 'object'
      ? Object.entries(dsp.details)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('|') : String(v)}`)
        .join(';')
      : '';
    const dspState = String(dsp?.state || 'inactive');
    const dspReason =
      dspState === 'inactive'
        ? 'no_calibration_filters'
        : dspState === 'unavailable'
          ? 'no_audio_context'
          : '';
    console.info([
      '[ASR_DSP_STATUS]',
      `path=${runtimePath}`,
      `state=${dspState}`,
      `activeFilters=${activeFilters.length ? activeFilters.join(',') : 'none'}`,
      `profileId=${payload.calibration?.profileId || 'none'}`,
      dspReason ? `reason=${dspReason}` : '',
      dsp?.error ? `error=${String(dsp.error)}` : '',
      details ? `details=${details}` : '',
      `source=runtime-status:${reason}`,
    ].filter(Boolean).join(' '));
  } catch {}
}

function resolveAsrDriverRef(): any {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return asrScrollDriver || w.__tpAsrScrollDriver || w.__tpAsrDriver || null;
}

function normalizeTimestamp(value: unknown): number {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.max(0, Math.floor(raw));
}

function readAsrDriverStats(driverRef: any): AsrScrollDriverStats | null {
  if (!driverRef || typeof driverRef !== 'object') return null;
  try {
    const stats = driverRef.getStats?.();
    if (stats && typeof stats === 'object') {
      const snapshot = stats as AsrScrollDriverStats;
      return {
        lastIngestAt: normalizeTimestamp(snapshot.lastIngestAt),
        lastCommitAt: normalizeTimestamp(snapshot.lastCommitAt),
        commitCount: Math.max(0, Math.floor(Number(snapshot.commitCount) || 0)),
        eventsSinceCommit: Math.max(0, Math.floor(Number(snapshot.eventsSinceCommit) || 0)),
        finalsSinceCommit: Math.max(0, Math.floor(Number(snapshot.finalsSinceCommit) || 0)),
      };
    }
  } catch {
    // ignore
  }
  return null;
}

function syncAsrDriverStats(driverRef?: any): void {
  const stats = readAsrDriverStats(driverRef ?? resolveAsrDriverRef());
  if (!stats) return;
  lastAsrIngestTs = Math.max(lastAsrIngestTs, stats.lastIngestAt);
  lastAsrCommitTs = Math.max(lastAsrCommitTs, stats.lastCommitAt);
  lastAsrCommitCount = Math.max(lastAsrCommitCount, stats.commitCount);
}

function normalizeLineIndex(value: unknown): number | null {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return null;
  return Math.max(0, Math.floor(raw));
}

function resolveRuntimeAsrLineIndex(): number | null {
  const driverRef = resolveAsrDriverRef();
  const fromDriver = normalizeLineIndex(driverRef?.getLastLineIndex?.());
  if (fromDriver != null) return fromDriver;
  try {
    return normalizeLineIndex((window as any)?.currentIndex);
  } catch {
    return null;
  }
}

function countTokenOverlap(
  transcriptTokens: string[],
  targetTokens: string[],
): { sharedAny: number; sharedMeaningful: number } {
  if (!transcriptTokens.length || !targetTokens.length) {
    return { sharedAny: 0, sharedMeaningful: 0 };
  }
  const transcriptSet = new Set(transcriptTokens);
  let sharedAny = 0;
  let sharedMeaningful = 0;
  for (const token of targetTokens) {
    if (!transcriptSet.has(token)) continue;
    sharedAny += 1;
    if (token.length >= 4 && !ASR_SCRIPT_END_STOPWORDS.has(token)) {
      sharedMeaningful += 1;
    }
  }
  return { sharedAny, sharedMeaningful };
}

function clearPendingAsrScriptEnd(reason: string): void {
  if (!pendingAsrScriptEndStop) return;
  if (isDevMode() && shouldLogTag('ASR:script-end-pending-clear', 2, 250)) {
    try {
      console.info('[ASR] script-end pending cleared', {
        reason,
        dedupeKey: pendingAsrScriptEndStop.dedupeKey,
      });
    } catch {}
  }
  pendingAsrScriptEndStop = null;
}

function clearDeferredAsrScriptEndStopTimer(): void {
  if (deferredAsrScriptEndStopTimer == null) return;
  try {
    window.clearTimeout(deferredAsrScriptEndStopTimer);
  } catch {}
  deferredAsrScriptEndStopTimer = null;
}

function cancelDeferredAsrScriptEndStop(reason: string): void {
  if (!deferredAsrScriptEndStop) return;
  clearDeferredAsrScriptEndStopTimer();
  if (isDevMode() && shouldLogTag('ASR:script-end-deferred-clear', 2, 250)) {
    try {
      console.info('[ASR] script-end deferred stop cleared', {
        reason,
        dedupeKey: deferredAsrScriptEndStop.pending.dedupeKey,
      });
    } catch {}
  }
  deferredAsrScriptEndStop = null;
  try { (window as any).__tpAsrEndGrace = null; } catch {}
}

function setAsrEndGraceState(
  active: boolean,
  detail?: {
    startedAt?: number;
    until?: number;
    lastSpeakableLineIndex?: number | null;
    reason?: string;
  },
): void {
  try {
    (window as any).__tpAsrEndGrace = active
      ? {
          active: true,
          startedAt: Number(detail?.startedAt || Date.now()),
          until: Number(detail?.until || Date.now()),
          lastSpeakableLineIndex:
            detail?.lastSpeakableLineIndex == null ? null : Math.max(0, Math.floor(Number(detail.lastSpeakableLineIndex))),
          reason: String(detail?.reason || 'end-grace'),
        }
      : null;
  } catch {}
}

function getPendingWhisperWork(): { requestsInFlight: number; queueDepth: number; hasPending: boolean } {
  try {
    const detail = ((window as any).__tpAiActivity || {}) as Record<string, unknown>;
    const requestsInFlight = Math.max(0, Math.floor(Number(detail.requestsInFlight) || 0));
    const queueDepth = Math.max(0, Math.floor(Number(detail.queueDepth) || 0));
    return {
      requestsInFlight,
      queueDepth,
      hasPending: requestsInFlight > 0 || queueDepth > 0,
    };
  } catch {
    return { requestsInFlight: 0, queueDepth: 0, hasPending: false };
  }
}

function isAsrEndGraceSpeechFresh(): { speechFresh: boolean; speechActive: boolean } {
  const now = Date.now();
  const lastSpeechTs = Math.max(
    Number(lastRecognizerOnResultTs || 0),
    Number(lastResultTs || 0),
    Number(lastAsrIngestTs || 0),
  );
  const speechFresh = lastSpeechTs > 0 && Math.max(0, now - lastSpeechTs) <= ASR_END_GRACE_SPEECH_FRESH_MS;
  return {
    speechFresh: speechRunningActual || speechFresh,
    speechActive: !!speechRunningActual,
  };
}

function shouldSuppressAsrScriptEndAutoStop(session = getSession()): boolean {
  if (session.recordOnLive) return true;
  try {
    if (isSessionRecording()) return true;
  } catch {}
  return false;
}

function suppressPendingAsrScriptEndStop(
  pending: PendingAsrScriptEndStop,
  reason: string,
  evidence: AsrScriptEndConfirmationEvidence,
): void {
  const session = getSession();
  lastAsrScriptEndStopKey = pending.dedupeKey;
  pendingAsrScriptEndStop = null;
  emitHudSnapshot('script-end-stop-suppressed', { force: true });
  if (isDevMode() && shouldLogTag('ASR:script-end-stop-suppressed', 2, 1000)) {
    try {
      console.info('[ASR] script-end auto-stop suppressed', {
        reason,
        mode: pending.mode,
        lineIndex: pending.lineIndex,
        lastSpeakableLineIndex: pending.lastSpeakableLineIndex,
        runKey: pending.runKey,
        confirmSource: evidence.source,
        confirmMatchedLine: evidence.matchedLine,
        sharedTokens: evidence.sharedAny,
        sharedMeaningfulTokens: evidence.sharedMeaningful,
        overlapRatio: Number(evidence.overlapRatio.toFixed(3)),
        sessionPhase: session.phase,
        recordOnLive: session.recordOnLive,
        recording: (() => {
          try {
            return isSessionRecording();
          } catch {
            return false;
          }
        })(),
      });
    } catch {}
  }
}

function getLineElementAtIndex(index: number, container?: ParentNode | null): HTMLElement | null {
  const idx = Math.max(0, Math.floor(Number(index) || 0));
  try {
    const host = container || getScriptRoot() || getPrimaryScroller() || document;
    return (
      host.querySelector<HTMLElement>(`.line[data-line="${idx}"]`) ||
      host.querySelector<HTMLElement>(`.line[data-line-idx="${idx}"]`) ||
      host.querySelector<HTMLElement>(`.line[data-i="${idx}"]`) ||
      host.querySelector<HTMLElement>(`.line[data-index="${idx}"]`) ||
      null
    );
  } catch {
    return null;
  }
}

function probeDeferredAsrScriptEndMarker(targetLine: number): {
  ready: boolean;
  reached: boolean;
  distancePx: number | null;
  tolerancePx: number;
  markerIdx: number;
} {
  try {
    const viewer = getPrimaryScroller();
    const root = getScriptRoot() || viewer;
    const host = viewer || root;
    const lineEl = getLineElementAtIndex(targetLine, root || viewer || document);
    if (!host || !lineEl) {
      return {
        ready: false,
        reached: false,
        distancePx: null,
        tolerancePx: ASR_SCRIPT_END_MARKER_TOLERANCE_MIN_PX,
        markerIdx: -1,
      };
    }
    const { markerOffset } = getMarkerOffset(viewer, root);
    const hostRect = host.getBoundingClientRect();
    const lineRect = lineEl.getBoundingClientRect();
    const lineHeight = lineRect.height || lineEl.offsetHeight || lineEl.clientHeight || 0;
    const lineCenterY = lineRect.top + lineRect.height * 0.5;
    const markerY = hostRect.top + markerOffset;
    const tolerancePx = Math.max(
      ASR_SCRIPT_END_MARKER_TOLERANCE_MIN_PX,
      Math.min(
        ASR_SCRIPT_END_MARKER_TOLERANCE_MAX_PX,
        lineHeight > 0
          ? lineHeight * ASR_SCRIPT_END_MARKER_TOLERANCE_LINE_RATIO
          : ASR_SCRIPT_END_MARKER_TOLERANCE_MIN_PX,
      ),
    );
    const distancePx = Math.abs(lineCenterY - markerY);
    return {
      ready: true,
      reached: distancePx <= tolerancePx,
      distancePx,
      tolerancePx,
      markerIdx: computeMarkerLineIndex(),
    };
  } catch {
    return {
      ready: false,
      reached: false,
      distancePx: null,
      tolerancePx: ASR_SCRIPT_END_MARKER_TOLERANCE_MIN_PX,
      markerIdx: -1,
    };
  }
}

function scheduleDeferredAsrScriptEndStop(delayMs: number): void {
  clearDeferredAsrScriptEndStopTimer();
  deferredAsrScriptEndStopTimer = window.setTimeout(() => {
    deferredAsrScriptEndStopTimer = null;
    const deferred = deferredAsrScriptEndStop;
    if (!deferred) return;
    const session = getSession();
    const mode = String(deferred.pending.mode || getScrollMode() || '').toLowerCase();
    if (session.phase !== 'live' || !isAsrLikeMode(mode)) {
      cancelDeferredAsrScriptEndStop('mode-or-phase-change');
      return;
    }
    if (deferred.markerReachedAt != null) {
      const pendingWhisper = getPendingWhisperWork();
      const speechState = isAsrEndGraceSpeechFresh();
      if (deferred.endGraceStartedAt == null) {
        const now = Date.now();
        deferred.endGraceStartedAt = now;
        deferred.endGraceUntil = now + ASR_END_GRACE_MS;
        deferred.endGraceReason = 'terminal_line_reached';
        deferred.pendingResponseSeen = pendingWhisper.hasPending;
        setAsrEndGraceState(true, {
          startedAt: deferred.endGraceStartedAt,
          until: deferred.endGraceUntil,
          lastSpeakableLineIndex: deferred.pending.lastSpeakableLineIndex,
          reason: deferred.endGraceReason,
        });
        try {
          console.info(`[ASR_END_GRACE_STARTED] lineIndex=${deferred.pending.lineIndex ?? -1} lastSpeakableLineIndex=${deferred.pending.lastSpeakableLineIndex ?? -1} graceMs=${ASR_END_GRACE_MS} speechFresh=${speechState.speechFresh ? 1 : 0} speechActive=${speechState.speechActive ? 1 : 0} requestsInFlight=${pendingWhisper.requestsInFlight} queueDepth=${pendingWhisper.queueDepth} reason=${deferred.endGraceReason}`);
        } catch {}
      }
      if (pendingWhisper.hasPending) {
        deferred.pendingResponseSeen = true;
      }
      const extensionReason =
        pendingWhisper.hasPending ? 'pending_whisper_response' : (speechState.speechFresh ? 'speech_fresh' : '');
      if (extensionReason) {
        const nextUntil = Math.max(Number(deferred.endGraceUntil || 0), Date.now() + ASR_END_GRACE_EXTENSION_MS);
        if (nextUntil > Number(deferred.endGraceUntil || 0) + 50) {
          deferred.endGraceUntil = nextUntil;
          deferred.lastExtensionReason = extensionReason;
          setAsrEndGraceState(true, {
            startedAt: deferred.endGraceStartedAt,
            until: deferred.endGraceUntil,
            lastSpeakableLineIndex: deferred.pending.lastSpeakableLineIndex,
            reason: extensionReason,
          });
          try {
            console.info(`[ASR_END_GRACE_EXTENDED] lineIndex=${deferred.pending.lineIndex ?? -1} lastSpeakableLineIndex=${deferred.pending.lastSpeakableLineIndex ?? -1} untilMs=${Math.round(deferred.endGraceUntil)} speechFresh=${speechState.speechFresh ? 1 : 0} speechActive=${speechState.speechActive ? 1 : 0} requestsInFlight=${pendingWhisper.requestsInFlight} queueDepth=${pendingWhisper.queueDepth} reason=${extensionReason}`);
          } catch {}
        }
      }
      if (
        deferred.pendingResponseSeen &&
        !pendingWhisper.hasPending &&
        !speechState.speechFresh
      ) {
        deferred.pendingResponseSeen = false;
        try {
          console.info(`[ASR_END_GRACE_FLUSHED] lineIndex=${deferred.pending.lineIndex ?? -1} lastSpeakableLineIndex=${deferred.pending.lastSpeakableLineIndex ?? -1} speechFresh=${speechState.speechFresh ? 1 : 0} speechActive=${speechState.speechActive ? 1 : 0} requestsInFlight=${pendingWhisper.requestsInFlight} queueDepth=${pendingWhisper.queueDepth} reason=pending_responses_drained`);
        } catch {}
      }
      if (
        Date.now() < Number(deferred.endGraceUntil || 0) ||
        speechState.speechFresh ||
        pendingWhisper.hasPending
      ) {
        setAsrEndGraceState(true, {
          startedAt: deferred.endGraceStartedAt || Date.now(),
          until: Number(deferred.endGraceUntil || Date.now()),
          lastSpeakableLineIndex: deferred.pending.lastSpeakableLineIndex,
          reason: deferred.lastExtensionReason || deferred.endGraceReason || 'end-grace',
        });
        scheduleDeferredAsrScriptEndStop(ASR_END_GRACE_POLL_MS);
        return;
      }
      setAsrEndGraceState(false);
      deferredAsrScriptEndStop = null;
      const stopIntent = {
        source: 'asr-script-end',
        reason: 'script-end',
        mode,
        phase: session.phase,
      };
      dispatchSessionIntent(false, stopIntent);
      try { setSessionPhase('wrap'); } catch {}
      try {
        window.dispatchEvent(
          new CustomEvent('tp:session:stop', {
            detail: {
              ...stopIntent,
              intentSource: 'asr-script-end',
              lineIndex: deferred.pending.lineIndex,
              lastSpeakableLineIndex: deferred.pending.lastSpeakableLineIndex,
              confirmSource: deferred.evidence.source,
              confirmMatchedLine: deferred.evidence.matchedLine,
              confirmSharedTokens: deferred.evidence.sharedAny,
              confirmSharedMeaningfulTokens: deferred.evidence.sharedMeaningful,
              confirmOverlapRatio: deferred.evidence.overlapRatio,
              markerWaitMs: deferred.markerReachedAt - deferred.startedAt,
              postrollMs: deferred.completionDelayMs,
              terminalHoldReason: deferred.completionReason,
            },
          }),
        );
      } catch {}
      emitHudSnapshot('script-end-stop', { force: true });
      if (isDevMode() && shouldLogTag('ASR:script-end-stop', 2, 1000)) {
        try {
          console.info('[ASR] session stop at script end', {
            mode,
            lineIndex: deferred.pending.lineIndex,
            lastSpeakableLineIndex: deferred.pending.lastSpeakableLineIndex,
            runKey: deferred.pending.runKey,
            confirmSource: deferred.evidence.source,
            confirmMatchedLine: deferred.evidence.matchedLine,
            sharedTokens: deferred.evidence.sharedAny,
            sharedMeaningfulTokens: deferred.evidence.sharedMeaningful,
            overlapRatio: Number(deferred.evidence.overlapRatio.toFixed(3)),
            markerWaitMs: deferred.markerReachedAt - deferred.startedAt,
            postrollMs: deferred.completionDelayMs,
            terminalHoldReason: deferred.completionReason,
          });
        } catch {}
      }
      try {
        console.info(`[ASR_END_GRACE_COMPLETED] lineIndex=${deferred.pending.lineIndex ?? -1} lastSpeakableLineIndex=${deferred.pending.lastSpeakableLineIndex ?? -1} graceElapsedMs=${Math.max(0, Date.now() - Number(deferred.endGraceStartedAt || deferred.startedAt))} speechFresh=${speechState.speechFresh ? 1 : 0} speechActive=${speechState.speechActive ? 1 : 0} requestsInFlight=${pendingWhisper.requestsInFlight} queueDepth=${pendingWhisper.queueDepth} reason=grace_elapsed_and_drained`);
      } catch {}
      return;
    }
    if (deferred.targetLine == null) {
      deferred.markerReachedAt = Date.now();
      deferred.completionDelayMs = ASR_SCRIPT_END_POSTROLL_MS;
      deferred.completionReason = 'no-target';
      scheduleDeferredAsrScriptEndStop(deferred.completionDelayMs);
      return;
    }
    const probe = probeDeferredAsrScriptEndMarker(deferred.targetLine);
    if (probe.reached) {
      deferred.markerReachedAt = Date.now();
      deferred.completionDelayMs = ASR_SCRIPT_END_POSTROLL_MS;
      deferred.completionReason = 'marker-reached';
      emitHudSnapshot('script-end-postroll', { force: true });
      if (isDevMode() && shouldLogTag('ASR:script-end-marker-reached', 2, 250)) {
        try {
          console.info('[ASR] script-end marker reached', {
            targetLine: deferred.targetLine,
            markerIdx: probe.markerIdx,
            distancePx: probe.distancePx == null ? null : Number(probe.distancePx.toFixed(1)),
            tolerancePx: Number(probe.tolerancePx.toFixed(1)),
            postrollMs: deferred.completionDelayMs,
          });
        } catch {}
      }
      scheduleDeferredAsrScriptEndStop(deferred.completionDelayMs);
      return;
    }
    const waitMs = Date.now() - deferred.startedAt;
    if (waitMs >= ASR_SCRIPT_END_MARKER_WAIT_MAX_MS) {
      deferred.markerReachedAt = Date.now();
      deferred.completionDelayMs = 0;
      deferred.completionReason = 'marker-timeout';
      if (isDevMode() && shouldLogTag('ASR:script-end-marker-timeout', 2, 500)) {
        try {
          console.info('[ASR] script-end marker wait timed out', {
            targetLine: deferred.targetLine,
            markerIdx: probe.markerIdx,
            distancePx: probe.distancePx == null ? null : Number(probe.distancePx.toFixed(1)),
            tolerancePx: Number(probe.tolerancePx.toFixed(1)),
            waitedMs: waitMs,
          });
        } catch {}
      }
      scheduleDeferredAsrScriptEndStop(0);
      return;
    }
    scheduleDeferredAsrScriptEndStop(ASR_SCRIPT_END_MARKER_POLL_MS);
  }, Math.max(0, delayMs));
}

function finalizePendingAsrScriptEndStop(
  pending: PendingAsrScriptEndStop,
  evidence: AsrScriptEndConfirmationEvidence,
): void {
  const session = getSession();
  const mode = String(pending.mode || getScrollMode() || '').toLowerCase();
  if (session.phase !== 'live' || !isAsrLikeMode(mode)) {
    clearPendingAsrScriptEnd('session-not-live');
    return;
  }
  if (shouldSuppressAsrScriptEndAutoStop(session)) {
    suppressPendingAsrScriptEndStop(pending, 'recording-active', evidence);
    return;
  }
  lastAsrScriptEndStopKey = pending.dedupeKey;
  pendingAsrScriptEndStop = null;
  cancelDeferredAsrScriptEndStop('replaced');
  deferredAsrScriptEndStop = {
    pending,
    evidence,
    targetLine: pending.lastSpeakableLineIndex ?? pending.lineIndex,
    startedAt: Date.now(),
    markerReachedAt: null,
    completionDelayMs: ASR_SCRIPT_END_POSTROLL_MS,
    completionReason: 'marker-reached',
    endGraceStartedAt: null,
    endGraceUntil: null,
    endGraceReason: null,
    pendingResponseSeen: false,
    lastExtensionReason: null,
  };
  emitHudSnapshot('script-end-marker-wait', { force: true });
  if (isDevMode() && shouldLogTag('ASR:script-end-marker-wait', 2, 250)) {
    try {
      console.info('[ASR] script-end waiting for terminal marker', {
        mode,
        lineIndex: pending.lineIndex,
        lastSpeakableLineIndex: pending.lastSpeakableLineIndex,
        runKey: pending.runKey,
        targetLine: deferredAsrScriptEndStop.targetLine,
        postrollMs: ASR_SCRIPT_END_POSTROLL_MS,
      });
    } catch {}
  }
  scheduleDeferredAsrScriptEndStop(0);
}

function maybeConfirmPendingAsrScriptEnd(
  text: string,
  isFinal: boolean,
  detail?: Partial<TranscriptPayload>,
): void {
  const pending = pendingAsrScriptEndStop;
  if (!pending) return;
  const now = Date.now();
  if (now - pending.armedAt > ASR_SCRIPT_END_CONFIRM_MAX_WAIT_MS) {
    clearPendingAsrScriptEnd('timeout');
    return;
  }
  if (!isFinal) return;
  const mode = String(detail?.mode || pending.mode || getScrollMode() || '').toLowerCase();
  const session = getSession();
  if (session.phase !== 'live' || !isAsrLikeMode(mode)) {
    clearPendingAsrScriptEnd('mode-or-phase-change');
    return;
  }
  const targetLine = pending.lastSpeakableLineIndex ?? pending.lineIndex;
  const runtimeLine = resolveRuntimeAsrLineIndex();
  if (targetLine != null && runtimeLine != null && runtimeLine < targetLine) return;

  const matchedLine =
    normalizeLineIndex(detail?.line) ??
    normalizeLineIndex(detail?.currentIdx);
  if (targetLine != null && matchedLine != null && matchedLine >= targetLine) {
    finalizePendingAsrScriptEndStop(pending, {
      source: 'route-line',
      matchedLine,
      sharedAny: 0,
      sharedMeaningful: 0,
      overlapRatio: 0,
    });
    return;
  }

  const transcriptTokens = normTokens(String(text || ''));
  const targetTokens = pending.targetLineTokens;
  const { sharedAny, sharedMeaningful } = countTokenOverlap(transcriptTokens, targetTokens);
  const overlapRatio = targetTokens.length > 0 ? sharedAny / targetTokens.length : 0;
  const hasTokenEvidence =
    (sharedMeaningful >= ASR_SCRIPT_END_CONFIRM_MIN_SHARED_MEANINGFUL_TOKENS &&
      sharedAny >= ASR_SCRIPT_END_CONFIRM_MIN_SHARED_TOKENS) ||
    (targetTokens.length > 0 && overlapRatio >= 0.5);
  if (!hasTokenEvidence) return;
  finalizePendingAsrScriptEndStop(pending, {
    source: 'token-overlap',
    matchedLine,
    sharedAny,
    sharedMeaningful,
    overlapRatio,
  });
}

function toMaybeTimestamp(ts: number): number | null {
  return ts > 0 ? ts : null;
}

function elapsedSince(ts: number, now: number): number | null {
  if (ts <= 0) return null;
  return Math.max(0, now - ts);
}

function resolveRecognizerQuietMs(payload: Pick<AsrHeartbeatPayload, 'sinceOnResultMs' | 'recognizerAttached' | 'speechRunningActual'>, now: number): number | null {
  if (payload.sinceOnResultMs != null) return payload.sinceOnResultMs;
  if (!payload.recognizerAttached && !payload.speechRunningActual) return null;
  return elapsedSince(lastRecognizerAttachedTs, now);
}

function buildHudSnapshot(reason: string): HudSnapshotPayload {
  const session = getSession();
  const driverRef = resolveAsrDriverRef();
  const mode = String(getScrollMode() || '').toLowerCase() || 'unknown';
  syncAsrDriverStats(driverRef);
  let lastLineIndex: number | null = null;
  let driverId: string | null = null;
  try {
    const raw = Number(driverRef?.getLastLineIndex?.());
    if (Number.isFinite(raw)) lastLineIndex = Math.max(0, Math.floor(raw));
  } catch {
    lastLineIndex = null;
  }
  try {
    const rawId = (driverRef as any)?.__instanceId ?? (driverRef as any)?._instanceId;
    if (rawId != null && String(rawId).trim()) driverId = String(rawId).trim();
  } catch {
    driverId = null;
  }
  return {
    reason: String(reason || 'state'),
    ts: Date.now(),
    scrollMode: mode,
    sessionPhase: String(session.phase || 'idle').toLowerCase() || 'idle',
    speechRunning: !!running,
    speechRunningActual: !!speechRunningActual,
    asrDesired: !!session.asrDesired,
    asrArmed: !!session.asrArmed,
    driver: !!driverRef,
    driverId,
    lastLineIndex,
    lastOnResultTs: toMaybeTimestamp(lastRecognizerOnResultTs || lastResultTs),
    lastIngestTs: toMaybeTimestamp(lastAsrIngestTs),
    lastCommitTs: toMaybeTimestamp(lastAsrCommitTs),
  };
}

function emitHudSnapshot(reason: string, opts?: { force?: boolean }): void {
  if (typeof window === 'undefined') return;
  const payload = buildHudSnapshot(reason);
  const fingerprint = [
    payload.scrollMode,
    payload.sessionPhase,
    payload.speechRunning ? 1 : 0,
    payload.speechRunningActual ? 1 : 0,
    payload.asrDesired ? 1 : 0,
    payload.asrArmed ? 1 : 0,
    payload.driver ? 1 : 0,
    payload.driverId || '',
    payload.lastLineIndex ?? -1,
    payload.lastOnResultTs ?? -1,
    payload.lastIngestTs ?? -1,
    payload.lastCommitTs ?? -1,
  ].join('|');
  const now = Date.now();
  if (!opts?.force) {
    if (fingerprint === lastHudSnapshotFingerprint && now - lastHudSnapshotAt < HUD_SNAPSHOT_THROTTLE_MS) {
      return;
    }
  }
  lastHudSnapshotFingerprint = fingerprint;
  lastHudSnapshotAt = now;
  try { (window as any).__tpHudSnapshotLast = payload; } catch {}
  try { window.__tpBus?.emit?.('tp:hud:snapshot', payload); } catch {}
  try { window.dispatchEvent(new CustomEvent('tp:hud:snapshot', { detail: payload })); } catch {}
  try { document.dispatchEvent(new CustomEvent('tp:hud:snapshot', { detail: payload })); } catch {}
}

function shouldEmitAsrHeartbeatPayload(): boolean {
  const mode = String(lastScrollMode || getScrollMode() || '').toLowerCase();
  if (mode !== 'asr') return false;
  const session = getSession();
  return !!session.asrArmed;
}

function isLiveArmedAsr(mode: string, phase: string, asrArmed: boolean): boolean {
  return (
    String(mode || '').toLowerCase() === 'asr' &&
    String(phase || '').toLowerCase() === 'live' &&
    asrArmed === true
  );
}

function maybeLogLiveArmedDetachedInvariant(reason: string): void {
  if (!isDevMode()) return;
  const session = getSession();
  const mode = String(lastScrollMode || getScrollMode() || '').toLowerCase();
  const phase = String(session.phase || '').toLowerCase();
  if (!isLiveArmedAsr(mode, phase, !!session.asrArmed)) return;
  if (shouldLogTag('ASR:invariant:live-armed-detached', 2, 1000)) {
    try { console.warn('[ASR_INVARIANT_BROKEN] live+armed but no recognizer attached', { reason }); } catch {}
  }
}

function buildAsrHeartbeat(reason: string): AsrHeartbeatPayload {
  const now = Date.now();
  const mode = String(lastScrollMode || getScrollMode() || '').toLowerCase() || 'unknown';
  const session = getSession();
  const recognizerAttached = !!activeRecognizer;
  if (!recognizerAttached && speechRunningActual) {
    setSpeechRunningActual(false, 'invariant:detached');
    maybeLogLiveArmedDetachedInvariant('heartbeat');
  }
  const driverRef = resolveAsrDriverRef();
  syncAsrDriverStats(driverRef);
  const lastOnResult = Math.max(lastRecognizerOnResultTs, lastResultTs);
  return {
    reason: String(reason || 'tick'),
    ts: now,
    scrollMode: mode,
    sessionPhase: String(session.phase || 'idle').toLowerCase() || 'idle',
    asrArmed: !!session.asrArmed,
    speechRunning: !!running,
    speechRunningActual: recognizerAttached ? !!speechRunningActual : false,
    recognizerAttached,
    lastOnResultTs: toMaybeTimestamp(lastOnResult),
    lastIngestTs: toMaybeTimestamp(lastAsrIngestTs),
    lastCommitTs: toMaybeTimestamp(lastAsrCommitTs),
    sinceOnResultMs: elapsedSince(lastOnResult, now),
    sinceIngestMs: elapsedSince(lastAsrIngestTs, now),
    sinceCommitMs: elapsedSince(lastAsrCommitTs, now),
    commitCount: Math.max(0, Math.floor(lastAsrCommitCount || 0)),
    lifecycleEvent: lastRecognizerLifecycleEvent || '',
    lifecycleEventTs: toMaybeTimestamp(lastRecognizerLifecycleAt),
  };
}

function classifyAsrStall(payload: AsrHeartbeatPayload): AsrStallClass {
  const now = Number.isFinite(payload.ts) ? Number(payload.ts) : Date.now();
  const liveArmedAsr = isLiveArmedAsr(
    payload.scrollMode,
    payload.sessionPhase,
    payload.asrArmed,
  );
  const liveArmedDetached = liveArmedAsr && !payload.recognizerAttached;
  if (liveArmedDetached) {
    maybeLogLiveArmedDetachedInvariant('stall-classifier');
    return 'speech_stall';
  }
  const commitCount = Math.max(0, Math.floor(Number(payload.commitCount) || 0));
  if (commitCount !== lastMatcherStallCommitCount) {
    lastMatcherStallCommitCount = commitCount;
    lastMatcherStallCommitStableSince = now;
  } else if (lastMatcherStallCommitStableSince <= 0) {
    lastMatcherStallCommitStableSince = now;
  }
  const commitStagnantMs = Math.max(0, now - lastMatcherStallCommitStableSince);
  const sinceOnResultMs = payload.sinceOnResultMs;
  const recognizerQuietMs = resolveRecognizerQuietMs(payload, now);
  const sinceIngestMs = payload.sinceIngestMs;
  const sinceCommitMs = payload.sinceCommitMs;
  const deafRecognizerStalled =
    liveArmedAsr &&
    (payload.recognizerAttached || payload.speechRunningActual) &&
    recognizerQuietMs != null &&
    recognizerQuietMs > ASR_DEAF_RECOGNIZER_MS;
  if (deafRecognizerStalled) {
    if (isDevMode() && shouldLogTag('ASR:deaf-recognizer', 2, 1000)) {
      try { console.warn(`[ASR_DEAF] no onresult for ${Math.round(recognizerQuietMs)}ms -> speech_stall`); } catch {}
    }
    return 'speech_stall';
  }
  const speechLaneStalled =
    sinceOnResultMs != null &&
    sinceOnResultMs > ASR_STALL_SPEECH_THRESHOLD_MS &&
    (!payload.speechRunningActual || !payload.recognizerAttached);
  if (speechLaneStalled) return 'speech_stall';
  const resultFlowing =
    (sinceOnResultMs != null && sinceOnResultMs <= ASR_STALL_SPEECH_THRESHOLD_MS) ||
    (sinceIngestMs != null && sinceIngestMs <= ASR_STALL_SPEECH_THRESHOLD_MS);
  const matcherLaneStalled =
    resultFlowing &&
    sinceCommitMs != null &&
    sinceCommitMs > ASR_STALL_MATCHER_THRESHOLD_MS &&
    commitStagnantMs >= ASR_STALL_MATCHER_STABLE_COMMIT_MS &&
    payload.speechRunningActual &&
    payload.recognizerAttached;
  if (matcherLaneStalled) return 'matcher_stall';
  return 'unknown';
}

function resetAsrStallAutoRestartEpisode(reason?: string): void {
  asrStallEpisodeRestarted = false;
  asrStallAttemptCountThisEpisode = 0;
  lastAsrStallEpisodeClass = 'unknown';
  lastAsrStallRescueAt = 0;
  lastMatcherStallCommitCount = -1;
  lastMatcherStallCommitStableSince = 0;
  if (isDevMode() && shouldLogTag('ASR_STALL_AUTORESTART_RESET', 2, 1000)) {
    try { console.info('[ASR_STALL_AUTORESTART_RESET]', { reason: reason || 'reset' }); } catch {}
  }
}

function suppressAsrStallAutoRestart(reason: string, durationMs = ASR_STALL_AUTORESTART_SUPPRESS_MS): void {
  const now = Date.now();
  const ttlMs = Math.max(0, Math.floor(Number(durationMs) || 0));
  suppressAsrStallAutoRestartUntil = Math.max(suppressAsrStallAutoRestartUntil, now + ttlMs);
  resetAsrStallAutoRestartEpisode(`suppress:${reason}`);
  if (isDevMode() && shouldLogTag('ASR_STALL_AUTORESTART_SUPPRESS', 2, 1000)) {
    try {
      console.info('[ASR_STALL_AUTORESTART_SUPPRESS]', {
        reason,
        suppressUntil: suppressAsrStallAutoRestartUntil,
      });
    } catch {}
  }
}

function emitAsrStallAutoRestart(payload: AsrStallAutoRestartPayload): void {
  if (typeof window === 'undefined') return;
  try { window.__tpAsrStallAutoRestartLast = payload; } catch {}
  try { window.__tpBus?.emit?.('tp:asr:stall-autorestart', payload); } catch {}
  try { window.dispatchEvent(new CustomEvent('tp:asr:stall-autorestart', { detail: payload })); } catch {}
  try { document.dispatchEvent(new CustomEvent('tp:asr:stall-autorestart', { detail: payload })); } catch {}
  if (isDevMode()) {
    try { console.warn('[ASR_STALL_AUTORESTART]', payload); } catch {}
  }
}

function emitAsrStallRescue(reason: string, stall: AsrStallPayload): void {
  if (typeof window === 'undefined') return;
  const payload = {
    reason: String(reason || 'stall:speech_stall'),
    ts: Date.now(),
    scrollMode: stall.scrollMode,
    sessionPhase: stall.sessionPhase,
    asrArmed: stall.asrArmed,
    stallClass: stall.stallClass,
    sinceOnResultMs: stall.sinceOnResultMs,
    sinceCommitMs: stall.sinceCommitMs,
    commitCount: stall.commitCount,
  };
  try { window.__tpBus?.emit?.('tp:asr:rescue', payload); } catch {}
  try { window.dispatchEvent(new CustomEvent('tp:asr:rescue', { detail: payload })); } catch {}
  try { document.dispatchEvent(new CustomEvent('tp:asr:rescue', { detail: payload })); } catch {}
  if (isDevMode() && shouldLogTag('ASR_STALL_RESCUE', 2, 1000)) {
    try { console.info('[ASR_STALL_RESCUE]', payload); } catch {}
  }
}

function maybeAutoRestartSpeechStall(stallPayload: AsrStallPayload): void {
  const nextClass = stallPayload.stallClass;
  const prevClass = lastAsrStallEpisodeClass;
  const enteredSpeechStall = nextClass === 'speech_stall' && prevClass !== 'speech_stall';
  const leftSpeechStall = nextClass !== 'speech_stall' && prevClass === 'speech_stall';

  if (enteredSpeechStall) {
    asrStallEpisodeId += 1;
    asrStallEpisodeRestarted = false;
    asrStallAttemptCountThisEpisode = 0;
  } else if (leftSpeechStall) {
    asrStallEpisodeRestarted = false;
    asrStallAttemptCountThisEpisode = 0;
  }
  lastAsrStallEpisodeClass = nextClass;

  if (nextClass !== 'speech_stall') return;

  const now = Date.now();
  const mode = String(stallPayload.scrollMode || '').toLowerCase();
  const asrArmed = stallPayload.asrArmed === true;
  const inAsrMode = mode === 'asr';
  const liveArmedAsr = isLiveArmedAsr(mode, stallPayload.sessionPhase, asrArmed);
  const recognizerQuietMs = resolveRecognizerQuietMs(stallPayload, now);
  const deafRecognizerLane =
    liveArmedAsr &&
    (stallPayload.recognizerAttached || stallPayload.speechRunningActual) &&
    recognizerQuietMs != null &&
    recognizerQuietMs > ASR_DEAF_RECOGNIZER_MS;
  const recognizerLaneDied =
    !stallPayload.recognizerAttached ||
    !stallPayload.speechRunningActual ||
    deafRecognizerLane;
  if (liveArmedAsr && recognizerLaneDied) {
    const rescueCooldownRemainingMs = Math.max(
      0,
      ASR_STALL_RESCUE_COOLDOWN_MS - (now - lastAsrStallRescueAt),
    );
    if (rescueCooldownRemainingMs <= 0) {
      lastAsrStallRescueAt = now;
      emitAsrStallRescue('stall:speech_stall', stallPayload);
    }
  }
  if (!inAsrMode || !asrArmed) {
    asrStallEpisodeRestarted = false;
    asrStallAttemptCountThisEpisode = 0;
  }
  const suppressionRemainingMs = Math.max(0, suppressAsrStallAutoRestartUntil - now);
  const cooldownRemainingBeforeMs = Math.max(0, ASR_STALL_AUTORESTART_COOLDOWN_MS - (now - lastAsrStallAutoRestartAt));

  let reason = 'stall:speech_stall';
  let restartAttempted = false;
  let restarted = false;

  if (!inAsrMode || !asrArmed) {
    reason = 'skip:not-asr-armed';
  } else if (!recognizerLaneDied) {
    reason = 'skip:not-speech-lane';
  } else if (!shouldAutoRestartSpeech()) {
    reason = 'skip:autorestart-disabled';
  } else if (asrStallEpisodeRestarted && cooldownRemainingBeforeMs > 0) {
    reason = 'skip:episode-cooldown';
  } else if (suppressionRemainingMs > 0) {
    reason = 'skip:manual-suppressed';
  } else if (cooldownRemainingBeforeMs > 0) {
    reason = 'skip:cooldown';
  } else {
    restartAttempted = true;
    asrStallEpisodeRestarted = true;
    asrStallAttemptCountThisEpisode += 1;
    lastAsrStallAutoRestartAt = now;
    restarted = requestRecognizerRestart('stall:speech_stall', { abortFirst: false });
    reason = restarted ? 'stall:speech_stall' : 'stall:speech_stall:failed';
    emitHudSnapshot(`stall-autorestart:${restarted ? 'ok' : 'failed'}`, { force: true });
  }

  if (!restartAttempted && !enteredSpeechStall) return;

  const cooldownRemainingMs = Math.max(0, ASR_STALL_AUTORESTART_COOLDOWN_MS - (now - lastAsrStallAutoRestartAt));
  emitAsrStallAutoRestart({
    reason,
    ts: now,
    stall: stallPayload,
    episodeId: asrStallEpisodeId,
    attemptCountThisEpisode: asrStallAttemptCountThisEpisode,
    lastAttemptAt: lastAsrStallAutoRestartAt > 0 ? lastAsrStallAutoRestartAt : null,
    cooldownRemainingMs,
    suppressionRemainingMs,
    restartAttempted,
    restarted,
  });
}

function emitAsrStallIfChanged(payload: AsrHeartbeatPayload, opts?: { force?: boolean }): void {
  if (typeof window === 'undefined') return;
  const stallClass = classifyAsrStall(payload);
  const stallPayload: AsrStallPayload = {
    reason: payload.reason,
    ts: payload.ts,
    stallClass,
    scrollMode: payload.scrollMode,
    sessionPhase: payload.sessionPhase,
    asrArmed: payload.asrArmed,
    speechRunning: payload.speechRunning,
    speechRunningActual: payload.speechRunningActual,
    recognizerAttached: payload.recognizerAttached,
    lastOnResultTs: payload.lastOnResultTs,
    lastIngestTs: payload.lastIngestTs,
    lastCommitTs: payload.lastCommitTs,
    sinceOnResultMs: payload.sinceOnResultMs,
    sinceIngestMs: payload.sinceIngestMs,
    sinceCommitMs: payload.sinceCommitMs,
    commitCount: payload.commitCount,
    lifecycleEvent: payload.lifecycleEvent,
    lifecycleEventTs: payload.lifecycleEventTs,
  };
  maybeAutoRestartSpeechStall(stallPayload);
  if (!opts?.force && stallClass === lastAsrStallClass) return;
  lastAsrStallClass = stallClass;
  try { window.__tpAsrStallLast = stallPayload; } catch {}
  try { window.__tpBus?.emit?.('tp:asr:stall', stallPayload); } catch {}
  try { window.dispatchEvent(new CustomEvent('tp:asr:stall', { detail: stallPayload })); } catch {}
  try { document.dispatchEvent(new CustomEvent('tp:asr:stall', { detail: stallPayload })); } catch {}
  if (isDevMode()) {
    try { console.warn('[ASR_STALL_VERDICT]', stallPayload); } catch {}
  }
}

function emitAsrHeartbeat(reason: string, opts?: { force?: boolean }): void {
  if (typeof window === 'undefined') return;
  if (!opts?.force && !shouldEmitAsrHeartbeatPayload()) return;
  const payload = buildAsrHeartbeat(reason);
  try { window.__tpAsrHeartbeatLast = payload; } catch {}
  try { window.__tpBus?.emit?.('tp:asr:heartbeat', payload); } catch {}
  try { window.dispatchEvent(new CustomEvent('tp:asr:heartbeat', { detail: payload })); } catch {}
  try { document.dispatchEvent(new CustomEvent('tp:asr:heartbeat', { detail: payload })); } catch {}
  emitAsrStallIfChanged(payload, opts);
  if (isDevMode() && shouldLogTag('ASR_HEARTBEAT', 2, ASR_HEARTBEAT_INTERVAL_MS)) {
    try { console.info('[ASR_HEARTBEAT]', payload); } catch {}
  }
}

function stopAsrHeartbeat(): void {
  if (asrHeartbeatTimer != null) {
    window.clearInterval(asrHeartbeatTimer);
    asrHeartbeatTimer = null;
  }
}

function startAsrHeartbeat(): void {
  if (asrHeartbeatTimer != null) return;
  asrHeartbeatTimer = window.setInterval(() => {
    emitAsrHeartbeat('tick');
  }, ASR_HEARTBEAT_INTERVAL_MS);
}

function dispatchSessionIntent(active: boolean, detail?: { source?: string; reason?: string; mode?: string; phase?: string }): void {
  try {
    const payload: Record<string, unknown> = {
      active,
      source: detail?.source,
      reason: detail?.reason,
      mode: detail?.mode ?? getScrollMode(),
      phase: detail?.phase,
      intentSource: 'session-intent',
    };
    window.dispatchEvent(new CustomEvent('tp:session:intent', { detail: payload }));
  } catch {
    // ignore
  }
}

function armAsrForSessionStart(mode: string, source: string): void {
  const normalizedMode = String(mode || '').toLowerCase();
  if (normalizedMode !== 'asr') return;
  startAsrHeartbeat();
  const store = window.__tpStore;
  if (!store || typeof store.set !== 'function') return;
  try { store.set('session.asrDesired' as any, true as any); } catch {}
  try { store.set('session.asrArmed' as any, true as any); } catch {}
  try { store.set('session.asrReady' as any, true as any); } catch {}
  // Arm must immediately trigger an attach attempt in the same tick so we do
  // not depend on a later mode-change event to wire ASR transcript handling.
  try { ensureAsrDriverLifecycleHooks(); } catch {}
  try {
    const reason = `arm:${source || 'unknown'}`;
    attachAsrScrollDriver({ reason, mode: normalizedMode, allowCreate: true });
    syncAsrDriverFromBlocks(reason, { mode: normalizedMode, allowCreate: true });
    bootTrace('speech-loader:arm:attach-attempt', {
      source,
      mode: normalizedMode,
      reason,
    });
  } catch {}
  try {
    console.info('[ASR] armed for session start', { source, mode: normalizedMode });
  } catch {}
  emitHudSnapshot('asr-arm', { force: true });
}

function rememberMode(mode: string): void {
  if (typeof mode === 'string') {
    lastScrollMode = mode;
  }
}
function micActive(): boolean {
  try { return !!window.__tpMic?.isOpen?.(); } catch {}
  try { return !!window.__tpStore?.get?.('micEnabled'); } catch {}
  return false;
}
function shouldEmitTranscript(): boolean {
  if (inRehearsal()) return false;
  const mode = getScrollMode();
  rememberMode(mode);
  if (mode !== 'asr' && mode !== 'hybrid') return false;
  if (!running) return false;
  const micOpen = micActive();
  if (!micOpen) {
    try { window.__tpHud?.log?.('[speech-loader]', 'mic inactive (soft gate)'); } catch {}
  }
  return true;
}

function isAutoRestartEnabled(): boolean {
  try {
    const flag = window.recAutoRestart;
    if (flag === undefined || flag === null) return true;
    if (typeof flag === 'string') {
      const normalized = flag.trim().toLowerCase();
      if (normalized === 'false' || normalized === '0') return false;
      if (normalized === 'true' || normalized === '1') return true;
    }
    return !!flag;
  } catch {}
  return true;
}

function emitTranscriptEvent(payload: TranscriptPayload): void {
  try { window.__tpBus?.emit?.('tp:speech:transcript', payload); } catch {}
  try { window.dispatchEvent(new CustomEvent('tp:speech:transcript', { detail: payload })); } catch {}
}

function hashSpeechText(value: string): string {
  const input = String(value || '');
  let hash = 2166136261;
  for (let idx = 0; idx < input.length; idx += 1) {
    hash ^= input.charCodeAt(idx);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function previewSpeechText(value: string, maxChars = 96): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}...` : normalized;
}

function normalizeSeqArray(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  values.forEach((value) => {
    if (!Number.isFinite(Number(value))) return;
    const normalized = Math.max(0, Math.floor(Number(value)));
    if (seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  });
  return out;
}

function resolveMatchBestIdxValue(match: Record<string, unknown> | null | undefined): number | null {
  const raw = match?.bestIdx ?? match?.line ?? match?.lineIdx;
  return Number.isFinite(Number(raw)) ? Math.max(0, Math.floor(Number(raw))) : null;
}

function normalizeRequestCaptureEvidence(values: unknown): NonNullable<TranscriptPayload['requestCaptureEvidence']> {
  const normalized: NonNullable<TranscriptPayload['requestCaptureEvidence']> = [];
  if (!Array.isArray(values)) return normalized;
  for (const value of values) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as Record<string, unknown>;
    const requestSeq = Number(entry.requestSeq);
    const verdictRaw = String(entry.verdict || '').trim();
    const verdict = verdictRaw === 'voice_detected' || verdictRaw === 'silence_detected' || verdictRaw === 'unknown'
      ? verdictRaw as 'voice_detected' | 'silence_detected' | 'unknown'
      : 'unknown';
    if (!Number.isFinite(requestSeq)) continue;
    normalized.push({
      requestSeq: Math.max(0, Math.floor(requestSeq)),
      verdict,
      vadSpeaking: typeof entry.vadSpeaking === 'boolean' ? Boolean(entry.vadSpeaking) : null,
      rmsDbfs: Number.isFinite(Number(entry.rmsDbfs)) ? Number(entry.rmsDbfs) : null,
      captureStartedAtMs: Number.isFinite(Number(entry.captureStartedAtMs)) ? Number(entry.captureStartedAtMs) : null,
      captureEndedAtMs: Number.isFinite(Number(entry.captureEndedAtMs)) ? Number(entry.captureEndedAtMs) : null,
      lastVoiceAtMs: Number.isFinite(Number(entry.lastVoiceAtMs)) ? Number(entry.lastVoiceAtMs) : null,
      lastSilenceAtMs: Number.isFinite(Number(entry.lastSilenceAtMs)) ? Number(entry.lastSilenceAtMs) : null,
      silenceBoundaryAtMs: Number.isFinite(Number(entry.silenceBoundaryAtMs)) ? Number(entry.silenceBoundaryAtMs) : null,
    });
  }
  return normalized;
}

function normalizeTranscriptForNovelty(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function computeSuffixPrefixOverlap(prevTokens: string[], nextTokens: string[]): number {
  const max = Math.min(prevTokens.length, nextTokens.length);
  for (let overlap = max; overlap > 0; overlap -= 1) {
    let ok = true;
    for (let idx = 0; idx < overlap; idx += 1) {
      if (prevTokens[prevTokens.length - overlap + idx] !== nextTokens[idx]) {
        ok = false;
        break;
      }
    }
    if (ok) return overlap;
  }
  return 0;
}

function shouldSuppressDuplicateFinalTranscript(nextText: string, nowMs: number): boolean {
  if (!lastEmittedFinalTranscriptNorm) return false;
  if (nowMs - lastEmittedFinalTranscriptAt > ASR_FINAL_NOVELTY_DEDUP_WINDOW_MS) return false;
  const prevTokens = lastEmittedFinalTranscriptNorm.split(' ').filter(Boolean);
  const nextTokens = normalizeTranscriptForNovelty(nextText);
  if (!prevTokens.length || !nextTokens.length) return false;
  const sameText = prevTokens.join(' ') === nextTokens.join(' ');
  if (sameText) return true;

  const overlap = computeSuffixPrefixOverlap(prevTokens, nextTokens);
  const overlapRatio = overlap / Math.max(1, Math.min(prevTokens.length, nextTokens.length));
  const noveltyRatio = Math.max(0, (nextTokens.length - overlap) / Math.max(1, nextTokens.length));
  return overlapRatio >= ASR_FINAL_NOVELTY_MIN_OVERLAP_RATIO && noveltyRatio < ASR_FINAL_NOVELTY_MIN_RATIO;
}

function resolveAcceptedTranscriptLine(payload: TranscriptPayload | Record<string, unknown> | null | undefined): number | null {
  const acceptedLineRaw =
    (payload as any)?.acceptedLine ??
    ((payload as any)?.match && typeof (payload as any).match === 'object'
      ? ((payload as any).match as any).acceptedLine ?? ((payload as any).match as any).bestIdx
      : null) ??
    (payload as any)?.line;
  const acceptedLine = Number(acceptedLineRaw);
  return Number.isFinite(acceptedLine) ? Math.max(0, Math.floor(acceptedLine)) : null;
}

function readCurrentCommittedLine(): number | null {
  if (typeof window === 'undefined') return null;
  const scrollState = ((window as any).__tpAsrScrollState || {}) as Record<string, unknown>;
  if (Number.isFinite(Number(scrollState.lastCommittedLine))) {
    return Math.max(0, Math.floor(Number(scrollState.lastCommittedLine)));
  }
  return resolveRuntimeAsrLineIndex();
}

function resolveDuplicateFinalCommitOpportunity(payload: TranscriptPayload): {
  suppressed: boolean;
  stage: 'post_commit_opportunity_eval';
  reason: string;
  currentCommittedLine: number | null;
  acceptedLine: number | null;
  acceptedLineGap: number | null;
  transcriptSeq: number | null;
  requestSeq: string | null;
} {
  const nowMs = Date.now();
  const acceptedLine = resolveAcceptedTranscriptLine(payload);
  const currentCommittedLine = readCurrentCommittedLine();
  const acceptedLineGap =
    acceptedLine != null && currentCommittedLine != null
      ? Math.max(0, acceptedLine - currentCommittedLine)
      : null;
  const duplicateCandidate = shouldSuppressDuplicateFinalTranscript(payload.text, nowMs);
  const forwardOpportunity =
    acceptedLine != null &&
    currentCommittedLine != null &&
    acceptedLine > currentCommittedLine &&
    acceptedLine - currentCommittedLine <= 8;
  return {
    suppressed: duplicateCandidate && !forwardOpportunity,
    stage: 'post_commit_opportunity_eval',
    reason: duplicateCandidate
      ? (forwardOpportunity ? 'forward_commit_opportunity_preserved' : 'duplicate_final_suppressed')
      : 'not_duplicate',
    currentCommittedLine,
    acceptedLine,
    acceptedLineGap,
    transcriptSeq: Number.isFinite(Number((payload as any)?.transcriptSeq))
      ? Math.max(0, Math.floor(Number((payload as any)?.transcriptSeq)))
      : null,
    requestSeq: typeof (payload as any)?.requestSeq === 'string' && String((payload as any).requestSeq).trim()
      ? String((payload as any).requestSeq).trim()
      : null,
  };
}

function logTranscriptEmitDebug(payload: TranscriptPayload): void {
  try {
    const textRaw = typeof payload.text === 'string' ? payload.text : '';
    const textPreview = textRaw.replace(/\s+/g, ' ').trim().slice(0, 60);
    const rawText = typeof payload.rawText === 'string' ? payload.rawText : '';
    const assembledText = typeof payload.assembledText === 'string' ? payload.assembledText : textRaw;
    const matchObj =
      payload.match && typeof payload.match === 'object'
        ? (payload.match as Record<string, unknown>)
        : null;
    const matchBestIdxRaw =
      (matchObj?.bestIdx as unknown) ??
      (matchObj?.line as unknown) ??
      (matchObj?.lineIdx as unknown);
    const matchBestSimRaw =
      (matchObj?.bestSim as unknown) ??
      (matchObj?.sim as unknown) ??
      (matchObj?.score as unknown);
    const topLevelBestIdxRaw = (payload as any)?.bestIdx ?? payload.line;
    const topLevelBestSimRaw = (payload as any)?.bestSim ?? payload.sim;
    const matchBestIdx = Number.isFinite(Number(matchBestIdxRaw))
      ? Math.floor(Number(matchBestIdxRaw))
      : null;
    const matchBestSim = Number.isFinite(Number(matchBestSimRaw))
      ? Number(Number(matchBestSimRaw).toFixed(4))
      : null;
    const topLevelBestIdx = Number.isFinite(Number(topLevelBestIdxRaw))
      ? Math.floor(Number(topLevelBestIdxRaw))
      : null;
    const topLevelBestSim = Number.isFinite(Number(topLevelBestSimRaw))
      ? Number(Number(topLevelBestSimRaw).toFixed(4))
      : null;
    const matchReason = typeof matchObj?.reason === 'string' ? matchObj.reason : null;
    const matchVia = typeof matchObj?.via === 'string' ? matchObj.via : null;
    const matchFallbackUsed = matchObj?.fallbackUsed === true;
    const primaryBypassReason = typeof matchObj?.primaryBypassReason === 'string'
      ? matchObj.primaryBypassReason
      : null;
    matcherSummaryCount += 1;
    if (matchFallbackUsed) matcherFallbackSummaryCount += 1;
    const matcherFallbackRatio = matcherSummaryCount > 0
      ? Number((matcherFallbackSummaryCount / matcherSummaryCount).toFixed(3))
      : 0;
    const blockSnapshot = getAsrBlockSnapshot();
    const scriptHash = (() => {
      try {
        const raw = (window as any).__TP_LAST_APPLIED_HASH;
        return typeof raw === 'string' && raw ? raw : null;
      } catch {
        return null;
      }
    })();
    const summary = {
      textLen: textRaw.length,
      textPreview,
      noMatch: payload.noMatch === true,
      matchId: payload.matchId ?? null,
      matchBestIdx,
      matchBestSim,
      matchReason,
      matchVia,
      matchFallbackUsed,
      primaryBypassReason,
      matcherFallbackRatio,
      rawTextHash: payload.rawTextHash ?? (rawText ? hashSpeechText(rawText) : null),
      rawTextPreview: payload.rawTextPreview ?? (rawText ? previewSpeechText(rawText, 60) : null),
      assembledTextHash: payload.assembledTextHash ?? (assembledText ? hashSpeechText(assembledText) : null),
      assembledTextPreview: payload.assembledTextPreview ?? (assembledText ? previewSpeechText(assembledText, 60) : null),
      sourceRequestSeqs: normalizeSeqArray(payload.sourceRequestSeqs),
      supportingRawSeqs: normalizeSeqArray(payload.supportingRawSeqs),
      rawMatchIndex: payload.rawMatchIndex ?? null,
      assembledMatchIndex: payload.assembledMatchIndex ?? null,
      forwardMatchCreatedByAssembly: payload.forwardMatchCreatedByAssembly === true,
      captureActivityVerdict: payload.captureActivityVerdict ?? null,
      semanticAdmissionVerdict: payload.semanticAdmissionVerdict ?? null,
      promptIncluded: payload.promptIncluded === true,
      promptHash: payload.promptHash ?? null,
      topLevelBestIdx,
      topLevelBestSim,
      scriptHash,
      scriptSig: blockSnapshot.scriptSig ?? null,
      blockCount: blockSnapshot.count,
      blockSource: blockSnapshot.source ?? null,
      blockSchemaVersion: blockSnapshot.schemaVersion ?? null,
    };
    console.info('[speech-loader] tp:speech:transcript emit summary', JSON.stringify(summary));
  } catch {}
}

function scheduleAcceptedTranscriptNoCommitDiagnostic(payload: TranscriptPayload): void {
  if (typeof window === 'undefined') return;
  if (!payload.isFinal) return;
  if (payload.noMatch === true) return;

  const commitCountBefore = Math.max(0, Math.floor(lastAsrCommitCount || 0));
  const acceptedLine = resolveAcceptedTranscriptLine(payload);

  window.setTimeout(() => {
    syncAsrDriverStats();
    const commitCountAfter = Math.max(0, Math.floor(lastAsrCommitCount || 0));
    if (commitCountAfter > commitCountBefore) return;

    const scrollState = ((window as any).__tpAsrScrollState || {}) as Record<string, unknown>;
    const currentCommittedLine = Number.isFinite(Number(scrollState.lastCommittedLine))
      ? Math.max(0, Math.floor(Number(scrollState.lastCommittedLine)))
      : resolveRuntimeAsrLineIndex();
    const candidateLine = Number.isFinite(Number(scrollState.candidateLine))
      ? Math.max(0, Math.floor(Number(scrollState.candidateLine)))
      : null;
    const acceptedLineFromDriver = Number.isFinite(Number(scrollState.acceptedLine))
      ? Math.max(0, Math.floor(Number(scrollState.acceptedLine)))
      : acceptedLine;
    const rawBlockedReason = String(scrollState.lastGuardReason || scrollState.lastHudGuardText || '').trim();
    const rawBlockedReasonLower = rawBlockedReason.toLowerCase();
    const sameLine =
      currentCommittedLine != null &&
      acceptedLineFromDriver != null &&
      currentCommittedLine === acceptedLineFromDriver;
    const duplicate = rawBlockedReasonLower.includes('duplicate');
    const replay = rawBlockedReasonLower.includes('replay') || rawBlockedReasonLower.includes('stale');
    const offscript = rawBlockedReasonLower.includes('offscript');
    const contradiction = rawBlockedReasonLower.includes('contradiction');
    const noMatch = rawBlockedReasonLower.includes('no_match') || rawBlockedReasonLower.includes('nomatch');
    const local = acceptedLineFromDriver != null && currentCommittedLine != null
      ? acceptedLineFromDriver <= currentCommittedLine + 1
      : null;
    const forward = acceptedLineFromDriver != null && currentCommittedLine != null
      ? acceptedLineFromDriver > currentCommittedLine
      : null;
    const acceptedLineGap =
      acceptedLineFromDriver != null && currentCommittedLine != null
        ? Math.max(0, acceptedLineFromDriver - currentCommittedLine)
        : null;
    const audioChunkAgeMs = Number.isFinite(Number(scrollState.lastAudioChunkAgeMs))
      ? Math.max(0, Math.floor(Number(scrollState.lastAudioChunkAgeMs)))
      : null;
    const freshnessLimitMs = Number.isFinite(Number(scrollState.freshnessLimitMs))
      ? Math.max(0, Math.floor(Number(scrollState.freshnessLimitMs)))
      : null;
    const transcriptSeq = Number.isFinite(Number((payload as any)?.transcriptSeq ?? scrollState.lastTranscriptSeq))
      ? Math.max(0, Math.floor(Number((payload as any)?.transcriptSeq ?? scrollState.lastTranscriptSeq)))
      : null;
    const requestSeqRaw = (payload as any)?.requestSeq ?? scrollState.lastRequestSeq;
    const requestSeq = typeof requestSeqRaw === 'string' && String(requestSeqRaw).trim()
      ? String(requestSeqRaw).trim()
      : null;
    const shortLineCatchupDeniedReasonMatch = rawBlockedReason.match(/short_line_staged_catchup_not_selected:([a-z0-9_:-]+)/i);
    const deniedReason = shortLineCatchupDeniedReasonMatch?.[1]
      ? String(shortLineCatchupDeniedReasonMatch[1]).trim()
      : null;
    let blockedReason = rawBlockedReason;
    if (rawBlockedReasonLower.includes('audio_chunk_stale')) {
      blockedReason = 'commit_freshness_blocked_audio_chunk_stale';
    } else if (rawBlockedReasonLower.includes('short_line_staged_catchup_not_selected')) {
      blockedReason = deniedReason
        ? `short_line_staged_catchup_not_selected:${deniedReason}`
        : 'short_line_staged_catchup_not_selected';
    } else if (duplicate) {
      blockedReason = 'duplicate_final_suppressed';
    } else if (forward === true && local === false) {
      blockedReason = 'accepted_forward_match_not_local';
    } else if (sameLine) {
      blockedReason = 'same_line_no_commit';
    } else if (!rawBlockedReason) {
      blockedReason = 'unknown_non_commit';
    }

    try {
      console.warn('[ASR_COMMIT_LANE_NON_COMMIT]', {
        matchId: payload.matchId ?? null,
        source: payload.source,
        currentCommittedLine,
        candidateLine,
        acceptedLine: acceptedLineFromDriver,
        acceptedLineGap,
        sameLine,
        duplicate,
        replay,
        local,
        forward,
        noMatch,
        offScript: offscript,
        contradiction,
        audioChunkAgeMs,
        freshnessLimitMs,
        transcriptSeq,
        requestSeq,
        deniedReason,
        blockedReason,
        commitCountBefore,
        commitCountAfter,
      });
    } catch {}
  }, 80);
}

function markResultTimestamp(): void {
  lastResultTs = Date.now();
}

function setSpeechRunningActual(next: boolean, reason: string): void {
  const normalized = !!next;
  if (normalized && !activeRecognizer) {
    if (speechRunningActual) {
      speechRunningActual = false;
    }
    maybeLogLiveArmedDetachedInvariant(`setSpeechRunningActual:${reason}`);
    emitHudSnapshot(`speech-running-actual:blocked:${reason}`, { force: true });
    return;
  }
  if (speechRunningActual === normalized) return;
  speechRunningActual = normalized;
  emitHudSnapshot(`speech-running-actual:${reason}`, { force: true });
  emitAsrRuntimeStatus(`speech-running:${reason}`);
}

function clearLifecycleRestartTimer(): void {
  if (lifecycleRestartTimer != null) {
    try { window.clearTimeout(lifecycleRestartTimer); } catch {}
    lifecycleRestartTimer = null;
  }
}

function markWebSpeechLifecycle(
  eventName: string,
  event: Event,
  detail?: Record<string, unknown>,
): void {
  const now = Date.now();
  lastRecognizerLifecycleEvent = eventName;
  lastRecognizerLifecycleAt = now;
  if (eventName === 'onresult') {
    lastRecognizerOnResultTs = now;
    markResultTimestamp();
  }
  const session = getSession();
  const payload: Record<string, unknown> = {
    event: eventName,
    ts: now,
    mode: String(lastScrollMode || getScrollMode() || '').toLowerCase(),
    phase: String(session.phase || 'idle').toLowerCase(),
    asrArmed: !!session.asrArmed,
    speechRunning: !!running,
    speechRunningActual: !!speechRunningActual,
    recognizerAttached: !!activeRecognizer,
    ...detail,
  };
  try { window.__tpAsrLifecycleLast = payload; } catch {}
  try { window.__tpBus?.emit?.('tp:asr:lifecycle', payload); } catch {}
  try { window.dispatchEvent(new CustomEvent('tp:asr:lifecycle', { detail: payload })); } catch {}
  try { document.dispatchEvent(new CustomEvent('tp:asr:lifecycle', { detail: payload })); } catch {}
  if (isDevMode()) {
    try { console.info('[ASR_LIFECYCLE]', payload); } catch {}
  }
  if (eventName !== 'onresult') {
    emitAsrHeartbeat(`lifecycle:${eventName}`, { force: true });
  }
}

function isRestartableWebSpeechError(event: Event): boolean {
  const code = String((event as any)?.error || '').toLowerCase();
  if (!code) return true;
  if (code === 'not-allowed' || code === 'service-not-allowed') return false;
  return true;
}

function scheduleRecognizerLifecycleRestart(
  trigger: 'onend' | 'onaudioend' | 'onerror',
  opts?: { abortFirst?: boolean },
): void {
  if (!shouldAutoRestartSpeech()) return;
  if (lifecycleRestartTimer != null) return;
  const now = Date.now();
  const elapsed = now - lastLifecycleRestartAt;
  const delay = elapsed >= LIFECYCLE_RESTART_COOLDOWN_MS
    ? LIFECYCLE_RESTART_DELAY_MS
    : Math.max(LIFECYCLE_RESTART_DELAY_MS, LIFECYCLE_RESTART_COOLDOWN_MS - elapsed);
  lifecycleRestartTimer = window.setTimeout(() => {
    lifecycleRestartTimer = null;
    if (!shouldAutoRestartSpeech()) return;
    const abortFirst = opts?.abortFirst ?? false;
    const restarted = requestRecognizerRestart(`lifecycle:${trigger}`, {
      abortFirst,
    });
    if (restarted) {
      lastLifecycleRestartAt = Date.now();
      emitHudSnapshot(`recognition-restart:${trigger}`, { force: true });
      emitAsrHeartbeat(`restart:${trigger}`, { force: true });
      return;
    }
    emitAsrState('idle', `recognition-restart-failed:${trigger}`);
    running = false;
    setActiveRecognizer(null);
    emitHudSnapshot(`recognition-restart-failed:${trigger}`, { force: true });
  }, delay);
}

function stopSpeechWatchdog(): void {
  if (speechWatchdogTimer != null) {
    window.clearInterval(speechWatchdogTimer);
    speechWatchdogTimer = null;
  }
}

function startSpeechWatchdog(): void {
  stopSpeechWatchdog();
  speechWatchdogTimer = window.setInterval(() => {
    if (!shouldAutoRestartSpeech()) return;
    const mode = String(lastScrollMode || getScrollMode() || '').toLowerCase();
    const session = getSession();
    const phase = String(session.phase || '').toLowerCase();
    const asrArmed = !!session.asrArmed;
    // In live ASR, stall classifier + one-shot autorestart is the single recovery lane.
    // Keeping watchdog active here causes repeated 5s restarts that mask stall diagnosis.
    if (isLiveArmedAsr(mode, phase, asrArmed)) return;
    if (!activeRecognizer || typeof activeRecognizer.start !== 'function') return;
    const lastResultAt = Math.max(lastRecognizerOnResultTs, lastResultTs);
    const idleFor = Date.now() - (lastResultAt || 0);
    const thresholdMs = mode === 'hybrid' ? ASR_WATCHDOG_THRESHOLD_MS : WATCHDOG_THRESHOLD_MS;
    if (lastResultAt > 0 && idleFor > thresholdMs) {
      try { console.warn('[speech] watchdog: no results for', idleFor, 'ms; restarting recognition'); } catch {}
      const restarted = requestRecognizerRestart('idle-watchdog');
      if (!restarted) {
        emitAsrState('idle', 'recognition-watchdog-failed');
        running = false;
        setActiveRecognizer(null);
        emitHudSnapshot('watchdog-failed', { force: true });
        _showToast('ASR recovery failed: recognizer restart blocked.');
      } else {
        _showToast('ASR recovered (no results).');
      }
    }
  }, WATCHDOG_INTERVAL_MS);
}
function setActiveRecognizer(instance: RecognizerLike | null): void {
  const previousRecognizer = activeRecognizer;
  activeRecognizer = instance && typeof instance.start === 'function' ? instance : null;
  pendingManualRestartCount = 0;
  clearLifecycleRestartTimer();
  if (activeRecognizer) {
    if (!previousRecognizer || previousRecognizer !== activeRecognizer || lastRecognizerAttachedTs <= 0) {
      lastRecognizerAttachedTs = Date.now();
    }
    markResultTimestamp();
    startSpeechWatchdog();
    if (previousRecognizer !== activeRecognizer) {
      try {
        markWebSpeechLifecycle('attach', new Event('attach'), {
          reason: 'setActiveRecognizer',
        });
      } catch {}
    }
  } else {
    lastRecognizerAttachedTs = 0;
    stopSpeechWatchdog();
    setSpeechRunningActual(false, 'detach');
    if (previousRecognizer) {
      try {
        markWebSpeechLifecycle('detach', new Event('detach'), {
          reason: 'setActiveRecognizer:null',
        });
      } catch {}
    }
    maybeLogLiveArmedDetachedInvariant('setActiveRecognizer:null');
  }
  emitAsrRuntimeStatus(`recognizer:${activeRecognizer ? 'attach' : 'detach'}`);
}

function clearRecognizerHandlers(instance: any): void {
  if (!instance || typeof instance !== 'object') return;
  try { instance.onstart = null; } catch {}
  try { instance.onresult = null; } catch {}
  try { instance.onend = null; } catch {}
  try { instance.onerror = null; } catch {}
  try { instance.onspeechstart = null; } catch {}
  try { instance.onspeechend = null; } catch {}
  try { instance.onaudiostart = null; } catch {}
  try { instance.onaudioend = null; } catch {}
  try { instance.onsoundstart = null; } catch {}
  try { instance.onsoundend = null; } catch {}
  try { instance.onnomatch = null; } catch {}
  try { instance.__tpLifecycleAttached = false; } catch {}
  try { instance.__tpLifecycleOnResult = null; } catch {}
  try { instance.__tpLifecycleOnError = null; } catch {}
}

function stopAndAbortRecognizer(instance: any): void {
  if (!instance) return;
  clearRecognizerHandlers(instance);
  try { instance.abort?.(); } catch {}
  try { instance.stop?.(); } catch {}
}

function hardResetSpeechEngine(reason?: string): void {
  const why = String(reason || 'script-reset');
  suppressRecognizerAutoRestart = true;
  suppressAsrStallAutoRestart(`hard-reset:${why}`);
  asrSessionIntentActive = false;
  resetAsrInterimStabilizer();
  fallbackTranscriptMatchSeq = 0;
  lastResultTs = 0;
  lastRecognizerOnResultTs = 0;
  lastRecognizerAttachedTs = 0;
  lastAsrIngestTs = 0;
  lastAsrCommitTs = 0;
  lastAsrCommitCount = 0;
  pendingManualRestartCount = 0;
  lastAsrStallClass = '';
  clearAsrRunKey(`hard-reset:${why}`);
  clearLifecycleRestartTimer();
  stopSpeechWatchdog();
  stopAsrHeartbeat();

  const candidates = new Set<any>();
  const remember = (value: any) => {
    if (!value) return;
    candidates.add(value);
  };
  remember(activeRecognizer);
  remember(rec);
  try { remember(window.__tpGetActiveRecognizer?.()); } catch {}
  try { remember((window as any).recog); } catch {}
  try { remember((window as any).__tpRecognizer); } catch {}

  try { getTpSpeechNamespace()?.stopRecognizer?.(); } catch {}

  for (const recognizer of candidates) {
    stopAndAbortRecognizer(recognizer);
  }

  rec = null;
  setActiveRecognizer(null);
  running = false;
  currentActualSpeechEngine = '';
  currentFallbackReason = '';
  setSpeechRunningActual(false, 'hard-reset');
  asrBrainLogged = false;
  lastAsrBlockSyncAt = 0;
  lastAsrBlockSyncLogAt = 0;
  lastAsrBlockSyncCompleteFingerprint = '';
  lastAsrBlockSyncUnchangedAt = 0;
  lastAsrSyncLogAtByType = { 'block sync': 0, 'index sync': 0 };
  lastAsrSyncFingerprintByType = { 'block sync': '', 'index sync': '' };
  detachAsrScrollDriver();
  try { window.__tpMic?.releaseMic?.(); } catch {}
  try { (window as any).__tpEmitSpeech = undefined; } catch {}
  try { (window as any).__tpRecognizer = null; } catch {}
  try { (window as any).recog = null; } catch {}
  try { (window as any).currentIndex = 0; } catch {}
  try { (window as any).__lastScrollTarget = 0; } catch {}
  try { window.speechOn = false; } catch {}
  try { document.body.classList.remove('listening'); } catch {}
  try { window.HUD?.bus?.emit?.('speech:toggle', false); } catch {}
  setListeningUi(false);
  setReadyUi();
  try {
    window.dispatchEvent(
      new CustomEvent('tp:speech-state', { detail: { running: false, reason: `hard-reset:${why}` } }),
    );
  } catch {}
  emitHudSnapshot(`speech-hard-reset:${why}`, { force: true });
  emitAsrHeartbeat(`hard-reset:${why}`, { force: true });
}

function requestRecognizerRestart(
  reasonTag?: string,
  opts?: { abortFirst?: boolean },
): boolean {
  if (!activeRecognizer || typeof activeRecognizer.start !== 'function') return false;
  const reason = String(reasonTag || 'restart').trim() || 'restart';
  const abortFirst = opts?.abortFirst !== false;
  if (abortFirst) {
    pendingManualRestartCount += 1;
  }
  if (abortFirst) {
    try { activeRecognizer.abort?.(); } catch {}
  }
  try {
    activeRecognizer.start();
    try { window.debug?.({ tag: 'speech:recognizer:restart', reason, hasRecognizer: true }); } catch {}
    try { console.log('[speech] recognizer: restarted', { reason }); } catch {}
    return true;
  } catch (err) {
    if (abortFirst) {
      pendingManualRestartCount = Math.max(pendingManualRestartCount - 1, 0);
    }
    try { console.warn('[speech] recognizer: restart failed', { reason, err }); } catch {}
    return false;
  }
}

try {
  window.__tpGetActiveRecognizer = () => activeRecognizer;
  window.__tpHardResetSpeech = (reason?: string) => hardResetSpeechEngine(reason);
  window.__tpStopSpeechBackend = (reason?: string) => stopSpeechBackendForSession(reason);
} catch {}

let fallbackTranscriptMatchSeq = 0;
let __asrLastInterimText = '';
let __asrLastInterimAt = 0;
let __asrInterimRepeatCount = 0;

function resetAsrInterimStabilizer(): void {
  __asrLastInterimText = '';
  __asrLastInterimAt = 0;
  __asrInterimRepeatCount = 0;
}

function shouldPromoteInterimToFinal(text: string): boolean {
  const now = Date.now();
  const t = String(text || '').trim();
  if (!t) return false;

  const same = t === __asrLastInterimText;
  if (same && now - __asrLastInterimAt < 1200) {
    __asrInterimRepeatCount += 1;
  } else {
    __asrInterimRepeatCount = 0;
  }

  __asrLastInterimText = t;
  __asrLastInterimAt = now;

  if (__asrInterimRepeatCount >= 2) return true;
  if (t.length >= 60 && /[.!?]$/.test(t)) return true;
  if (t.length >= 90) return true;
  return false;
}

function normalizeComparableText(value: string): string {
  return normTokens(String(value || '')).join(' ');
}

const CUE_LINE_BRACKET_RE = /^\s*[\[(][^\])]{0,120}[\])]\s*$/;
const CUE_LINE_WORD_RE = /\b(pause|beat|silence|breath|breathe|hold|wait|reflective)\b/i;
const SPEAKER_TAG_ONLY_RE = /^\s*\[\s*\/?\s*(s1|s2|guest1|guest2|g1|g2)\s*\]\s*$/i;
const NOTE_TAG_ONLY_RE = /^\s*\[\s*\/?\s*note(?:[^\]]*)\]\s*$/i;
const NOTE_INLINE_BLOCK_RE = /^\s*\[\s*note(?:[^\]]*)\][\s\S]*\[\s*\/\s*note\s*\]\s*$/i;

function isCueOnlyLineText(value: string): boolean {
  const raw = String(value || '').trim();
  if (!raw) return true;
  const normalized = normalizeComparableText(raw);
  if (!normalized) return true;
  if (CUE_LINE_BRACKET_RE.test(raw)) return true;
  const tokenCount = normalized.split(' ').filter(Boolean).length;
  return tokenCount <= 4 && CUE_LINE_WORD_RE.test(normalized);
}

function isSpeakerTagOnlyLineText(value: string): boolean {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return SPEAKER_TAG_ONLY_RE.test(raw);
}

function isNoteOnlyLineText(value: string): boolean {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return NOTE_TAG_ONLY_RE.test(raw) || NOTE_INLINE_BLOCK_RE.test(raw) || /\[\s*\/?\s*note\b/i.test(raw);
}

function isSpeakableLineText(value: string): boolean {
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (isSpeakerTagOnlyLineText(raw)) return false;
  if (isNoteOnlyLineText(raw)) return false;
  if (isCueOnlyLineText(raw)) return false;
  return true;
}

function nextFallbackTranscriptMatchId(): string {
  fallbackTranscriptMatchSeq += 1;
  return `sl-${Date.now().toString(36)}-${fallbackTranscriptMatchSeq}`;
}

function normalizeRecognizerTranscriptPayload(input: unknown, defaultFinal: boolean): TranscriptPayload | null {
  if (typeof input === 'string') {
    const text = String(input || '');
    if (!text) return null;
    return {
      text,
      final: !!defaultFinal,
      isFinal: !!defaultFinal,
      timestamp: performance.now(),
      source: 'speech-loader',
      mode: lastScrollMode || getScrollMode(),
    };
  }
  if (!input || typeof input !== 'object') {
    const text = String(input || '');
    if (!text) return null;
    return {
      text,
      final: !!defaultFinal,
      isFinal: !!defaultFinal,
      timestamp: performance.now(),
      source: 'speech-loader',
      mode: lastScrollMode || getScrollMode(),
    };
  }
  const incoming = input as Record<string, unknown>;
  const textRaw = incoming.text ?? incoming.transcript ?? incoming.value;
  const text = typeof textRaw === 'string' ? textRaw : String(textRaw || '');
  if (!text) return null;
  const finalFromInput = incoming.isFinal ?? incoming.final;
  const final =
    typeof finalFromInput === 'boolean'
      ? finalFromInput
      : !!defaultFinal;
  return {
    ...(incoming as Partial<TranscriptPayload>),
    text,
    final,
    isFinal: final,
    timestamp: typeof incoming.timestamp === 'number' ? incoming.timestamp : performance.now(),
    source: typeof incoming.source === 'string' ? incoming.source : 'speech-loader',
    mode: typeof incoming.mode === 'string' ? incoming.mode : (lastScrollMode || getScrollMode()),
  } as TranscriptPayload;
}

function normalizeMatcherResult(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const bestIdxRaw = raw.bestIdx ?? raw.idx;
  const bestSimRaw = raw.bestSim ?? raw.sim;
  const bestIdx = Number.isFinite(Number(bestIdxRaw)) ? Math.floor(Number(bestIdxRaw)) : -1;
  const explicitNoMatch = raw.noMatch === true;
  const noMatch = explicitNoMatch || bestIdx < 0;
  const bestSim = Number.isFinite(Number(bestSimRaw)) ? Number(bestSimRaw) : undefined;
  const topScores = Array.isArray(raw.topScores)
    ? raw.topScores
    : (Array.isArray(raw.candidates) ? raw.candidates : []);
  const normalized: Record<string, unknown> = {
    ...raw,
    bestIdx: noMatch ? -1 : bestIdx,
    topScores,
    noMatch,
  };
  if (!noMatch && Number.isFinite(bestSim)) {
    normalized.bestSim = Number(bestSim);
  } else {
    delete normalized.bestSim;
    delete normalized.sim;
  }
  return normalized;
}

function tagMatchResult(
  result: Record<string, unknown> | null,
  via: 'backend' | 'backend_stub' | 'local_fallback',
): Record<string, unknown> | null {
  if (!result) return null;
  if (typeof result.via !== 'string' || !String(result.via)) {
    result.via = via;
  }
  if (via === 'local_fallback') {
    result.fallbackUsed = true;
  }
  return result;
}

function deriveDirectMatcherResult(
  transcript: string,
  speechStoreState?: any,
): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  const { matchTokens } = prepareMatcherInput(String(transcript || ''), normTokens);
  if (!matchTokens.length) return null;
  const adaptiveMultiLineMax =
    matchTokens.length <= DIRECT_MATCHER_SHORT_UTTERANCE_TOKEN_THRESHOLD
      ? DIRECT_MATCHER_SHORT_UTTERANCE_MULTI_LINE_MAX_LINES
      : DIRECT_MATCHER_MULTI_LINE_MAX_LINES;
  const blockSnapshot = getAsrBlockSnapshot();
  if (!(blockSnapshot.ready && blockSnapshot.count > 0)) {
    return null;
  }
  const w = window as any;
  const runtime = getMatcherRuntimeState({
    currentIndex:
      w.currentIndex ??
      speechStoreState?.currentIdx ??
      speechStoreState?.currentIndex ??
      0,
  });
  if (!runtime) return null;
  const { scriptWords, paraIndex, vParaIndex, cfg, currentIndex, viterbiState } = runtime;
  if (!scriptWords.length) {
    return null;
  }
  if (!paraIndex.length && !(Array.isArray(vParaIndex) && vParaIndex.length)) {
    return null;
  }
  try {
    const raw = runMatcherBatch(
      matchTokens,
      scriptWords,
      paraIndex,
      vParaIndex,
      cfg,
      currentIndex,
      viterbiState ?? undefined,
      {
        multiLineMinLines: DIRECT_MATCHER_MULTI_LINE_MIN_LINES,
        multiLineMaxLines: adaptiveMultiLineMax,
      },
    );
    const normalized = normalizeMatcherResult(raw);
    if (!normalized) return null;
    if (normalized.currentIdx == null) {
      normalized.currentIdx = currentIndex;
    }
    if (typeof normalized.reason !== 'string' || !normalized.reason) {
      normalized.reason = 'direct_matcher';
    }
    return tagMatchResult(normalized, 'local_fallback');
  } catch {
    return null;
  }
}

function deriveMatchForTranscriptText(
  transcript: string,
  speechStoreState?: any,
): Record<string, unknown> | null {
  const speechNs = getTpSpeechNamespace();
  const finalFlag = true;
  const isMatcherUnavailable = (result: Record<string, unknown> | null) =>
    !!result && result.noMatch === true && String(result.reason || '').toLowerCase() === 'matcher_unavailable';
  let unavailableResult: Record<string, unknown> | null = null;
  try {
    const matchOne = speechNs?.matchOne;
    if (typeof matchOne === 'function') {
      const result = tagMatchResult(normalizeMatcherResult(matchOne(transcript, finalFlag)), 'backend');
      if (result) {
        if (!isMatcherUnavailable(result)) return result;
        unavailableResult = tagMatchResult(result, 'backend_stub');
      }
    }
  } catch {}
  try {
    const matchBatchFn = speechNs?.matchBatch;
    if (typeof matchBatchFn === 'function') {
      const result = tagMatchResult(normalizeMatcherResult(matchBatchFn(transcript, finalFlag)), 'backend');
      if (result) {
        if (!isMatcherUnavailable(result)) return result;
        unavailableResult = tagMatchResult(result, 'backend_stub');
      }
    }
  } catch {}
  const directResult = deriveDirectMatcherResult(transcript, speechStoreState);
  if (directResult) {
    if (typeof directResult.primaryBypassReason !== 'string') {
      directResult.primaryBypassReason = unavailableResult?.reason || 'backend_unavailable_or_untrusted';
    }
    return directResult;
  }
  return unavailableResult;
}

function deriveFallbackMatch(payload: TranscriptPayload): Record<string, unknown> | null {
  const raw = payload as any;
  const speechStoreState = getTpSpeechStoreSnapshot();
  if (raw?.match && typeof raw.match === 'object') {
    return raw.match as Record<string, unknown>;
  }
  const bestIdxRaw = raw?.bestIdx ?? raw?.line ?? raw?.idx;
  const bestSimRaw = raw?.bestSim ?? raw?.sim ?? raw?.score;
  const explicitNoMatch = raw?.noMatch === true;
  const hasStructuredHint = Number.isFinite(Number(bestIdxRaw)) || explicitNoMatch;
  if (!hasStructuredHint) {
    const transcript = String(payload.text || '');
    const directResult = deriveMatchForTranscriptText(transcript, speechStoreState);
    if (directResult) {
      if (isDevMode() && shouldLogTag('ASR:matcher-fallback-direct', 2, 1500)) {
        try {
          console.info('[ASR] matcher fallback switched to direct matcher', {
            reason: directResult?.primaryBypassReason || null,
            bestIdx: Number.isFinite(Number(directResult.bestIdx)) ? Number(directResult.bestIdx) : -1,
            bestSim: Number.isFinite(Number(directResult.bestSim))
              ? Number(Number(directResult.bestSim).toFixed(3))
              : null,
          });
        } catch {}
      }
      return directResult;
    }
    return null;
  }
  const bestIdx = Number.isFinite(Number(bestIdxRaw)) ? Math.floor(Number(bestIdxRaw)) : -1;
  const noMatch = explicitNoMatch || bestIdx < 0;
  const bestSim = Number.isFinite(Number(bestSimRaw)) ? Number(bestSimRaw) : undefined;
  const topScores = Array.isArray(raw?.topScores)
    ? raw.topScores
    : (Array.isArray(raw?.candidates) ? raw.candidates : []);
  const currentIdxRaw =
    raw?.currentIdx ??
    (window as any)?.currentIndex ??
    (speechStoreState as any)?.currentIdx ??
    (speechStoreState as any)?.currentIndex;
  const currentIdx = Number.isFinite(Number(currentIdxRaw)) ? Math.floor(Number(currentIdxRaw)) : null;
  const result: Record<string, unknown> = {
    bestIdx: noMatch ? -1 : bestIdx,
    topScores,
    currentIdx,
    noMatch,
  };
  const reason = raw?.reason;
  if (typeof reason === 'string' && reason) {
    result.reason = reason;
  }
  if (!noMatch && Number.isFinite(bestSim)) {
    result.bestSim = Number(bestSim);
  }
  return result;
}

function enrichTranscriptPayloadForAsr(payload: TranscriptPayload): TranscriptPayload {
  const next: TranscriptPayload = { ...payload };
  next.activeAsrLane = activeAsrLane;
  const mode = String(next.mode || lastScrollMode || getScrollMode() || '').toLowerCase();
  const asrLike = mode === 'asr' || mode === 'hybrid';
  if (!asrLike) return next;
  if (next.runKey == null) {
    next.runKey = activeAsrRunKey || null;
  }
  if (next.runGeneration == null) {
    next.runGeneration = asrRunGeneration > 0 ? asrRunGeneration : null;
  }
  if (next.speechRunningActual == null) {
    next.speechRunningActual = !!speechRunningActual;
  }
  const rawText = typeof next.rawText === 'string' ? next.rawText : '';
  const assembledText = typeof next.assembledText === 'string' ? next.assembledText : String(next.text || '');
  if (!next.rawTextHash && rawText) next.rawTextHash = hashSpeechText(rawText);
  if (!next.assembledTextHash && assembledText) next.assembledTextHash = hashSpeechText(assembledText);
  if (!next.rawTextPreview && rawText) next.rawTextPreview = previewSpeechText(rawText);
  if (!next.assembledTextPreview && assembledText) next.assembledTextPreview = previewSpeechText(assembledText);
  const sourceRequestSeqs = normalizeSeqArray(next.sourceRequestSeqs);
  const supportingRawSeqs = normalizeSeqArray(next.supportingRawSeqs);
  const requestCaptureEvidence = normalizeRequestCaptureEvidence(next.requestCaptureEvidence);
  if (sourceRequestSeqs.length) next.sourceRequestSeqs = sourceRequestSeqs;
  if (supportingRawSeqs.length) next.supportingRawSeqs = supportingRawSeqs;
  if (requestCaptureEvidence.length) next.requestCaptureEvidence = requestCaptureEvidence;

  const match = deriveFallbackMatch(next);
  if (match && (!next.match || typeof next.match !== 'object')) {
    next.match = match;
  }
  const rawAndAssembledEquivalent =
    !!rawText &&
    !!assembledText &&
    next.rawTextHash != null &&
    next.assembledTextHash != null &&
    next.rawTextHash === next.assembledTextHash;
  const rawMatch =
    rawAndAssembledEquivalent
      ? (match ? { ...(match as Record<string, unknown>) } : null)
      : (rawText && rawText !== assembledText
        ? deriveMatchForTranscriptText(rawText, getTpSpeechStoreSnapshot())
        : null);
  if (rawMatch) {
    next.rawMatch = rawMatch;
  }

  const bestIdxRaw = (match as any)?.bestIdx;
  const assembledMatchIndex = resolveMatchBestIdxValue(match as Record<string, unknown> | null);
  const rawMatchIndex = resolveMatchBestIdxValue(rawMatch);
  const matchNoMatch = (match as any)?.noMatch === true;
  const hasForwardMatch = !matchNoMatch && Number.isFinite(Number(bestIdxRaw)) && Number(bestIdxRaw) >= 0;
  if (matchNoMatch) {
    next.noMatch = true;
  } else if (next.noMatch == null) {
    next.noMatch = matchNoMatch || !hasForwardMatch;
  }
  if (next.noMatch === true) {
    next.matchId = null;
  } else if (next.matchId == null || next.matchId === '') {
    next.matchId = next.noMatch ? null : nextFallbackTranscriptMatchId();
  }
  if (next.currentIdx == null) {
    const idxRaw = Number((window as any)?.currentIndex ?? (match as any)?.currentIdx);
    next.currentIdx = Number.isFinite(idxRaw) ? Math.max(0, Math.floor(idxRaw)) : null;
  }
  if (next.line == null && hasForwardMatch) {
    next.line = Math.floor(Number(bestIdxRaw));
  }
  const simRaw = (match as any)?.bestSim ?? (payload as any)?.bestSim;
  if (next.noMatch !== true && next.sim == null && Number.isFinite(Number(simRaw))) {
    next.sim = Number(simRaw);
  }
  if (next.noMatch === true) {
    if (next.sim != null) delete (next as any).sim;
    if (next.match && typeof next.match === 'object') {
      const normalizedMatch: Record<string, unknown> = {
        ...(next.match as Record<string, unknown>),
        noMatch: true,
        bestIdx: -1,
      };
      delete normalizedMatch.bestSim;
      delete normalizedMatch.sim;
      next.match = normalizedMatch;
    }
  }
  if (next.candidates == null && Array.isArray((match as any)?.topScores)) {
    next.candidates = (match as any).topScores;
  }
  next.assembledText = assembledText;
  if (rawText) next.rawText = rawText;
  next.assembledMatchIndex = assembledMatchIndex;
  next.rawMatchIndex = rawAndAssembledEquivalent ? assembledMatchIndex : rawMatchIndex;
  if (rawAndAssembledEquivalent && rawMatchIndex != null && rawMatchIndex !== assembledMatchIndex) {
    try {
      console.warn('[speech-loader] raw-assembled-match-invariant-fault', JSON.stringify({
        rawTextHash: next.rawTextHash ?? null,
        assembledTextHash: next.assembledTextHash ?? null,
        rawMatchIndex,
        assembledMatchIndex,
      }));
    } catch {}
  }
  const requestCaptureVerdict =
    requestCaptureEvidence.length > 0
      ? (requestCaptureEvidence.every((entry) => entry.verdict === 'voice_detected')
        ? 'voice_detected'
        : (requestCaptureEvidence.some((entry) => entry.verdict === 'silence_detected')
          ? 'silence_detected'
          : 'unknown'))
      : 'unknown';
  next.requestCaptureVerdict = requestCaptureVerdict;
  if (next.captureActivityVerdict == null) {
    next.captureActivityVerdict =
      requestCaptureVerdict === 'voice_detected'
        ? 'provenance_safe + capture_activity_present'
        : (requestCaptureVerdict === 'silence_detected'
          ? 'raw_provider_text_during_verified_silence'
          : 'capture_activity_unavailable');
  }
  if (next.captureActivityEvidence == null) {
    next.captureActivityEvidence = {
      runtimeSpeechFresh: false,
      vadSpeechFresh: false,
      speechRunningActual: !!next.speechRunningActual,
      silenceActive: false,
      captureEvidenceAvailable: false,
      requestCaptureVoiceDetected: requestCaptureVerdict === 'voice_detected',
      requestCaptureUnknown: requestCaptureVerdict === 'unknown',
      requestCaptureSilenceDetected: requestCaptureVerdict === 'silence_detected',
      requestCaptureSeqCount: requestCaptureEvidence.length,
    };
  }
  const lineageSeqs = supportingRawSeqs.length ? supportingRawSeqs : sourceRequestSeqs;
  next.forwardMatchCreatedByAssembly =
    !rawAndAssembledEquivalent &&
    assembledMatchIndex != null &&
    rawMatchIndex !== assembledMatchIndex &&
    lineageSeqs.length <= 1;
  return next;
}

function routeRecognizerTranscript(input: unknown, defaultFinal: boolean): void {
  const payload = normalizeRecognizerTranscriptPayload(input, defaultFinal);
  if (!payload) return;
  try {
    console.info('[speech-loader] bridge-input', JSON.stringify({
      source: payload.source ?? null,
      final: Boolean(payload.isFinal ?? payload.final ?? defaultFinal),
      transcriptSeq: payload.transcriptSeq ?? null,
      requestSeq: payload.requestSeq ?? null,
      rawTextHash: payload.rawTextHash ?? (payload.rawText ? hashSpeechText(payload.rawText) : null),
      rawTextPreview: payload.rawTextPreview ?? (payload.rawText ? previewSpeechText(payload.rawText, 60) : null),
      assembledTextHash: payload.assembledTextHash ?? (payload.assembledText ? hashSpeechText(payload.assembledText) : null),
      assembledTextPreview: payload.assembledTextPreview ?? (payload.assembledText ? previewSpeechText(payload.assembledText, 60) : null),
      sourceRequestSeqs: normalizeSeqArray(payload.sourceRequestSeqs),
      supportingRawSeqs: normalizeSeqArray(payload.supportingRawSeqs),
      requestCaptureVerdict: payload.requestCaptureVerdict ?? null,
      promptIncluded: payload.promptIncluded === true,
      promptHash: payload.promptHash ?? null,
    }));
  } catch {}
  routeTranscript(payload, Boolean(payload.isFinal ?? payload.final ?? defaultFinal));
}

// Small router to bridge transcripts to both legacy and modern paths
function routeTranscript(input: string | (Partial<TranscriptPayload> & { text?: string }), isFinal?: boolean): void {
  try {
    const incoming = typeof input === 'string' ? null : input;
    const inputText = typeof input === 'string' ? input : '';
    const finalFlag =
      typeof isFinal === 'boolean'
        ? isFinal
        : Boolean(incoming?.isFinal ?? incoming?.final);
    const payload: TranscriptPayload = incoming ? { ...(incoming as TranscriptPayload) } : {
      text: inputText,
      final: !!finalFlag,
      isFinal: !!finalFlag,
      timestamp: performance.now(),
      source: 'speech-loader',
      mode: lastScrollMode || getScrollMode(),
    };
    const text = typeof payload.text === 'string'
      ? payload.text
      : inputText;
    if (!text) return;
    markResultTimestamp();
    if (payload.text == null) payload.text = text;
    if (payload.final == null) payload.final = !!finalFlag;
    if (payload.isFinal == null) payload.isFinal = !!finalFlag;
    if (payload.timestamp == null) payload.timestamp = performance.now();
    if (payload.source == null) payload.source = 'speech-loader';
    if (payload.mode == null) payload.mode = lastScrollMode || getScrollMode();
    const rawFinal = Boolean(payload.isFinal ?? payload.final ?? finalFlag);
    const normalizedMode = String(payload.mode || '').toLowerCase();
    const asrLike = normalizedMode === 'asr' || normalizedMode === 'hybrid';
    const promotedFinal = rawFinal || (asrLike ? shouldPromoteInterimToFinal(text) : false);
    if (rawFinal) {
      resetAsrInterimStabilizer();
    }
    payload.final = promotedFinal;
    payload.isFinal = promotedFinal;
    const enriched = enrichTranscriptPayloadForAsr(payload);
    try {
      console.info('[speech-loader] transcript-route', JSON.stringify({
        source: enriched.source ?? null,
        final: Boolean(enriched.isFinal ?? enriched.final ?? promotedFinal),
        transcriptSeq: enriched.transcriptSeq ?? null,
        requestSeq: enriched.requestSeq ?? null,
        rawTextHash: enriched.rawTextHash ?? null,
        rawTextPreview: enriched.rawTextPreview ?? null,
        assembledTextHash: enriched.assembledTextHash ?? null,
        assembledTextPreview: enriched.assembledTextPreview ?? null,
        rawMatchIndex: enriched.rawMatchIndex ?? null,
        assembledMatchIndex: enriched.assembledMatchIndex ?? null,
        forwardMatchCreatedByAssembly: enriched.forwardMatchCreatedByAssembly === true,
        requestCaptureVerdict: enriched.requestCaptureVerdict ?? null,
        captureActivityVerdict: enriched.captureActivityVerdict ?? null,
      }));
    } catch {}
    const eventFinal = Boolean(enriched.isFinal ?? enriched.final ?? promotedFinal);
    if (eventFinal && asrLike) {
      const duplicateOpportunity = resolveDuplicateFinalCommitOpportunity(enriched as TranscriptPayload);
      if (duplicateOpportunity.reason !== 'not_duplicate') {
        try {
          console.info('[ASR_DUPLICATE_FINAL_COMMIT_OPPORTUNITY]', duplicateOpportunity);
        } catch {}
      }
      if (duplicateOpportunity.suppressed) {
        try {
          console.info('[ASR] suppressed duplicate final transcript window', {
            mode: normalizedMode,
            dedupWindowMs: ASR_FINAL_NOVELTY_DEDUP_WINDOW_MS,
            stage: duplicateOpportunity.stage,
            reason: duplicateOpportunity.reason,
          });
        } catch {}
        return;
      }
      const normalizedFinal = normalizeTranscriptForNovelty(text).join(' ');
      if (normalizedFinal) {
        lastEmittedFinalTranscriptNorm = normalizedFinal;
        lastEmittedFinalTranscriptAt = Date.now();
      }
    }
    if (eventFinal && !firstTranscriptFinalMatcherDiagnosticEmitted) {
      firstTranscriptFinalMatcherDiagnosticEmitted = true;
      ensureTsPrimaryMatcherNamespace('first_transcript_final');
      emitTsPrimaryMatcherProviderDiagnostic('first_transcript_final');
    }
    try {
      console.debug(
        '[ASR_ROUTE] keys=',
        Object.keys(enriched as Record<string, unknown>),
        'matchId=',
        (enriched as any).matchId,
        'noMatch=',
        (enriched as any).noMatch,
      );
    } catch {}

    // Always emit to HUD bus (unconditional for debugging/monitoring)
    try { window.HUD?.bus?.emit?.(eventFinal ? 'speech:final' : 'speech:partial', enriched); } catch {}
    try {
      console.info('[speech-loader] speech-final', JSON.stringify({
        event: eventFinal ? 'speech:final' : 'speech:partial',
        transcriptSeq: enriched.transcriptSeq ?? null,
        requestSeq: enriched.requestSeq ?? null,
        rawTextHash: enriched.rawTextHash ?? null,
        assembledTextHash: enriched.assembledTextHash ?? null,
        rawMatchIndex: enriched.rawMatchIndex ?? null,
        assembledMatchIndex: enriched.assembledMatchIndex ?? null,
        forwardMatchCreatedByAssembly: enriched.forwardMatchCreatedByAssembly === true,
        requestCaptureVerdict: enriched.requestCaptureVerdict ?? null,
        captureActivityVerdict: enriched.captureActivityVerdict ?? null,
      }));
    } catch {}

    pushAsrTranscript(text, eventFinal, enriched as any);

    // In rehearsal, never steer; only HUD logging
    if (inRehearsal()) return;

    // Legacy monolith path
    if (typeof window.advanceByTranscript === 'function') {
      try { window.advanceByTranscript(text, !!eventFinal); } catch {}
    }

    // Dispatch window event only when gated (ASR/Hybrid mode + mic active)
    if (shouldEmitTranscript()) {
      try { (enriched as any).__tpDirectIngest = true; } catch {}
      logTranscriptEmitDebug(enriched);
      scheduleAcceptedTranscriptNoCommitDiagnostic(enriched);
      emitTranscriptEvent(enriched);
    }
  } catch {}
}

// (dynamic import of '/dist/speech/orchestrator.real.js' is performed inline where needed)

// Minimal Web Speech fallback
function _startWebSpeech(): { stop: () => void } | null {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    try { console.warn('[speech] Web Speech not available'); } catch {}
    return { stop: () => {} };
  }
  const r = new SR();
  r.continuous = true;
  r.interimResults = true;
  r.lang = 'en-US';
  attachWebSpeechLifecycle(r, {
    onError: (e: Event) => { try { console.warn('[speech] error', e); } catch {} },
  });
  setActiveRecognizer(r);
  try { r.start(); } catch {}
  return { stop: () => { try { r.stop(); } catch {} } };
}

function setReadyUi(): void {
  try {
    const btn = document.getElementById('recBtn') as HTMLButtonElement | null;
    const chip = document.getElementById('speechStatus') || document.getElementById('recChip');
    if (btn) {
      btn.disabled = false;
      btn.title = 'Start speech sync';
      try { btn.textContent = 'Start speech sync'; } catch {}
    }
    if (chip) chip.textContent = 'Speech: ready';
    try { document.body.classList.add('speech-ready'); } catch {}
  } catch {}
}

function _setUnsupportedUi(): void {
  try {
    const btn = document.getElementById('recBtn') as HTMLButtonElement | null;
    const chip = document.getElementById('speechStatus') || document.getElementById('recChip');
    if (btn) {
      btn.disabled = true;
      btn.title = 'Speech not supported in this browser';
    }
    if (chip) chip.textContent = 'Speech: unsupported';
    try { document.body.classList.remove('speech-ready', 'speech-listening', 'listening'); } catch {}
  } catch {}
}

// Update UI when speech is actively listening or stopped
function setListeningUi(listening: boolean): void {
  try {
    const btn = document.getElementById('recBtn') as HTMLButtonElement | null;
    const chip = document.getElementById('speechStatus') || document.getElementById('recChip');
    if (btn) {
      // Keep the button enabled/disabled state managed by callers; update labels
      btn.title = listening ? 'Stop speech sync' : 'Start speech sync';
      try { btn.textContent = listening ? 'Stop speech sync' : 'Start speech sync'; } catch {}
    }
    if (chip) chip.textContent = listening ? 'Speech: listening' : 'Speech: ready';
    try {
      if (listening) {
        document.body.classList.add('listening');
      } else {
        document.body.classList.remove('listening');
      }
    } catch {}
  } catch {}
}

// … (keep your existing helper functions unchanged above installSpeech)

function _beginCountdownThen(sec: number, cb: () => Promise<void> | void, source = 'speech'): Promise<void> {
  // Run a simple seconds countdown (emit optional HUD events) then call the callback.
  // Resolves even if the callback throws; non-blocking and tolerant to environment failures.
  // Overlay helpers (local so they don't leak globals if loader is re-imported)
  function showPreroll(n: number) {
    try {
      const overlay = document.getElementById('countOverlay');
      const num = document.getElementById('countNum');
      if (overlay) overlay.style.display = 'flex';
      if (num) num.textContent = String(n);
      // Send to display window if available
      if (typeof window.sendToDisplay === 'function') {
        window.sendToDisplay({ type: 'preroll', show: true, n });
      }
    } catch {}
  }
  function hidePreroll() {
    try {
      const overlay = document.getElementById('countOverlay');
      if (overlay) overlay.style.display = 'none';
      // Send to display window if available
      if (typeof window.sendToDisplay === 'function') {
        window.sendToDisplay({ type: 'preroll', show: false });
      }
    } catch {}
  }
  return new Promise((resolve) => {
    (async () => {
      let done = false;
      try {
        const s = Number(sec) || 0;
        if (s <= 0) {
          hidePreroll();
          try { await cb(); } catch {}
          completePrerollSession({ seconds: s, source });
          done = true;
          return;
        }
        for (let i = s; i > 0; i--) {
          showPreroll(i);
          try { window.HUD?.bus?.emit?.('speech:countdown', { remaining: i }); } catch {}
          await new Promise(r => setTimeout(r, 1000));
        }
        hidePreroll();
        try { await cb(); } catch {}
        completePrerollSession({ seconds: s, source });
        done = true;
      } catch {}
      finally {
        if (!done) hidePreroll();
      }
    })().then(() => resolve()).catch(() => { try { hidePreroll(); } catch {}; resolve(); });
  });
}

function emitAsrState(state: string, reason?: string): void {
  currentAsrState = state || 'idle';
  const payload = { state, reason };
  try { window.__tpBus?.emit?.('tp:asr:state', payload); } catch {}
  try { window.dispatchEvent(new CustomEvent('tp:asr:state', { detail: payload })); } catch {}
  try { document.dispatchEvent(new CustomEvent('tp:asr:state', { detail: payload })); } catch {}
  emitHudSnapshot(`asr-state:${String(state || '').toLowerCase() || 'unknown'}`);
  emitAsrHeartbeat(`state:${String(state || '').toLowerCase() || 'unknown'}`, { force: true });
  emitAsrRuntimeStatus(`state:${String(state || '').toLowerCase() || 'unknown'}`);
}

function shouldAutoRestartSpeech(): boolean {
  if (suppressRecognizerAutoRestart) return false;
  const mode = String(lastScrollMode || getScrollMode() || '').toLowerCase();
  rememberMode(mode);
  if (!isAutoRestartEnabled()) return false;
  const session = getSession();
  const phase = String(session.phase || '').toLowerCase();
  const recognizerActive = !!activeRecognizer || !!speechRunningActual;
  if (mode === 'hybrid') {
    return running || recognizerActive;
  }
  if (mode !== 'asr') return false;
  if (!session.asrArmed) return false;
  if (phase === 'live') {
    return running || recognizerActive;
  }
  return running;
}

function isDevMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const w = window as any;
    if (w.__TP_DEV || w.__TP_DEV1 || w.__tpDevMode) return true;
    if (w.localStorage?.getItem('tp_dev_mode') === '1') return true;
    const params = new URLSearchParams(window.location.search || '');
    if (params.has('dev')) return true;
    const hash = (window.location.hash || '').replace(/^#/, '').toLowerCase();
    if (hash === 'dev' || hash === 'dev=1' || hash.includes('dev=1')) return true;
  } catch {}
  return false;
}

function installAsrHudDev(): void {
  if (!isDevMode()) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const w = window as any;
  if (w.__tpAsrHudInstalled) return;
  w.__tpAsrHudInstalled = true;

  const mountHud = () => {
    if (!document.body || document.getElementById('__tpAsrHud')) return;
    const HUD_HIDDEN_KEY = 'tp_dev_asr_hud_hidden_v1';
    const readHidden = () => {
      try { return window.localStorage?.getItem(HUD_HIDDEN_KEY) === '1'; } catch { return false; }
    };
    const writeHidden = (hidden: boolean) => {
      try { window.localStorage?.setItem(HUD_HIDDEN_KEY, hidden ? '1' : '0'); } catch {}
    };

    const el = document.createElement('div');
    el.id = '__tpAsrHud';
    el.style.cssText = [
      'position:fixed; right:8px; bottom:8px; z-index:999999;',
      'background:rgba(0,0,0,0.75); color:#9ef; padding:10px 12px;',
      'font:12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;',
      'border:1px solid rgba(255,255,255,0.15); border-radius:10px;',
      'max-width:420px; white-space:pre; pointer-events:auto;',
    ].join(' ');
    const textEl = document.createElement('pre');
    textEl.style.cssText = 'margin:0;padding-top:18px;pointer-events:none;';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Hide HUD';
    closeBtn.title = 'Close ASR HUD (Esc)';
    closeBtn.style.cssText = [
      'position:absolute;top:6px;right:8px;z-index:1;',
      'border:1px solid rgba(255,255,255,0.25);background:rgba(0,0,0,0.4);color:#cfe8ff;',
      'border-radius:6px;padding:2px 6px;font-size:11px;cursor:pointer;',
    ].join('');
    el.style.position = 'fixed';
    el.appendChild(closeBtn);
    el.appendChild(textEl);

    const reopenBtn = document.createElement('button');
    reopenBtn.id = '__tpAsrHudReopen';
    reopenBtn.type = 'button';
    reopenBtn.textContent = 'Show ASR HUD';
    reopenBtn.title = 'Show ASR HUD';
    reopenBtn.style.cssText = [
      'position:fixed;right:8px;top:64px;z-index:2147483000;',
      'border:1px solid rgba(255,255,255,0.25);background:rgba(0,0,0,0.65);color:#cfe8ff;',
      'border-radius:8px;padding:4px 8px;font-size:11px;cursor:pointer;display:none;',
    ].join('');
    document.body.appendChild(el);
    document.body.appendChild(reopenBtn);
    const formatBool = (value: unknown) => (value ? 'true' : 'false');
    const formatAge = (ts: number | null | undefined) => {
      if (!Number.isFinite(Number(ts)) || Number(ts) <= 0) return '-';
      const age = Math.max(0, Date.now() - Number(ts));
      return `${Math.round(age)}ms`;
    };
    const render = (snap: HudSnapshotPayload) => {
      textEl.textContent =
`ASR HUD
href: ${location.pathname}${location.search}${location.hash}
scrollMode: ${snap.scrollMode || 'unknown'}
sessionPhase: ${snap.sessionPhase || 'idle'}
speechRunning: ${formatBool(snap.speechRunning)}
speechRunningActual: ${formatBool(snap.speechRunningActual)}
asrDesired: ${formatBool(snap.asrDesired)}
asrArmed: ${formatBool(snap.asrArmed)}

driver: ${snap.driver ? 'YES' : 'NO'}
driverId: ${snap.driverId || 'none'}
lastLineIndex: ${snap.lastLineIndex ?? '-'}
lastOnResult: ${formatAge(snap.lastOnResultTs)}
lastIngest: ${formatAge(snap.lastIngestTs)}
lastCommit: ${formatAge(snap.lastCommitTs)}
`;
    };

    const onSnapshot = (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      if (!detail || typeof detail !== 'object') return;
      render(detail as HudSnapshotPayload);
    };
    const dismiss = () => {
      el.style.display = 'none';
      reopenBtn.style.display = '';
      writeHidden(true);
    };
    const showHud = () => {
      el.style.display = '';
      reopenBtn.style.display = 'none';
      writeHidden(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismiss();
        return;
      }
      // Global recovery toggle: Ctrl+Shift+H
      if (event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && String(event.key || '').toLowerCase() === 'h') {
        event.preventDefault();
        if (el.style.display === 'none') showHud();
        else dismiss();
      }
    };
    const layoutHud = () => {
      const base = 8;
      let rightInset = base;
      let bottomInset = base;
      let topInset = 64;
      try {
        const drawer = document.getElementById('tp-dev-drawer') as HTMLElement | null;
        if (drawer && drawer.getAttribute('data-open') === 'true') {
          const dock = String(drawer.getAttribute('data-dock') || '').toLowerCase();
          const rect = drawer.getBoundingClientRect();
          if (dock === 'right') {
            rightInset = Math.max(base, Math.round(rect.width + 16));
          } else if (dock === 'bottom') {
            topInset = 16;
            bottomInset = Math.max(base, Math.round(rect.height + 16));
          }
        }
      } catch {}
      try {
        el.style.right = `${rightInset}px`;
        el.style.bottom = `${bottomInset}px`;
      } catch {}
      try {
        reopenBtn.style.right = `${rightInset}px`;
        reopenBtn.style.top = `${topInset}px`;
      } catch {}
    };
    closeBtn.addEventListener('click', dismiss);
    reopenBtn.addEventListener('click', showHud);
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('resize', layoutHud, { passive: true });
    window.addEventListener('orientationchange', layoutHud);
    window.addEventListener('tp:asr:lane-change', layoutHud as EventListener);
    window.addEventListener('click', () => { window.setTimeout(layoutHud, 0); }, true);

    try { window.addEventListener('tp:hud:snapshot', onSnapshot, { capture: false }); } catch {}
    render(buildHudSnapshot('dev-hud:init'));
    layoutHud();
    if (readHidden()) {
      dismiss();
    }
    window.setInterval(() => {
      render(buildHudSnapshot('dev-hud:poll'));
    }, 250);
  };

  if (document.body) {
    mountHud();
    return;
  }

  try {
    window.addEventListener('DOMContentLoaded', mountHud, { once: true });
  } catch {}
}

const SPEAKER_SLOTS: SpeakerSlot[] = ['s1', 's2', 'g1', 'g2'];
const SPEAKER_NAME_SELECTORS: Record<SpeakerSlot, string> = {
  s1: '#name-s1',
  s2: '#name-s2',
  g1: '#name-g1',
  g2: '#name-g2',
};

const DEFAULT_SPEAKER_LABELS: Record<SpeakerSlot, string> = {
  s1: 'Speaker 1',
  s2: 'Speaker 2',
  g1: 'Guest 1',
  g2: 'Guest 2',
};

function getSpeakerName(slot: SpeakerSlot): string {
  try {
    const selector = SPEAKER_NAME_SELECTORS[slot];
    const input = document.querySelector<HTMLInputElement>(selector);
    const value = input?.value?.trim();
    if (value) return value;
  } catch {}
  return DEFAULT_SPEAKER_LABELS[slot] || slot.toUpperCase();
}

function ensureProfileForSlot(slot: SpeakerSlot): ReturnType<typeof createProfile> {
  const bindings = getSpeakerBindings();
  const existingId = bindings[slot] || null;
  const profile = getProfile(existingId);
  if (profile) return profile;
  const created = createProfile(getSpeakerName(slot));
  applyProfileToSlot(slot, created.id);
  return created;
}

const LOWER_GUARDS = [
  'low_sim',
  'low_sim_wait',
  'no_match',
  'no_match_pipeline',
  'min_evidence',
];
const RAISE_GUARDS = [
  'tie_forward',
  'forward_outrun',
  'forward_progress',
  'forward_bias',
];

function clampCandidate(value: number): number {
  return Math.max(0.25, Math.min(0.85, clamp01(value)));
}

let summaryListenerAttached = false;

function computeCandidateDelta(guardCounts?: Record<string, number>): number {
  if (!guardCounts) return 0;
  const lowerHits = LOWER_GUARDS.reduce((sum, key) => sum + (guardCounts[key] || 0), 0);
  const raiseHits = RAISE_GUARDS.reduce((sum, key) => sum + (guardCounts[key] || 0), 0);
  if (lowerHits >= 3) return -0.01;
  if (raiseHits >= 3) return 0.01;
  return 0;
}

function handleAsrSummary(summary: Record<string, any> | undefined): void {
  if (!summary) return;
  const mode = (summary.mode || '').toLowerCase();
  if (!['asr', 'hybrid'].includes(mode)) return;
  const commitCount = typeof summary.commitCount === 'number' ? summary.commitCount : 0;
  if (commitCount < 4) return;
  const guardCounts = summary.guardCounts as Record<string, number> | undefined;
  const delta = computeCandidateDelta(guardCounts);
  if (!delta) return;
  const slot = getActiveSpeakerSlot();
  const profile = ensureProfileForSlot(slot);
  const existing = profile.asrTweaks?.candidateMinSim ?? DEFAULT_ASR_THRESHOLDS.candidateMinSim;
  const next = clampCandidate(existing + delta);
  if (Math.abs(next - existing) < 1e-6) return;
  setProfileAsrTweaks(profile.id, {
    ...(profile.asrTweaks || {}),
    candidateMinSim: next,
  });
  if (isDevMode()) {
    console.debug('[ASR] summary auto-tune', { slot, delta, next, guardCounts });
  }
}

function attachSummaryListener(): void {
  if (summaryListenerAttached || typeof window === 'undefined') return;
  summaryListenerAttached = true;
  try {
    window.addEventListener('tp:asr:summary', (event) => {
      handleAsrSummary((event as CustomEvent)?.detail);
    });
  } catch {}
}

function autoSaveSpeakerPatchesAfterStop(mode: string | null | undefined): void {
  if (typeof document === 'undefined') return;
  const normalizedMode = (mode || '').toLowerCase();
  if (!['asr', 'hybrid'].includes(normalizedMode)) return;
  const patches = getSessionLearnedPatches();
  const bindingsBefore = getSpeakerBindings();
  const createdSlots: SpeakerSlot[] = [];
  for (const slot of SPEAKER_SLOTS) {
    if (!bindingsBefore[slot]) {
      ensureProfileForSlot(slot);
      createdSlots.push(slot);
    } else {
      ensureProfileForSlot(slot);
    }
  }

  if (isDevMode()) {
    console.debug('[ASR] autoSaveSpeakerPatchesAfterStop', {
      mode: normalizedMode,
      patches: Object.fromEntries(
        SPEAKER_SLOTS.map((slot) => [slot, Object.keys(patches[slot] || {})]),
      ),
      createdSlots,
    });
  }

  for (const slot of SPEAKER_SLOTS) {
    const patch = patches[slot];
    if (!patch || !Object.keys(patch).length) continue;
    const profile = ensureProfileForSlot(slot);
    setProfileAsrTweaks(profile.id, {
      ...(profile.asrTweaks || {}),
      ...patch,
    });
    if (isDevMode()) {
      console.debug('[ASR] saved patch', slot, Object.keys(patch));
    }
  }
}

function isSettingsHydrating(): boolean {
  try { return !!(window as any).__tpSettingsHydrating; } catch { return false; }
}

function parsePx(value: string | null | undefined): number {
  const parsed = Number.parseFloat(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getMarkerOffset(viewer: HTMLElement | null, root: HTMLElement | null) {
  const markerPct = typeof (window as any).__TP_MARKER_PCT === 'number'
    ? (window as any).__TP_MARKER_PCT
    : 0.4;
  const host = viewer || root;
  const hostHeight = host?.clientHeight || 0;
  const markerOffset = Math.max(0, Math.round(hostHeight * markerPct));
  return { markerPct, host, hostHeight, markerOffset };
}

function checkAsrLayoutReady() {
  const viewer = getPrimaryScroller();
  const root = getScriptRoot() || viewer;
  const container = root || viewer;
  if (!container) return { ready: false, reason: 'no-container' as const };
  const lineEl = container.querySelector<HTMLElement>('.line');
  if (!lineEl) return { ready: false, reason: 'no-lines' as const };
  const lineHeight = lineEl.offsetHeight || lineEl.clientHeight || 0;
  if (lineHeight <= 0) return { ready: false, reason: 'line-height' as const, lineHeight };
  const { markerPct, host, hostHeight, markerOffset } = getMarkerOffset(viewer, root);
  if (!host || hostHeight <= 0) {
    return { ready: false, reason: 'host-height' as const, hostHeight, markerPct };
  }
  const rootPadding = root ? parsePx(getComputedStyle(root).paddingTop) : 0;
  const viewerScrollPadding = viewer ? parsePx(getComputedStyle(viewer).scrollPaddingTop) : 0;
  const paddingReady =
    markerOffset <= 0 ||
    Math.abs(rootPadding - markerOffset) <= 1 ||
    Math.abs(viewerScrollPadding - markerOffset) <= 1;
  if (!paddingReady) {
    return {
      ready: false,
      reason: 'marker-padding' as const,
      markerOffset,
      rootPadding,
      viewerScrollPadding,
      markerPct,
      hostHeight,
    };
  }
  return {
    ready: true,
    markerOffset,
    lineHeight,
    markerPct,
    hostHeight,
  };
}

const ASR_LAYOUT_READY_MAX_MS = 1200;
let pendingLayoutReady: Promise<boolean> | null = null;

async function waitForAsrLayoutReady(reason?: string): Promise<boolean> {
  if (typeof window === 'undefined') return true;
  if (pendingLayoutReady) return pendingLayoutReady;
  pendingLayoutReady = (async () => {
    const raf = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16);
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let lastCheck = checkAsrLayoutReady();
    while (!lastCheck.ready) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - start >= ASR_LAYOUT_READY_MAX_MS) break;
      await new Promise<void>((resolve) => raf(() => resolve()));
      lastCheck = checkAsrLayoutReady();
    }
    if (!lastCheck.ready) {
      try {
        console.warn('[ASR] layout not ready', {
          reason,
          cause: lastCheck.reason,
          ...lastCheck,
        });
      } catch {}
    }
    return lastCheck.ready;
  })();
  try {
    return await pendingLayoutReady;
  } finally {
    pendingLayoutReady = null;
  }
}

function computeMarkerLineIndex(): number {
  try {
    const viewer = getPrimaryScroller();
    const root = getScriptRoot() || viewer;
    const container = viewer || root;
    const lineEls = Array.from(
      (container || document).querySelectorAll<HTMLElement>('.line'),
    );
    if (!lineEls.length) return 0;
    const scroller =
      getRuntimeScroller() ||
      resolveActiveScroller(viewer, root || getScrollerEl('main') || getScrollerEl('display'));
    const scrollTop = scroller?.scrollTop ?? 0;
    const firstLineHeight = lineEls[0].offsetHeight || lineEls[0].clientHeight || 0;
    const topEpsilon = Math.max(24, firstLineHeight * 0.5);
    if (scrollTop <= topEpsilon) return 0;
    const markerPct = typeof (window as any).__TP_MARKER_PCT === 'number'
      ? (window as any).__TP_MARKER_PCT
      : 0.4;
    const host = scroller || container;
    const rect = host ? host.getBoundingClientRect() : document.documentElement.getBoundingClientRect();
    const markerY = rect.top + (host ? host.clientHeight : window.innerHeight) * markerPct;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < lineEls.length; i++) {
      const el = lineEls[i];
      const r = el.getBoundingClientRect();
      const y = r.top + r.height * 0.5;
      const d = Math.abs(y - markerY);
      if (d < bestDist) {
        bestDist = d;
        const dataIdx = el.dataset.i || el.dataset.index || el.getAttribute('data-line-idx');
        bestIdx = dataIdx ? Math.max(0, Number(dataIdx) || 0) : i;
      }
    }
    return Math.max(0, Math.floor(bestIdx));
  } catch {
    return 0;
  }
}

function getLineSnapshot(index: number) {
  try {
    const viewer = getPrimaryScroller() || getScriptRoot();
    const idx = Math.max(0, Math.floor(index));
    const line =
      viewer?.querySelector<HTMLElement>(`.line[data-i="${idx}"]`) ||
      viewer?.querySelector<HTMLElement>(`.line[data-index="${idx}"]`) ||
      viewer?.querySelector<HTMLElement>(`.line[data-line-idx="${idx}"]`);
    if (!line) return null;
    const text = String(line.textContent || '').replace(/\s+/g, ' ').trim();
    const snippet = text.length > 60 ? `${text.slice(0, 60)}...` : text;
    return {
      snippet,
      lineHeight: line.offsetHeight || line.clientHeight || 0,
      scrollTop: (viewer as HTMLElement | null)?.scrollTop ?? 0,
    };
  } catch {
    return null;
  }
}

function getLineTextAtIndex(index: number, container?: ParentNode | null): string {
  const line = getLineElementAtIndex(index, container);
  return String(line?.textContent || '').replace(/\s+/g, ' ').trim();
}

function nextSpeakableLineFrom(
  startIndex: number,
  opts?: { maxLookahead?: number; container?: ParentNode | null },
): number | null {
  if (!Number.isFinite(startIndex)) return null;
  const begin = Math.max(0, Math.floor(startIndex));
  const maxLookaheadRaw = Number(opts?.maxLookahead);
  const maxLookahead = Number.isFinite(maxLookaheadRaw) && maxLookaheadRaw >= 0
    ? Math.floor(maxLookaheadRaw)
    : Number.POSITIVE_INFINITY;
  try {
    const host = opts?.container || getScriptRoot() || getPrimaryScroller() || document;
    const lines = Array.from(host.querySelectorAll<HTMLElement>('.line'));
    if (!lines.length) return null;
    const entries = lines
      .map((lineEl, pos) => ({
        idx: parseLineIndexFromElement(lineEl, pos),
        text: String(lineEl.textContent || '').replace(/\s+/g, ' ').trim(),
      }))
      .filter((entry) => Number.isFinite(entry.idx))
      .sort((a, b) => a.idx - b.idx);
    for (const entry of entries) {
      if (entry.idx < begin) continue;
      if (Number.isFinite(maxLookahead) && entry.idx > begin + maxLookahead) break;
      if (isSpeakableLineText(entry.text)) {
        return entry.idx;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

type AsrBlockCursorCandidate = {
  blockIdx: number;
  lineStart: number;
  lineEnd: number;
  speakableStartLine: number;
  blockTopPx: number;
  cueOnlyByLine: Map<number, boolean>;
};

function parseLineIndexFromElement(lineEl: HTMLElement, fallback: number): number {
  const raw =
    lineEl.dataset.line ||
    lineEl.dataset.lineIdx ||
    lineEl.dataset.i ||
    lineEl.dataset.index ||
    lineEl.getAttribute('data-line-idx');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : Math.max(0, fallback);
}

function elementTopRelativeToScroller(el: HTMLElement, scroller: HTMLElement | null): number {
  try {
    if (!scroller) return el.offsetTop || 0;
    if (isWindowScroller(scroller)) {
      const rect = el.getBoundingClientRect();
      const scrollTop = window.scrollY || window.pageYOffset || scroller.scrollTop || 0;
      return rect.top + scrollTop;
    }
    const rect = el.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    return rect.top - scrollerRect.top + (scroller.scrollTop || 0);
  } catch {
    return el.offsetTop || 0;
  }
}

function getAsrBlockCursorCandidates(scroller: HTMLElement | null): AsrBlockCursorCandidate[] {
  const blocks = getAsrBlockElements();
  if (!Array.isArray(blocks) || !blocks.length) return [];
  const candidates: AsrBlockCursorCandidate[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const blockEl = blocks[i];
    if (!blockEl) continue;
    const blockIdxRaw = Number(blockEl.dataset.tpBlock ?? i);
    const blockIdx = Number.isFinite(blockIdxRaw) ? Math.max(0, Math.floor(blockIdxRaw)) : i;
    const lineEls = Array.from(blockEl.querySelectorAll<HTMLElement>('.line'));
    if (!lineEls.length) continue;
    const entries = lineEls
      .map((lineEl, linePos) => {
        const idx = parseLineIndexFromElement(lineEl, linePos);
        const text = String(lineEl.textContent || '').replace(/\s+/g, ' ').trim();
        return {
          idx,
          cueOnly: !isSpeakableLineText(text),
        };
      })
      .filter((entry) => Number.isFinite(entry.idx))
      .sort((a, b) => a.idx - b.idx);
    if (!entries.length) continue;
    const lineStart = entries[0].idx;
    const lineEnd = entries[entries.length - 1].idx;
    const speakable = entries.find((entry) => !entry.cueOnly);
    const speakableStartLine = speakable ? speakable.idx : lineStart;
    const cueOnlyByLine = new Map<number, boolean>();
    entries.forEach((entry) => {
      cueOnlyByLine.set(entry.idx, entry.cueOnly);
    });
    candidates.push({
      blockIdx,
      lineStart,
      lineEnd,
      speakableStartLine,
      blockTopPx: elementTopRelativeToScroller(blockEl, scroller),
      cueOnlyByLine,
    });
  }
  return candidates.sort((a, b) => a.blockIdx - b.blockIdx || a.lineStart - b.lineStart);
}

function resolveAsrBlockCursor(
  startIdx: number,
  scroller: HTMLElement | null,
  topEpsilon: number,
): (AsrBlockCursorCandidate & { lineIdx: number; sourceLine: number; cueAdjusted: boolean; clamped: boolean }) | null {
  const sourceLine = Math.max(0, Math.floor(Number(startIdx) || 0));
  const candidates = getAsrBlockCursorCandidates(scroller);
  if (!candidates.length) return null;
  let chosen =
    candidates.find((candidate) => sourceLine >= candidate.lineStart && sourceLine <= candidate.lineEnd) ||
    null;
  if (!chosen) {
    chosen = candidates.reduce<AsrBlockCursorCandidate | null>((best, candidate) => {
      if (!best) return candidate;
      const bestDist =
        sourceLine < best.lineStart
          ? best.lineStart - sourceLine
          : (sourceLine > best.lineEnd ? sourceLine - best.lineEnd : 0);
      const candidateDist =
        sourceLine < candidate.lineStart
          ? candidate.lineStart - sourceLine
          : (sourceLine > candidate.lineEnd ? sourceLine - candidate.lineEnd : 0);
      return candidateDist < bestDist ? candidate : best;
    }, null);
  }
  if (!chosen) return null;
  let clamped = chosen.blockTopPx <= topEpsilon;
  if (clamped) {
    const first = candidates
      .slice()
      .sort((a, b) => a.blockTopPx - b.blockTopPx || a.blockIdx - b.blockIdx)[0];
    if (first) {
      chosen = first;
      clamped = chosen.blockTopPx <= topEpsilon;
    }
  }
  let lineIdx = sourceLine;
  if (lineIdx < chosen.lineStart || lineIdx > chosen.lineEnd) {
    lineIdx = chosen.speakableStartLine;
  }
  const cueAdjusted =
    chosen.cueOnlyByLine.get(lineIdx) === true || lineIdx !== sourceLine;
  if (chosen.cueOnlyByLine.get(lineIdx) === true) {
    lineIdx = chosen.speakableStartLine;
  }
  lineIdx = Math.max(chosen.lineStart, Math.min(chosen.lineEnd, lineIdx));
  return {
    ...chosen,
    lineIdx,
    sourceLine,
    cueAdjusted,
    clamped,
  };
}

function resolveBlockIdxForLine(lineIdx: number, scroller: HTMLElement | null): number | null {
  const target = Math.max(0, Math.floor(Number(lineIdx) || 0));
  const candidates = getAsrBlockCursorCandidates(scroller);
  const hit = candidates.find((candidate) => target >= candidate.lineStart && target <= candidate.lineEnd);
  return hit ? hit.blockIdx : null;
}

function getAsrSyncCursorFloor(): number | null {
  const mode = String(getScrollMode() || '').toLowerCase();
  const phase = String(getSession().phase || '').toLowerCase();
  if (mode !== 'asr' || phase !== 'live' || !running) return null;
  const driverIdxRaw = Number(asrScrollDriver?.getLastLineIndex?.() ?? NaN);
  if (!Number.isFinite(driverIdxRaw)) return null;
  return Math.max(0, Math.floor(driverIdxRaw));
}

function shouldApplyAsrIndexSync(
  idx: number,
  reason: string,
  interpretedAs: 'line' | 'block',
): boolean {
  const next = Math.max(0, Math.floor(Number(idx) || 0));
  const floor = getAsrSyncCursorFloor();
  if (floor == null || next >= floor) return true;
  if (
    isDevMode()
    && shouldLogLevel(2)
    && shouldLogTag(`ASR:index-sync-regression:${interpretedAs}:${reason}`, 2, ASR_SYNC_LOG_THROTTLE_MS)
  ) {
    try {
      console.warn('[ASR] index sync ignored (regression)', {
        idx: next,
        floor,
        interpretedAs,
        reason,
      });
    } catch {}
  }
  return false;
}

function syncAsrBlockCursor(
  startIdx: number,
  reason: string,
  scroller: HTMLElement | null,
  scrollTop: number,
  topEpsilon: number,
): boolean {
  if (reason !== 'blocks:scroll-mode') return false;
  const cursor = resolveAsrBlockCursor(startIdx, scroller, topEpsilon);
  if (!cursor) return false;
  const idx = cursor.lineIdx;
  if (!shouldApplyAsrIndexSync(idx, reason, 'block')) {
    return true;
  }
  const blockTopPx = Number.isFinite(cursor.blockTopPx) ? Math.round(cursor.blockTopPx) : cursor.blockTopPx;
  const schemaVersion = Number(getAsrBlockIndex()?.schemaVersion || 1);
  try { (window as any).currentIndex = idx; } catch {}
  try { asrScrollDriver?.setLastLineIndex?.(idx); } catch {}
  logAsrSync('block sync', {
    idx,
    interpretedAs: 'block',
    blockIdx: cursor.blockIdx,
    lineIdx: idx,
    lineStart: cursor.lineStart,
    lineEnd: cursor.lineEnd,
    speakableStartLine: cursor.speakableStartLine,
    schemaVersion,
    blockTopPx,
    reason,
    clamped: cursor.clamped,
    cueAdjusted: cursor.cueAdjusted,
    sourceLine: cursor.sourceLine,
    scrollTop: Math.round(scrollTop),
    topEpsilon: Math.round(topEpsilon),
  });
  logAsrSync('index sync', {
    idx,
    interpretedAs: 'block',
    blockIdx: cursor.blockIdx,
    lineIdx: idx,
    schemaVersion,
    reason,
    clamped: cursor.clamped,
    cueAdjusted: cursor.cueAdjusted,
    sourceLine: cursor.sourceLine,
    scrollTop: Math.round(scrollTop),
    topEpsilon: Math.round(topEpsilon),
    blockTopPx,
  });
  return true;
}

function syncAsrIndices(startIdx: number, reason: string): void {
  const viewer = getPrimaryScroller();
  const root = getScriptRoot() || viewer;
  const scroller =
    getRuntimeScroller() ||
    resolveActiveScroller(viewer, root || getScrollerEl('main') || getScrollerEl('display'));
  const scrollTop = scroller?.scrollTop ?? 0;
  const lineEl = (root || viewer || document).querySelector<HTMLElement>('.line');
  const lineHeight = lineEl?.offsetHeight || lineEl?.clientHeight || 0;
  const topEpsilon = Math.max(24, lineHeight * 0.5);
  if (syncAsrBlockCursor(startIdx, reason, scroller, scrollTop, topEpsilon)) return;
  const clamped = scrollTop <= topEpsilon;
  const sourceIdx = clamped ? 0 : Math.max(0, Math.floor(Number(startIdx) || 0));
  let idx = sourceIdx;
  const sourceLineText = getLineTextAtIndex(sourceIdx, root || viewer || document);
  let cueAdjusted = false;
  if (!isSpeakableLineText(sourceLineText)) {
    const nextSpoken = nextSpeakableLineFrom(sourceIdx, {
      container: root || viewer || document,
    });
    if (Number.isFinite(nextSpoken as number) && (nextSpoken as number) >= sourceIdx) {
      idx = Math.max(0, Math.floor(nextSpoken as number));
      cueAdjusted = true;
    }
  }
  const blockIdx = resolveBlockIdxForLine(idx, scroller);
  const schemaVersion = Number(getAsrBlockIndex()?.schemaVersion || 1);
  if (!shouldApplyAsrIndexSync(idx, reason, 'line')) return;
  try { (window as any).currentIndex = idx; } catch {}
  try { asrScrollDriver?.setLastLineIndex?.(idx); } catch {}
  logAsrSync('index sync', {
    idx,
    interpretedAs: 'line',
    blockIdx,
    lineIdx: idx,
    schemaVersion,
    reason,
    clamped,
    cueAdjusted,
    sourceLine: sourceIdx,
    scrollTop: Math.round(scrollTop),
    topEpsilon: Math.round(topEpsilon),
  });
}

const TRANSCRIPT_EVENT_OPTIONS: AddEventListenerOptions = { capture: true };
let asrScrollDriver: AsrScrollDriver | null = null;
let transcriptListener: ((event: Event) => void) | null = null;
let sessionStopHooked = false;
let asrBrainLogged = false;
let asrDriverLifecycleHooked = false;
let asrSessionIntentActive = false;
let asrRunCounter = 0;
let activeAsrRunKey = '';
let asrRunGeneration = 0;
let lastAsrBlockSyncAt = 0;
let lastAsrBlockSyncLogAt = 0;
let lastAsrSyncLogAtByType: Record<'block sync' | 'index sync', number> = {
  'block sync': 0,
  'index sync': 0,
};
let lastAsrSyncFingerprintByType: Record<'block sync' | 'index sync', string> = {
  'block sync': '',
  'index sync': '',
};

const ASR_LIVE_BLOCK_SYNC_THROTTLE_MS = 200;
const ASR_BLOCK_SYNC_LOG_THROTTLE_MS = 1000;
const ASR_SYNC_LOG_THROTTLE_MS = 750;
const ASR_BLOCK_SYNC_UNCHANGED_LOG_THROTTLE_MS = 1000;
let lastAsrBlockSyncCompleteFingerprint = '';
let lastAsrBlockSyncUnchangedAt = 0;

function logAsrBlockSyncSkip(mode: string, phase: string, reason: 'live-skip' | 'throttled', now: number): void {
  if (!isDevMode()) return;
  if (!shouldLogLevel(2)) return;
  if (!shouldLogTag(`ASR:block-sync-skip:${reason}:${mode}:${phase}`, 2, ASR_BLOCK_SYNC_LOG_THROTTLE_MS)) return;
  if (now - lastAsrBlockSyncLogAt < ASR_BLOCK_SYNC_LOG_THROTTLE_MS) return;
  lastAsrBlockSyncLogAt = now;
  const lastSyncAgeMs = lastAsrBlockSyncAt > 0 ? Math.max(0, now - lastAsrBlockSyncAt) : -1;
  try {
    console.debug('[ASR] block sync skipped', {
      mode,
      phase,
      reason,
      lastSyncAgeMs,
    });
  } catch {}
}

function isAsrLikeMode(mode: string | null | undefined): boolean {
  const normalized = String(mode || '').toLowerCase();
  return normalized === 'asr' || normalized === 'hybrid';
}

function canAttachAsrBackend(): boolean {
  try {
    if (isSpeechBackendAllowed()) return true;
  } catch {}
  try {
    if (isLegacySpeechOrchestratorAllowed() && window.__tpSpeechOrchestrator?.start) return true;
  } catch {}
  if (isLegacySpeechNamespaceAllowed()) {
    try {
      const ns = getTpSpeechNamespace();
      if (typeof ns?.startRecognizer === 'function') return true;
    } catch {}
  }
  try {
    if (window.SpeechRecognition || window.webkitSpeechRecognition) return true;
  } catch {}
  return false;
}

function getAsrBlockSnapshot(): {
  ready: boolean;
  count: number;
  schemaVersion?: number;
  source?: string;
  scriptSig?: string;
} {
  let count = 0;
  let schemaVersion: number | undefined;
  let source: string | undefined;
  let scriptSig: string | undefined;
  try {
    const els = getAsrBlockElements();
    count = Array.isArray(els) ? els.length : 0;
  } catch {}
  try {
    const meta = getAsrBlockIndex() as any;
    if (Number.isFinite(Number(meta?.schemaVersion))) {
      schemaVersion = Number(meta.schemaVersion);
    }
    if (typeof meta?.source === 'string') {
      source = meta.source;
    }
    if (Array.isArray(meta?.units) && meta.units.length) {
      const units = meta.units as Array<{
        unitStart?: number;
        unitEnd?: number;
        sentenceCount?: number;
        charCount?: number;
      }>;
      const first = units[0] || {};
      const last = units[units.length - 1] || {};
      const sums = units.reduce(
        (acc, unit) => {
          const chars = Number(unit?.charCount);
          const sentences = Number(unit?.sentenceCount);
          if (Number.isFinite(chars)) acc.chars += Math.max(0, Math.floor(chars));
          if (Number.isFinite(sentences)) acc.sentences += Math.max(0, Math.floor(sentences));
          return acc;
        },
        { chars: 0, sentences: 0 },
      );
      scriptSig = [
        units.length,
        Number(first?.unitStart ?? -1),
        Number(first?.unitEnd ?? -1),
        Number(last?.unitStart ?? -1),
        Number(last?.unitEnd ?? -1),
        sums.sentences,
        sums.chars,
      ].join(':');
    }
  } catch {}
  try {
    const globalCount = Number((window as any).__tpAsrBlockCount);
    if (Number.isFinite(globalCount) && globalCount > count) {
      count = Math.floor(globalCount);
    }
  } catch {}
  const ready = count > 0 || (() => {
    try { return Boolean((window as any).__tpAsrBlocksReady); } catch { return false; }
  })();
  return { ready, count, schemaVersion, source, scriptSig };
}

function shouldCreateAsrDriver(mode: string, reason: string): boolean {
  const blocks = getAsrBlockSnapshot();
  const blocksReady = blocks.ready && blocks.count > 0;
  const backendReady = canAttachAsrBackend();
  const session = getSession();
  const phaseAllowsAsrDriver = shouldAllowAsrDriverCreateAttempt(mode, session);
  const allowed = isAsrLikeMode(mode) && blocksReady && backendReady && phaseAllowsAsrDriver;
  if (!allowed) {
    reportAsrDriverCreateBlocked({
      reason,
      mode,
      blocksReady,
      blockCount: blocks.count,
      backendReady,
      phaseAllowsAsrDriver,
      sessionPhase: String(session.phase || 'idle').toLowerCase(),
      running,
      asrSessionIntentActive,
    });
  }
  return allowed;
}

function beginAsrRunKey(mode: string, reason?: string): string {
  if (activeAsrRunKey) return activeAsrRunKey;
  asrRunGeneration += 1;
  asrRunCounter += 1;
  const startedAt = Date.now();
  activeAsrRunKey = `asr-${startedAt.toString(36)}-${asrRunCounter}-${String(mode || 'unknown').toLowerCase()}`;
  if (typeof window !== 'undefined') {
    try { window.__tpAsrRunKey = activeAsrRunKey; } catch {}
    try { window.__tpAsrRunGeneration = asrRunGeneration; } catch {}
    try { window.__tpAsrRunStartedAt = startedAt; } catch {}
  }
  if (isDevMode() && shouldLogLevel(1)) {
    try {
      console.info('[ASR] run begin', {
        runKey: activeAsrRunKey,
        runGeneration: asrRunGeneration,
        startedAt,
        mode,
        reason,
      });
    } catch {}
  }
  emitAsrRuntimeStatus(`run-begin:${String(reason || 'unspecified')}`);
  return activeAsrRunKey;
}

function clearAsrRunKey(reason: string): void {
  if (!activeAsrRunKey) return;
  const endedRunKey = activeAsrRunKey;
  asrRunGeneration += 1;
  if (isDevMode() && shouldLogLevel(1)) {
    try {
      console.info('[ASR] run clear', {
        runKey: endedRunKey,
        runGeneration: asrRunGeneration,
        reason,
      });
    } catch {}
  }
  activeAsrRunKey = '';
  if (typeof window !== 'undefined') {
    try { window.__tpAsrLastEndedRunKey = endedRunKey; } catch {}
    try { window.__tpAsrLastEndedRunAt = Date.now(); } catch {}
    try { window.__tpAsrRunKey = null; } catch {}
    try { window.__tpAsrRunGeneration = asrRunGeneration; } catch {}
    try { window.__tpAsrRunStartedAt = 0; } catch {}
  }
  emitAsrRuntimeStatus(`run-clear:${reason}`);
}

function buildAsrSyncLogFingerprint(payload: Record<string, unknown>): string {
  const bool = (value: unknown) => (value ? '1' : '0');
  return [
    payload.reason ?? '',
    payload.interpretedAs ?? '',
    payload.blockIdx ?? 'na',
    payload.lineIdx ?? payload.idx ?? 'na',
    payload.sourceLine ?? 'na',
    payload.schemaVersion ?? 'na',
    bool(payload.clamped),
    bool(payload.cueAdjusted),
  ].join('|');
}

function logAsrSync(kind: 'block sync' | 'index sync', payload: Record<string, unknown>): void {
  if (!isDevMode()) return;
  if (!shouldLogLevel(2)) return;
  const now = Date.now();
  const fingerprint = buildAsrSyncLogFingerprint(payload);
  const prevFingerprint = lastAsrSyncFingerprintByType[kind];
  const prevAt = lastAsrSyncLogAtByType[kind];
  if (fingerprint === prevFingerprint && now - prevAt < ASR_SYNC_LOG_THROTTLE_MS) {
    return;
  }
  lastAsrSyncFingerprintByType[kind] = fingerprint;
  lastAsrSyncLogAtByType[kind] = now;
  try {
    console.debug(`[ASR] ${kind}`, payload);
  } catch {}
}

function buildAsrBlockSyncCompleteFingerprint(payload: {
  mode: string;
  markerIdx: number;
  blockCount: number;
  schemaVersion?: number;
  source?: string;
  scriptSig?: string;
}): string {
  return [
    payload.mode || '',
    Number.isFinite(payload.markerIdx) ? Math.floor(payload.markerIdx) : -1,
    Number.isFinite(payload.blockCount) ? Math.floor(payload.blockCount) : -1,
    Number.isFinite(Number(payload.schemaVersion)) ? Number(payload.schemaVersion) : -1,
    payload.source || '',
    payload.scriptSig || '',
  ].join('|');
}

function logAsrBlockSyncComplete(payload: {
  reason: string;
  mode: string;
  markerIdx: number;
  blockCount: number;
  schemaVersion?: number;
  source?: string;
  scriptSig?: string;
}): void {
  if (!isDevMode()) return;
  if (!shouldLogLevel(2)) return;
  const fingerprint = buildAsrBlockSyncCompleteFingerprint(payload);
  if (fingerprint === lastAsrBlockSyncCompleteFingerprint) {
    const now = Date.now();
    if (now - lastAsrBlockSyncUnchangedAt >= ASR_BLOCK_SYNC_UNCHANGED_LOG_THROTTLE_MS) {
      lastAsrBlockSyncUnchangedAt = now;
      try {
        console.debug('[ASR] block sync unchanged', {
          reason: payload.reason,
          mode: payload.mode,
          markerIdx: payload.markerIdx,
          blockCount: payload.blockCount,
          schemaVersion: payload.schemaVersion,
        });
      } catch {}
    }
    return;
  }
  lastAsrBlockSyncCompleteFingerprint = fingerprint;
  try {
    console.info('[ASR] block sync complete', payload);
  } catch {}
}

function ensureAsrScrollDriver(
  reason: string,
  opts?: { mode?: string; allowCreate?: boolean; runKey?: string; runGeneration?: number | null },
): AsrScrollDriver | null {
  if (typeof window === 'undefined') return null;
  if (asrScrollDriver) return asrScrollDriver;
  if (opts?.allowCreate !== true) return null;
  const mode = String(opts?.mode || getScrollMode() || '').toLowerCase();
  if (!shouldCreateAsrDriver(mode, reason)) return null;
  const runKey = String(opts?.runKey || activeAsrRunKey || '').trim();
  const runGenerationRaw = Number(opts?.runGeneration ?? asrRunGeneration);
  const runGeneration = Number.isFinite(runGenerationRaw)
    ? Math.max(0, Math.floor(runGenerationRaw))
    : undefined;
  asrScrollDriver = createAsrScrollDriver({
    runKey: runKey || undefined,
    runGeneration,
  });
  try { (window as any).__tpAsrScrollDriver = asrScrollDriver; } catch {}
  if (isDevMode() && shouldLogLevel(1)) {
    try { console.info('[ASR] driver created', { reason, mode, phase: getSession().phase, runKey: runKey || null }); } catch {}
  }
  emitHudSnapshot('driver-created', { force: true });
  return asrScrollDriver;
}

function syncAsrDriverFromBlocks(
  reason: string,
  opts?: { mode?: string; allowCreate?: boolean; runKey?: string; runGeneration?: number | null },
): void {
  const mode = String(opts?.mode || getScrollMode() || '').toLowerCase();
  const phase = String(getSession().phase || '').toLowerCase();
  const livePhase = phase === 'live';
  const asrLive = running && mode === 'asr' && livePhase;
  const now = Date.now();
  const driver =
    asrScrollDriver ||
    ensureAsrScrollDriver(`sync:${reason}`, {
      mode,
      allowCreate: opts?.allowCreate === true,
      runKey: opts?.runKey,
      runGeneration: opts?.runGeneration,
    });
  if (!driver) return;
  if (livePhase && mode !== 'asr') {
    logAsrBlockSyncSkip(mode, phase, 'live-skip', now);
    return;
  }
  if (asrLive && now - lastAsrBlockSyncAt < ASR_LIVE_BLOCK_SYNC_THROTTLE_MS) {
    logAsrBlockSyncSkip(mode, phase, 'throttled', now);
    return;
  }
  const blocks = getAsrBlockSnapshot();
  if (!blocks.ready || blocks.count <= 0) {
    if (
      isDevMode()
      && shouldLogLevel(2)
      && shouldLogTag(`ASR:block-sync-not-ready:${mode}:${phase}`, 2, ASR_BLOCK_SYNC_LOG_THROTTLE_MS)
    ) {
      try { console.debug('[ASR] block sync skipped (not ready)', { reason, mode, blocks }); } catch {}
    }
    return;
  }
  try {
    (window as any).__tpAsrBlocksReady = true;
    (window as any).__tpAsrBlockCount = blocks.count;
  } catch {}
  const markerIdx = computeMarkerLineIndex();
  if (asrLive) {
    lastAsrBlockSyncAt = now;
    if (isDevMode()) {
      logAsrBlockSyncComplete({
        reason,
        mode,
        markerIdx,
        blockCount: blocks.count,
        schemaVersion: blocks.schemaVersion,
        source: blocks.source,
        scriptSig: blocks.scriptSig,
      });
      if (shouldLogLevel(2) && shouldLogTag('ASR:live-block-sync:suppressed', 2, ASR_BLOCK_SYNC_LOG_THROTTLE_MS)) {
        try {
          console.debug('[ASR] live block sync suppressed', {
            reason,
            mode,
            phase,
            markerIdx,
            blockCount: blocks.count,
            schemaVersion: blocks.schemaVersion,
          });
        } catch {}
      }
    }
    emitHudSnapshot(`block-sync:${reason}`);
    return;
  }
  syncAsrIndices(markerIdx, `blocks:${reason}`);
  if (asrLive) {
    lastAsrBlockSyncAt = now;
  }
  if (isDevMode()) {
    logAsrBlockSyncComplete({
      reason,
      mode,
      markerIdx,
      blockCount: blocks.count,
      schemaVersion: blocks.schemaVersion,
      source: blocks.source,
      scriptSig: blocks.scriptSig,
    });
  }
  emitHudSnapshot(`block-sync:${reason}`);
}

function pushAsrTranscript(text: string, isFinal: boolean, detail?: any): void {
  const t = String(text || '').trim();
  if (!t) return;
  const session = getSession();
  const payload = {
    text: t,
    isFinal: !!isFinal,
    source: detail?.source,
  };
  if (isDevMode() && shouldLogTag('ASR:ingest', 2, 250)) {
    console.log('[ASR] ingest', {
      isFinal: payload.isFinal,
      text: payload.text?.slice(0, 60),
      source: payload.source,
    });
  }
  const mode = String(detail?.mode || getScrollMode() || '').toLowerCase();
  const liveSessionActive = session.phase === 'live';
  const allowAsrIngest =
    running ||
    asrSessionIntentActive ||
    (liveSessionActive && (mode === 'hybrid' || (mode === 'asr' && session.asrArmed)));
  if (!allowAsrIngest) {
    if (isDevMode() && shouldLogTag('ASR:ingest:ignored-inactive-session', 2, 500)) {
      try {
        console.debug('[ASR] transcript ignored (inactive session)', {
          mode,
          phase: session.phase,
          running,
          asrSessionIntentActive,
          asrArmed: session.asrArmed,
          text: t.slice(0, 60),
        });
      } catch {}
    }
    // Script-end confirmation still needs to observe final transcript evidence even
    // when normal ASR ingest is gated inactive (for example in tests/manual phase flips).
    maybeConfirmPendingAsrScriptEnd(t, !!isFinal, detail);
    return;
  }
  attachAsrScrollDriver({ reason: 'transcript', mode, allowCreate: true });
  bootTrace('ASR:ingest', {
    raw: t,
    normalized: normalizeComparableText(t),
  });
  try { asrScrollDriver?.ingest(t, !!isFinal, detail); } catch {}
  syncAsrDriverStats(asrScrollDriver);
  maybeConfirmPendingAsrScriptEnd(t, !!isFinal, detail);
}

function attachAsrScrollDriver(
  opts?: { reason?: string; mode?: string; allowCreate?: boolean; runKey?: string; runGeneration?: number | null },
): void {
  if (typeof window === 'undefined') return;
  const mode = String(opts?.mode || getScrollMode() || '').toLowerCase();
  bootTrace('speech-loader:attach-asr-driver:start', {
    reason: opts?.reason || 'attach',
    mode,
    allowCreate: opts?.allowCreate === true,
    runKey: opts?.runKey || null,
    runGeneration: Number.isFinite(Number(opts?.runGeneration ?? asrRunGeneration))
      ? Math.max(0, Math.floor(Number(opts?.runGeneration ?? asrRunGeneration)))
      : null,
  });
  ensureAsrScrollDriver(opts?.reason || 'attach', {
    mode,
    allowCreate: opts?.allowCreate === true,
    runKey: opts?.runKey,
    runGeneration: opts?.runGeneration,
  });
  if (transcriptListener) {
    bootTrace('speech-loader:attach-asr-driver:done', {
      reason: opts?.reason || 'attach',
      mode,
      listener: 'existing',
    });
    return;
  }
  transcriptListener = (event: Event) => {
    const detail = (event as CustomEvent)?.detail || {};
    if ((detail as any).__tpDirectIngest === true) return;
    const detectedMode = typeof detail.mode === 'string' ? detail.mode.toLowerCase() : '';
    const rawMode = (detectedMode || getScrollMode() || '').toLowerCase();
    const effectiveMode = rawMode === 'manual' ? 'step' : rawMode;
    if (effectiveMode !== 'hybrid' && effectiveMode !== 'asr') {
      return;
    }
    const text = typeof detail.text === 'string' ? detail.text : '';
    if (!text) return;
    const isFinal = Boolean(detail.isFinal ?? detail.final);
    const payload = enrichTranscriptPayloadForAsr({
      ...(detail as Partial<TranscriptPayload>),
      text,
      final: Boolean(detail.final ?? isFinal),
      isFinal,
      timestamp: typeof detail.timestamp === 'number' ? detail.timestamp : performance.now(),
      source: typeof detail.source === 'string' ? detail.source : 'speech-loader',
      mode: typeof detail.mode === 'string' ? detail.mode : effectiveMode,
    } as TranscriptPayload);
    pushAsrTranscript(text, isFinal, payload as any);
  };
  window.addEventListener('tp:speech:transcript', transcriptListener, TRANSCRIPT_EVENT_OPTIONS);
  bootTrace('speech-loader:attach-asr-driver:done', {
    reason: opts?.reason || 'attach',
    mode,
    listener: 'new',
  });
}

function ensureAsrDriverLifecycleHooks(): void {
  if (asrDriverLifecycleHooked || typeof window === 'undefined') return;
  asrDriverLifecycleHooked = true;
  const onSessionIntent = (event: Event) => {
    const detail = (event as CustomEvent)?.detail || {};
    asrSessionIntentActive = Boolean(detail.active);
    const mode = String(detail.mode || getScrollMode() || '').toLowerCase();
    if (asrSessionIntentActive && isAsrLikeMode(mode)) {
      attachAsrScrollDriver({ reason: 'session-intent', mode, allowCreate: true });
      syncAsrDriverFromBlocks('session-intent', { mode, allowCreate: true });
      return;
    }
    if (!asrSessionIntentActive && !running) {
      detachAsrScrollDriver();
    }
    emitHudSnapshot('session-intent');
  };
  const onScrollMode = (event: Event) => {
    const detail = (event as CustomEvent)?.detail || {};
    const mode = String(detail.mode || detail.nextMode || getScrollMode() || '').toLowerCase();
    const session = getSession();
    const allowCreate = shouldAllowAsrDriverCreateAttempt(mode, session);
    if (isAsrLikeMode(mode)) {
      attachAsrScrollDriver({ reason: 'scroll-mode', mode, allowCreate });
      syncAsrDriverFromBlocks('scroll-mode', { mode, allowCreate });
      return;
    }
    clearPendingAsrScriptEnd('scroll-mode-exit-asr');
    cancelDeferredAsrScriptEndStop('scroll-mode-exit-asr');
    if (!running) {
      detachAsrScrollDriver();
    }
    emitHudSnapshot('scroll-mode');
  };
  const onSessionStart = () => {
    const session = getSession();
    const mode = getScrollMode();
    lastAsrScriptEndStopKey = '';
    clearPendingAsrScriptEnd('session-start');
    cancelDeferredAsrScriptEndStop('session-start');
    asrSessionIntentActive = true;
    if (session.asrDesired || isAsrLikeMode(mode)) {
      attachAsrScrollDriver({ reason: 'session-start', mode, allowCreate: true });
      syncAsrDriverFromBlocks('session-start', { mode, allowCreate: true });
    }
    emitHudSnapshot('session-start', { force: true });
  };
  const onBlocksReady = (event: Event) => {
    const detail = (event as CustomEvent)?.detail || {};
    const mode = String(getScrollMode() || '').toLowerCase();
    const session = getSession();
    const allowCreate = shouldAllowAsrDriverCreateAttempt(mode, session);
    if (detail && typeof detail.blockCount === 'number') {
      try { (window as any).__tpAsrBlockCount = Math.max(0, Math.floor(detail.blockCount)); } catch {}
      try { (window as any).__tpAsrBlocksReady = true; } catch {}
    }
    syncAsrDriverFromBlocks('blocks-ready', { mode, allowCreate });
  };
  const onScriptRendered = () => {
    const mode = String(getScrollMode() || '').toLowerCase();
    const session = getSession();
    const allowCreate = shouldAllowAsrDriverCreateAttempt(mode, session);
    const wantsAsrDriver = allowCreate || !!asrScrollDriver;
    if (!wantsAsrDriver) return;
    try {
      window.requestAnimationFrame?.(() => {
        syncAsrDriverFromBlocks('script-rendered', { mode, allowCreate });
      });
    } catch {
      syncAsrDriverFromBlocks('script-rendered', { mode, allowCreate });
    }
  };
  const onSessionStop = (event: Event) => {
    const detail = (event as CustomEvent | undefined)?.detail || {};
    const userInitiated =
      String(detail?.reason || '').toLowerCase() === 'user' ||
      String(detail?.source || '').toLowerCase() === 'user' ||
      detail?.manual === true;
    if (userInitiated && deferredAsrScriptEndStop) {
      try {
        console.info(`[ASR_END_GRACE_CANCELLED_BY_USER] lineIndex=${deferredAsrScriptEndStop.pending.lineIndex ?? -1} lastSpeakableLineIndex=${deferredAsrScriptEndStop.pending.lastSpeakableLineIndex ?? -1} reason=user_stop`);
      } catch {}
    }
    setAsrEndGraceState(false);
    lastAsrScriptEndStopKey = '';
    clearPendingAsrScriptEnd('session-stop');
    cancelDeferredAsrScriptEndStop('session-stop');
    asrSessionIntentActive = false;
    resetAsrInterimStabilizer();
    clearAsrRunKey('lifecycle-session-stop');
    disarmAsrSessionState('session-stop');
    resetAsrDriverCreateBlockedDiagnostics();
    emitHudSnapshot('session-stop', { force: true });
  };
  const onSessionPhase = (event: Event) => {
    const phase = String((event as CustomEvent)?.detail?.phase || '').toLowerCase();
    if (phase === 'idle' || phase === 'wrap') {
      lastAsrScriptEndStopKey = '';
      clearPendingAsrScriptEnd(`phase-${phase}`);
      cancelDeferredAsrScriptEndStop(`phase-${phase}`);
      asrSessionIntentActive = false;
      resetAsrInterimStabilizer();
      clearAsrRunKey(`phase-${phase}`);
      disarmAsrSessionState(`phase-${phase}`);
      resetAsrDriverCreateBlockedDiagnostics();
    }
    emitHudSnapshot(`session-phase:${phase || 'unknown'}`);
  };
  const onAsrScriptEnd = (event: Event) => {
    const detail = (event as CustomEvent)?.detail || {};
    const mode = String(detail.mode || getScrollMode() || '').toLowerCase();
    const session = getSession();
    if (session.phase !== 'live' || !isAsrLikeMode(mode)) return;
    const lineIndexRaw = Number(detail.lineIndex);
    const lastSpeakableLineIndexRaw = Number(detail.lastSpeakableLineIndex);
    const lineIndex = Number.isFinite(lineIndexRaw) ? Math.max(0, Math.floor(lineIndexRaw)) : null;
    const lastSpeakableLineIndex = Number.isFinite(lastSpeakableLineIndexRaw)
      ? Math.max(0, Math.floor(lastSpeakableLineIndexRaw))
      : null;
    const runKey = String(detail.runKey || activeAsrRunKey || 'no-run');
    const dedupeKey = `${runKey}|${lineIndex ?? 'na'}|${lastSpeakableLineIndex ?? 'na'}`;
    if (dedupeKey === lastAsrScriptEndStopKey) return;
    const targetLine = lastSpeakableLineIndex ?? lineIndex;
    const host = getScriptRoot() || getPrimaryScroller() || document;
    const targetLineText =
      targetLine != null
        ? getLineTextAtIndex(targetLine, host)
        : '';
    pendingAsrScriptEndStop = {
      dedupeKey,
      runKey,
      mode,
      lineIndex,
      lastSpeakableLineIndex,
      armedAt: Date.now(),
      targetLineTokens: normTokens(targetLineText),
    };
    emitHudSnapshot('script-end-pending', { force: true });
    if (isDevMode() && shouldLogTag('ASR:script-end-pending', 2, 1000)) {
      try {
        console.info('[ASR] script end armed (awaiting final confirmation)', {
          mode,
          lineIndex,
          lastSpeakableLineIndex,
          runKey,
          targetLine,
          targetTokens: pendingAsrScriptEndStop.targetLineTokens.length,
        });
      } catch {}
    }
  };
  const onSpeechHardReset = (event: Event) => {
    const detail = (event as CustomEvent)?.detail || {};
    const reason = String(detail.reason || detail.source || 'script-reset');
    hardResetSpeechEngine(reason);
  };
  const onScriptReset = (event: Event) => {
    const detail = (event as CustomEvent)?.detail || {};
    const source = String(detail.source || 'script-reset');
    hardResetSpeechEngine(source);
  };
  window.addEventListener('tp:session:intent', onSessionIntent, TRANSCRIPT_EVENT_OPTIONS);
  window.addEventListener('tp:scroll:mode', onScrollMode, TRANSCRIPT_EVENT_OPTIONS);
  window.addEventListener('tp:session:start', onSessionStart, TRANSCRIPT_EVENT_OPTIONS);
  window.addEventListener('tp:session:stop', onSessionStop, TRANSCRIPT_EVENT_OPTIONS);
  window.addEventListener('tp:session:phase', onSessionPhase, TRANSCRIPT_EVENT_OPTIONS);
  window.addEventListener('tp:asr:script-end', onAsrScriptEnd, TRANSCRIPT_EVENT_OPTIONS);
  window.addEventListener('tp:speech:hard-reset', onSpeechHardReset, TRANSCRIPT_EVENT_OPTIONS);
  window.addEventListener('tp:script:reset', onScriptReset, TRANSCRIPT_EVENT_OPTIONS);
  window.addEventListener('tp:asr:blocks-ready', onBlocksReady, TRANSCRIPT_EVENT_OPTIONS);
  window.addEventListener('tp:script-rendered', onScriptRendered, TRANSCRIPT_EVENT_OPTIONS);
  window.addEventListener('tp:render:done', onScriptRendered, TRANSCRIPT_EVENT_OPTIONS);
  const initialMode = String(getScrollMode() || '').toLowerCase();
  const session = getSession();
  const initialPhase = String(session.phase || '').toLowerCase();
  const allowBootstrapCreate = shouldAllowAsrDriverCreateAttempt(initialMode, session);
  if (allowBootstrapCreate || !!asrScrollDriver) {
    attachAsrScrollDriver({ reason: 'bootstrap', mode: initialMode, allowCreate: allowBootstrapCreate });
    syncAsrDriverFromBlocks('bootstrap', { mode: initialMode, allowCreate: allowBootstrapCreate });
  }
  emitHudSnapshot('lifecycle-hooks-bootstrap', { force: true });
}

function detachAsrScrollDriver(): void {
  if (typeof window !== 'undefined' && transcriptListener) {
    window.removeEventListener('tp:speech:transcript', transcriptListener, TRANSCRIPT_EVENT_OPTIONS);
  }
  transcriptListener = null;
  if (asrScrollDriver) {
    asrScrollDriver.dispose();
    asrScrollDriver = null;
    try { (window as any).__tpAsrScrollDriver = null; } catch {}
  }
  emitHudSnapshot('driver-detach', { force: true });
}

function ensureSessionStopHooked(): void {
  if (sessionStopHooked) return;
  sessionStopHooked = true;
  if (typeof window === 'undefined') return;
  window.addEventListener('tp:session:stop', (event) => {
    asrSessionIntentActive = false;
    resetAsrInterimStabilizer();
    clearAsrRunKey('session-stop-hook');
    disarmAsrSessionState('session-stop-hook');
    resetAsrDriverCreateBlockedDiagnostics();
    detachAsrScrollDriver();
    const detail = (event as CustomEvent)?.detail || {};
    const mode = typeof detail.mode === 'string' && detail.mode
      ? detail.mode
      : lastScrollMode || getScrollMode();
    autoSaveSpeakerPatchesAfterStop(mode);
    if (isDevMode()) {
      maybePromptSaveSpeakerProfiles(mode);
    }
    clearSessionLearnedPatches();
  }, TRANSCRIPT_EVENT_OPTIONS);
}

try {
  ensureSessionStopHooked();
} catch {
  // ignore
}

try {
  attachSummaryListener();
} catch {}

type WebSpeechLifecycleOptions = {
  onResult?: (event: any) => void;
  onError?: (event: Event) => void;
};

type WebSpeechLifecycleHost = SpeechRecognition & {
  __tpLifecycleAttached?: boolean;
  __tpLifecycleOnResult?: ((event: any) => void) | null;
  __tpLifecycleOnError?: ((event: Event) => void) | null;
};

function attachWebSpeechLifecycle(sr: SpeechRecognition, opts: WebSpeechLifecycleOptions = {}): void {
  if (!sr) return;
  const host = sr as WebSpeechLifecycleHost;
  if (host.__tpLifecycleAttached) {
    host.__tpLifecycleOnResult = opts.onResult ?? null;
    host.__tpLifecycleOnError = opts.onError ?? null;
    if (isDevMode() && shouldLogTag('ASR:lifecycle:already-attached', 2, 1000)) {
      try { console.warn('[speech] lifecycle already attached'); } catch {}
    }
    return;
  }
  host.__tpLifecycleAttached = true;
  host.__tpLifecycleOnResult = opts.onResult ?? null;
  host.__tpLifecycleOnError = opts.onError ?? null;
  sr.onstart = (event: Event) => {
    setSpeechRunningActual(true, 'onstart');
    markWebSpeechLifecycle('onstart', event);
  };
  sr.onaudiostart = (event: Event) => {
    setSpeechRunningActual(true, 'onaudiostart');
    markWebSpeechLifecycle('onaudiostart', event);
  };
  sr.onspeechstart = (event: Event) => {
    markWebSpeechLifecycle('onspeechstart', event);
  };
  sr.onresult = (event: any) => {
    const resultCount = Number(event?.results?.length || 0);
    markWebSpeechLifecycle('onresult', event as Event, {
      resultCount,
      resultIndex: Number(event?.resultIndex || 0),
    });
    try { host.__tpLifecycleOnResult?.(event); } catch {}
  };
  sr.onspeechend = (event: Event) => {
    markWebSpeechLifecycle('onspeechend', event);
  };
  sr.onaudioend = (event: Event) => {
    setSpeechRunningActual(false, 'onaudioend');
    markWebSpeechLifecycle('onaudioend', event);
    if (shouldAutoRestartSpeech()) {
      scheduleRecognizerLifecycleRestart('onaudioend', { abortFirst: false });
    } else {
      emitAsrState('idle', 'recognition-audioend');
    }
  };
  sr.onend = (event: Event) => {
    setSpeechRunningActual(false, 'onend');
    markWebSpeechLifecycle('onend', event, {
      pendingManualRestartCount,
    });
    if (pendingManualRestartCount > 0) {
      pendingManualRestartCount = Math.max(pendingManualRestartCount - 1, 0);
      return;
    }
    if (shouldAutoRestartSpeech()) {
      scheduleRecognizerLifecycleRestart('onend', { abortFirst: false });
    } else {
      emitAsrState('idle', 'recognition-end');
    }
  };
  sr.onerror = (event: Event) => {
    const code = String((event as any)?.error || '').toLowerCase() || 'error';
    setSpeechRunningActual(false, 'onerror');
    markWebSpeechLifecycle('onerror', event, { code });
    try { host.__tpLifecycleOnError?.(event); } catch {}
    if (isRestartableWebSpeechError(event) && shouldAutoRestartSpeech()) {
      scheduleRecognizerLifecycleRestart('onerror', { abortFirst: false });
      return;
    }
    emitAsrState('idle', `recognition-error:${code}`);
  };
}

function enforceRecognizerInterimCapture(mode: string, recognizer: unknown): void {
  const normalizedMode = String(mode || '').toLowerCase();
  if (normalizedMode !== 'asr' && normalizedMode !== 'hybrid') return;
  if (!recognizer || (typeof recognizer !== 'object' && typeof recognizer !== 'function')) return;
  const r = recognizer as any;
  try { r.interimResults = true; } catch {}
  try { r.interim = true; } catch {}
  try { r.partialResults = true; } catch {}
  try {
    if (typeof r.setInterimResults === 'function') {
      r.setInterimResults(true);
    }
  } catch {}
  try {
    if (typeof r.configure === 'function') {
      r.configure({ interimResults: true, interim: true, partialResults: true });
    } else if (typeof r.setConfig === 'function') {
      r.setConfig({ interimResults: true, interim: true, partialResults: true });
    }
  } catch {}
}

async function startBackendForSession(mode: string, reason?: string): Promise<boolean> {
  const speechNs = getTpSpeechNamespace();
  const allowLegacyNs = isLegacySpeechNamespaceAllowed();
  const allowLegacyOrchestrator = isLegacySpeechOrchestratorAllowed();
  const speechStoreState = getTpSpeechStoreSnapshot();
  const baseEngine = resolveRuntimeSpeechEngine({
    appStore: (window as any).__tpStore,
  });
  activeAsrLane = readActiveAsrLane();
  const selectedEngine = resolveRequestedEngineForLane(baseEngine, activeAsrLane);
  lastRequestedSpeechEngine = selectedEngine || 'whisper';
  currentActualSpeechEngine = '';
  currentFallbackReason = '';
  emitAsrRuntimeStatus(`backend-select:${String(reason || 'unspecified')}`);
  if (isSettingsHydrating()) {
    try { console.debug('[ASR] startBackend blocked during settings hydration', { mode, reason }); } catch {}
    return false;
  }
  if (isDevMode()) {
    if (shouldLogLevel(2)) {
      const w = typeof window !== 'undefined' ? (window as any) : null;
        const info = {
          mode,
          reason,
          hasOrchestrator: allowLegacyOrchestrator && !!w?.__tpSpeechOrchestrator?.start,
          allowLegacyNamespace: allowLegacyNs,
        hasRecognizerStart: allowLegacyNs && typeof speechNs?.startRecognizer === 'function',
        hasWebSpeech: !!(w?.SpeechRecognition || w?.webkitSpeechRecognition),
        selectedEngine,
        activeAsrLane,
        speechStoreEngine: (speechStoreState as any)?.engine,
        appStoreEngine: w?.__tpStore?.get?.('asr.engine'),
        sessionPhase: (speechStoreState as any)?.sessionPhase,
        scrollMode: (speechStoreState as any)?.scrollMode,
        speechRunning: (speechStoreState as any)?.speechRunning,
      };
      try { console.log('[ASR] lifecycle startBackend: invoking backend', info); } catch {}
    }
  }

  if (selectedEngine === 'whisper') {
    try {
      const whisperRecognizer = createWhisperBridgeRecognizer({
        lang: typeof (speechStoreState as any)?.lang === 'string' ? (speechStoreState as any).lang : 'en-US',
        interim: (speechStoreState as any)?.interim !== false,
        endpointingMs: Number((speechStoreState as any)?.endpointingMs || 0),
        asrLane: activeAsrLane,
      });
      await whisperRecognizer.start();
      rec = whisperRecognizer as unknown as RecognizerLike;
      try { whisperRecognizer.on('final', (t: unknown) => routeRecognizerTranscript(t, true)); } catch {}
      try { whisperRecognizer.on('partial', (t: unknown) => routeRecognizerTranscript(t, false)); } catch {}
      try {
        whisperRecognizer.on('error', (detail: unknown) => {
          const row = (detail && typeof detail === 'object') ? (detail as Record<string, unknown>) : {};
          const summary = {
            source: row.source ?? 'openai-whisper-bridge',
            message: row.message ?? null,
            code: row.code ?? null,
            provider: row.provider ?? null,
            modelId: row.modelId ?? null,
            asrLane: row.asrLane ?? null,
            upstreamStatus: row.upstreamStatus ?? null,
            upstreamMessage: row.upstreamMessage ?? null,
            upstreamUrl: row.upstreamUrl ?? null,
            modelUrl: row.modelUrl ?? null,
          };
          try { console.warn('[speech] whisper bridge error', JSON.stringify(summary)); } catch { console.warn('[speech] whisper bridge error', summary); }
        });
      } catch {}
      try { window.__tpEmitSpeech = (t: unknown, final?: boolean) => routeRecognizerTranscript(t, !!final); } catch {}
      setActiveRecognizer(rec);
      if (!activeRecognizer) {
        emitAsrState('idle', 'recognizer-not-attached:whisper');
        setSpeechRunningActual(false, 'whisper-no-attach');
        maybeLogLiveArmedDetachedInvariant('whisper-no-attach');
        emitHudSnapshot('recognizer-attach-failed:whisper', { force: true });
        return false;
      }
      lastStartedSpeechEngine = 'whisper';
      currentActualSpeechEngine = 'whisper';
      currentFallbackReason = '';
      setSpeechRunningActual(true, 'whisper-start');
      emitAsrRuntimeStatus('backend-attached:whisper');
      emitAsrHeartbeat('recognizer-attached:whisper', { force: true });
      return true;
    } catch (error) {
      try { console.warn('[ASR] whisper bridge failed to start', error); } catch {}
      emitAiActivity({
        active: false,
        provider: 'browser',
        engine: 'webspeech',
        phase: 'off',
        source: 'speech-loader-whisper-fallback',
        timestamp: Date.now(),
        message: 'Whisper bridge unavailable; using browser speech instead.',
        requestsInFlight: 0,
        queueDepth: 0,
      });
      currentActualSpeechEngine = 'webspeech';
      currentFallbackReason = 'whisper-start-failed';
      emitAsrRuntimeStatus('backend-fallback:whisper');
      emitAsrState('idle', 'recognizer-start-failed:whisper');
      setActiveRecognizer(null);
      setSpeechRunningActual(false, 'whisper-start-failed');
      rec = null;
    }
  }

  try {
    if (allowLegacyOrchestrator && window.__tpSpeechOrchestrator?.start) {
      const started = await window.__tpSpeechOrchestrator.start();
      rec = (started || null) as RecognizerLike | null;
      enforceRecognizerInterimCapture(mode, rec);
      if (rec && typeof rec.on === 'function') {
        try { rec.on('final', (t: any) => routeRecognizerTranscript(t, true)); } catch {}
        try { rec.on('partial', (t: any) => routeRecognizerTranscript(t, false)); } catch {}
      }
      try { window.__tpEmitSpeech = (t: unknown, final?: boolean) => routeRecognizerTranscript(t, !!final); } catch {}
      if (rec && typeof rec.start === 'function') {
        setActiveRecognizer(rec);
      } else {
        setActiveRecognizer(null);
      }
      if (!activeRecognizer) {
        emitAsrState('idle', 'recognizer-not-attached:orchestrator');
        setSpeechRunningActual(false, 'orchestrator-no-attach');
        maybeLogLiveArmedDetachedInvariant('orchestrator-no-attach');
        emitHudSnapshot('recognizer-attach-failed:orchestrator', { force: true });
        return false;
      }
      lastStartedSpeechEngine = selectedEngine || 'webspeech';
      currentActualSpeechEngine = selectedEngine === 'whisper' ? 'webspeech' : (selectedEngine || 'webspeech');
      setSpeechRunningActual(true, 'orchestrator-start');
      emitAsrRuntimeStatus('backend-attached:orchestrator');
      emitAsrHeartbeat('recognizer-attached:orchestrator', { force: true });
      return true;
    }
  } catch {}

  if (allowLegacyNs) {
    try {
      const startRecognizer = speechNs?.startRecognizer;
      if (typeof startRecognizer === 'function') {
        const startNamespaceRecognizer = () => {
          startRecognizer(() => {}, { lang: 'en-US' });
        };
        startNamespaceRecognizer();
        const namespaceRecognizer: RecognizerLike = {
          start: () => { startNamespaceRecognizer(); },
          stop: () => { try { speechNs?.stopRecognizer?.(); } catch {} },
          abort: () => { try { speechNs?.stopRecognizer?.(); } catch {} },
        };
        rec = namespaceRecognizer;
        setActiveRecognizer(namespaceRecognizer);
        if (!activeRecognizer) {
          emitAsrState('idle', 'recognizer-not-attached:namespace');
          setSpeechRunningActual(false, 'namespace-no-attach');
          maybeLogLiveArmedDetachedInvariant('namespace-no-attach');
          emitHudSnapshot('recognizer-attach-failed:namespace', { force: true });
          return false;
        }
        lastStartedSpeechEngine = selectedEngine || 'webspeech';
        currentActualSpeechEngine = selectedEngine === 'whisper' ? 'webspeech' : (selectedEngine || 'webspeech');
        setSpeechRunningActual(true, 'namespace-start');
        emitAsrRuntimeStatus('backend-attached:namespace');
        emitAsrHeartbeat('recognizer-attached:namespace', { force: true });
        return true;
      }
    } catch {}
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) throw new Error('NoSpeechBackend');
  const sr = new SR();
  sr.interimResults = true;
  sr.continuous = true;
  enforceRecognizerInterimCapture(mode, sr);
  let _lastInterimAt = 0;
  attachWebSpeechLifecycle(sr, {
    onResult: (e: any) => {
      try {
        let interim = '', finals = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) finals += res[0].transcript;
          else interim += res[0].transcript;
        }
        if (finals) routeTranscript(finals, true);
        const now = performance.now();
        if (interim && (now - _lastInterimAt) > 120) {
          _lastInterimAt = now;
          routeTranscript(interim, false);
        }
      } catch {}
    },
    onError: (e: Event) => { try { console.warn('[speech] error', e); } catch {} },
  });
  setActiveRecognizer(sr);
  let startedOk = false;
  try {
    sr.start();
    startedOk = true;
  } catch {}
  if (!startedOk) {
    emitAsrState('idle', 'recognizer-start-failed:webspeech');
    setActiveRecognizer(null);
    setSpeechRunningActual(false, 'webspeech-start-failed');
    maybeLogLiveArmedDetachedInvariant('webspeech-start-failed');
    emitHudSnapshot('recognizer-start-failed:webspeech', { force: true });
    return false;
  }
  rec = { stop: () => { try { sr.stop(); } catch {} } };
  lastStartedSpeechEngine = selectedEngine || 'webspeech';
  currentActualSpeechEngine = selectedEngine === 'whisper' ? 'webspeech' : (selectedEngine || 'webspeech');
  setSpeechRunningActual(true, 'webspeech-start');
  emitAsrRuntimeStatus('backend-attached:webspeech');
  emitAsrHeartbeat('recognizer-attached:webspeech', { force: true });
  try { window.__tpEmitSpeech = (t: unknown, final?: boolean) => routeRecognizerTranscript(t, !!final); } catch {}
  return true;
}

export async function startSpeechBackendForSession(info?: { reason?: string; mode?: string }): Promise<boolean> {
  ensureTsPrimaryMatcherNamespace('speech_backend_start');
  emitTsPrimaryMatcherProviderDiagnostic('speech_backend_start');
  const mode = (info?.mode || getScrollMode()).toLowerCase();
  bootTrace('speech-loader:live-path:enter', {
    reason: info?.reason || null,
    mode,
  });
  const wantsSpeech = mode === 'asr' || mode === 'hybrid';
  if (!wantsSpeech) {
    bootTrace('speech-loader:live-path:skip', { reason: 'mode-not-speech', mode });
    return false;
  }
  ensureAsrDriverLifecycleHooks();
  if (isSettingsHydrating()) {
    if (shouldLogLevel(2)) {
      try { console.debug('[ASR] startSpeech blocked during settings hydration', { mode, reason: info?.reason }); } catch {}
    }
    bootTrace('speech-loader:live-path:skip', { reason: 'settings-hydrating', mode });
    return false;
  }
  if (running) {
    bootTrace('speech-loader:live-path:skip', { reason: 'already-running', mode });
    return true;
  }

  try {
    const layoutReady = await waitForAsrLayoutReady(info?.reason);
    if (!layoutReady) {
      bootTrace('speech-loader:live-path:skip', { reason: 'layout-not-ready', mode });
      return false;
    }
    if (running) {
      bootTrace('speech-loader:live-path:skip', { reason: 'running-after-layout', mode });
      return true;
    }
    const runKey = beginAsrRunKey(mode, info?.reason);
    const runGeneration = asrRunGeneration;

    attachAsrScrollDriver({ reason: 'session-start', mode, allowCreate: true, runKey, runGeneration });
    syncAsrDriverFromBlocks(info?.reason || 'session-start', {
      mode,
      allowCreate: true,
      runKey,
      runGeneration,
    });
    const startIdx = computeMarkerLineIndex();
    syncAsrIndices(startIdx, 'session-start');
    if (!asrBrainLogged) {
      asrBrainLogged = true;
      try {
        const session = getSession();
        const scroller =
          getRuntimeScroller() ||
          resolveActiveScroller(
            getPrimaryScroller(),
            getScriptRoot() || getScrollerEl('main') || getScrollerEl('display'),
          );
        console.warn('ASR_BRAIN_READY', {
          asrDesired: session.asrDesired,
          asrArmed: session.asrArmed,
          brain: !!asrScrollDriver,
          mode,
          scrollerId: describeElement(scroller),
        });
      } catch {}
    }
    try {
      const currentIdx = Number((window as any).currentIndex ?? startIdx);
      const viewer = getPrimaryScroller();
      const root = getScriptRoot() || viewer;
      const scroller =
        getRuntimeScroller() ||
        resolveActiveScroller(viewer, root || getScrollerEl('main') || getScrollerEl('display'));
      const scrollerTop = scroller?.scrollTop ?? 0;
      const firstLine = (root || viewer || document).querySelector<HTMLElement>('.line');
      const firstLineHeight = firstLine?.offsetHeight || firstLine?.clientHeight || 0;
      const topEpsilon = Math.max(24, firstLineHeight * 0.5);
      const markerSnap = getLineSnapshot(startIdx);
      const currentSnap = getLineSnapshot(currentIdx);
      try {
        console.warn('ASR_START_STATE', {
          anchorIndex: startIdx,
          cursorLine: currentIdx,
          scrollTop: Math.round(scrollerTop),
          scroller: describeElement(scroller),
          topEps: Math.round(topEpsilon),
        });
      } catch {}
      const anchorLine = [
        'ASR_ANCHOR',
        `current=${currentIdx}`,
        `marker=${startIdx}`,
        `scroller=${describeElement(scroller)}`,
        `scrollTop=${Math.round(scrollerTop)}`,
        `topEps=${Math.round(topEpsilon)}`,
        markerSnap?.snippet ? `markerText="${markerSnap.snippet}"` : '',
        currentSnap?.snippet ? `currentText="${currentSnap.snippet}"` : '',
        `snapScrollTop=${Math.round(currentSnap?.scrollTop ?? 0)}`,
        `lineH=${currentSnap?.lineHeight ?? 0}`,
      ].filter(Boolean).join(' ');
      console.warn(anchorLine);
    } catch {}
    suppressRecognizerAutoRestart = false;
    lastRecognizerOnResultTs = 0;
    lastAsrIngestTs = 0;
    lastAsrCommitTs = 0;
    lastAsrCommitCount = 0;
    lastRecognizerLifecycleEvent = '';
    lastRecognizerLifecycleAt = 0;
    lastAsrStallClass = '';
    resetAsrStallAutoRestartEpisode('session-start');
    setSpeechRunningActual(false, 'session-start');
    clearLifecycleRestartTimer();
    startAsrHeartbeat();
    running = true;
    rememberMode(mode);
    try { document.body.classList.add('listening'); } catch {}
    try { window.HUD?.bus?.emit?.('speech:toggle', true); } catch {}
    try { window.speechOn = true; } catch {}
    setListeningUi(true);
    try { window.dispatchEvent(new CustomEvent('tp:speech-state', { detail: { running: true } })); } catch {}
    emitHudSnapshot('speech-running:true', { force: true });

    if (shouldLogLevel(2)) {
      try {
        console.debug('[ASR] willStartRecognizer', {
          phase: 'session-live',
          mode,
          hasSR: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
        });
      } catch {}
    }

    try {
      const ok = await startBackendForSession(mode, info?.reason);
      if (shouldLogLevel(2)) {
        try { console.debug('[ASR] didCallStartRecognizer', { ok }); } catch {}
      }
      if (!ok) {
        running = false;
        setActiveRecognizer(null);
        setSpeechRunningActual(false, 'start-failed:no-attach');
        setListeningUi(false);
        setReadyUi();
        clearAsrRunKey('start-failed:no-attach');
        emitAsrState('idle', 'recognizer-not-attached');
        emitHudSnapshot('speech-start-failed:no-attach', { force: true });
        bootTrace('speech-loader:live-path:error', {
          mode,
          reason: info?.reason || null,
          runKey,
          detail: 'recognizer-not-attached',
        });
        return false;
      }
      const startedEngine = String(lastStartedSpeechEngine || (getTpSpeechStoreSnapshot() as any)?.engine || '').toLowerCase();
      if (startedEngine !== 'whisper') {
        try {
          const activeProfile = getActiveAsrProfile();
          await window.__tpMic?.requestMic?.({
            source: 'speech-loader',
            asrPath: startedEngine || 'webspeech',
            profileId: activeProfile?.id || null,
            capture: activeProfile?.capture || null,
          });
        } catch {}
      }
      bootTrace('speech-loader:live-path:done', { mode, ok, runKey });
      return ok;
    } catch {
      running = false;
      setActiveRecognizer(null);
      setSpeechRunningActual(false, 'start-failed');
      setListeningUi(false);
      setReadyUi();
      clearAsrRunKey('start-failed');
      emitHudSnapshot('speech-start-failed', { force: true });
      bootTrace('speech-loader:live-path:error', { mode, reason: info?.reason || null, runKey });
      return false;
    }
  } finally {
    // no-op
  }
}

export function stopSpeechBackendForSession(reason?: string): void {
  resetAsrDriverCreateBlockedDiagnostics();
  suppressRecognizerAutoRestart = true;
  suppressAsrStallAutoRestart(`stop:${String(reason || 'unspecified')}`);
  clearLifecycleRestartTimer();
  stopAsrHeartbeat();
  asrSessionIntentActive = false;
  disarmAsrSessionState(`stop:${String(reason || 'unspecified')}`);
  resetAsrInterimStabilizer();
  clearAsrRunKey(`stop:${String(reason || 'unspecified')}`);
  if (!running && !rec) {
    currentActualSpeechEngine = '';
    currentFallbackReason = '';
    setSpeechRunningActual(false, 'stop-idle');
    try { window.__tpEmitSpeech = undefined; } catch {}
    detachAsrScrollDriver();
    emitAsrHeartbeat(`stop:${String(reason || 'unspecified')}`, { force: true });
    emitAsrRuntimeStatus(`stop:${String(reason || 'unspecified')}:idle`);
    return;
  }
  running = false;
  try { window.__tpEmitSpeech = undefined; } catch {}
  detachAsrScrollDriver();
  asrBrainLogged = false;
  try { rec?.abort?.(); } catch {}
  try { rec?.stop?.(); } catch {}
  try { stopAndAbortRecognizer((window as any).__tpRecognizer); } catch {}
  try { stopAndAbortRecognizer((window as any).recog); } catch {}
  try { getTpSpeechNamespace()?.stopRecognizer?.(); } catch {}
  try { window.__tpMic?.releaseMic?.(); } catch {}
  setActiveRecognizer(null);
  rec = null;
  currentActualSpeechEngine = '';
  currentFallbackReason = '';
  setSpeechRunningActual(false, 'stop');
  try { document.body.classList.remove('listening'); } catch {}
  try { window.HUD?.bus?.emit?.('speech:toggle', false); } catch {}
  try { window.speechOn = false; } catch {}
  setListeningUi(false);
  setReadyUi();
  try { window.dispatchEvent(new CustomEvent('tp:speech-state', { detail: { running: false, reason } })); } catch {}
  emitHudSnapshot('speech-running:false', { force: true });
  emitAsrHeartbeat(`stop:${String(reason || 'unspecified')}`, { force: true });
  emitAsrRuntimeStatus(`stop:${String(reason || 'unspecified')}`);
}

export function installSpeech(): void {
  try { installAsrLogBuffer(window as any); } catch {}
  ensureAsrDriverLifecycleHooks();
  startAsrHeartbeat();
  activeAsrLane = readActiveAsrLane();
  emitHudSnapshot('installSpeech:init', { force: true });
  emitAsrRuntimeStatus('install');
  installAsrHudDev();
  try {
    window.addEventListener('tp:asr:lane-change', (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      const nextLane = normalizeAsrLane((detail as any).lane);
      if (nextLane === activeAsrLane) return;
      activeAsrLane = nextLane;
      emitAsrRuntimeStatus('lane-change');
      if (!running) return;
      stopSpeechBackendForSession('lane-change');
      window.setTimeout(() => { void startSpeechBackendForSession({ reason: 'lane-change' }); }, 0);
    });
  } catch {}
  
  // Session-first: recBtn only starts preroll/session
  (async () => {
    try {
      const btn = document.getElementById('recBtn') as HTMLButtonElement | null;
      if (!btn || (btn as any).__sessionWired) return;
      (btn as any).__sessionWired = true;
      setReadyUi();
      const syncBtnUi = (phase?: string) => {
        try {
          const p = (phase || '').toLowerCase();
          const isRunning = p === 'preroll' || p === 'live';
          btn.textContent = isRunning ? 'Stop' : 'Start speech sync';
          btn.title = isRunning ? 'Stop speech sync' : 'Start speech sync';
        } catch {}
      };
      try {
        window.addEventListener('tp:session:phase', (ev: Event) => {
          const phase = (ev as CustomEvent)?.detail?.phase || '';
          syncBtnUi(String(phase));
        });
      } catch {}
      btn.addEventListener(
        'click',
        () => {
          const session = getSession();
          if (session.phase === 'preroll' || session.phase === 'live') {
            try { console.debug('[session/stop] click in phase=', session.phase); } catch {}
            const stopIntent = { source: 'recBtn', phase: session.phase, reason: 'user' };
            dispatchSessionIntent(false, stopIntent);
            try { setSessionPhase('wrap'); } catch {}
            try {
              window.dispatchEvent(
                new CustomEvent('tp:session:stop', {
                  detail: { ...stopIntent, intentSource: 'session-intent' },
                }),
              );
            } catch {}
            return;
          }
          try { console.debug('[session/start] phase', session.phase, '→ preroll'); } catch {}
          const mode = getScrollMode();
          armAsrForSessionStart(mode, 'recBtn');
          const startIntent = { source: 'recBtn', reason: 'user', mode };
          try { setSessionPhase('preroll'); } catch {}
          try {
            window.dispatchEvent(
              new CustomEvent('tp:session:start', {
                detail: { ...startIntent, intentSource: 'session-intent' },
              }),
            );
          } catch {}
          dispatchSessionIntent(true, startIntent);
          syncBtnUi('preroll');
        },
        { capture: true },
      );
    } catch {}
  })();
}
async function _maybeStartRecorders(): Promise<void> {
  // recording/session-managed; placeholder to preserve API
  return;
}
