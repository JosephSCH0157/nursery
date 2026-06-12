type StorageLike = {
  getItem(key: string): string | null;
};

type ChairpersonFlagRuntimeConfig = {
  asr_visual_chairperson?: unknown;
  asr_visual_chairperson_owner?: unknown;
  asr_visual_chairperson_shadow?: unknown;
};

export type AsrChairpersonFlagState = {
  rawHref: string;
  rawSearch: string;
  parsedQueryParams: string;
  rawChairpersonValue: string;
  rawOwnerValue: string;
  resolvedShadowEnabled: boolean;
  resolvedOwnerEnabled: boolean;
  ownerFlagSource: string;
  ownerFlagReadFrom: 'url' | 'localStorage' | 'runtime_config' | 'default';
  ownerDisabledReason: string;
  devFlagReaderAvailable: boolean;
};

export type AsrChairpersonImportMetaEnvSnapshot = {
  dev: string;
  mode: string;
};

export function normalizeChairpersonFlagValue(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function isTruthyFlagValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes' || normalized === 'enabled';
}

function isFalsyFlagValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no' || normalized === 'disabled';
}

function collectRuntimeConfig(globalScope: Record<string, unknown>): ChairpersonFlagRuntimeConfig {
  const direct = globalScope.__TP_RUNTIME_CONFIG__;
  if (direct && typeof direct === 'object') return direct as ChairpersonFlagRuntimeConfig;
  const forgeConfig = globalScope.__forgeRuntimeConfig;
  if (forgeConfig && typeof forgeConfig === 'object') return forgeConfig as ChairpersonFlagRuntimeConfig;
  const fallback = globalScope.__forgeConfig;
  if (fallback && typeof fallback === 'object') return fallback as ChairpersonFlagRuntimeConfig;
  return {
    asr_visual_chairperson: globalScope.__tpAsrVisualChairperson,
    asr_visual_chairperson_owner: globalScope.__tpAsrVisualChairpersonOwner,
    asr_visual_chairperson_shadow: globalScope.__tpAsrVisualChairpersonShadow,
  };
}

export function readAsrChairpersonImportMetaEnvSnapshot(): AsrChairpersonImportMetaEnvSnapshot {
  try {
    const env = (0, eval)('import.meta.env');
    if (env && typeof env === 'object') {
      return {
        dev: normalizeChairpersonFlagValue((env as Record<string, unknown>).DEV) || 'unavailable',
        mode: normalizeChairpersonFlagValue((env as Record<string, unknown>).MODE) || 'unavailable',
      };
    }
  } catch {
    // ignore
  }
  return { dev: 'unavailable', mode: 'unavailable' };
}

function stringifyQueryParams(params: URLSearchParams): string {
  const pairs: string[] = [];
  params.forEach((value, key) => {
    pairs.push(`${key}:${value}`);
  });
  return JSON.stringify(pairs);
}

export function summarizeChairpersonFlagState(state: Pick<AsrChairpersonFlagState, 'resolvedShadowEnabled' | 'resolvedOwnerEnabled' | 'ownerFlagSource' | 'ownerDisabledReason'>): string {
  return [
    `shadow=${state.resolvedShadowEnabled ? 1 : 0}`,
    `owner=${state.resolvedOwnerEnabled ? 1 : 0}`,
    `source=${state.ownerFlagSource || 'default'}`,
    `disabled=${state.ownerDisabledReason || 'none'}`,
  ].join('|');
}

