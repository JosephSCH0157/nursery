import { getAsrBlockElements, getAsrBlockIndex } from '../scroll/asr-block-store';
import { prepareMatcherInput } from './matcher-input';
import { getMatcherRuntimeState } from './matcher-runtime-state';
import { matchBatch as runMatcherBatch, normTokens } from './matcher';

type MatchLike = {
  bestIdx?: number;
  bestSim?: number;
  idx?: number;
  sim?: number;
  topScores?: unknown[];
  candidates?: unknown[];
  noMatch?: boolean;
  reason?: string;
  currentIdx?: number | null;
  [key: string]: unknown;
};

type MatcherNamespace = {
  matchOne?: (text: unknown, arg1?: unknown, arg2?: unknown) => MatchLike;
  matchBatch?: (text: unknown, arg1?: unknown, arg2?: unknown) => MatchLike;
  __tpMatcherProvider?: string;
  __tpMatcherProviderSource?: string;
  __tpMatcherDiagnostics?: Record<string, unknown>;
};

const PROVIDER_ID = 'ts_primary_runtime';
const PROVIDER_SOURCE = 'ts_primary_matcher_provider';
const OVERWRITE_DIAGNOSTIC_TAG = '[TS_PRIMARY_MATCHER_PROVIDER_OVERWRITTEN]';
const STATUS_DIAGNOSTIC_TAG = '[TS_PRIMARY_MATCHER_PROVIDER_STATUS]';
const DIRECT_MATCHER_MULTI_LINE_MIN_LINES = 2;
const DIRECT_MATCHER_MULTI_LINE_MAX_LINES = 5;
const DIRECT_MATCHER_SHORT_UTTERANCE_MULTI_LINE_MAX_LINES = 3;
const DIRECT_MATCHER_SHORT_UTTERANCE_TOKEN_THRESHOLD = 10;

type MatcherInstallCheckpoint =
  | 'app_boot'
  | 'blocks_ready'
  | 'speech_backend_start'
  | 'first_transcript_final'
  | 'asr_driver_creation'
  | 'speech_store_init'
  | 'ensure';

type ProviderRuntimeState = {
  installAttempted: boolean;
  installSucceeded: boolean;
  installSkippedReason: string | null;
  overwrittenAfterInstall: boolean;
  overwriteLogged: boolean;
  installedMatchBatch: MatcherNamespace['matchBatch'] | null;
  installedMatchOne: MatcherNamespace['matchOne'] | null;
  currentProviderSource: string | null;
  emittedStages: Record<string, true>;
  lastStatus: TsPrimaryMatcherProviderStatus | null;
};

export type TsPrimaryMatcherProviderStatus = {
  stage: string;
  hasWindowTpSpeech: boolean;
  hasMatchOne: boolean;
  hasMatchBatch: boolean;
  matcherProviderKind: string;
  isBackendGuardStub: boolean;
  blocksReady: boolean;
  blockCount: number;
  scriptHash: string | null;
  installAttempted: boolean;
  installSucceeded: boolean;
  installSkippedReason: string | null;
  overwrittenAfterInstall: boolean;
  currentProviderSource: string | null;
};

function getRuntimeState(): ProviderRuntimeState | null {
  if (typeof window === 'undefined') return null;
  const win = window as Window & typeof globalThis & { __tpTsPrimaryMatcherProviderRuntime?: ProviderRuntimeState };
  if (!win.__tpTsPrimaryMatcherProviderRuntime) {
    win.__tpTsPrimaryMatcherProviderRuntime = {
      installAttempted: false,
      installSucceeded: false,
      installSkippedReason: null,
      overwrittenAfterInstall: false,
      overwriteLogged: false,
      installedMatchBatch: null,
      installedMatchOne: null,
      currentProviderSource: null,
      emittedStages: {},
      lastStatus: null,
    };
  }
  return win.__tpTsPrimaryMatcherProviderRuntime;
}

function getTpSpeechNamespace(): MatcherNamespace | null {
  if (typeof window === 'undefined') return null;
  const win = window as Window & typeof globalThis & { __tpSpeech?: MatcherNamespace };
  if (!win.__tpSpeech || typeof win.__tpSpeech !== 'object') return null;
  return win.__tpSpeech;
}

function isBackendGuardStubFn(fn: unknown): boolean {
  return typeof fn === 'function' && (fn as any).__tpMatcherUnavailableStub === true;
}

