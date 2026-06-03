// =============================================================
// File: src/index-hooks/asr.ts
// =============================================================
import type { AsrMode } from '../features/asr-mode';
import { installAsrLogBuffer } from '../features/asr/asr-log-buffer';
import {
  ASR_DELAYED_SUPPRESSION_AUTOPSY_VERSION,
  ASR_VISUAL_GOVERNOR_DEAD_SCREEN_AUTOPSY_VERSION,
  buildAsrChairpersonFlagProofDiagnostic,
} from '../features/asr/asr-diagnostics';
import {
  readAsrChairpersonImportMetaEnvSnapshot,
  resolveAsrChairpersonFlagState,
  summarizeChairpersonFlagState,
} from '../features/asr/asr-chairperson-flags';
import { installAsrHotkeys } from '../hotkeys/asr-hotkeys';
import { ensureAsrSettingsWired } from '../ui/settings-asr';
import { AsrTopbar } from '../ui/topbar-asr';
export { AsrMode } from '../features/asr-mode';

type LegacyAsrModeShim = Pick<AsrMode, 'setEnabled' | 'start' | 'stop'> & {
  __tpLegacyShim?: true;
};

let asrFeatureInitialized = false;
let asrTopbarMounted = false;
let legacyShimWarned = false;
let legacyOverrideWarned = false;
const ASR_INIT_IMPL_PROOF_VERSION = 'asr.ts 2026-05-18b';

function allowLegacyAsrModeRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if ((window as any).__tpAllowLegacyAsrMode === true) return true;
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('legacyAsrMode') === '1') return true;
  } catch {}
  return false;
}

function isSpeechLoaderShim(value: unknown): value is LegacyAsrModeShim {
  return !!value && typeof (value as any).setEnabled === 'function' && (value as any).__tpLegacyShim === true;
}

function shouldEmitAsrInitProof(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const w = window as any;
    if (w.__TP_DEV || w.__TP_DEV1 || w.__tpDevMode) return true;
    if (w.__asrLogBufferInstalled) return true;
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('dev') === '1' || params.get('asr_log_buffer') === '1') return true;
  } catch {}
  try {
    if (window.localStorage?.getItem('tp_dev_mode') === '1') return true;
    if (window.localStorage?.getItem('asr_log_buffer') === '1') return true;
  } catch {}
  return false;
}

function ensureLegacyAsrModeShim(): LegacyAsrModeShim {
  const existing = (window as any).__tpAsrMode as any;
  if (isSpeechLoaderShim(existing)) {
    return existing;
  }
  const allowLegacy = allowLegacyAsrModeRuntime();
  if (allowLegacy && existing && typeof existing.setEnabled === 'function') {
    return existing as LegacyAsrModeShim;
  }
  if (existing && typeof existing.stop === 'function') {
    try { void existing.stop(); } catch {}
  }
  const shim: LegacyAsrModeShim = {
    __tpLegacyShim: true,
    async setEnabled(_enabled: boolean) {
      if (!(window as any).__tpDevMode || legacyShimWarned) return;
      legacyShimWarned = true;
      try {
        console.info('[ASR] legacy __tpAsrMode shim active; speech-loader owns ASR runtime');
      } catch {}
    },
    async start() {
      // Compatibility no-op: speech-loader/session pipeline owns runtime start.
    },
    async stop() {
      // Compatibility no-op: speech-loader/session pipeline owns runtime stop.
    },
  };
  if (existing && !allowLegacy && typeof existing.setEnabled === 'function' && !legacyOverrideWarned) {
    legacyOverrideWarned = true;
    try {
      console.warn('[ASR] overriding non-shim __tpAsrMode (speech-loader owns runtime). Use ?legacyAsrMode=1 to allow legacy mode runtime.');
    } catch {}
  }
  (window as any).__tpAsrMode = shim;
  return shim;
}

function mountAsrTopbarOnce(modeShim: LegacyAsrModeShim): void {
  if (asrTopbarMounted) return;
  asrTopbarMounted = true;
  try { new AsrTopbar(modeShim as AsrMode).mount('#topbarRight, .topbar, header, body'); } catch {}
}

export function initAsrFeature() {
  if (asrFeatureInitialized) return;
  asrFeatureInitialized = true;
  try {
    const flagState = resolveAsrChairpersonFlagState();
    const importMetaEnv = readAsrChairpersonImportMetaEnvSnapshot();
    console.info(
      buildAsrChairpersonFlagProofDiagnostic({
        rawHref: flagState.rawHref,
        rawSearch: flagState.rawSearch,
        parsedQueryParams: flagState.parsedQueryParams,
        rawChairpersonValue: flagState.rawChairpersonValue,
        rawOwnerValue: flagState.rawOwnerValue,
        resolvedShadowEnabled: flagState.resolvedShadowEnabled,
        resolvedOwnerEnabled: flagState.resolvedOwnerEnabled,
        ownerFlagSource: flagState.ownerFlagSource,
        ownerDisabledReason: flagState.ownerDisabledReason,
        devFlagReaderAvailable: flagState.devFlagReaderAvailable,
        flagEvaluationLocation: 'app_boot',
        driverCreationTimeFlagState: 'not_created',
        liveTickFlagState: summarizeChairpersonFlagState(flagState),
        importMetaDev: importMetaEnv.dev,
        importMetaMode: importMetaEnv.mode,
        ownerFlagReadFrom: flagState.ownerFlagReadFrom,
      }),
    );
  } catch {}
  if (typeof window !== 'undefined' && shouldEmitAsrInitProof()) {
    (window as any).__ASR_INIT_IMPL__ = ASR_INIT_IMPL_PROOF_VERSION;
    (window as any).__ASR_DIAGNOSTIC_PROOF__ = {
      buildStamp: String((window as any).__TP_BUILD_STAMP || 'unknown'),
      delayedAutopsyBuilderPresent: true,
      deadScreenAutopsyBuilderPresent: true,
      dumpPathProofPresent: true,
      delayedAutopsyVersion: ASR_DELAYED_SUPPRESSION_AUTOPSY_VERSION,
      deadScreenAutopsyVersion: ASR_VISUAL_GOVERNOR_DEAD_SCREEN_AUTOPSY_VERSION,
      initImpl: ASR_INIT_IMPL_PROOF_VERSION,
    };
    try {
      console.warn(`[ASR_INIT_IMPL] ${ASR_INIT_IMPL_PROOF_VERSION}`);
    } catch {}
  }
  try { installAsrLogBuffer(); } catch {}
  try {
    (window as any).__ASR_DIAGNOSTIC_PROOF__ = {
      buildStamp: String((window as any).__TP_BUILD_STAMP || 'unknown'),
      delayedAutopsyBuilderPresent: true,
      deadScreenAutopsyBuilderPresent: true,
      dumpPathProofPresent: true,
      delayedAutopsyVersion: ASR_DELAYED_SUPPRESSION_AUTOPSY_VERSION,
      deadScreenAutopsyVersion: ASR_VISUAL_GOVERNOR_DEAD_SCREEN_AUTOPSY_VERSION,
      initImpl: ASR_INIT_IMPL_PROOF_VERSION,
    };
  } catch {}
  ensureAsrSettingsWired(document.getElementById('settingsBody') || document);
  installAsrHotkeys();
  const modeShim = ensureLegacyAsrModeShim();
  mountAsrTopbarOnce(modeShim);
}
