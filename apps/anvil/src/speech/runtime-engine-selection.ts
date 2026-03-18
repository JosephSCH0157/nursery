function normalizeRuntimeSpeechEngine(value: unknown): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'web-speech') return 'webspeech';
  if (normalized === 'offline') return 'vosk';
  return normalized;
}

export function resolveRuntimeSpeechEngine(options: {
  speechState?: unknown;
  appStore?: { get?: (key: string) => unknown } | null;
  fallback?: string;
} = {}): string {
  const { appStore, fallback = 'whisper' } = options;
  const storeEngine = normalizeRuntimeSpeechEngine(appStore?.get?.('asr.engine'));
  if (storeEngine) return storeEngine;

  return normalizeRuntimeSpeechEngine(fallback) || 'whisper';
}