function readScriptHash(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = (window as any).__TP_LAST_APPLIED_HASH;
    return typeof raw === 'string' && raw ? raw : null;
  } catch {
    return null;
  }
}

function getBlockSnapshot(): { blocksReady: boolean; blockCount: number } {
  const blockEls = getAsrBlockElements();
  const blockMeta = getAsrBlockIndex();
  const blockCount = Array.isArray(blockEls) ? blockEls.length : 0;
  return {
    blocksReady: !!blockMeta && blockCount > 0,
    blockCount,
  };
}

function getMatcherProviderKind(ns: MatcherNamespace | null): string {
  if (!ns || typeof ns !== 'object') return 'missing_namespace';
  if (typeof ns.__tpMatcherProvider === 'string' && ns.__tpMatcherProvider) {
    return ns.__tpMatcherProvider;
  }
  if (isBackendGuardStubFn(ns.matchBatch) || isBackendGuardStubFn(ns.matchOne)) {
    return 'matcher_unavailable_stub';
  }
  if (typeof ns.matchBatch === 'function' || typeof ns.matchOne === 'function') {
    return 'custom_or_legacy';
  }
  return 'missing_matcher';
}

function computeCurrentProviderSource(ns: MatcherNamespace | null, runtime: ProviderRuntimeState | null): string | null {
  if (!ns || typeof ns !== 'object') return null;
  if (typeof ns.__tpMatcherProviderSource === 'string' && ns.__tpMatcherProviderSource) {
    return ns.__tpMatcherProviderSource;
  }
  if (runtime?.installedMatchBatch && ns.matchBatch === runtime.installedMatchBatch) {
    return PROVIDER_SOURCE;
  }
  if (isBackendGuardStubFn(ns.matchBatch) || isBackendGuardStubFn(ns.matchOne)) {
    return 'backend_guard_stub';
  }
  return null;
}

function hasProviderBeenOverwritten(ns: MatcherNamespace | null, runtime: ProviderRuntimeState | null): boolean {
  if (!ns || !runtime?.installSucceeded) return false;
  if (runtime.installedMatchBatch && ns.matchBatch !== runtime.installedMatchBatch) return true;
  if (runtime.installedMatchOne && ns.matchOne !== runtime.installedMatchOne) return true;
  return false;
}

function buildStatus(stage: string): TsPrimaryMatcherProviderStatus {
  const runtime = getRuntimeState();
  const ns = getTpSpeechNamespace();
  const { blocksReady, blockCount } = getBlockSnapshot();
  const overwrittenAfterInstall =
    Boolean(runtime?.overwrittenAfterInstall) || hasProviderBeenOverwritten(ns, runtime);
  const status: TsPrimaryMatcherProviderStatus = {
    stage,
    hasWindowTpSpeech: !!ns,
    hasMatchOne: typeof ns?.matchOne === 'function',
    hasMatchBatch: typeof ns?.matchBatch === 'function',
    matcherProviderKind: getMatcherProviderKind(ns),
    isBackendGuardStub: isBackendGuardStubFn(ns?.matchBatch) || isBackendGuardStubFn(ns?.matchOne),
    blocksReady,
    blockCount,
    scriptHash: readScriptHash(),
    installAttempted: !!runtime?.installAttempted,
    installSucceeded: !!runtime?.installSucceeded,
    installSkippedReason: runtime?.installSkippedReason ?? null,
    overwrittenAfterInstall,
    currentProviderSource: computeCurrentProviderSource(ns, runtime),
  };
  if (runtime) {
    runtime.lastStatus = status;
    runtime.currentProviderSource = status.currentProviderSource;
    if (overwrittenAfterInstall) runtime.overwrittenAfterInstall = true;
  }
  return status;
}

function maybeEmitOverwriteDiagnostic(stage: string): void {
  const runtime = getRuntimeState();
  const ns = getTpSpeechNamespace();
  if (!runtime || !hasProviderBeenOverwritten(ns, runtime)) return;
  runtime.overwrittenAfterInstall = true;
  if (runtime.overwriteLogged) return;
  runtime.overwriteLogged = true;
  try {
    console.warn(OVERWRITE_DIAGNOSTIC_TAG, buildStatus(stage));
  } catch {}
}

function isTsPrimaryBoot(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (window as any).__TP_TS_PRIMARY__ === true;
  } catch {
    return false;
  }
}

function createUnavailableResult(diagnostic: string): MatchLike {
  return {
    noMatch: true,
    bestIdx: -1,
    idx: -1,
    topScores: [],
    reason: 'matcher_unavailable',
    provider: PROVIDER_ID,
    diagnostic,
  };
}

