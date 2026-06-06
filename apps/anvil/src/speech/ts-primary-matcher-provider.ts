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
  __tpMatcherDiagnostics?: Record<string, unknown>;
};

const PROVIDER_ID = 'ts_primary_runtime';
const DIRECT_MATCHER_MULTI_LINE_MIN_LINES = 2;
const DIRECT_MATCHER_MULTI_LINE_MAX_LINES = 5;
const DIRECT_MATCHER_SHORT_UTTERANCE_MULTI_LINE_MAX_LINES = 3;
const DIRECT_MATCHER_SHORT_UTTERANCE_TOKEN_THRESHOLD = 10;

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

export function installTsPrimaryMatcherNamespace(ns: MatcherNamespace): boolean {
  if (!isTsPrimaryBoot() || !ns || typeof ns !== 'object') return false;

  ns.matchBatch = (text: unknown, arg1?: unknown, arg2?: unknown) => runTsPrimaryMatch(text, arg1, arg2);
  ns.matchOne = (text: unknown, arg1?: unknown, arg2?: unknown) => runTsPrimaryMatch(text, arg1, arg2);
  ns.__tpMatcherProvider = PROVIDER_ID;
  ns.__tpMatcherDiagnostics = {
    provider: PROVIDER_ID,
    installMode: 'dynamic-runtime',
  };
  return true;
}

export function getTsPrimaryMatcherProviderId(): string {
  return PROVIDER_ID;
}
