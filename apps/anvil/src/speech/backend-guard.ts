const matchBatchStub = () => ({
  noMatch: true,
  bestIdx: -1,
  topScores: [],
  reason: 'matcher_unavailable',
} as const);
(matchBatchStub as any).__tpMatcherUnavailableStub = true;
const noop = () => undefined;

function hasSearchFlag(name: string, aliases: string[] = []): boolean {
  try {
    const search = typeof window !== 'undefined' && window.location ? window.location.search : '';
    if (!search) return false;
    const params = new URLSearchParams(search);
    if (params.get(name) === '1') return true;
    for (const alias of aliases) {
      if (params.get(alias) === '1') return true;
    }
  } catch {
    return false;
  }
  return false;
}

function hasStorageFlag(name: string): boolean {
  try {
    const storage = typeof window !== 'undefined' ? window.localStorage : undefined;
    return storage?.getItem(name) === '1';
  } catch {
    return false;
  }
}

function flagEnabled(name: string, aliases: string[] = []): boolean {
  return hasSearchFlag(name, aliases) || hasStorageFlag(name);
}

export function isSpeechFeatureEnabled(): boolean {
  return flagEnabled('tp_speech') || flagEnabled('tp_speech_force');
}

export function isSpeechBackendAllowed(): boolean {
  return isSpeechFeatureEnabled() && flagEnabled('tp_probe_speech', ['probe']);
}

export function ensureSpeechGlobals(): void {
  if (typeof window === 'undefined') return;
  const win = window as Window & Record<string, any>;
  if (!win.__tpRecognizer) {
    win.__tpRecognizer = () => ({
      start: noop,
      stop: noop,
      abort: noop,
      on: noop,
      onend: null,
      onerror: null,
    });
  }
  if (!win.__tpMatcher) {
    win.__tpMatcher = {
      matchBatch: matchBatchStub,
      normTokens: () => [],
      computeLineSimilarity: () => 0,
    };
  } else {
    if (!win.__tpMatcher.matchBatch) win.__tpMatcher.matchBatch = matchBatchStub;
    if (!win.__tpMatcher.normTokens) win.__tpMatcher.normTokens = () => [];
    if (!win.__tpMatcher.computeLineSimilarity) win.__tpMatcher.computeLineSimilarity = () => 0;
  }
  if (!win.__tpSpeech) {
    win.__tpSpeech = {
      startRecognizer: async () => undefined,
      stopRecognizer: noop,
      matchBatch: matchBatchStub,
      __tpMatcherProvider: 'matcher_unavailable_stub',
      __tpMatcherProviderSource: 'backend_guard_stub',
    } as any;
  } else {
    const speechNs = win.__tpSpeech as any;
    if (!speechNs.startRecognizer) speechNs.startRecognizer = async () => undefined;
    if (!speechNs.stopRecognizer) speechNs.stopRecognizer = noop;
    if (!speechNs.matchBatch) speechNs.matchBatch = matchBatchStub;
    if (!speechNs.__tpMatcherProvider) speechNs.__tpMatcherProvider = 'matcher_unavailable_stub';
    if (!speechNs.__tpMatcherProviderSource) speechNs.__tpMatcherProviderSource = 'backend_guard_stub';
  }
}