function normalizeTextInput(input: unknown): string {
  if (Array.isArray(input)) {
    return input.map((part) => String(part ?? '')).join(' ').trim();
  }
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') {
    const text = (input as Record<string, unknown>).text ?? (input as Record<string, unknown>).transcript;
    if (typeof text === 'string') return text;
  }
  return String(input ?? '');
}

function normalizeMatchArgs(arg1?: unknown, arg2?: unknown): { isFinal: boolean; opts: Record<string, unknown> | undefined } {
  if (typeof arg1 === 'boolean') {
    return {
      isFinal: arg1,
      opts: arg2 && typeof arg2 === 'object' ? (arg2 as Record<string, unknown>) : undefined,
    };
  }
  const opts = arg1 && typeof arg1 === 'object' ? (arg1 as Record<string, unknown>) : undefined;
  const isFinal =
    typeof opts?.isFinal === 'boolean'
      ? Boolean(opts.isFinal)
      : false;
  return { isFinal, opts };
}

function normalizeMatchResult(input: MatchLike | null | undefined): MatchLike {
  if (!input || typeof input !== 'object') {
    return createUnavailableResult('ts_primary_matcher_invalid_result');
  }
  const bestIdxRaw = input.bestIdx ?? input.idx;
  const bestSimRaw = input.bestSim ?? input.sim;
  const bestIdx = Number.isFinite(Number(bestIdxRaw)) ? Math.floor(Number(bestIdxRaw)) : -1;
  const noMatch = input.noMatch === true || bestIdx < 0;
  const bestSim = Number.isFinite(Number(bestSimRaw)) ? Number(bestSimRaw) : undefined;
  return {
    ...input,
    bestIdx: noMatch ? -1 : bestIdx,
    idx: noMatch ? -1 : bestIdx,
    bestSim,
    sim: bestSim,
    topScores: Array.isArray(input.topScores)
      ? input.topScores
      : (Array.isArray(input.candidates) ? input.candidates : []),
    noMatch,
  };
}

function resolveMatcherAvailability(currentIndexOverride?: number | null): {
  ok: boolean;
  diagnostic: string;
  runtime: ReturnType<typeof getMatcherRuntimeState> | null;
} {
  const blockEls = getAsrBlockElements();
  const blockMeta = getAsrBlockIndex();
  const blockCount = Array.isArray(blockEls) ? blockEls.length : 0;
  if (blockCount <= 0) {
    return { ok: false, diagnostic: 'ts_primary_matcher_not_ready:block_elements_empty', runtime: null };
  }
  if (!blockMeta) {
    return { ok: false, diagnostic: 'ts_primary_matcher_not_ready:block_index_missing', runtime: null };
  }
  const runtime = getMatcherRuntimeState({ currentIndex: currentIndexOverride });
  if (!runtime) {
    return { ok: false, diagnostic: 'ts_primary_matcher_not_ready:runtime_missing', runtime: null };
  }
  if (!Array.isArray(runtime.scriptWords) || runtime.scriptWords.length === 0) {
    return { ok: false, diagnostic: 'ts_primary_matcher_not_ready:script_words_missing', runtime };
  }
  if (!runtime.paraIndex.length && !(Array.isArray(runtime.vParaIndex) && runtime.vParaIndex.length > 0)) {
    return { ok: false, diagnostic: 'ts_primary_matcher_not_ready:line_index_missing', runtime };
  }
  return { ok: true, diagnostic: 'ready', runtime };
}