export function resolveAsrChairpersonFlagState(args?: {
  href?: string;
  search?: string;
  localStorage?: StorageLike | null;
  globalScope?: Record<string, unknown> | null;
}): AsrChairpersonFlagState {
  const globalScope =
    (args?.globalScope as Record<string, unknown> | null | undefined) ||
    (typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : null) ||
    {};
  const rawHref =
    typeof args?.href === 'string'
      ? args.href
      : (typeof location !== 'undefined' ? String(location.href || '') : '');
  const rawSearch =
    typeof args?.search === 'string'
      ? args.search
      : (typeof location !== 'undefined' ? String(location.search || '') : '');
  const params = new URLSearchParams(rawSearch || '');
  const parsedQueryParams = stringifyQueryParams(params);
  const rawChairpersonValue = normalizeChairpersonFlagValue(params.get('asr_visual_chairperson'));
  const rawOwnerValue = normalizeChairpersonFlagValue(params.get('asr_visual_chairperson_owner'));
  const rawShadowValue = normalizeChairpersonFlagValue(params.get('asr_visual_chairperson_shadow'));
  const rawDevValue = normalizeChairpersonFlagValue(params.get('dev'));
  const rawOpenValue = normalizeChairpersonFlagValue(params.get('open'));
  const localStorageRef =
    args?.localStorage === undefined
      ? ((typeof window !== 'undefined' ? window.localStorage : null) as StorageLike | null)
      : args.localStorage;
  const localStorageChairpersonValue = normalizeChairpersonFlagValue(localStorageRef?.getItem('asr_visual_chairperson'));
  const localStorageOwnerValue = normalizeChairpersonFlagValue(localStorageRef?.getItem('asr_visual_chairperson_owner'));
  const runtimeConfig = collectRuntimeConfig(globalScope);
  const runtimeChairpersonValue = normalizeChairpersonFlagValue(runtimeConfig.asr_visual_chairperson);
  const runtimeOwnerValue = normalizeChairpersonFlagValue(runtimeConfig.asr_visual_chairperson_owner);

  let resolvedOwnerEnabled = false;
  let ownerFlagSource = 'default';
  let ownerFlagReadFrom: AsrChairpersonFlagState['ownerFlagReadFrom'] = 'default';
  let ownerDisabledReason = 'no_owner_flag_present';

  const evaluateOwnerSource = (source: string, value: string, readFrom: AsrChairpersonFlagState['ownerFlagReadFrom']) => {
    if (!value) return false;
    ownerFlagSource = `${source}=${value}`;
    ownerFlagReadFrom = readFrom;
    if (isTruthyFlagValue(value)) {
      resolvedOwnerEnabled = true;
      ownerDisabledReason = 'none';
      return true;
    }
    if (isFalsyFlagValue(value)) {
      ownerDisabledReason = `${source}_explicit_false`;
      return true;
    }
    ownerDisabledReason = `${source}_unrecognized_value`;
    return true;
  };

  evaluateOwnerSource('url:asr_visual_chairperson', rawChairpersonValue, 'url') ||
    evaluateOwnerSource('url:asr_visual_chairperson_owner', rawOwnerValue, 'url') ||
    evaluateOwnerSource('localStorage:asr_visual_chairperson', localStorageChairpersonValue, 'localStorage') ||
    evaluateOwnerSource('localStorage:asr_visual_chairperson_owner', localStorageOwnerValue, 'localStorage') ||
    evaluateOwnerSource('runtime_config:asr_visual_chairperson', runtimeChairpersonValue, 'runtime_config') ||
    evaluateOwnerSource('runtime_config:asr_visual_chairperson_owner', runtimeOwnerValue, 'runtime_config');

  const devTeleprompterScriptRun =
    isTruthyFlagValue(rawDevValue) &&
    rawOpenValue.trim().toLowerCase() === 'script';
  if (!resolvedOwnerEnabled && ownerFlagSource === 'default' && devTeleprompterScriptRun) {
    resolvedOwnerEnabled = true;
    ownerFlagSource = 'default:dev_open_script_auto_owner';
    ownerDisabledReason = 'none';
    ownerFlagReadFrom = 'default';
  }

  let resolvedShadowEnabled = true;
  if (rawShadowValue) {
    if (isFalsyFlagValue(rawShadowValue)) resolvedShadowEnabled = false;
    else if (isTruthyFlagValue(rawShadowValue)) resolvedShadowEnabled = true;
  }

  return {
    rawHref,
    rawSearch,
    parsedQueryParams,
    rawChairpersonValue,
    rawOwnerValue,
    resolvedShadowEnabled,
    resolvedOwnerEnabled,
    ownerFlagSource,
    ownerFlagReadFrom,
    ownerDisabledReason,
    devFlagReaderAvailable:
      typeof URLSearchParams === 'function' &&
      (!!localStorageRef || Object.keys(globalScope).length >= 0),
  };
}
