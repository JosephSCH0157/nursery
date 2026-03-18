export const ASR_ENGINE_EXPLICIT_KEY = 'tp_asr_engine_explicit_v1';

export function normalizeAsrEngine(value: string | null | undefined): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'web-speech') return 'webspeech';
  if (normalized === 'offline') return 'vosk';
  return normalized;
}

export function isAsrEngineExplicit(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

export function resolveAsrEngineSelection(opts: {
  engine?: string | null | undefined;
  explicit?: unknown;
  fallback?: string;
}): string {
  const fallback = normalizeAsrEngine(opts.fallback || 'whisper') || 'whisper';
  const engine = normalizeAsrEngine(opts.engine);
  const explicit = isAsrEngineExplicit(opts.explicit);

  if (explicit) return engine || fallback;
  if (!engine || engine === 'webspeech') return fallback;
  return engine;
}

export function normalizePersistedAsrSelection<T extends {
  app?: Record<string, any>;
  asrSettings?: Record<string, any>;
}>(settings: T): T {
  const rawApp = settings?.app && typeof settings.app === 'object' ? settings.app : {};
  const rawAsrSettings = settings?.asrSettings && typeof settings.asrSettings === 'object'
    ? settings.asrSettings
    : {};

  const hasPersistedEngine =
    typeof rawAsrSettings.engine === 'string' ||
    typeof rawApp['asr.engine'] === 'string';
  const explicit = isAsrEngineExplicit(rawAsrSettings.engineExplicit);

  if (!hasPersistedEngine && !explicit) return settings;

  const app = { ...rawApp };
  const asrSettings = { ...rawAsrSettings };
  const resolvedEngine = resolveAsrEngineSelection({
    engine: typeof asrSettings.engine === 'string' ? asrSettings.engine : app['asr.engine'],
    explicit,
  });

  app['asr.engine'] = resolvedEngine;
  asrSettings.engine = resolvedEngine;
  if (explicit) asrSettings.engineExplicit = true;
  else delete asrSettings.engineExplicit;

  return {
    ...settings,
    app,
    asrSettings,
  };
}

export function readLocalAsrEngineExplicit(): boolean {
  try {
    const store = (window as any)?.__tpStore;
    if (store && typeof store.get === 'function') {
      return isAsrEngineExplicit(store.get('asr.engineExplicit'));
    }
  } catch {
    // fall back to legacy localStorage read
  }
  try {
    return localStorage.getItem(ASR_ENGINE_EXPLICIT_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeLocalAsrEngineExplicit(explicit: boolean): void {
  try {
    const store = (window as any)?.__tpStore;
    if (store && typeof store.set === 'function') {
      store.set('asr.engineExplicit', !!explicit);
      return;
    }
  } catch {
    // fall back to legacy localStorage write
  }
  try {
    if (explicit) {
      localStorage.setItem(ASR_ENGINE_EXPLICIT_KEY, '1');
      return;
    }
    localStorage.removeItem(ASR_ENGINE_EXPLICIT_KEY);
  } catch {
    // ignore persistence failures
  }
}