function runTsPrimaryMatch(textInput: unknown, arg1?: unknown, arg2?: unknown): MatchLike {
  const text = normalizeTextInput(textInput);
  const { opts } = normalizeMatchArgs(arg1, arg2);
  const currentIndexOverride = Number.isFinite(Number(opts?.currentIdx ?? opts?.currentIndex))
    ? Number(opts?.currentIdx ?? opts?.currentIndex)
    : null;
  const availability = resolveMatcherAvailability(currentIndexOverride);
  if (!availability.ok || !availability.runtime) {
    return createUnavailableResult(availability.diagnostic);
  }

  const { matchTokens } = prepareMatcherInput(text, normTokens);
  if (!matchTokens.length) {
    return {
      noMatch: true,
      bestIdx: -1,
      idx: -1,
      topScores: [],
      reason: 'ts_primary_matcher_no_tokens',
      provider: PROVIDER_ID,
      currentIdx: availability.runtime.currentIndex,
    };
  }

  const adaptiveMultiLineMax =
    matchTokens.length <= DIRECT_MATCHER_SHORT_UTTERANCE_TOKEN_THRESHOLD
      ? DIRECT_MATCHER_SHORT_UTTERANCE_MULTI_LINE_MAX_LINES
      : DIRECT_MATCHER_MULTI_LINE_MAX_LINES;

  try {
    const result = runMatcherBatch(
      matchTokens,
      availability.runtime.scriptWords,
      availability.runtime.paraIndex,
      availability.runtime.vParaIndex,
      availability.runtime.cfg,
      availability.runtime.currentIndex,
      availability.runtime.viterbiState ?? undefined,
      {
        multiLineMinLines: DIRECT_MATCHER_MULTI_LINE_MIN_LINES,
        multiLineMaxLines: adaptiveMultiLineMax,
      },
    );

    return normalizeMatchResult({
      ...result,
      currentIdx: availability.runtime.currentIndex,
      reason: 'ts_primary_matcher',
      provider: PROVIDER_ID,
    });
  } catch {
    return createUnavailableResult('ts_primary_matcher_failed');
  }
}

function createMatchBatchProvider(): MatcherNamespace['matchBatch'] {
  return (text: unknown, arg1?: unknown, arg2?: unknown) => runTsPrimaryMatch(text, arg1, arg2);
}

function createMatchOneProvider(): MatcherNamespace['matchOne'] {
  return (text: unknown, arg1?: unknown, arg2?: unknown) => runTsPrimaryMatch(text, arg1, arg2);
}

function applyProvider(ns: MatcherNamespace, stage: string): boolean {
  if (!ns || typeof ns !== 'object') return false;
  const runtime = getRuntimeState();
  maybeEmitOverwriteDiagnostic(`${stage}:preinstall`);
  const matchBatch = createMatchBatchProvider();
  const matchOne = createMatchOneProvider();
  ns.matchBatch = matchBatch;
  ns.matchOne = matchOne;
  ns.__tpMatcherProvider = PROVIDER_ID;
  ns.__tpMatcherProviderSource = PROVIDER_SOURCE;
  ns.__tpMatcherDiagnostics = {
    provider: PROVIDER_ID,
    installMode: 'dynamic-runtime',
    installStage: stage,
  };
  if (runtime) {
    runtime.installAttempted = true;
    runtime.installSucceeded = true;
    runtime.installSkippedReason = null;
    runtime.installedMatchBatch = matchBatch;
    runtime.installedMatchOne = matchOne;
    runtime.currentProviderSource = PROVIDER_SOURCE;
  }
  return true;
}

export function installTsPrimaryMatcherNamespace(ns: MatcherNamespace): boolean {
  if (!isTsPrimaryBoot() || !ns || typeof ns !== 'object') return false;
  return applyProvider(ns, 'ensure');
}

export function ensureTsPrimaryMatcherNamespace(stage: MatcherInstallCheckpoint = 'ensure'): boolean {
  const runtime = getRuntimeState();
  if (runtime) {
    runtime.installAttempted = true;
    runtime.installSkippedReason = null;
  }
  if (!isTsPrimaryBoot()) {
    if (runtime) runtime.installSkippedReason = 'not_ts_primary_boot';
    return false;
  }
  if (typeof window === 'undefined') {
    if (runtime) runtime.installSkippedReason = 'window_unavailable';
    return false;
  }
  const win = window as Window & typeof globalThis & { __tpSpeech?: MatcherNamespace };
  const ns = (win.__tpSpeech = win.__tpSpeech || {});
  return applyProvider(ns, stage);
}

export function getTsPrimaryMatcherProviderStatus(stage: MatcherInstallCheckpoint | string = 'ensure'): TsPrimaryMatcherProviderStatus {
  return buildStatus(stage);
}

export function emitTsPrimaryMatcherProviderDiagnostic(stage: MatcherInstallCheckpoint | string): TsPrimaryMatcherProviderStatus {
  const runtime = getRuntimeState();
  maybeEmitOverwriteDiagnostic(`${stage}:check`);
  const status = buildStatus(stage);
  if (runtime?.emittedStages?.[stage]) return status;
  if (runtime) runtime.emittedStages[stage] = true;
  try {
    console.info(STATUS_DIAGNOSTIC_TAG, status);
  } catch {}
  return status;
}

export function getTsPrimaryMatcherProviderId(): string {
  return PROVIDER_ID;
}
